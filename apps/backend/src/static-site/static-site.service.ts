import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";

import type { CreateStaticSite } from "@genealogy/core";
import {
  allParentOfEdges,
  allSpouseOfEdges,
  citations,
  configurableOptions,
  personEvents,
  personNames,
  persons,
  repositories,
  sources,
  unions,
  userProfiles,
  type Database,
} from "@genealogy/db";
import { buildSite, readViewerAssets, redactSiteData } from "@genealogy/static-site";
import { InjectQueue } from "@nestjs/bullmq";
import { BadRequestException, Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Queue } from "bullmq";
import { count, eq, inArray } from "drizzle-orm";
import { Zip, ZipDeflate, ZipPassThrough } from "fflate";
import type { Pool } from "pg";

import { DRIZZLE, PG_POOL } from "../database/database.module.js";
import { NotificationService } from "../notification/notification.service.js";
import { SettingsService } from "../settings/settings.service.js";
import { ThemeService } from "../theme/theme.service.js";
import { assembleSiteData, type SiteRows } from "./site-data.js";

export const STATIC_SITE_QUEUE = "static-site";
export const GENERATE_STATIC_SITE_JOB = "generate";

export interface GenerateStaticSiteJob {
  userId: string;
  options: CreateStaticSite;
}

/** The folder everything sits in inside the zip, so unzipping doesn't scatter files. */
const ZIP_FOLDER = "family-website";
/** The option topics whose labels the site shows. */
const LABEL_TOPICS = ["event_type", "name_variant_type", "confidence", "union_status", "parentage"];
/** Already compressed — stored, not deflated again. */
const STORED = /\.(jpe?g|png|gif|webp|avif|heic)$/i;

/**
 * Exports the whole tree as a static website (see "Static family website"
 * in TECH_STACK.md) — same "enqueue now, notify when the file is ready"
 * shape as `BackupService`: the router only enqueues, `StaticSiteProcessor`
 * calls `generate` once BullMQ hands the job to a worker, and
 * `StaticSiteController` serves the zip once and deletes it.
 *
 * The privacy rule (`redactSiteData`) runs before anything else touches the
 * data: before the photos are read, so a living person's photo is never
 * even opened, and before `buildSite` (which runs it again itself).
 */
@Injectable()
export class StaticSiteService {
  private readonly logger = new Logger(StaticSiteService.name);

  constructor(
    @InjectQueue(STATIC_SITE_QUEUE) private readonly queue: Queue<GenerateStaticSiteJob>,
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly config: ConfigService,
    private readonly notifications: NotificationService,
    private readonly settings: SettingsService,
    private readonly themes: ThemeService,
  ) {}

  /** Refuses an empty tree up front, rather than queueing a job that would build an empty site. */
  async enqueue(userId: string, options: CreateStaticSite): Promise<void> {
    const [row] = await this.db.select({ total: count() }).from(persons);
    if (!row || row.total === 0) {
      throw new BadRequestException("There is no one in the tree to export yet");
    }
    await this.queue.add(GENERATE_STATIC_SITE_JOB, { userId, options });
  }

