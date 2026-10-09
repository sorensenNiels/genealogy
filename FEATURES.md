# Features

What the genealogy app can do today (✅). Planned work (🚧) and undecided ideas (💡) are in [IDEAS.md](IDEAS.md). Entries are kept short by design — the _why_ behind a non-obvious decision lives in [TECH_STACK.md](TECH_STACK.md), not here; this file is a scannable "what exists" list.

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
- ✅ Merge a duplicate into a person ("Merge with…"): a preview of what moves, everything moved in one transaction, nothing on the kept person overwritten, identical facts not doubled; refused for people related to each other.
- ✅ Research notes per person: open questions to chase down later (a "brick wall"), each with a type and a resolved flag.
- ✅ Single-person printable report ("family group sheet") at `/people/$personId/print`.

## Tree & visualization

- ✅ Tree view (`/tree`): ancestors and descendants around one person, expandable generation-by-generation, add a relative (parent, spouse, child or sibling) directly from the tree, a docked detail panel instead of navigating away. Display settings for the tree on the Settings page (admin, site-wide): photos or initials only, gender badge, mourning band for the deceased, years or full dates, highlighting the direct line, and which chart and direction the tree opens with. Drawn with topola: relatives (the default — ancestors, descendants, siblings, aunts/uncles, cousins), ancestors or descendants charts, top-down or left to right, with pan/zoom; click a person for the panel, double-click to centre on them. See "Tree view: topola" in TECH_STACK.md.
- ✅ Show both sides, ancestors only, or descendants only (a toggle on the canvas, kept in the URL).
- ✅ Remove a parent, spouse or child relationship from the tree's side panel (confirm first; people and marriage records are kept).

## Photos

- ✅ Family photo library via [Immich](https://immich.app) (self-hosted on its own server): albums, upload, add-existing-photos, a queued "download all" (zipped, notified when ready — see below), face detection/clustering linked to genealogy people, tag/unlink a face from the photo viewer, a person's own Photos card. See "Photos & albums: Immich" in TECH_STACK.md.
- ✅ Immich is optional: when it isn't configured or can't be reached, every photo and album feature is turned off (no Photos menu item, no Photos card), and the Overview page shows Immich's status and why it's off.
- ✅ Set a person's profile photo from an existing Immich photo, with a circular crop.
- ✅ Local album metadata (date, place) plus a filters panel (name/kind/place/date range/missing-info) and sort, for cutting through a large album collection.
- ✅ Physical albums (a real scanned album: grows by upload, with a cover color/style, where-found and scan notes) and virtual albums (curated collections of photos that already live in a physical album, showing their source).
- ✅ Album categories (e.g. family names): a Categories list in the Photos sidebar with counts, albums grouped under category headings (one shelf per category in book view), an album can be in several categories, and categories can be picked or created from the New/Edit album dialogs.
- ✅ Photo book reading mode (N photos per page, paper styles), manual photo order, captions and Immich tags per photo.
- ✅ Delete albums and photos (photos go to Immich's trash, recoverable there), and remove a photo from an album.

## Import / export

- ✅ GEDCOM export from the Tools page, as 5.5.1 (default, most compatible) or 7.0: every person, name, event, family, source, repository and citation; notes as plain text for other programs; this app's own fields travel as underscore tags so export → import is lossless. See "GEDCOM export" in TECH_STACK.md.
- ✅ GEDCOM import from the Tools page: pick a file, see a preview (what will be added, anything that can't be imported, and incoming people who share a name with someone already in the tree), then import. Everyone is added as a new person — likely duplicates are reported, then merged by hand ("Merge with…" on the person page). Reads UTF-8, UTF-16, Windows-1252 and ANSEL files, Julian dates and double years (`1749/50`), and the common GEDCOM 7 forms. Media is reported, not imported (a 5.5.1 file only holds file paths). See "GEDCOM import" in TECH_STACK.md.
- ✅ Witnesses, godparents and other roles on a person's records (a "Witnesses & godparents" card; tied to an event, a marriage, or neither; the person can be someone in the tree or just a name), privacy restrictions on people (badge; not yet enforced), other programs' research to-dos imported as research notes, and place coordinates (PostGIS, no map UI yet), repositories with contact details and call numbers, and external IDs (FamilySearch, Ancestry, REFN, EXID — shown on an "External IDs" card, FamilySearch linked to its profile) — all imported from and exported back to GEDCOM.

## Sharing & collaboration

- ✅ Sign-in by email/password or Google; joining is by invitation only (the very first account on a new install becomes admin).
- ✅ Members & roles: Admin (members, Settings, Tools, merge/delete), Editor (edits the tree and photos), Viewer (read-only). A Members page to change roles, remove members, and manage invitations.
- ✅ Invite family members by email: a link valid 14 days, with role, an optional "this is you" person and a personal message; sent in the inviting admin's language, and always shown to copy in case email isn't set up.
- ✅ Living people are shown to Viewers by name only — dates, places, notes, photos and records hidden (also for people marked private/confidential); a Viewer's own person is never hidden from them.

## Tools

An admin utility page (`/tools`).

- ✅ Backup the database (background job, notified when ready) and restore from a backup file (locked against overlap, typed confirmation). Alongside it, "Download all albums" queues a zip of every photo in every album the same way — one notification per file if the library needs more than one archive.
- ✅ Re-scan for faces (Immich), GEDCOM export and import.
- ✅ Data integrity checks (dangling citations, possible duplicate people, dangling Immich links) and a two-store consistency check (Postgres vs. the Apache AGE graph).

## Platform

- ✅ Dark mode.
- ✅ A shared, animated React Aria–based component library.

## Internationalization

- ✅ English/Danish language switching (the language menu in the header, left of the user menu), saved to the account and mirrored to a cookie for fast/SSR reads. Covers full scope, not just UI strings:
  - Every user-facing string across `apps/frontend/src/routes/` (all person, photos, tree, tools, settings, profile pages) via `i18next`/`react-i18next` — a fresh instance per SSR request, avoiding the cross-request-leak class of bug documented in `trpc-proxy-client.ts`.
  - Backend error messages translated centrally in the frontend layer, via one custom tRPC link (`apps/frontend/src/server/trpc-error-translation-link.ts`) rather than touching any of the ~40 server function files — the NestJS backend stays English-only by design.
  - Danish free-text date entry ("ca. 1854", "før 1920", "mellem 1900 og 1905") — real parser support in `packages/core/src/historical-date.ts`, with its own Danish quality-word/month-name tables, not just translated labels.
  - Out of scope for this pass: `packages/ui`'s own internal default copy (e.g. a component's default confirm-dialog text), configurable-options values (user-authored data, not app strings), better-auth's own auth-flow error messages, and the dev-only `/dev/components` showcase page.

## What's next

Planned work and undecided ideas live in [IDEAS.md](IDEAS.md).
