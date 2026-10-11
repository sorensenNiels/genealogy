import { queryOptions, type QueryClient } from "@tanstack/react-query";

import { listAssociations } from "../server/functions/association.functions";
import { getHealth } from "../server/functions/health.functions";
import {
  getCensusGaps,
  getFamilyAtAGlance,
  getFeaturedAncestor,
  getLastTree,
  getMyLine,
  getOnThisDay,
  getRecentChanges,
  getRecentPeople,
  getResearchTodo,
  getTopPlaces,
  getUpkeep,
} from "../server/functions/overview.functions";
import {
  getPersonById,
  getRelatives,
  listEvents,
  listNames,
  listPersons,
  listUnions,
} from "../server/functions/person.functions";
import {
  getOverviewPreferences,
  getPeopleListPreferences,
} from "../server/functions/profile.functions";
import { listNotes } from "../server/functions/research-note.functions";
import { searchFullText } from "../server/functions/search.functions";
import {
  getOverviewSettings,
  getPeopleListSettings,
  getPersonSettings,
  listOptions,
} from "../server/functions/settings.functions";
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

/**
 * The person page's settings — and the name format every page uses (see
 * `usePersonName`), which is why the root loader prefetches them.
 */
export const personSettingsQuery = () =>
  queryOptions({ queryKey: ["settings", "personSettings"], queryFn: () => getPersonSettings() });

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

/** Which Overview cards show, and in what order (Settings → Overview). */
export const overviewSettingsQuery = () =>
  queryOptions({
    queryKey: ["settings", "overviewSettings"],
    queryFn: () => getOverviewSettings(),
  });

/** The Overview cards this member has hidden for themselves. */
export const overviewPreferencesQuery = () =>
  queryOptions({
    queryKey: ["profile", "overviewPreferences"],
    queryFn: () => getOverviewPreferences(),
  });

/** The Overview's "Your place in the tree" — null until the member says who they are. */
export const myLineQuery = () =>
  queryOptions({ queryKey: ["overview", "myLine"], queryFn: () => getMyLine() });

/** The Overview's "Continue where you left off": the tree's last centre, chart and direction. */
export const lastTreeQuery = () =>
  queryOptions({ queryKey: ["overview", "lastTree"], queryFn: () => getLastTree() });

/** The people this member opened most recently, newest first. */
export const recentPeopleQuery = () =>
  queryOptions({ queryKey: ["overview", "recentPeople"], queryFn: () => getRecentPeople() });

/** "On this day" for the member's own date (YYYY-MM-DD). */
export const onThisDayQuery = (today: string) =>
  queryOptions({
    queryKey: ["overview", "onThisDay", today],
    queryFn: () => getOnThisDay({ data: { today } }),
  });

/** The day's featured ancestor — a different one each day. */
export const featuredAncestorQuery = (today: string) =>
  queryOptions({
    queryKey: ["overview", "featuredAncestor", today],
    queryFn: () => getFeaturedAncestor({ data: { today } }),
  });

export const familyAtAGlanceQuery = () =>
  queryOptions({ queryKey: ["overview", "familyAtAGlance"], queryFn: () => getFamilyAtAGlance() });

export const topPlacesQuery = () =>
  queryOptions({ queryKey: ["overview", "topPlaces"], queryFn: () => getTopPlaces() });

/** Editors only, like the procedures behind them. */
export const researchTodoQuery = () =>
  queryOptions({ queryKey: ["overview", "researchTodo"], queryFn: () => getResearchTodo() });

export const censusGapsQuery = () =>
  queryOptions({ queryKey: ["overview", "censusGaps"], queryFn: () => getCensusGaps() });

export const recentChangesQuery = () =>
  queryOptions({ queryKey: ["overview", "recentChanges"], queryFn: () => getRecentChanges() });

/** Admins only. The server keeps the counts for ten minutes; "Check again" asks it to redo them. */
export const upkeepQuery = () =>
  queryOptions({
    queryKey: ["overview", "upkeep"],
    queryFn: () => getUpkeep({ data: { refresh: false } }),
  });
