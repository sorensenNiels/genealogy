# Features

A living backlog for the genealogy app. Status markers: ✅ done, 🚧 planned, 💡 idea (not yet decided — see "Ideas under consideration"). Entries are kept short by design — the _why_ behind a non-obvious decision lives in [TECH_STACK.md](TECH_STACK.md), not here; this file is a scannable "what exists" list.

## Core record-keeping

- ✅ Person records: given/last names, nicknames, title/suffix, gender, living/deceased flag, a human-readable public id (e.g. `LZ4Y-9K2`), computed age, notes.
- ✅ Alternate names (maiden, married, spelling variants) — add, edit, remove, each with its own note.
- ✅ Life events, birth/death included (christening, burial, immigration, emigration, naturalization, residence, occupation, other, ...), each with a date, place, markdown notes, and structured per-type detail fields (ship & port, employer & job title, cemetery & plot, ...). Sorted chronologically on the person page.
- ✅ Marriages/unions: status (married/divorced/partnership/annulled/widowed), start/end dates and places, more than one per pair over time.
- ✅ Relationships: parents, spouses, children, with parentage type (birth/adopted/step/foster/unknown).
- ✅ Sources & citations, on a person or on a specific fact (a name, event, or union), with a confidence level, page/volume/entry ID, and a note — citable directly from a fact's own edit dialog.
- ✅ Unified, forgiving date entry everywhere ("abt 1854", "BET 1900 AND 1905", ...) with a live preview and one normalized display format across the app.
- ✅ People list: avatar, gender icon, living/deceased badge, age column, name search, pagination.
- ✅ Person profile photo (local upload, or picked from an Immich photo — see Photos below).
- ✅ Delete a person outright, once they have no recorded parent/spouse/child; confirm-before-remove on relationships, alternate names, and life events.
- ✅ Single-person printable report ("family group sheet") at `/people/$personId/print`.

## Tree & visualization

- ✅ Tree view (`/tree`): ancestors and descendants around one person, expandable generation-by-generation, add a relative directly from the tree, a docked detail panel instead of navigating away. See "Tree view: React Flow + elkjs" in TECH_STACK.md for the layout design.
- 🚧 Ancestor-only / descendant-only toggle (currently always shows both).
- 🚧 Remove a relationship from the tree panel (add-only today; removal still needs the full person page).

## Photos

- ✅ Family photo library via [Immich](https://immich.app) (self-hosted alongside this app): albums, upload, add-existing-photos, a queued "download all" (zipped, notified when ready — see below), face detection/clustering linked to genealogy people, tag/unlink a face from the photo viewer, a person's own Photos card. See "Photos & albums: Immich" in TECH_STACK.md.
- ✅ Set a person's profile photo from an existing Immich photo, with a circular crop.
- ✅ Local album metadata (date, place, freeform autocompleting tags) plus a filters panel (name/tags/place/date range/missing-info) and sort, for cutting through a large album collection.
- 🚧 Document Immich as opt-in infrastructure (~6-8GB RAM) in self-hosted deployment packaging.
- 💡 Trial Immich's face clustering against old/scanned/faded photographs specifically — untested territory outside its usual phone-camera-backup use case.

## Import / export

- ✅ GEDCOM export (every person, name, event, family, source, and citation) from the Tools page.
- 🚧 GEDCOM import — deferred past export; matching an incoming person against someone already in the tree is a materially harder problem than writing the file out.

## Sharing & collaboration

- ✅ Account sign-up/sign-in (email/password + Google OAuth); login required to use the app.
- 🚧 Invite family members with roles (admin/editor/viewer).
- 🚧 Redact sensitive details for living people from non-owner viewers.

## Tools

An admin utility page (`/tools`).

- ✅ Backup the database (background job, notified when ready) and restore from a backup file (locked against overlap, typed confirmation). Alongside it, "Download all albums" queues a zip of every photo in every album the same way — one notification per file if the library needs more than one archive.
- ✅ Re-scan for faces (Immich), GEDCOM export.
- ✅ Data integrity checks (dangling citations, possible duplicate people, dangling Immich links) and a two-store consistency check (Postgres vs. the Apache AGE graph).

## Platform

- ✅ Dark mode.
- ✅ A shared, animated React Aria–based component library.
- 🚧 Self-hosted deployment packaging (docker-compose, backup/restore docs).

## Internationalization

- ✅ English/Danish language switching (Profile → Language), saved to the account and mirrored to a cookie for fast/SSR reads. Covers full scope, not just UI strings:
  - Every user-facing string across `apps/frontend/src/routes/` (all person, photos, tree, tools, settings, profile pages) via `i18next`/`react-i18next` — a fresh instance per SSR request, avoiding the cross-request-leak class of bug documented in `trpc-proxy-client.ts`.
  - Backend error messages translated centrally in the frontend layer, via one custom tRPC link (`apps/frontend/src/server/trpc-error-translation-link.ts`) rather than touching any of the ~40 server function files — the NestJS backend stays English-only by design.
  - Danish free-text date entry ("ca. 1854", "før 1920", "mellem 1900 og 1905") — real parser support in `packages/core/src/historical-date.ts`, with its own Danish quality-word/month-name tables, not just translated labels.
  - Out of scope for this pass: `packages/ui`'s own internal default copy (e.g. a component's default confirm-dialog text), configurable-options values (user-authored data, not app strings), better-auth's own auth-flow error messages, and the dev-only `/dev/components` showcase page.

