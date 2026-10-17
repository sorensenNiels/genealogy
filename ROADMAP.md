# Roadmap

Everything not built yet. [FEATURES.md](FEATURES.md) describes what's built,
and [CHANGELOG.md](CHANGELOG.md) records when each piece shipped.

- 🚧 **Planned:** decided on, not built yet.
- 💡 **Idea:** not decided on yet.

When an idea is decided on, mark it 🚧 and move it to "Planned". When
something ships, remove it here, describe it in FEATURES.md, and add a dated
entry to CHANGELOG.md. Record any decision it needs in
[TECH_STACK.md](TECH_STACK.md).

Where groundwork already exists, an item says what it **builds on**. Those are
usually the cheapest wins. Items that depend on an outside service or a new
library are marked **unresearched** until someone checks them against the
"Recommending or adding a library" rule in [CLAUDE.md](CLAUDE.md).

## Planned

- 🚧 **Self-hosted deployment packaging:** docker-compose and backup/restore
  docs, including documenting Immich as optional infrastructure (~6–8 GB RAM)
  and keeping `UPLOADS_DIR` on a persistent volume.

## Up next

The next items to scope:

- 💡 **Shareable read-only tree links.** Share a branch publicly without a full
  account. _Builds on:_ the Viewer redaction (living people by name only),
  which a public link would apply to everyone.
- 💡 **Research badges on tree cards.** Next in the tree's suggested order;
  see "Tree view" below.
