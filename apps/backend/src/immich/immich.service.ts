import { formatPersonName } from "@genealogy/core";
import { personImmichLinks, persons, type Database, type PersonImmichLinkRow } from "@genealogy/db";
import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { eq } from "drizzle-orm";

import { DRIZZLE } from "../database/database.module.js";

/** The handful of fields this app actually uses from Immich's `PersonResponseDto`. */
export interface ImmichPerson {
  id: string;
  name: string;
  isHidden: boolean;
}

/** The handful of fields this app actually uses from Immich's `AssetResponseDto`. */
export interface ImmichAsset {
  id: string;
  originalFileName: string;
  type: string;
}

/** The handful of fields this app actually uses from Immich's `AlbumResponseDto`. */
export interface ImmichAlbum {
  id: string;
  albumName: string;
  description: string;
  assetCount: number;
  albumThumbnailAssetId: string | null;
}

export interface LinkedImmichPerson extends ImmichPerson {
  /** `person_immich_links.id` — what `unlink` takes, not Immich's own id. */
  linkId: string;
}

export interface ImmichBinary {
  buffer: Buffer;
  contentType: string;
}

/**
 * Thin wrapper over Immich's REST API (native `fetch`, no client library —
 * see TECH_STACK.md's library-vetting rule; the surface used here is small
 * enough that owning it outright avoids a dependency on Immich's generated
 * SDK release cadence) plus the `person_immich_links` mapping table CRUD.
 * One service, like `PersonService`, rather than splitting the API client
 * from the mapping-table logic — they're small and tightly coupled.
 *
 * `IMMICH_URL`/`IMMICH_API_KEY` are optional app config (see env.ts):
 * Immich is opt-in infrastructure, so every public method here either checks
 * `isConfigured()` itself or is only ever called after the router already
 * has.
 */
@Injectable()
export class ImmichService {
  private readonly logger = new Logger(ImmichService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly config: ConfigService,
  ) {}

  isConfigured(): boolean {
    return Boolean(
      this.config.get<string>("IMMICH_URL") && this.config.get<string>("IMMICH_API_KEY"),
    );
  }

  private requireConfig(): { url: string; apiKey: string } {
    const url = this.config.get<string>("IMMICH_URL");
    const apiKey = this.config.get<string>("IMMICH_API_KEY");
    if (!url || !apiKey) {
      throw new BadRequestException("Immich is not configured");
    }
    return { url, apiKey };
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const { url, apiKey } = this.requireConfig();
    const response = await fetch(`${url}/api${path}`, {
      ...init,
      headers: { ...init.headers, "x-api-key": apiKey, accept: "application/json" },
    });
    if (!response.ok) {
      throw new BadRequestException(
        `Immich request failed: ${response.status} ${response.statusText} (${path})`,
      );
    }
    return response.json() as Promise<T>;
  }

