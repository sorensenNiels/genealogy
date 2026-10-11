# Ideas

Everything not built yet. [FEATURES.md](FEATURES.md) lists what's built (✅).
This file holds the rest: **planned** work (🚧) that's been decided on, and
**ideas** (💡) that haven't. When an idea is decided on, move it to "Planned"
as 🚧; when something ships, move it to FEATURES.md as ✅. Record any decision
it needs in [TECH_STACK.md](TECH_STACK.md).

Each idea notes what it **builds on** where the groundwork already exists. Those
are usually the cheapest wins. Ideas that depend on an outside service or a new
library are marked **unresearched** until someone checks them against the
"Recommending or adding a library" rule in [CLAUDE.md](CLAUDE.md). An idea
added in the October 2026 review is marked 🆕.

## Planned

Decided on, not built yet.

**Platform**

- 🚧 **Self-hosted deployment packaging:** docker-compose and backup/restore
  docs, including documenting Immich as optional infrastructure (~6–8 GB RAM)
  and keeping `UPLOADS_DIR` on a persistent volume.

**Sharing**

- 💡 **Family website: a size warning.** The export (built — see "Static
  family website" in TECH_STACK.md) has no warning for a very large tree
  with many profile photos; the zip just grows. Research notes are left out
  on purpose (working notes, not results) — revisit if anyone asks.

## Up next

Picked on 2026-09-28 as the next two to scope, one from each focus area
(duplicate person detection has since shipped — see FEATURES.md):

- 💡 **Shareable read-only tree links.** Share a branch publicly without a full
  account. _Builds on:_ the Viewer redaction (living people by name only),
  which a public link would apply to everyone.

## Research aids

- 💡 🆕 **Consistency warnings.** Flag facts that can't all be true: a child born
  before a parent was 12 or after a mother died, death before birth, marriage
  before 14, a "living" person over 110, events after burial. Shown on the
  person page and as a Tools-page report. _Builds on:_ the data integrity check
  and parsed date bounds (`earliest`/`latest`).
- 💡 🆕 **Conflicting evidence, side by side.** When sources disagree (two birth
  dates), keep both, show them together with their citations, and let the user
  mark one as preferred. GEDCOM import currently turns a second birth into an
  "other" event, so this would also make import less lossy.
- 💡 🆕 **Research log.** Record searches as well as findings ("Brande parish
  burials 1800–1830: searched, nothing found"), so the same record isn't
  searched twice. _Builds on:_ research notes.
- 💡 🆕 **Transcriptions and links on citations.** Add a verbatim transcription
  field and a URL field (e.g. a deep link to the scanned page in an online
  archive). Today `sources`/`citations` have neither, and GEDCOM import has to
  drop `SOUR.TEXT`. A URL is also the ToS-safe answer for Find A Grave (see
  External data).
- 💡 🆕 **Merge duplicate sources.** Importing the same file twice leaves two
  copies of each source and repository; person merge rightly doesn't touch
  them, since sources are shared. A source merge (re-pointing citations) is the
  missing half. _Builds on:_ the person merge's identical-citation collapsing.
- 💡 🆕 **Import media from a GEDCOM 7 zip (`.gdz`).** A 5.5.1 file only holds
  photo paths, but a GEDCOM 7 zip carries the files — those could go into
  Immich, linked to the people. _Builds on:_ Immich upload and person links.
- 💡 🆕 **Source library page.** Browse every source and see everything it's
  cited for. There's no Sources page today; sources are only reachable through
  the people who cite them.
- 💡 🆕 **Record-type templates.** Structured entry for common Danish records
  (church book baptism/marriage/burial, folketælling/census, lægdsrulle/military
  levy roll, skifte/probate) that fills in the source, citation and facts in one
  go instead of five dialogs.
- 💡 🆕 **Name-aware matching.** Treat patronymic and spelling variants as
  possible matches (Søren/Sören, Christensen/Kristensen, Sørensen/Sörensen,
  æ/ø/å vs. ae/oe/aa) in search. Duplicate detection and the People list's
  "Similar spellings" already do this (`soundKey`/`surnameStem` in
  `packages/core/src/duplicate-match.ts`, `nameWordMatches` in
  `person-list.ts`); what's left is full-text search (`/search`), which
  uses Postgres' `simple` configuration and folds neither. _Builds on:_ those keys.
- 💡 🆕 **FAN-club view.** Show who keeps appearing around a person (godparents,
  witnesses, neighbours in a census), which is the classic way through a brick
  wall. _Builds on:_ the associations table and its "name only" associates.

**Census records** (October 2026 review). A census page lists a whole
household — family, servants, lodgers — with each person's position in it,
and genealogists work from the values _as written_ (age, occupation,
birthplace). Today a census can only be a per-person event with a free
detail, and citations have no URL for the scan.

- 💡 🆕 **A URL on citations.** A `url` column on `citations` for a scan
  at Rigsarkivet/DDD, useful for every source type. (Records — census,
  church books — already have their own; the `census` event type now
  exists, seeded with the census feature.)
- 💡 🆕 **Faster entry.** A keyboard-friendly transcription grid, and import
  from a Dansk Demografisk Database (DDD) search result (format not yet
  checked).

**Record-based research** (October 2026 review). Census showed the pattern:
enter _one record_ as written, link _everyone in it_, and let the app
create the events, roles and citations. Generalised into a record
framework with templates (census, baptism, marriage, burial — see
FEATURES.md); further record types become further templates:

- 💡 🆕 **Probate (skifteprotokoller).** Deceased, surviving spouse, every
  heir with age and residence, married daughters with husbands, guardians
  for minors — often the best evidence of who someone's children were.
  Heirs suggest parent–child links and married names, and flag children
  missing from the tree. Needs a `probate` event type (GEDCOM `PROB`).
- 💡 🆕 **Confirmation lists** — a template like baptism (the confirmand,
  parents, the parish), giving a confirmation event.
- 💡 🆕 **Church book moves (tilgang/afgang).** Arrival and departure lists:
  where people moved from and to — a residence/migration event each.
- 💡 🆕 **Military levy rolls (lægdsruller).** Danish: boys and men followed
  from birth with father's name, age and moves between parishes, year after
  year — how you trace a man who moved. A residence event per roll entry.
- 💡 🆕 **Emigration (Copenhagen Police emigration records, 1869–1940).**
  Destination, ship, contract number, travel companions (often relatives) —
  onto the existing Emigration event type (ship/port fields).
- 💡 🆕 **Farm and place histories (gårdhistorie).** Everyone who owned or
  lived at "Nørregaard" over time, from record addresses (census, church
  books) and deeds — Danish research often follows the farm, not the
  surname. _Builds on:_ record addresses and the `places` table.
- 💡 🆕 **FAN club view** (Friends, Associates, Neighbours). Who keeps
  appearing around a person across records — godparents, witnesses, census
  neighbours, guardians — often hidden relatives; a classic brick-wall
  method. _Builds on:_ associations and record rows.
- 💡 🆕 **Search log per source.** "Which church books have I searched, for
  which parish and years?" — the place-based counterpart of census
  coverage. Extends the research log idea above.
- 💡 🆕 **DNA matches** (unresearched). Matches from Ancestry/MyHeritage
  with shared cM, placed in the tree, clustered by branch. Needs a design
  decision on how much DNA data to keep.

## Places & maps

- 💡 **Map view.** Plot birthplaces and migrations across generations, with a
  heat map of where ancestors came from. _Builds on:_ the PostGIS `places` table
  (coordinates already stored, filled from GEDCOM `PLAC.MAP`).
- 💡 **Cemetery and grave tracking.** Grave locations with map pins and
  headstone photos.
- 💡 🆕 **Place hierarchy and historical jurisdictions.** Model sogn (parish) →
  herred → amt (and later kommune/region), so "Brande" and "Brande sogn,
  Hammerum herred, Ringkøbing amt" are the same place, and records can be
  found by the parish that kept them. Places are a flat list of text today.
- 💡 🆕 **Place cleanup tool.** List every place spelling in use, merge
  variants, and attach coordinates by hand. This matters most after a GEDCOM
  import. _Builds on:_ the `places` table.

## Tree & visualization

- 💡 **Relationship calculator.** "How are X and Y related" (e.g. second cousin
  once removed) for any two people, not just the tree's centre. _Builds on:_
  `kinshipsFrom`/`formatKinship` in core, which the tree's card labels use.
- 💡 **Printable chart exports.** Fan chart and large-format pedigree or
  descendant posters (PDF or image), for printing and framing.
- 💡 🆕 **Pedigree collapse highlighting.** Mark ancestors who appear more than
  once (cousin marriages are common in rural parishes), and count unique
  ancestors per generation.
- 💡 🆕 **"Who's missing" ancestor grid.** A 2/4/8/16/32 grid per generation
  showing which ancestor slots are filled, unknown, or sourced. It's a quick
  visual to-do list. _Builds on:_ `treeAround`.
- 💡 🆕 **Family statistics.** Lifespans by century, most common names, family
  sizes, where people were born, surname distribution.

**Tree view, after the move to topola** (October 2026). The tree is drawn by
topola with our own card renderer — see "Tree view: topola" in TECH_STACK.md.
Files these ideas touch: `apps/frontend/src/routes/tree.tsx` (page, side
panel, data merging), `routes/-topola-chart.tsx` (React wrapper), and in
`packages/tree-chart/src/` (shared with the static site) `chart.ts` (topola +
d3-zoom), `card-renderer.ts` (the cards, drawn with D3) and `topola-data.ts`
(our data → topola families, card text), and tree
display settings in `packages/core/src/app-settings.ts` (a new setting is a
schema field with a default plus a form field in `routes/settings.tsx`; no
migration).

_More on each card_

- 💡 🆕 **Research badges.** Small markers on a card for "no sources", "no
  birth date", "parents unknown" — the tree as a visual research to-do list.
  Needs a count of citations per person in `person.tree`'s result (one
  grouped query over `citations` for the tree's person ids, in
  `PersonService.tree`), carried into `TreeCard`; "parents unknown" is "in
  `parentsKnownIds` and has no parent edge". A tree setting to turn badges on
  and off.
- 💡 🆕 **Hover preview.** A small pop-up on hover with a larger photo, full
  dates and places, without changing the panel. Render it in React (a
  positioned div over the canvas), positioned from the hovered card's screen
  rect; the card renderer only reports hover in/out with the person id.
  Not on touch devices; keyboard focus (see above) should show it too.
- 💡 🆕 **Immich face as a fallback photo.** A person with no profile photo
  but a linked Immich face shows that face on the card. Builds on:
  `person_immich_links` and the face-thumbnail proxy
  (`/api/immich/people/$id/thumbnail`). Only while `useImmichAvailable()` is
  true; `person.tree` would return the first linked Immich person id per
  person.

_Seeing patterns_

- 💡 🆕 **"Colour by" setting.** Tint cards by surname, century of birth,
  birth region, or how well-sourced the person is, with a small legend. A
  `colorBy` tree setting (structural enum, like `dateDetail`); the card
  renderer adds a class or inline fill per card. Surname/region colours from
  a fixed palette by hash, so they're stable between visits.
- 💡 🆕 **Pedigree collapse on the tree.** The "Pedigree collapse
  highlighting" idea above, on the cards: someone drawn twice (topola draws
  them once per path) gets a small "appears 2×" marker; clicking it pans to
  the other copy. Topola gives repeat copies distinct node ids (`id:1`,
  `id:2`) but the same `indi.id` — count `g.indi` per person id after render.
