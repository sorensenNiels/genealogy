import { isRedactedFor } from "@genealogy/core";

import type { SiteData, SitePerson } from "./types.js";

/**
 * Whether the site shows this person by name only: the Viewer rule
 * (`isRedactedFor` with the `viewer` role), so everyone living — the
 * exporting admin's own person included. A published site has no signed-in
 * reader to make an exception for.
 */
export function isRedactedOnSite(person: Pick<SitePerson, "isLiving">): boolean {
  return isRedactedFor("viewer", person);
}

/**
 * The site's privacy rule, applied to the data before any page is built.
 * A redacted person keeps their name, gender and place in the tree (their
 * parent and spouse links); everything else goes — photo, notes, alternate
 * names (a married name tells of a marriage), events and so every date and
 * place, and citations. A union with a redacted partner loses its details
 * too (its date is the living partner's marriage date); the couple stay
 * linked through the spouse edge. Sources no remaining citation points at
 * are dropped, since a source's title can itself name a living person
 * ("Birth certificate of …").
 *
 * `buildSite` runs this itself, so its output never depends on the caller
 * remembering to; apps/backend also runs it first, so it knows which photos
 * to copy.
 */
export function redactSiteData(data: SiteData): SiteData {
  const hidden = new Set(data.people.filter(isRedactedOnSite).map((person) => person.id));
  const people = data.people.map((person): SitePerson =>
    hidden.has(person.id)
      ? {
          id: person.id,
          given: person.given,
          surname: person.surname,
          titlePrefix: person.titlePrefix,
          suffix: person.suffix,
          gender: person.gender,
          isLiving: person.isLiving,
          photo: null,
          notes: null,
          names: [],
          events: [],
          citations: [],
        }
      : person,
  );
  const unions = data.unions.filter(
    (union) => !union.partnerIds.some((partnerId) => hidden.has(partnerId)),
  );

  const citedSourceIds = new Set<string>();
  for (const person of people) {
    for (const citation of [
      ...person.citations,
      ...person.names.flatMap((name) => name.citations),
      ...person.events.flatMap((event) => event.citations),
    ]) {
      citedSourceIds.add(citation.sourceId);
    }
  }
  for (const citation of unions.flatMap((union) => union.citations)) {
    citedSourceIds.add(citation.sourceId);
  }

  return {
    ...data,
    people,
    unions,
    sources: data.sources.filter((source) => citedSourceIds.has(source.id)),
  };
}
