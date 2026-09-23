# Features

A living backlog for the genealogy app. Status markers: ✅ done, 🚧 planned, 💡 idea (not yet decided — see "Ideas under consideration").

## Core record-keeping

- ✅ Person records: given names, last name, sex, title/prefix, suffix, one or more nicknames/preferred names, birth/death with approximate or range dates, places, notes
- ✅ Alternate names: maiden, married, and spelling-variant names, each with its own note (add/remove; no in-place edit yet)
- ✅ Life events, birth and death included: christening, burial, cremation, immigration, emigration, naturalization, residence, occupation, other, and (since 2026-09-23) birth/death themselves — each with a date, place, and notes (markdown, `MarkdownEditor`/`MarkdownContent` — was a plain-text "description" until 2026-09-23). Birth/death are ordinary `person_events` rows now, not separate `persons` columns (see "Birth and death are events" in TECH_STACK.md) — they used to be the one thing missing from the "Life events" list on a person's own page despite always having a date/place/citations like any other event; created/edited as the usual dedicated pair of fields on the person form (so there's still exactly one of each), but they show up, and are fully editable (date, place, notes, detail like cause of death), from the Life events list like everything else
- ✅ Marriage/union detail: status (married/divorced/partnership/annulled/widowed), start/end dates and places per spousal pair, supporting more than one union over time (divorce, remarriage)
- ✅ Relationships: parents, spouses, children, with parentage type (birth/adopted/step/foster/unknown)
- ✅ Living/deceased flag per person, ready for privacy rules once sharing exists
- ✅ Sources & citations: attach evidence to a person, or to a specific fact about them (an alternate name, a life event — birth/death included — or a union), with a confidence level (low/medium/high/proven), page/volume/entry ID/certificate number, and a note. A life event's own edit dialog has a "Sources" section — see/remove what's already cited and cite a new (or newly-created-right-there) source without leaving the dialog, rather than only from the person-level "Sources & citations" card
- 🚧 Media attachments: scanned documents (certificates, deeds, census pages) attached to a person or a citation — see "Photos & albums via Immich" under Ideas for the separate plan covering photos specifically
- ✅ Search people by name
- ✅ A short, human-readable public id per person (FamilySearch-style, e.g. `LZ4Y-9K2`) — always starts with a letter, distinct from the internal database id, shown as a subtle click-to-copy indicator in the people list and on a person's own page
- ✅ Autocomplete on Title/prefix and Suffix, suggesting a fixed list of common values plus whatever's already been typed for other people — encourages reusing the same wording ("Dr." rather than a mix of "Dr.", "Dr", "Doctor") without forcing a closed vocabulary
- ✅ "Person list" (renamed from "People"): avatar/initials, gender shown as an icon + label, a living/deceased status badge, an Age column, hover-revealed row actions, and real pagination (previously hard-capped at 50 with no way to see anyone past that)

### Person record & UI — gaps found in a review of the current implementation