- 💡 🆕 **Path between two people.** Pick two people (e.g. shift-click) and
  the chart highlights the cards and lines connecting them. Find the path in
  `merged` (breadth-first over parent and spouse edges), then add a class to
  those `g.indi` and to the `path.link` elements between them (topola's link
  ids are `parentNodeId:childNodeId`).

_Suggested order_ (from the October 2026 review): the "getting around a big
tree" and "doing things from the tree" ideas have shipped — see FEATURES.md.
Research badges next.

## Overview (the landing page)

Built: "Your place in the tree", "Continue where you left off", the family
cards (On this day, Featured ancestor, The family at a glance, Where the
family came from), the research cards for editors (Research to-do, Census
gaps, Recently added and changed), the upkeep cards for admins (Things to
look at, System status), and Settings → Overview with each member's own
hidden cards — see FEATURES.md. Still open:

- 💡 🆕 **A map for "Where the family came from".** Birthplaces on a map
  instead of a list. _Builds on:_ place coordinates (PostGIS, no map UI
  yet) — see Places & maps.
- 💡 🆕 **Who changed what.** "Recently added and changed" says what and
  when; who needs an audit log, which nothing records yet (see Change
  history under Person page).
- 💡 🆕 **Upkeep counts on a schedule.** "Things to look at" runs the Tools
  reports on demand and caches them for ten minutes in memory; a large
  tree may want them computed by a queued job instead.