  /** Called only by `StaticSiteProcessor`. Throws on failure — left to BullMQ's own retry, same as `BackupService.createDump`. */
  async generate(userId: string, options: CreateStaticSite): Promise<void> {
    const [rows, ownPersonId, treeSettings, theme] = await Promise.all([
      this.gather(),
      this.ownPersonId(userId),
      this.settings.getTreeSettings(),
      // The family site's theme, not the exporting admin's own choice.
      this.themes.active(null),
    ]);
    const data = redactSiteData(
      assembleSiteData(rows, {
        options,
        ownPersonId,
        treeSettings,
        theme: theme.definition,
        exportedAt: new Date(),
      }),
    );

    // Each photo the site still shows, read from UPLOADS_DIR. A missing
    // file (deleted by hand, a restore without the uploads volume) just
    // leaves that person with initials, rather than failing the export.
    const uploadsDir = this.config.getOrThrow<string>("UPLOADS_DIR");
    const photoPathByPublicId = new Map(rows.persons.map((row) => [row.publicId, row.photoPath]));
    const photos = new Map<string, Uint8Array>();
    await Promise.all(
      data.people.map(async (person) => {
        const source = photoPathByPublicId.get(person.id);
        if (!person.photo || !source) return;
        try {
          photos.set(person.photo, await readFile(join(uploadsDir, source)));
        } catch {
          this.logger.warn(`Photo for ${person.id} is missing from UPLOADS_DIR; left out`);
          person.photo = null;
        }
      }),
    );

    const pages = buildSite(data);
    const assets = await readViewerAssets();
    const encoder = new TextEncoder();
    const entries: Array<[string, Uint8Array]> = [
      ...[...pages].map(([path, text]): [string, Uint8Array] => [path, encoder.encode(text)]),
      ...assets,
      ...photos,
    ];

    const dir = this.config.getOrThrow<string>("STATIC_SITES_DIR");
    await mkdir(dir, { recursive: true });
    const id = randomUUID();
    const path = join(dir, `${id}.zip`);
    this.logger.log(
      `Writing static site ${id} for user ${userId}: ${data.people.length} people, ${photos.size} photos`,
    );
    try {
      await writeZip(path, entries);
    } catch (error) {
      // Same reasoning as BackupService.createDump: nothing else ever looks
      // at a partial file with no notification pointing at it.
      await rm(path, { force: true });
      throw error;
    }

    await this.notifications.create({
      userId,
      type: "static_site_ready",
      title: "Family website ready",
      body: `The static website (${data.people.length} people) is ready to download. Unzip it and open index.html, or upload the folder to any web server.`,
      // A frontend route, proxied through to StaticSiteController — see
      // "The proxy architecture" in CLAUDE.md.
      actionUrl: `/api/static-sites/${id}`,
    });
  }

  /**
   * Everyone and everything the site shows. Separate unsynchronized reads,
   * like `GedcomService.exportAll` and for the same reason: a person added
   * mid-export at worst leaves a dangling edge, which `assembleSiteData`
   * drops.
   */
  private async gather(): Promise<SiteRows> {
    const [
      personRows,
      names,
      events,
      unionRows,
      sourceRows,
      repositoryRows,
      citationRows,
      options,
      parentEdges,
      spouseEdges,
    ] = await Promise.all([
      this.db.select().from(persons),
      this.db.select().from(personNames),
      this.db.select().from(personEvents),
      this.db.select().from(unions),
      this.db.select().from(sources),
      this.db.select().from(repositories),
      this.db.select().from(citations),
      this.db
        .select({
          topic: configurableOptions.topic,
          key: configurableOptions.key,
          label: configurableOptions.label,
        })
        .from(configurableOptions)
        .where(inArray(configurableOptions.topic, LABEL_TOPICS)),
      allParentOfEdges(this.pool),
      allSpouseOfEdges(this.pool),
    ]);
    const labels = new Map<string, Map<string, string>>();
    for (const option of options) {
      const topic = labels.get(option.topic) ?? new Map<string, string>();
      topic.set(option.key, option.label);
      labels.set(option.topic, topic);
    }
    return {
      persons: personRows,
      names,
      events,
      unions: unionRows,
      sources: sourceRows,
      repositories: repositoryRows,
      citations: citationRows,
      parentEdges,
      spouseEdges,
      labels,
    };
  }

  private async ownPersonId(userId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ personId: userProfiles.personId })
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId))
      .limit(1);
    return row?.personId ?? null;
  }
}

/**
 * Streams the files into a zip on disk, under one top folder. Text is
 * deflated; photos are stored as they are, since compressing a JPEG again
 * only costs time. fflate's `Zip` hands back chunks as each file is added,
 * so the archive is written as it's built.
 */
function writeZip(path: string, entries: ReadonlyArray<[string, Uint8Array]>): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const out = createWriteStream(path);
    out.on("error", reject);
    out.on("finish", resolve);
    const zip = new Zip((error, chunk, final) => {
      if (error) {
        out.destroy(error);
        reject(error);
        return;
      }
      out.write(chunk);
      if (final) out.end();
    });
    try {
      for (const [name, contents] of entries) {
        const entryName = `${ZIP_FOLDER}/${name}`;
        const file = STORED.test(name)
          ? new ZipPassThrough(entryName)
          : new ZipDeflate(entryName, { level: 6 });
        zip.add(file);
        file.push(contents, true);
      }
      zip.end();
    } catch (error) {
      out.destroy();
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}
