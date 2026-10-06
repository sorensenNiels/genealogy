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

**Tree view**

- 🚧 **Ancestor-only / descendant-only toggle.** The tree currently always
  shows both directions.
- 🚧 **Remove a relationship from the tree panel.** The panel can only add
  today; removing still needs the full person page.

**GEDCOM**

- 🚧 **Store what the import preview only reports today:** external IDs
  (FamilySearch, Ancestry, `REFN`) and repository details/call numbers; decide
  whether to import media.
- 🚧 **Close the remaining format gaps:** decode ANSEL-encoded files; parse
  calendar escapes (`@#DJULIAN@`) and double dates; export notes as plain text
  rather than raw markdown; GEDCOM 7 export (import already reads some GEDCOM 7
  constructs).
- 🚧 **Merge an imported person into an existing one.** Depends on duplicate
  person detection (see "Up next" below).

**Sharing & collaboration**

- 🚧 **Invite family members with roles** (admin/editor/viewer). How
  invitations reach people is the 💡 "Invite family members by email" idea
  below.
- 🚧 **Redact sensitive details for living people** from non-owner viewers.
  _Builds on:_ `persons.restriction` and `isLiving`.

**Platform**

- 🚧 **Self-hosted deployment packaging:** docker-compose and backup/restore
  docs, including documenting Immich as optional infrastructure (~6–8 GB RAM)
  and keeping `UPLOADS_DIR` on a persistent volume.

## Up next

Picked on 2026-09-28 as the next two to scope, one from each focus area:

- 💡 **Duplicate person detection.** Flag likely duplicates (especially after a
  GEDCOM import) and suggest merges; this also unblocks the planned 🚧 "merge
  an imported person into an existing one". _Builds on:_ the integrity check's
  same-name rule and the import preview's name matching. Danish name rules
  matter here: see "Name-aware matching" below.
- 💡 **Shareable read-only tree links.** Share a branch publicly without a full
  account. _Builds on:_ `persons.restriction` (stored, not yet enforced). Living
  people must be redacted first, so this pairs with the planned 🚧 redaction
  work.

## Research aids

- 💡 **Full-text search** across citation text and notes, not just names.
- 💡 **Per-person completeness indicator** (e.g. missing birth place, no
  citations) to guide where to research next.
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
- 💡 🆕 **Source library page.** Browse every source and see everything it's
  cited for. There's no Sources page today; sources are only reachable through
  the people who cite them.
- 💡 🆕 **Record-type templates.** Structured entry for common Danish records
  (church book baptism/marriage/burial, folketælling/census, lægdsrulle/military
  levy roll, skifte/probate) that fills in the source, citation and facts in one
  go instead of five dialogs.
- 💡 🆕 **Name-aware matching.** Treat patronymic and spelling variants as
  possible matches (Søren/Sören, Christensen/Kristensen, Sørensen/Sörensen,
  æ/ø/å vs. ae/oe/aa) in search and duplicate detection. Patronymics before the
  naming laws mean a son of Søren is a Sørensen, so equal surnames say less in
  Danish trees than in most. _Builds on:_ the æ/ø/å slugging already in GEDCOM
  import.
- 💡 🆕 **FAN-club view.** Show who keeps appearing around a person (godparents,
  witnesses, neighbours in a census), which is the classic way through a brick
  wall. _Builds on:_ the associations table and its "name only" associates.

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
  once removed).
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

- 💡 🆕 **Invite family members by email.** Enter a relative's email address
  and they get an invitation link to create an account and join the tree, with
  a personal message and optionally "this is you" pre-linked to their person in
  the tree. Pending invitations are listed, can be resent or withdrawn, and
  expire after a while. This is the delivery side of the planned 🚧 "Invite
  family members with roles", which decides what an invited member may do. _Builds on:_ the mail queue (`MailService` templates),
  better-auth sign-up, and the per-account "this is me" link on the Profile
  page.
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
- 💡 🆕 **Static family website.** Publish deceased people only, as a static
  site that can be hosted anywhere. It's a read-only export rather than a live
  link.

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
