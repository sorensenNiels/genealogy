import { queryOptions, type QueryClient } from "@tanstack/react-query";

import { listAssociations } from "../server/functions/association.functions";
import { getHealth } from "../server/functions/health.functions";
import {
  getPersonById,
  getRelatives,
  listEvents,
  listNames,
  listPersons,
  listUnions,
} from "../server/functions/person.functions";
import { getPeopleListPreferences } from "../server/functions/profile.functions";
import { listNotes } from "../server/functions/research-note.functions";
import { searchFullText } from "../server/functions/search.functions";
import { getPeopleListSettings, listOptions } from "../server/functions/settings.functions";
import { listCitations, listSources } from "../server/functions/source.functions";
import { getActiveTheme, getThemeState } from "../server/functions/theme.functions";

/*
 * Query definitions shared by a route's `loader` and its component. A loader
 * prefetches into the same cache entry the component then reads, so the two
 * must agree on key and function exactly — defining each once here is what
 * keeps them from drifting apart. Add a query here when a route loader needs
 * it; one-off queries can stay inline in their component.
 */

export const healthQuery = () => queryOptions({ queryKey: ["health"], queryFn: () => getHealth() });

export type PersonListInput = Parameters<typeof listPersons>[0]["data"];

export const personListQuery = (input: PersonListInput) =>
  queryOptions({
    queryKey: ["person", "list", input],
    queryFn: () => listPersons({ data: input }),
  });

/** Just the total — the Overview's person count. */
export const PERSON_COUNT_INPUT = { limit: 1, offset: 0, search: null } as const;

export const listOptionsQuery = () =>
  queryOptions({ queryKey: ["settings", "listOptions"], queryFn: () => listOptions() });

export const personByIdQuery = (id: string) =>
  queryOptions({
    queryKey: ["person", "byId", id],
    queryFn: () => getPersonById({ data: { id } }),
  });

export const relativesQuery = (id: string) =>
  queryOptions({
    queryKey: ["person", "relatives", id],
    queryFn: () => getRelatives({ data: { id } }),
  });

export const namesQuery = (personId: string) =>
  queryOptions({
    queryKey: ["person", "listNames", personId],
    queryFn: () => listNames({ data: { personId } }),
  });

export const eventsQuery = (personId: string) =>
  queryOptions({
    queryKey: ["person", "listEvents", personId],
    queryFn: () => listEvents({ data: { personId } }),
  });

export const unionsQuery = (personId: string) =>
  queryOptions({
    queryKey: ["person", "listUnions", personId],
    queryFn: () => listUnions({ data: { personId } }),
  });

export const sourcesQuery = () =>
  queryOptions({ queryKey: ["source", "listSources"], queryFn: () => listSources() });

export const citationsQuery = (personId: string) =>
  queryOptions({
    queryKey: ["source", "listCitations", personId],
    queryFn: () => listCitations({ data: { personId } }),
  });

export const researchNotesQuery = (personId: string) =>
  queryOptions({
    queryKey: ["researchNote", "listNotes", personId],
    queryFn: () => listNotes({ data: { personId } }),
  });

export const associationsQuery = (personId: string) =>
  queryOptions({
    queryKey: ["association", "list", personId],
    queryFn: () => listAssociations({ data: { personId } }),
  });

/** Prefetches everything the person page reads — its route loader. */
export const prefetchPersonPage = (queryClient: QueryClient, personId: string) =>
  Promise.all([
    queryClient.prefetchQuery(personByIdQuery(personId)),
    queryClient.prefetchQuery(relativesQuery(personId)),
    queryClient.prefetchQuery(namesQuery(personId)),
    queryClient.prefetchQuery(eventsQuery(personId)),
    queryClient.prefetchQuery(unionsQuery(personId)),
    queryClient.prefetchQuery(sourcesQuery()),
    queryClient.prefetchQuery(citationsQuery(personId)),
    queryClient.prefetchQuery(researchNotesQuery(personId)),
    queryClient.prefetchQuery(associationsQuery(personId)),
    queryClient.prefetchQuery(listOptionsQuery()),
  ]);

/** The theme applied app-wide (the root loader prefetches it, so it's in the server-rendered page). */
export const activeThemeQuery = () =>
  queryOptions({ queryKey: ["theme", "active"], queryFn: () => getActiveTheme() });

/** The theme pickers' data: every theme, the site default, the member's own. */
export const themeStateQuery = () =>
  queryOptions({ queryKey: ["theme", "state"], queryFn: () => getThemeState() });

/** The /search page's full-text results for one query (at least two characters — the server refuses less). */
export const fullTextSearchQuery = (query: string) =>
  queryOptions({
    queryKey: ["search", "fullText", query],
    queryFn: () => searchFullText({ data: { query } }),
    enabled: query.trim().length >= 2,
  });

/** The People list's site-wide defaults (Settings → People list). */
export const peopleListSettingsQuery = () =>
  queryOptions({
    queryKey: ["settings", "peopleListSettings"],
    queryFn: () => getPeopleListSettings(),
  });

/** This member's own People list choices (table/cards, compact/detailed); empty until they pick. */
export const peopleListPreferencesQuery = () =>
  queryOptions({
    queryKey: ["profile", "peopleListPreferences"],
    queryFn: () => getPeopleListPreferences(),
  });