## People list

Ideas from the October 2026 review of the People list
(`apps/frontend/src/routes/people/index.tsx`, `-people-card-view.tsx`; the
query is `PersonService.list` with `listFilter`/`sortColumns`). Already
built: word-by-word name search over primary and alternate names (with
"Similar spellings"), grouping, a column chooser, one- or two-line rows,
header
sorting, the place/born/gender/"Missing"/"My ancestors"/"Open research
notes" filters, all of it in the URL, and table and card views — see
FEATURES.md.

_Research-oriented_

- 💡 🆕 **Completeness column.** The research checklist's percentage as a
  small bar per row, sortable, so the least-researched people come first.
  The "Missing" filter answers "who lacks X"; this answers "who needs the
  most work". Parents are in the graph, so sorting on it needs the same
  graph-side set the "Missing: both parents" filter uses.
- 💡 🆕 **Relationship column.** "Your 2nd great-grandfather", relative to
  the signed-in member's own person ("this is me"), with a "within N
  generations of me" filter. _Builds on:_ `kinshipsFrom`/`formatKinship`
  (the tree's card labels), run server-side over the graph.
- 💡 🆕 **More filters:** has a photo or not; born in an exact parish
  (rather than a substring of the place); appears in a given census; died
  young (necronyms — a later sibling given the same name); recently added or
  edited (after an import); has a possible duplicate (links to Tools →
  Possible duplicates); a surname with all its spelling variants.
- 💡 🆕 **Surname index.** A panel or tab listing surnames with counts and
  date ranges ("Sørensen · 47 · 1712–1998"); clicking one filters the list.
  The classic entry point on genealogy sites, and suits patronymic-heavy
  trees. Could group spelling variants with `surnameStem`.

_Working with many people at once_

- 💡 🆕 **Bulk selection and actions.** Checkboxes, then: add a citation to
  all selected (everyone found in one census household), mark deceased, add
  a research note, export the selection as GEDCOM, open them in the tree.
  Needs thought on roles (editor vs. admin per action) and undo.
- 💡 🆕 **CSV export** of the current filtered view — for a spreadsheet, or
  to hand someone a research to-do list.
- 💡 🆕 **Saved views.** Named filter combinations per member ("Stevns
  branch, missing sources"), stored on their profile. The list's state is
  already all in the URL, so a view is just a saved search string.

_Presentation_

- 💡 🆕 **More People list settings.** Candidates for Settings → People list
  (a site default, each overridable per member where it's taste): page size;
  what the card view shows under the name (lifespan, place, family line); a third item on the
  detailed line (occupation, or "Missing: …" from the research checklist).
- 💡 🆕 **Hover preview.** Photo, parents, spouse and the research checklist
  in a popover without opening the page. The same idea as the tree's "Hover
  preview" (Tree & visualization) — worth one shared component.
- 💡 🆕 **Map view.** The filtered people plotted by birthplace. _Builds
  on:_ place coordinates (PostGIS, imported from GEDCOM, no map UI yet) —
  see Places & maps.
- 💡 🆕 **Timeline view.** Lifespans as horizontal bars on a shared time
  axis, filtered like the list — who overlapped with whom.

## Person page

Ideas from the October 2026 review of the person page
(`apps/frontend/src/routes/people/$personId.tsx` and its `-*.tsx` cards).
Person-page settings live in the `"person"` section of `app_settings`
(`personSettingsSchema` in `packages/core/src/app-settings.ts`: a schema
field with a default, plus a form field on the Settings page's "Person" section; no migration). Already built from this list: the read view (as "life at a glance",
with the generated summary), family events in the timeline, "presumed
deceased after N years", and the person-page settings (cards, name
display, dates and ages, Family card scope, what Viewers see of the
living) — see FEATURES.md.

_Reading and getting around_

- 💡 🆕 **Section jump bar.** A sticky row of links (Details · Events ·
  Family · Sources · Notes) for long pages — `id`s on the cards, a
  `position: sticky` bar under the breadcrumb (mind `__root.tsx`'s header
  height).
- 💡 🆕 **Previous/next person.** Step through siblings (from
  `person.relatives`) or back through recently visited people (a small
  per-browser history in localStorage).
- 💡 🆕 **A small tree on the page.** A compact relatives chart (parents,
  spouse, children) using the tree's chart; a click opens that person's
  page, plus "Open in tree". _Builds on:_ the chart being a framework-free
  package now (`packages/tree-chart`, `createTreeChart`).

_More on the page_

- 💡 🆕 **Citation dots on Personal details.** The timeline shows a
  confidence dot per event; birth/death/burial in Personal details don't
  show whether they're sourced. Their citations are on the birth/death
  events (`citationFactType` "event"), so the same `confidenceTier` and
  cite-from-here flow can be reused.
- 💡 🆕 **Change history.** Who changed what and when on this person, now
  that several members edit. Needs an audit table written in the services
  (person, events, names, relationships) — a schema change and a decision
  on retention.
- 💡 🆕 **Comments for family members.** Viewers leave a note on a person
  ("I think this is Aunt Else's mother") without edit rights; editors see
  and resolve them. A new table and `protectedProcedure`s for own comments,
  `editorProcedure` to resolve. _Builds on:_ notifications.

## Photos

- 💡 **Test Immich face clustering on old photos.** Try it on
  old/scanned/faded photographs specifically, which is untested territory
  outside Immich's usual phone-backup use case.
- 💡 🆕 **"Who is this?" queue.** Untagged face clusters sorted by how many
  photos they appear in, to tag in one sitting. Tagging the top ten clusters
  probably covers most of a scanned album. _Builds on:_ face tagging and
  `listPeople`.
- 💡 🆕 **Age in photo.** When a photo or its album has a date, show each tagged
  person's age at the time ("Else, about 7"). This also helps date undated
  photos from who's in them. _Builds on:_ album `HistoricalDate` and birth dates.
- 💡 🆕 **Photos as evidence.** Attach a photo to an event (wedding photo →
  marriage) or to a citation (a scan of the church book page). _Builds on:_
  Immich asset links. Also settles the open "media and document storage"
  question in TECH_STACK.md for documents.

## Storytelling & context

- 💡 **Timeline view.** A person's life events in order, and a family-wide
  timeline of overlapping lifespans.
- 💡 **Historical context overlay.** What was happening in the world (or in
  Denmark: wars, emigration waves, epidemics) when a person was born or died.
- 💡 **Narrative generation.** Auto-drafted biographical summaries from
  structured data via an LLM API, editable afterward.
- 💡 🆕 **Family history book.** A printable PDF for a branch: narrative pages,
  photos, timelines and source notes, generated from the data. _Builds on:_ the
  print report and the photo book.
- 💡 🆕 **Oral history.** Attach audio or video interviews with older relatives
  to people, with a transcript. Needs a storage decision; Immich already stores
  video and could be the home.

## Sharing & engagement

- 💡 **Birthday, anniversary and "on this day" reminders**, possibly as a
  periodic family digest email. _Builds on:_ the mail queue and notifications.
- 💡 **Comments and discussion threads** on a person or fact, separate from
  formal notes and citations.
- 💡 **Change history / audit log.** Who edited what, with the ability to
  revert.
- 💡 **Suggest-and-approve editing.** Less-trusted family members submit edits
  as suggestions an admin approves, rather than editing directly.
- 💡 🆕 **"Help identify" requests.** Send a relative a link to a photo or an
  open question ("who is the woman on the left?") that they can answer without
  an account. _Builds on:_ shareable links, once they exist.

## Data & platform

- 💡 🆕 **Scheduled backups.** Run backups on a schedule, keep a retention
  window, and optionally copy them off the machine. Backups are manual only
  today. _Builds on:_ the backup BullMQ job.
- 💡 🆕 **Partial GEDCOM export.** Export a branch (ancestors or descendants of
  someone, N generations) instead of the whole tree. This is useful for sharing
  with a cousin. _Builds on:_ `treeAround`.
- 💡 🆕 **Global search / command palette.** One box (Ctrl+K) that finds
  people, sources, places, albums and notes.
- 💡 🆕 **Archive-trip mode.** A phone-friendly page for quickly adding a note,
  a photo or a citation while at an archive or cemetery, to be tidied up later.

## External data

- 💡 **FamilySearch integration.** Researched 2026-09-29. FamilySearch's
  Developer Center API (GEDCOM X–based, REST) is free and actively maintained,
  and supports writing source references. But every call needs the **individual
  end user's own** FamilySearch OAuth login (there's no app-level credential).
  Any access beyond a throwaway sandbox is gated behind a "Compatibility
  Review" that requires a **registered business or non-profit**, which a
  self-hosted hobby app likely can't clear. Both official SDKs are stale (one
  explicitly deprecated). GEDCOM import (✅) is the realistic path instead,
  since FamilySearch trees export to GEDCOM natively.
- 💡 **Find A Grave links.** Researched 2026-09-29. There's no public API, and
  the Terms of Service ban bots, scraping and automated access. The realistic
  option is a manually entered memorial URL per person or citation (see
  "Transcriptions and links on citations"), round-tripped through GEDCOM's
  standard `SOUR`/`PAGE`.
- 💡 🆕 **Danish archives (unresearched).** Rigsarkivet's Arkivalieronline
  (scanned church books and censuses) and Danish Family Search (transcribed
  censuses) are where most Danish research happens. The first step is checking
  whether either has an API and what its terms allow. Even with neither, stable
  deep links stored on citations get most of the value.

## Deliberately not pursuing for now

- DNA match import (AncestryDNA/23andMe/MyHeritage/FTDNA).
- AI/OCR transcription of scanned handwritten records.