## Ideas under consideration

Cool features worth considering once the core is solid. Not yet scheduled into a phase.

### Up next

Picked on 2026-09-28 as the next two to actually scope, one from each focus area:

- 💡 **Duplicate person detection** — flags likely duplicates and suggests merges.
- 💡 **Shareable read-only tree links** — share a branch publicly without a full account.

### Research aids

- 💡 Duplicate person detection: flags likely duplicates (e.g. after a GEDCOM import) and suggests merges. (picked as up next — see above)
- 💡 Research to-do / "brick wall" tracking per person (open questions to pick up later).
- 💡 Full-text search across citation text and notes, not just names.
- 💡 Per-person "completeness" indicator (e.g. missing birth place, no citations) to guide where to research next.

### Sharing & engagement

- 💡 Shareable read-only tree links: share a branch publicly without a full account. (picked as up next — see "Up next" above)
- 💡 Birthday/anniversary and "on this day" reminders, possibly as a periodic family digest email.
- 💡 Comments/discussion threads on a person or fact, separate from formal notes/citations.
- 💡 Change history / audit log: who edited what, with the ability to revert.
- 💡 Suggest-and-approve editing: less-trusted family members submit edits as suggestions an admin approves, rather than editing directly.

### Tree & visualization

- 💡 Relationship calculator: "how are X and Y related" (e.g. second cousin once removed).
- 💡 Printable chart exports: fan chart and large-format pedigree/descendant posters (PDF or image), suitable for printing and framing.

### Storytelling & context

- 💡 Timeline view: a person's life events in order, and a family-wide timeline of overlapping lifespans.
- 💡 Map view: birthplaces and migrations plotted geographically across generations; a heat-map summary of where ancestors came from.
- 💡 Historical context overlay: what was happening in the world when a person was born/died.
- 💡 Narrative/story generation: auto-drafted biographical summaries from structured data, via an LLM API, editable afterward.

### External data

- 💡 FamilySearch integration — researched 2026-09-29: FamilySearch's Developer Center API (GEDCOM X–based, REST) is free and actively maintained, and does support writing source references (linking an external record to a tree person is architecturally possible). But every call needs the **individual end user's own** FamilySearch OAuth login — there's no app-level credential — and any access beyond a throwaway sandbox is gated behind a "Compatibility Review," which requires being a **registered business or non-profit**; a self-hosted hobby app likely can't clear that bar. Both official SDKs are stale (one explicitly deprecated). GEDCOM import (already 🚧 planned above) is the realistic near-term path — FamilySearch trees export to GEDCOM natively — rather than a live API lookup.
- 💡 Find A Grave links — researched 2026-09-29: no public API exists at all, and its Terms of Service explicitly bans bots/scraping/automated access; Ancestry (its owner) has no public API program that covers it either, and other genealogy tools that touch Find A Grave data do so by scraping at users' own legal risk. The only realistic, ToS-compliant option is a plain manually-entered memorial URL field per person — optionally round-tripped through GEDCOM's standard `SOUR`/`PAGE` citation structure (not a proprietary custom tag) so it survives export/import — not a live integration.
- 💡 Cemetery/grave tracking: grave locations with map pins and headstone photos.

### Deliberately not pursuing for now

- DNA match import (AncestryDNA/23andMe/MyHeritage/FTDNA).
- AI/OCR transcription of scanned handwritten records.
