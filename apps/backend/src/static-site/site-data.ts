import type {
  CreateStaticSite,
  HistoricalDate,
  ThemeDefinition,
  TreeSettings,
} from "@genealogy/core";
import type {
  CitationRow,
  PersonEventRow,
  PersonNameRow,
  PersonRow,
  RepositoryRow,
  SourceRow,
  UnionRow,
} from "@genealogy/db";
import type { SiteCitation, SiteData, SitePerson } from "@genealogy/static-site";

/** Everything read from the two stores for one export — see `StaticSiteService.gather`. */
export interface SiteRows {
  persons: PersonRow[];
  names: PersonNameRow[];
  events: PersonEventRow[];
  unions: UnionRow[];
  sources: SourceRow[];
  repositories: RepositoryRow[];
  citations: CitationRow[];
  parentEdges: Array<{ parentId: string; childId: string; parentage: string }>;
  spouseEdges: Array<{ aId: string; bId: string }>;
  /** Configurable-option labels, by topic then key. */
  labels: Map<string, Map<string, string>>;
}

export interface SiteSettings {
  options: CreateStaticSite;
  /** The exporting admin's own linked person, the default start. */
  ownPersonId: string | null;
  treeSettings: TreeSettings;
  theme: ThemeDefinition;
  exportedAt: Date;
}

/** Where a person's profile photo goes inside the site — named by publicId, so it's a safe file name whatever the upload was called. */
export function sitePhotoPath(publicId: string, photoPath: string): string {
  const extension = /\.([A-Za-z0-9]{1,5})$/.exec(photoPath)?.[1]?.toLowerCase() ?? "jpg";
  return `assets/photos/${publicId}.${extension}`;
}

/**
 * Turns database rows into `buildSite`'s input: people keyed by their
 * `publicId` (stable across exports, unlike nothing else here — and never
 * the database UUID), every option key replaced by its label, and each
 * citation attached to the fact it evidences. Pure, so it's tested without a
 * database. Redaction is not done here: `StaticSiteService` runs
 * `redactSiteData` on the result, and `buildSite` runs it again.
 *
 * Left out on purpose: research notes (working notes, not results),
 * witnesses/godparents and their citations, external ids, and Immich
 * photos (profile photos only — see "Static family website" in
 * TECH_STACK.md).
 */
export function assembleSiteData(rows: SiteRows, settings: SiteSettings): SiteData {
  const publicIds = new Map(rows.persons.map((person) => [person.id, person.publicId]));
  const label = (topic: string, key: string) => rows.labels.get(topic)?.get(key) ?? key;

  const siteCitation = (citation: CitationRow): SiteCitation => ({
    sourceId: citation.sourceId,
    page: citation.page,
    volume: citation.volume,
    entryId: citation.entryId,
    certificateNumber: citation.certificateNumber,
    confidence: label("confidence", citation.confidence),
    note: citation.note,
  });
  // Citations of one fact (a name, an event, a union), and of a person as a whole.
  const byFact = groupBy(
    rows.citations.filter(
      (citation) => citation.factId !== null && citation.factType !== "association",
    ),
    (citation) => `${citation.factType}:${citation.factId}`,
    siteCitation,
  );
  const byPerson = groupBy(
    rows.citations.filter((citation) => citation.factType === "person"),
    (citation) => citation.personId,
    siteCitation,
  );

  const namesByPerson = groupBy(
    rows.names,
    (name) => name.personId,
    (name) => name,
  );
  const eventsByPerson = groupBy(
    rows.events,
    (event) => event.personId,
    (event) => event,
  );

  const people = rows.persons.map((person): SitePerson => ({
    id: person.publicId,
    given: person.given,
    surname: person.surname,
    titlePrefix: person.titlePrefix,
    suffix: person.suffix,
    gender: person.gender,
    isLiving: person.isLiving,
    photo: person.photoPath ? sitePhotoPath(person.publicId, person.photoPath) : null,
    notes: person.notes,
    names: (namesByPerson.get(person.id) ?? []).map((name) => ({
      typeLabel: label("name_variant_type", name.nameType),
      given: name.given,
      surname: name.surname,
      since: name.since ?? null,
      notes: name.notes,
      citations: byFact.get(`name:${name.id}`) ?? [],
    })),
    events: (eventsByPerson.get(person.id) ?? []).map((event) => ({
      eventType: event.eventType,
      typeLabel: label("event_type", event.eventType),
      label: event.label,
      date: (event.date as HistoricalDate | null) ?? null,
      place: event.place,
      details: event.details ?? null,
      notes: event.notes,
      citations: byFact.get(`event:${event.id}`) ?? [],
    })),
    citations: byPerson.get(person.id) ?? [],
  }));

  const repositories = new Map(rows.repositories.map((repository) => [repository.id, repository]));
  const both = (a: string, b: string) => {
    const [x, y] = [publicIds.get(a), publicIds.get(b)];
    return x && y ? ([x, y] as [string, string]) : null;
  };

  const ownPublicId = settings.ownPersonId ? publicIds.get(settings.ownPersonId) : undefined;
  const startPublicId = settings.options.startPersonId
    ? publicIds.get(settings.options.startPersonId)
    : undefined;

  return {
    title: settings.options.title,
    exportedAt: settings.exportedAt.toISOString(),
    language: settings.options.language,
    startPersonId: startPublicId ?? ownPublicId ?? null,
    treeSettings: settings.treeSettings,
    theme: settings.theme,
    people,
    parentEdges: rows.parentEdges.flatMap((edge) => {
      const pair = both(edge.parentId, edge.childId);
      return pair
        ? [
            {
              parentId: pair[0],
              childId: pair[1],
              parentage: edge.parentage,
              parentageLabel: label("parentage", edge.parentage),
            },
          ]
        : [];
    }),
    spouseEdges: rows.spouseEdges.flatMap((edge) => {
      const pair = both(edge.aId, edge.bId);
      return pair ? [pair] : [];
    }),
    unions: rows.unions.flatMap((union) => {
      const pair = both(union.personAId, union.personBId);
      if (!pair) return [];
      return [
        {
          partnerIds: pair,
          statusLabel: label("union_status", union.status),
          startDate: (union.startDate as HistoricalDate | null) ?? null,
          startPlace: union.startPlace,
          endDate: (union.endDate as HistoricalDate | null) ?? null,
          endPlace: union.endPlace,
          notes: union.notes,
          citations: byFact.get(`union:${union.id}`) ?? [],
        },
      ];
    }),
    sources: rows.sources.map((source) => ({
      id: source.id,
      title: source.title,
      author: source.author,
      publication: source.publication,
      sourceType: source.sourceType,
      repository: source.repositoryId
        ? (repositories.get(source.repositoryId)?.name ?? null)
        : null,
      callNumber: source.callNumber,
    })),
  };
}

function groupBy<T, U>(
  items: readonly T[],
  key: (item: T) => string,
  map: (item: T) => U,
): Map<string, U[]> {
  const groups = new Map<string, U[]>();
  for (const item of items) {
    const group = groups.get(key(item));
    if (group) group.push(map(item));
    else groups.set(key(item), [map(item)]);
  }
  return groups;
}