- ✅ Show nickname(s) (quoted, between given and last name, comma-separated when there's more than one) everywhere a name is formatted; title/prefix and suffix appear in the formal form used on a person's own page header
- ✅ Person profile photo: a primary portrait on the person's header card, uploaded to local disk on the backend (see `UPLOADS_DIR`)
- ✅ Structured per-event-type detail fields (ship & port for immigration, employer & job title for occupation, cemetery & plot for burial, and more), stored in the existing `details` key/value bag
- ✅ Distinguish "other" life events from one another via a required short label (named event types don't need one)
- ✅ Cite evidence against a specific fact (a life event — birth/death included — an alternate name, or a union), not just the person as a whole
- ✅ Sort life events chronologically on the person page (oldest first, undated events last)
- ✅ Edit an alternate name after adding it, rather than only add/remove
- ✅ Confirm before removing a relationship, alternate name, or life event, via a new `alert-dialog` component in the shared library
- ✅ Single-person printable report ("family group sheet"): a print-optimized page (`/people/$personId/print`) summarizing a person's vitals, alternate names, immediate family, life events, and sources
- ✅ Computed age shown on the person page (current age if living, age at death otherwise)
- ✅ Delete a person outright (relational row, alternate names, life events, unions, citations, and their uploaded photo), only while they have no recorded parent, spouse, or child — from the people list and from the person's own page
- ✅ Unified date entry across every date field (birth/death, life events, union start dates): a live preview shows how free text like "abt 1854", "1970-11-18", or "BET 1900 AND 1905" was understood, with a warning icon for text that couldn't be read. Every date is displayed the same normalized way everywhere (person header, lists, print report, event and union rows) rather than the raw typed wording

## Tree & visualization

- ✅ Tree view (`/tree`, nav link "Tree"): ancestors and descendants around one person, four generations either way by default, rendered with React Flow (`@xyflow/react`) + elkjs. A "View in tree" row action on the person list (the `Network` icon) links straight to `/tree?personId=...`; with no `personId`, the page shows a person search instead of a dead end. Clicking a non-root node's own tree icon re-centers on them. Cards are sex-accented (a colored left stripe + tinted silhouette placeholder, no photo needed) and spouses are joined by a short solid "marriage" connector through dedicated left/right handles, distinct from the parent/child lines through the top/bottom handles.

  Layout is a hybrid, not a single elk call: elk's layered algorithm can only place a node relative to its edges, and a strictly layered (Sugiyama-style) algorithm always treats an edge as "target is at least one layer below source" — fed a spouse edge, it either ignores the same-row intent or shifts one node down a layer to make the edge routable, so partitioning-by-generation doesn't work as it appears to promise (verified empirically: it only constrains cross-partition ordering, not that two same-partition nodes land in the same layer). So generation (row) is computed once, in-house, via a flood-fill from the root (`computeGenerations` in `apps/frontend/src/lib/tree-layout.ts`: +1 down a `PARENT_OF` edge, -1 up, +0 across a spouse edge), and that becomes `y` directly. elk only ever sees `PARENT_OF` edges, deciding left-to-right ordering (crossing minimization) within each already-fixed row; a spouse with no blood edge of their own (a pure in-law) is placed beside whichever partner elk did position, on the same row.

  Backend: `person.tree` procedure (`apps/backend/src/person/person.router.ts`) → `PersonService.tree` → `treeAround` (`packages/db/src/graph.ts`), which walks one generation at a time via `parentsOf`/`childrenOf` rather than a single variable-length Cypher path query — AGE's `agtype` decoding only handles one vertex/edge/path per column, not the list form `nodes(path)`/`relationships(path)` would return.

- ✅ Clicking a card opens a docked detail panel instead of navigating away — name, lifespan, "View full profile", "Center tree here", and the person's parents/spouses/children with add/expand actions (below). Keeps the canvas and your scroll position intact; profile navigation is now an explicit action in the panel rather than the card's default click.

- ✅ Add a relative directly from the tree: the panel offers "+ Add father/mother/spouse/child" (search an existing person or create a blank one to link, then fill in details later from their own page) wherever the tree can vouch the slot is genuinely empty — not just unfetched. `treeAround` now reports `parentsKnownIds`/`childrenKnownIds`: exactly who had their _own_ full parent/child set queried, since the walk is asymmetric (an ancestor's parents are verified but their other children — your aunts and uncles — never are, and the mirror image holds for descendants). The tree view only offers "+ Add" where that's actually known; otherwise it offers "Load ancestors"/"Load descendants" instead (below).

- ✅ Expand on demand: a node whose further ancestors/descendants were never fetched shows "Load ancestors"/"Load descendants" in the panel, reusing the existing `person.relatives` procedure (no new endpoint) to pull in one more generation — plus each newly-revealed person's own spouse, one hop, matching what the initial fetch does — and merges it into the current layout without refetching or rearranging the rest of the tree.

- 🚧 Toggle between ancestor-only / descendant-only / both (currently always both)
- 🚧 Remove a relationship from the tree panel (currently add-only there; removal still requires the full person page)

## Photos

- ✅ Family photo library via [Immich](https://immich.app), self-hosted alongside this app rather than built from scratch — see "Photos & albums via Immich" in TECH_STACK.md for the full design and why. Nav link "Photos" → `/photos`: an album grid (from Immich's own `GET /albums`) and, per album, a photo grid. A person's own page gets a "Photos" card: linked faces as removable chips, a thumbnail grid of every photo across all of them, and "+ Link a face" to browse Immich's detected people (paginated, named or not) and link one. Browse-and-link only — photos are added to the library through Immich itself (its web UI, mobile app auto-backup, or bulk import), never through this app.
- 🚧 Immich is opt-in infrastructure (`docker compose --profile immich up -d`, not part of a plain `docker compose up`) — self-hosted deployment packaging still needs to document this choice and its ~6-8GB RAM cost.
- 🚧 Picking a person's profile photo (the header portrait, still local-disk upload only) from one of their linked Immich photos — deliberately deferred past this first version; see TECH_STACK.md.
- 💡 Structured trial of Immich's face clustering against old/scanned/faded photographs specifically — its docs don't say how well it performs outside phone-camera-backup use, and that matters a lot for a genealogy library skewed toward pre-digital photos.

## Import / export

- 🚧 GEDCOM import (bring in an existing tree from another tool)
- 🚧 GEDCOM export (take your data elsewhere)

## Sharing & collaboration

- ✅ Account sign-up/sign-in (email/password + Google OAuth)
- ✅ Login required to use the app
- 🚧 Invite family members with roles (admin/editor/viewer)
- 🚧 Redact sensitive details for living people from non-owner viewers

## Platform

- ✅ Dark mode
- ✅ Animated, modern UI on a shared React Aria–based component library
- 🚧 Self-hosted deployment packaging (docker-compose, backup/restore docs)

## Ideas under consideration

Cool features worth considering once the core is solid. Not yet scheduled into a phase.

### Photos & albums via Immich

- 💡 Integrate [Immich](https://immich.app) (self-hosted photo/video library with automatic face detection and clustering) as the family photo library, rather than building photo storage and face tagging from scratch. Investigated 2026-09-21 per the "Recommending or adding a library" rule in [CLAUDE.md](CLAUDE.md): actively maintained (releases roughly weekly, 114k+ GitHub stars, latest commit hours old at the time of checking), AGPL-3.0 licensed, with a documented OpenAPI REST API and a generated TypeScript client SDK.

  **Decisions from this investigation** (user-directed): deploy Immich fresh, as its own service, rather than connecting to an existing instance. Reuse Immich's automatic face clustering — link an Immich-detected "Person" (a face cluster) to a genealogy `Person` once, and every photo already or later grouped under that face comes along for free, rather than tagging each photo by hand in the genealogy app. The genealogy app stays browse-and-link only: photos get added to the library through Immich itself (its web UI, mobile app auto-backup, or bulk import of old scans), never through the genealogy app, which only searches, displays, and links what's already there.

  **How the pieces fit together**, if built:
  - **Person ↔ Immich-person mapping**: a new table in this app's own Postgres (not Immich's), mapping a genealogy `personId` to one or more Immich person IDs — _many_ Immich person IDs to one genealogy person, deliberately: Immich's clustering works off visual similarity, and the same real person photographed decades apart (a child vs. the same person elderly) very plausibly lands in two separate Immich-side clusters that both need linking to one genealogy record. Immich's own `Person` object has no field for an external ID (checked its `PersonCreateDto`/`PersonUpdateDto` schema directly), so this mapping has to live on this app's side, the same way `citations.factId` already resolves against a table this app owns rather than something the external system tracks for us.
  - **Person page → "Photos" section**: fetches every asset linked to that person's mapped Immich person ID(s) via Immich's `POST /search/metadata` with a `personIds` filter, shown as a thumbnail grid.
  - **Linking UI**: on a person's page, search/browse Immich's people list (`GET /people`) and pick the matching face cluster(s) to link; support unlinking, since Immich's clustering can and does get corrected/re-run over time (a link pointing at a deleted or merged Immich person should fail gracefully, not break the page).
  - **Albums**: a read-only browsing view of Immich's albums (`GET /albums`, `GET /albums/{id}`), since the goal explicitly includes surfacing albums, not just per-person photos.
  - **Backend as proxy, never the browser talking to Immich directly**: Immich auth is a single API key with admin-configurable scopes, generated once and stored server-side only (same principle as this app's session/secret handling) — the frontend must never see it. A new backend module (mirroring `apps/backend/src/source/`) would hold the Immich API key/URL and proxy thumbnail/asset requests through the genealogy app's own auth, the same shape as the existing `/uploads` static route but fetched live from Immich per request rather than served from local disk.
  - **Deployment cost, stated plainly**: Immich is a real second service, not a dependency bump — its own Postgres (with a vector-search extension, not shareable with this app's AGE-enabled instance, for the same reason this app's own Postgres isn't shared with anything else), Redis, and a machine-learning container for face detection, with roughly 6–8GB RAM recommended by Immich's own docs. This is additional infrastructure to account for in the still-🚧 self-hosted deployment packaging work, not something that piggybacks on the existing docker-compose stack for free.
  - **Relationship to the person profile photo already built**: unrelated and complementary. The single portrait shown on a person's header card (done, stored on local disk via `UPLOADS_DIR`) is a one-photo-per-person avatar; this feature is the family's whole photo library, many photos per person, browsable as albums. No conflict — the profile photo picker could eventually let someone pick "make this the profile photo" from a person's linked Immich photos, but that's a later refinement, not a blocker.

  **Open questions before this gets scheduled**: how well Immich's clustering actually performs on old, scanned, or heavily faded photographs (its own docs don't say, and this matters a lot for a genealogy use case skewed toward pre-digital photos, unlike Immich's typical phone-camera-backup use case) — worth a hands-on trial with a real batch of scanned family photos before committing to the linking UI described above. Also unresolved: whether "browse and link only" should extend to _deleting_ — if a photo is removed in Immich, does the genealogy app's link table need active cleanup, or is a dangling link (rendered as "photo no longer available") an acceptable failure mode.

### Tree & visualization

- 💡 Relationship calculator: "how are X and Y related" (e.g. second cousin once removed)
- 💡 Printable chart exports: fan chart and large-format pedigree/descendant posters (PDF or image), suitable for printing and framing

### Research aids

- 💡 Duplicate person detection: flags likely duplicates (e.g. after a GEDCOM import) and suggests merges
- 💡 Research to-do / "brick wall" tracking per person (open questions to pick up later)
- 💡 Full-text search across citation text and notes, not just names
- 💡 Per-person "completeness" indicator (e.g. missing birth place, no citations) to guide where to research next

### Storytelling & context

- 💡 Timeline view: a person's life events in order, and a family-wide timeline of overlapping lifespans
- 💡 Map view: birthplaces and migrations plotted geographically across generations; a heat-map summary of where ancestors came from
- 💡 Historical context overlay: what was happening in the world when a person was born/died
- 💡 Narrative/story generation: auto-drafted biographical summaries from structured data, via an LLM API (e.g. Claude), editable afterward

### External data

- 💡 Public archive integration: look up/link records from FamilySearch's API from a person's page
- 💡 Cemetery/grave tracking: grave locations with map pins and headstone photos

### Sharing & engagement

- 💡 Shareable read-only tree links: share a branch publicly without a full account
- 💡 Birthday/anniversary and "on this day" reminders, possibly as a periodic family digest email
- 💡 Comments/discussion threads on a person or fact, separate from formal notes/citations
- 💡 Change history / audit log: who edited what, with the ability to revert
- 💡 Suggest-and-approve editing: less-trusted family members submit edits as suggestions an admin approves, rather than editing directly

### Deliberately not pursuing for now

- DNA match import (AncestryDNA/23andMe/MyHeritage/FTDNA)
- AI/OCR transcription of scanned handwritten records
