# Features

A living backlog for the genealogy app. Status markers: ✅ done, 🚧 planned, 💡 idea (not yet decided — see "Ideas under consideration").

## Core record-keeping

- ✅ Person records: given names, last name, sex, title/prefix, suffix, one or more nicknames/preferred names, birth/death with approximate or range dates, places, notes
- ✅ Alternate names: maiden, married, and spelling-variant names, each with its own note (add/remove; no in-place edit yet)
- ✅ Life events beyond birth/death: christening, burial, cremation, immigration, emigration, naturalization, residence, occupation, other — each with a date, place, and description
- ✅ Marriage/union detail: status (married/divorced/partnership/annulled/widowed), start/end dates and places per spousal pair, supporting more than one union over time (divorce, remarriage)
- ✅ Relationships: parents, spouses, children, with parentage type (birth/adopted/step/foster/unknown)
- ✅ Living/deceased flag per person, ready for privacy rules once sharing exists
- ✅ Sources & citations: attach evidence to a person, or to a specific fact about them (birth, death, an alternate name, a life event, a union), with a confidence level (low/medium/high/proven), page/volume/entry ID/certificate number, and a note
- 🚧 Media attachments: scanned documents (certificates, deeds, census pages) attached to a person or a citation — see "Photos & albums via Immich" under Ideas for the separate plan covering photos specifically
- ✅ Search people by name
- ✅ A short, human-readable public id per person (FamilySearch-style, e.g. `LZ4Y-9K2`) — always starts with a letter, distinct from the internal database id, shown as a subtle click-to-copy indicator in the people list and on a person's own page
- ✅ Autocomplete on Title/prefix and Suffix, suggesting a fixed list of common values plus whatever's already been typed for other people — encourages reusing the same wording ("Dr." rather than a mix of "Dr.", "Dr", "Doctor") without forcing a closed vocabulary

### Person record & UI — gaps found in a review of the current implementation

- ✅ Show nickname(s) (quoted, between given and last name, comma-separated when there's more than one) everywhere a name is formatted; title/prefix and suffix appear in the formal form used on a person's own page header
- ✅ Person profile photo: a primary portrait on the person's header card, uploaded to local disk on the backend (see `UPLOADS_DIR`)
- ✅ Structured per-event-type detail fields (ship & port for immigration, employer & job title for occupation, cemetery & plot for burial, and more), stored in the existing `details` key/value bag
- ✅ Distinguish "other" life events from one another via a required short label (named event types don't need one)
- ✅ Cite evidence against a specific fact (a birth date, a life event, an alternate name, a union), not just the person as a whole
- ✅ Sort life events chronologically on the person page (oldest first, undated events last)
- ✅ Edit an alternate name after adding it, rather than only add/remove
- ✅ Confirm before removing a relationship, alternate name, or life event, via a new `alert-dialog` component in the shared library
- ✅ Single-person printable report ("family group sheet"): a print-optimized page (`/people/$personId/print`) summarizing a person's vitals, alternate names, immediate family, life events, and sources
- ✅ Computed age shown on the person page (current age if living, age at death otherwise)
- ✅ Delete a person outright (relational row, alternate names, life events, unions, citations, and their uploaded photo), only while they have no recorded parent, spouse, or child — from the people list and from the person's own page
- ✅ Unified date entry across every date field (birth/death, life events, union start dates): a live preview shows how free text like "abt 1854", "1970-11-18", or "BET 1900 AND 1905" was understood, with a warning icon for text that couldn't be read. Every date is displayed the same normalized way everywhere (person header, lists, print report, event and union rows) rather than the raw typed wording

## Tree & visualization

- 🚧 Pedigree (ancestor) and descendant tree views, toggle between them — React Flow + elkjs, not yet built

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