  private async requestBinary(path: string): Promise<ImmichBinary> {
    const { url, apiKey } = this.requireConfig();
    const response = await fetch(`${url}/api${path}`, { headers: { "x-api-key": apiKey } });
    if (response.status === 404) {
      throw new NotFoundException(`Immich asset not found (${path})`);
    }
    if (!response.ok) {
      throw new BadRequestException(
        `Immich request failed: ${response.status} ${response.statusText} (${path})`,
      );
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    return { buffer, contentType: response.headers.get("content-type") ?? "image/jpeg" };
  }

  /** Every Immich "Person" (a face cluster), paginated — named or not; most start unnamed. */
  async listPeople(
    page: number,
    size: number,
  ): Promise<{ people: ImmichPerson[]; total: number; hasNextPage: boolean }> {
    const result = await this.request<{
      people: ImmichPerson[];
      total: number;
      hasNextPage: boolean;
    }>(`/people?page=${page}&size=${size}&withHidden=false`);
    return result;
  }

  private async getPerson(immichPersonId: string): Promise<ImmichPerson | null> {
    try {
      return await this.request<ImmichPerson>(`/people/${immichPersonId}`);
    } catch (error) {
      if (error instanceof NotFoundException) return null;
      throw error;
    }
  }

  async personThumbnail(immichPersonId: string): Promise<ImmichBinary> {
    return this.requestBinary(`/people/${immichPersonId}/thumbnail`);
  }

  /**
   * `PUT /people/{id}` is flagged deprecated in Immich's v3.2.2 OpenAPI spec
   * (superseded by a bulk `PUT /people`), but it's still live and is the
   * simpler call for renaming one person — matches this file's existing
   * single-id GET pattern, so kept rather than adopting the bulk form for
   * one row.
   */
  private async renamePerson(immichPersonId: string, name: string): Promise<void> {
    await this.request<ImmichPerson>(`/people/${immichPersonId}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
  }

  async assetThumbnail(assetId: string): Promise<ImmichBinary> {
    return this.requestBinary(`/assets/${assetId}/thumbnail?size=thumbnail`);
  }

  private async assetsForPersonIds(immichPersonIds: string[]): Promise<ImmichAsset[]> {
    if (immichPersonIds.length === 0) return [];
    const result = await this.request<{ assets: { items: ImmichAsset[] } }>("/search/metadata", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ personIds: immichPersonIds }),
    });
    return result.assets.items;
  }

  async listAlbums(): Promise<ImmichAlbum[]> {
    return this.request<ImmichAlbum[]>("/albums");
  }

  async albumAssets(albumId: string): Promise<ImmichAsset[]> {
    const result = await this.request<{ assets: { items: ImmichAsset[] } }>("/search/metadata", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ albumIds: [albumId] }),
    });
    return result.assets.items;
  }

  /**
   * Every Immich person linked to this genealogy person, resolved to
   * name/hidden status. A link whose Immich person was since deleted or
   * merged away is silently dropped rather than surfaced as an error — see
   * "browse and link only" in FEATURES.md: a dangling link should degrade
   * gracefully, not break the page.
   */
  async linkedPeople(personId: string): Promise<LinkedImmichPerson[]> {
    const links = await this.db
      .select()
      .from(personImmichLinks)
      .where(eq(personImmichLinks.personId, personId));
    const resolved = await Promise.all(
      links.map(async (link) => {
        const person = await this.getPerson(link.immichPersonId);
        return person ? [{ ...person, linkId: link.id }] : [];
      }),
    );
    return resolved.flat();
  }

  /** Every photo across all of this person's linked Immich person ids, deduplicated. */
  async photosForPerson(personId: string): Promise<ImmichAsset[]> {
    const links = await this.db
      .select({ immichPersonId: personImmichLinks.immichPersonId })
      .from(personImmichLinks)
      .where(eq(personImmichLinks.personId, personId));
    const assets = await this.assetsForPersonIds(links.map((link) => link.immichPersonId));
    return [...new Map(assets.map((asset) => [asset.id, asset])).values()];
  }

  /**
   * `immichPersonId` is unique across the whole table (see schema.ts) — one
   * face cluster represents at most one genealogy person — so a second link
   * attempt for an already-linked Immich person is rejected with a clear
   * reason rather than the raw unique-violation.
   */
  async link(personId: string, immichPersonId: string): Promise<PersonImmichLinkRow> {
    const person = await this.getPerson(immichPersonId);
    if (!person) {
      throw new BadRequestException("No such Immich person");
    }
    const [existing] = await this.db
      .select({ personId: personImmichLinks.personId })
      .from(personImmichLinks)
      .where(eq(personImmichLinks.immichPersonId, immichPersonId))
      .limit(1);
    if (existing) {
      throw new BadRequestException(
        existing.personId === personId
          ? "Already linked to this person"
          : "This Immich person is already linked to someone else",
      );
    }
    const [row] = await this.db
      .insert(personImmichLinks)
      .values({ personId, immichPersonId })
      .returning();
    if (!row) {
      throw new Error("Insert returned no row");
    }

    // Best-effort: push the tree person's name into Immich so its own UI
    // shows the same name instead of whatever it guessed (usually
    // "Unnamed"). Never blocks the link itself — a rename failure would be
    // an odd, transient Immich-side problem, not a reason to lose the link
    // the user just made, so it's logged rather than thrown. See "fails
    // open" in TECH_STACK.md for the same philosophy applied to reads.
    const [treePerson] = await this.db
      .select({ given: persons.given, surname: persons.surname })
      .from(persons)
      .where(eq(persons.id, personId))
      .limit(1);
    if (treePerson) {
      try {
        await this.renamePerson(immichPersonId, formatPersonName(treePerson));
      } catch (error) {
        this.logger.warn(
          `Could not sync name to Immich person ${immichPersonId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return row;
  }

  /** A no-op if the link was already removed. */
  async unlink(linkId: string): Promise<void> {
    await this.db.delete(personImmichLinks).where(eq(personImmichLinks.id, linkId));
  }
}