- 💡 **Family website: a size warning.** The export (see "Static family
  website" in TECH_STACK.md) gives no warning for a very large tree with many
  profile photos; the zip just grows. Research notes are left out on purpose
  (they're working notes, not results). Revisit if anyone asks.

## Research aids

- 💡 **Conflicting evidence, side by side.** When sources disagree (two birth
  dates), keep both, show them together with their citations, and let the user
  mark one as preferred. GEDCOM import currently turns a second birth into an
  "other" event, so this would also make import less lossy.
- 💡 **Research log.** Record searches as well as findings ("Brande parish
  burials 1800–1830: searched, nothing found") so the same record isn't
  searched twice, and answer "which church books have I searched, for which
  parish and years?". It would be the place-based counterpart of census
  coverage. _Builds on:_ research notes and `record_searches`.
- 💡 **Transcriptions and links on citations.** Add a verbatim transcription
  field and a `url` column on `citations`, e.g. a deep link to the scanned page
  at Rigsarkivet/DDD. Today `sources`/`citations` have neither, so GEDCOM
  import has to drop `SOUR.TEXT`. Records already have a scan link of their
  own. A URL is also the ToS-safe answer for Find A Grave (see External data).
- 💡 **Merge duplicate sources.** Importing the same file twice leaves two
  copies of each source and repository. Person merge rightly doesn't touch
  them, because sources are shared. A source merge (re-pointing citations) is
  the missing half. _Builds on:_ the person merge's identical-citation
  collapsing.
- 💡 **Source library page.** Browse every source and see everything it's
  cited for. There's no Sources page today; sources are only reachable through
  the people who cite them.
- 💡 **Name variants in full-text search.** Duplicate detection and the People
  list's "Similar spellings" already match Søren/Sören, Christensen/Kristensen
  and æ/ø/å vs. ae/oe/aa (`soundKey`/`surnameStem` in
  `packages/core/src/duplicate-match.ts`, `nameWordMatches` in
  `person-list.ts`). Full-text search (`/search`) uses Postgres' `simple`
  configuration and folds neither. _Builds on:_ those keys.
- 💡 **FAN club view** (Friends, Associates, Neighbours). Show who keeps
  appearing around a person across records (godparents, witnesses, census
  neighbours, guardians). They are often hidden relatives, and this is the
  classic way through a brick wall. _Builds on:_ the associations table, its
  "name only" associates, and record rows.
- 💡 **Import media from a GEDCOM 7 zip (`.gdz`).** A 5.5.1 file only holds
  photo paths, but a GEDCOM 7 zip carries the files. Those could go into
  Immich, linked to the people. _Builds on:_ Immich upload and person links.
- 💡 **DNA matches** (unresearched). Matches from Ancestry/MyHeritage with
  shared cM, placed in the tree and clustered by branch. Needs a design
  decision on how much DNA data to keep. This conflicts with "DNA match
  import" under "Deliberately not pursuing" below, so decide which one stands.

### Record-based research

Census and church book records showed the pattern: enter _one record_ as
written, link _everyone in it_, and let the app create the events, roles and
citations. The record framework built for census, baptism, marriage and burial
(see FEATURES.md) takes further record types as further templates:

- 💡 **Probate (skifteprotokoller).** The deceased, surviving spouse, every
  heir with age and residence, married daughters with their husbands, and
  guardians for minors. Often the best evidence of who someone's children
  were. Heirs suggest parent–child links and married names, and flag children
  missing from the tree. Needs a `probate` event type (GEDCOM `PROB`).
- 💡 **Confirmation lists:** a template like baptism (the confirmand, parents,
  the parish) that gives a confirmation event.
- 💡 **Church book moves (tilgang/afgang).** Arrival and departure lists, with
  where people moved from and to. Each gives a residence or migration event.
- 💡 **Military levy rolls (lægdsruller).** Boys and men followed from birth,
  year after year, with father's name, age and moves between parishes. This is
  how you trace a man who moved. Each roll entry gives a residence event.
- 💡 **Emigration (Copenhagen Police emigration records, 1869–1940).**
  Destination, ship, contract number and travel companions (often relatives),
  recorded onto the existing Emigration event type (ship/port fields).
- 💡 **Farm and place histories (gårdhistorie).** Everyone who owned or lived
  at "Nørregaard" over time, from record addresses (census, church books) and
  deeds. Danish research often follows the farm, not the surname. _Builds on:_
  record addresses and the `places` table.
- 💡 **Faster entry.** A keyboard-friendly transcription grid, and import from
  a Dansk Demografisk Database (DDD) search result (format not yet checked).

## Places & maps

- 💡 **Map view.** Plot birthplaces and migrations across generations, with a
  heat map of where ancestors came from. The same map would serve the
  Overview's "Where the family came from" card (today a list) and a map view of
  the People list's filtered people. _Builds on:_ the PostGIS `places` table
  (coordinates already stored, filled from GEDCOM `PLAC.MAP`; no map UI yet).
- 💡 **Cemetery and grave tracking.** Grave locations with map pins and
  headstone photos.
- 💡 **Place hierarchy and historical jurisdictions.** Model sogn (parish) →
  herred → amt (and later kommune/region), so "Brande" and "Brande sogn,
  Hammerum herred, Ringkøbing amt" are the same place, and records can be found
  by the parish that kept them. Places are a flat list of text today.
- 💡 **Place cleanup tool.** List every place spelling in use, merge variants,
  and attach coordinates by hand. This matters most after a GEDCOM import.
  _Builds on:_ the `places` table.

## Tree & visualization

- 💡 **Relationship calculator.** "How are X and Y related" (e.g. second cousin
  once removed) for any two people, not just the tree's centre. _Builds on:_
  `kinshipsFrom`/`formatKinship` in core, which the tree's card labels use.
- 💡 **Printable chart exports.** Fan chart and large-format pedigree or
  descendant posters (PDF or image), for printing and framing.
- 💡 **"Who's missing" ancestor grid.** A 2/4/8/16/32 grid per generation
  showing which ancestor slots are filled, unknown, or sourced. It's a quick
  visual to-do list. The Overview's "Your place in the tree" already counts
  known ancestors per generation; this is the slot-by-slot view. _Builds on:_
  `treeAround`.
- 💡 **Family statistics.** Lifespans by century, most common names, family
  sizes and surname distribution. The Overview's "The family at a glance" and
  "Where the family came from" cover the basic counts and birthplaces.

### Tree view

The tree is drawn by topola with our own card renderer (see "Tree view:
topola" in TECH_STACK.md). Files these items touch:
`apps/frontend/src/routes/tree.tsx` (page, side panel, data merging),
`routes/-topola-chart.tsx` (React wrapper), and in `packages/tree-chart/src/`
(shared with the static site) `chart.ts` (topola + d3-zoom),
`card-renderer.ts` (the cards, drawn with D3) and `topola-data.ts` (our data →
topola families, card text). Tree display settings are in
`packages/core/src/app-settings.ts`: a new setting is a schema field with a
default plus a form field in `routes/settings.tsx`, with no migration.

Suggested order: research badges first.

_More on each card_

- 💡 **Research badges.** Small markers on a card for "no sources", "no birth
  date" and "parents unknown", which turn the tree into a visual research
  to-do list. Needs a count of citations per person in `person.tree`'s result
  (one grouped query over `citations` for the tree's person ids, in
  `PersonService.tree`), carried into `TreeCard`. "Parents unknown" means "in
  `parentsKnownIds` and has no parent edge". Add a tree setting to turn badges
  on and off.
- 💡 **Hover preview.** A small pop-up on hover with a larger photo and full
  dates and places, without changing the panel. Render it in React (a
  positioned div over the canvas), placed from the hovered card's screen rect;
  the card renderer only reports hover in/out with the person id. Not on touch
  devices; keyboard focus should show it too. The People list wants the same
  popover (see below), so build one shared component.
- 💡 **Immich face as a fallback photo.** A person with no profile photo but a
  linked Immich face shows that face on the card. _Builds on:_
  `person_immich_links` and the face-thumbnail proxy
  (`/api/immich/people/$id/thumbnail`). Only while `useImmichAvailable()` is
  true; `person.tree` would return the first linked Immich person id per
  person.

_Seeing patterns_

- 💡 **"Colour by" setting.** Tint cards by surname, century of birth, birth
  region, or how well-sourced the person is, with a small legend. A `colorBy`
  tree setting (a structural enum, like `dateDetail`); the card renderer adds
  a class or inline fill per card. Pick surname/region colours from a fixed
  palette by hash, so they stay the same between visits.
- 💡 **Pedigree collapse.** Mark ancestors who appear more than once (cousin
  marriages are common in rural parishes), and count unique ancestors per
  generation. On the tree, someone drawn twice (topola draws them once per
  path) gets a small "appears 2×" marker, and clicking it pans to the other
  copy. Topola gives repeat copies distinct node ids (`id:1`, `id:2`) but the
  same `indi.id`, so count `g.indi` per person id after render.
- 💡 **Path between two people.** Pick two people (e.g. shift-click) and the
  chart highlights the cards and lines connecting them. Find the path in
  `merged` (breadth-first over parent and spouse edges), then add a class to
  those `g.indi` and to the `path.link` elements between them (topola's link
  ids are `parentNodeId:childNodeId`).

## Overview (the landing page)

- 💡 **A map for "Where the family came from".** See "Map view" under Places &
  maps.
- 💡 **Who changed what.** "Recently added and changed" says what and when.
  Saying who needs the change history (see Sharing & engagement).
- 💡 **Upkeep counts on a schedule.** "Things to look at" runs the Tools
  reports on demand and caches them in memory for ten minutes. A large tree may
  need them computed by a queued job instead.

## People list

The list is `apps/frontend/src/routes/people/index.tsx` and
`-people-card-view.tsx`; the query is `PersonService.list` with
`listFilter`/`sortColumns`.

_Research-oriented_

- 💡 **Completeness column.** The research checklist's percentage as a small
  bar per row, sortable so the least-researched people come first. The
  "Missing" filter answers "who lacks X"; this answers "who needs the most
  work". Parents are in the graph, so sorting on it needs the same graph-side
  set the "Missing: both parents" filter uses.
- 💡 **Relationship column.** "Your 2nd great-grandfather", relative to the
  signed-in member's own person ("this is me"), with a "within N generations
  of me" filter. _Builds on:_ `kinshipsFrom`/`formatKinship` (the tree's card
  labels), run server-side over the graph.
- 💡 **More filters:** has a photo or not; born in an exact parish (rather than
  a substring of the place); appears in a given census; died young (necronyms:
  a later sibling given the same name); recently added or edited (after an
  import); has a possible duplicate (links to Tools → Possible duplicates); a
  surname with all its spelling variants.
- 💡 **Surname index.** A panel or tab listing surnames with counts and date
  ranges ("Sørensen · 47 · 1712–1998"); clicking one filters the list. The
  classic entry point on genealogy sites, and it suits trees with many
  patronymics. Could group spelling variants with `surnameStem`.

_Working with many people at once_

- 💡 **Bulk selection and actions.** Checkboxes, then: add a citation to
  everyone selected (everyone found in one census household), mark deceased,
  add a research note, export the selection as GEDCOM, or open them in the
  tree. Needs thought on roles (editor vs. admin per action) and undo.
- 💡 **CSV export** of the current filtered view, for a spreadsheet or to hand
  someone a research to-do list.
- 💡 **Saved views.** Named filter combinations per member ("Stevns branch,
  missing sources"), stored on their profile. The list's state is already all
  in the URL, so a view is just a saved search string.

_Presentation_

- 💡 **More People list settings.** Candidates for Settings → People list (a
  site default, each overridable per member where it's a matter of taste):
  page size; what the card view shows under the name (lifespan, place, family
  line); a third item on the two-line row (occupation, or "Missing: …" from the
  research checklist).
- 💡 **Hover preview.** Photo, parents, spouse and the research checklist in a
  popover without opening the page. Same component as the tree's hover
  preview.
- 💡 **Map view.** See Places & maps.
- 💡 **Timeline view.** See Storytelling & context.

## Person page

The page is `apps/frontend/src/routes/people/$personId.tsx` and its `-*.tsx`
cards. Person-page settings live in the `"person"` section of `app_settings`
(`personSettingsSchema` in `packages/core/src/app-settings.ts`: a schema field
with a default, plus a form field in the Settings page's "Person" section; no
migration).

- 💡 **Section jump bar.** A sticky row of links (Details · Events · Family ·
  Sources · Notes) for long pages: `id`s on the cards and a `position: sticky`
  bar under the breadcrumb (mind `__root.tsx`'s header height).
- 💡 **Previous/next person.** Step through siblings (from `person.relatives`)
  or back through recently visited people. _Builds on:_ the recently opened
  people that "Continue where you left off" already keeps.
- 💡 **A small tree on the page.** A compact relatives chart (parents, spouse,
  children) using the tree's chart. A click opens that person's page, and an
  "Open in tree" link goes to the full tree. _Builds on:_ the chart being a
  framework-free package (`packages/tree-chart`, `createTreeChart`).
- 💡 **Citation dots on Personal details.** The timeline shows a confidence
  dot per event, but birth/death/burial in Personal details don't show whether
  they're sourced. Their citations are on the birth/death events
  (`citationFactType` "event"), so the same `confidenceTier` and
  cite-from-here flow can be reused.

## Photos

- 💡 **Test Immich face clustering on old photos.** Try it on old, scanned and
  faded photographs specifically. That's untested territory outside Immich's
  usual phone-backup use case.
- 💡 **"Who is this?" queue.** Untagged face clusters sorted by how many photos
  they appear in, to tag in one sitting. Tagging the top ten clusters probably
  covers most of a scanned album. _Builds on:_ face tagging and `listPeople`.
- 💡 **Age in photo.** When a photo or its album has a date, show each tagged
  person's age at the time ("Else, about 7"). This also helps date undated
  photos from who's in them. _Builds on:_ album `HistoricalDate` and birth
  dates.
- 💡 **Photos as evidence.** Attach a photo to an event (wedding photo →
  marriage) or to a citation (a scan of the church book page). _Builds on:_
  Immich asset links. Also settles the open "media and document storage"
  question in TECH_STACK.md for documents.

## Storytelling & context

- 💡 **Family timeline.** Lifespans as horizontal bars on a shared time axis,
  showing who overlapped with whom, for a family or the People list's filtered
  people. A person's own life events are already a timeline on the person page.
- 💡 **Historical context overlay.** What was happening in the world (or in
  Denmark: wars, emigration waves, epidemics) when a person was born or died.
- 💡 **Narrative generation.** Auto-drafted biographical summaries from
  structured data via an LLM API, editable afterwards. _Builds on:_ the
  generated one-line summary in "life at a glance".
- 💡 **Family history book.** A printable PDF for a branch: narrative pages,
  photos, timelines and source notes, generated from the data. _Builds on:_ the
  print report and the photo book.
- 💡 **Oral history.** Attach audio or video interviews with older relatives to
  people, with a transcript. Needs a storage decision; Immich already stores
  video and could be the home.

## Sharing & engagement

- 💡 **Family digest email.** Birthdays, anniversaries and "on this day" as a
  periodic email. The Overview's "On this day" card shows them in the app
  already. _Builds on:_ the mail queue and notifications.
- 💡 **Comments for family members.** Viewers leave a note on a person or fact
  ("I think this is Aunt Else's mother") without edit rights, kept apart from
  formal notes and citations; editors see and resolve them. A new table,
  `protectedProcedure`s for a member's own comments, and `editorProcedure` to
  resolve. _Builds on:_ notifications.
- 💡 **Change history / audit log.** Who changed what and when, per person and
  across the tree, with the option to revert, now that several members edit.
  Needs an audit table written in the services (person, events, names,
  relationships), a schema change, and a decision on retention. Also lets the
  Overview's "Recently added and changed" say who.
- 💡 **Suggest-and-approve editing.** Less-trusted family members submit edits
  as suggestions that an admin approves, rather than editing directly.
- 💡 **"Help identify" requests.** Send a relative a link to a photo or an open
  question ("who is the woman on the left?") that they can answer without an
  account. _Builds on:_ shareable links, once they exist.

## Data & platform

- 💡 **Scheduled backups.** Run backups on a schedule, keep a retention window,
  and optionally copy them off the machine. Backups are manual only today.
  _Builds on:_ the backup BullMQ job.
- 💡 **Partial GEDCOM export.** Export a branch (ancestors or descendants of
  someone, N generations) instead of the whole tree, e.g. to share with a
  cousin. _Builds on:_ `treeAround`.
- 💡 **Command palette.** One box (Ctrl+K) that finds people, sources, places,
  albums and notes. Today the header search box opens full-text search, which
  doesn't search names, and people are found on the People list. _Builds on:_
  both searches.
- 💡 **Archive-trip mode.** A phone-friendly page for quickly adding a note, a
  photo or a citation at an archive or cemetery, to be tidied up later.

## External data

- 💡 **FamilySearch integration.** Researched 2026-09-29. FamilySearch's
  Developer Center API (GEDCOM X–based, REST) is free and actively maintained,
  and supports writing source references. But every call needs the
  **individual end user's own** FamilySearch OAuth login; there's no app-level
  credential. Any access beyond a throwaway sandbox is gated behind a
  "Compatibility Review" that requires a **registered business or
  non-profit**, which a self-hosted hobby app likely can't clear. Both official
  SDKs are stale (one is explicitly deprecated). GEDCOM import is the realistic
  path instead, since FamilySearch trees export to GEDCOM natively.
- 💡 **Find A Grave links.** Researched 2026-09-29. There's no public API, and
  the Terms of Service ban bots, scraping and automated access. The realistic
  option is a manually entered memorial URL per person or citation (see
  "Transcriptions and links on citations"), round-tripped through GEDCOM's
  standard `SOUR`/`PAGE`.
- 💡 **Danish archives** (unresearched). Rigsarkivet's Arkivalieronline
  (scanned church books and censuses) and Danish Family Search (transcribed
  censuses) are where most Danish research happens. The first step is checking
  whether either has an API and what its terms allow. Even without one, stable
  deep links stored on citations get most of the value.

## Deliberately not pursuing for now

- DNA match import (AncestryDNA/23andMe/MyHeritage/FTDNA). See "DNA matches"
  under Research aids for the open question.
- AI/OCR transcription of scanned handwritten records.
