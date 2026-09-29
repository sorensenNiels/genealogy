import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { finished } from "node:stream/promises";

import { InjectQueue } from "@nestjs/bullmq";
import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Queue } from "bullmq";

import { NotificationService } from "../notification/notification.service.js";
import { ImmichService } from "./immich.service.js";

export const ALBUM_ZIP_QUEUE = "album-zip";
export const GENERATE_ALBUM_ZIP_JOB = "generate";

export interface GenerateAlbumZipJob {
  userId: string;
  /** Omitted → every album in the library, not just one. */
  albumId?: string;
}

/**
 * Zips one album, or the whole photo library, as one or more downloadable
 * archives — same "enqueue now, notify when the file is ready" shape as
 * `BackupService`, and for the same reason: Immich's own archive generation
 * can take a while for a large album or library, too long to hold a
 * request/response open for it.
 */
@Injectable()
export class AlbumZipService {
  private readonly logger = new Logger(AlbumZipService.name);

  constructor(
    @InjectQueue(ALBUM_ZIP_QUEUE) private readonly queue: Queue<GenerateAlbumZipJob>,
    private readonly config: ConfigService,
    private readonly notifications: NotificationService,
    private readonly immich: ImmichService,
  ) {}

  /**
   * Resolves how many assets a job would cover and what to call it —
   * called synchronously from the router before enqueueing, so an empty
   * album/library shows an immediate error instead of a job that silently
   * fails with no notification (`generateZips` below never gets to run).
   */
  async resolveJobScope(albumId?: string): Promise<{ assetIds: string[]; label: string }> {
    if (albumId) {
      const [album, assets] = await Promise.all([
        this.immich.getAlbum(albumId),
        this.immich.albumAssets(albumId),
      ]);
      return { assetIds: assets.map((asset) => asset.id), label: album.albumName };
    }
    const albums = await this.immich.listAlbums();
    const assetLists = await Promise.all(albums.map((album) => this.immich.albumAssets(album.id)));
    const assetIds = [...new Set(assetLists.flat().map((asset) => asset.id))];
    return { assetIds, label: "your photo library" };
  }

  async enqueueAlbumZip(userId: string, albumId?: string): Promise<void> {
    const { assetIds } = await this.resolveJobScope(albumId);
    if (assetIds.length === 0) {
      throw new BadRequestException(
        albumId ? "This album has no photos to download" : "There are no photos to download yet",
      );
    }
    await this.queue.add(GENERATE_ALBUM_ZIP_JOB, { userId, ...(albumId ? { albumId } : {}) });
  }

  /** Called only by `AlbumZipProcessor`. Throws on failure — left to BullMQ's own retry, same as `BackupService.createDump`. */
  async generateZips(userId: string, albumId?: string): Promise<void> {
    const { assetIds, label } = await this.resolveJobScope(albumId);
    if (assetIds.length === 0) return; // Nothing left to zip — the source album/library was emptied after enqueueing.

    const dir = this.config.getOrThrow<string>("ALBUM_ZIPS_DIR");
    await mkdir(dir, { recursive: true });
    const groups = await this.immich.downloadGroupsForAssetIds(assetIds);
    this.logger.log(`Generating ${groups.length} zip(s) for "${label}", user ${userId}`);

    await Promise.all(
      groups.map((group, index) =>
        this.generateOneZip(userId, label, group.assetIds, index + 1, groups.length, dir),
      ),
    );
  }

  private async generateOneZip(
    userId: string,
    label: string,
    assetIds: string[],
    part: number,
    totalParts: number,
    dir: string,
  ): Promise<void> {
    const id = randomUUID();
    const path = join(dir, `${id}.zip`);
    const suffix = totalParts > 1 ? ` (part ${part} of ${totalParts})` : "";

    try {
      const { body } = await this.immich.downloadArchive(assetIds, `${label}${suffix}.zip`);
      await finished(Readable.fromWeb(body).pipe(createWriteStream(path)));
    } catch (error) {
      // Same reasoning as BackupService.createDump: nothing else ever looks
      // at a partial file with no notification pointing at it.
      await rm(path, { force: true });
      throw error;
    }

    await this.notifications.create({
      userId,
      type: "album_zip_ready",
      title: `Photo download ready${suffix}`,
      body: `"${label}" has finished zipping and is ready to download.`,
      actionUrl: `/api/immich/album-zips/${id}`,
    });
  }
}
