# Changelog

What shipped, and when, newest first. [FEATURES.md](FEATURES.md) describes
each feature as it stands today; this file records when it arrived or
changed. Planned work is in [ROADMAP.md](ROADMAP.md).

The app has no releases yet, so entries are grouped by date. When something
ships, add it under today's date and update FEATURES.md in the same change.

## 2026-10-11

### Added

- Overview cards for the family: "On this day", "Featured ancestor", "The
  family at a glance" and "Where the family came from".
- Overview cards for editors: "Research to-do", "Census gaps" and "Recently
  added and changed". For admins: "Things to look at" and "System status".
- Settings → Overview chooses which cards show and in what order. Each member
  can hide cards for themselves (Customize) and drag them into their own order
  (Arrange).
- Settings → Person page: which cards show and in what order, how names read
  ("Anders Jensen", "JENSEN, Anders", "Anders JENSEN"), full dates or years,
  whether ages show, and the Family card's scope (half-siblings, step-relatives,
  in-laws).
- What Viewers see of living people is now a setting: name only, name and
  birth year, or nothing.
- Consistency warnings: facts that can't all be true (death before birth, a
  parent too young, a child born after the mother died, …), shown at the top
  of the person page and listed in Tools → Data integrity. The limits are set
  in Settings → Person.

### Fixed

- Privacy: the People list's date, place and "Missing" filters, and sorting or
  grouping by birth, death, age or place, no longer reveal hidden facts about
  living people to Viewers.

## 2026-10-10

### Added

- Records entered as written: census households and church book entries
  (baptism, marriage, burial), with every person named, linked to the tree or
  used to create them. Saving creates the events, marriages, associations and
  citations the record implies.
- Built-in censuses for Denmark, Norway, Sweden, England & Wales, Scotland, the
  USA and Canada, plus custom censuses in Settings.
- Records suggest the parent and spouse links they imply, or make them
  automatically (a Settings choice).
- A Records card on the person page with census coverage (found, searched but
  not found, not yet searched), and birth estimates from recorded ages.
- Records settings.
- Personal details opens as "life at a glance", with a generated life summary
  and milestones.
- Duplicate person detection (Tools → Possible duplicates), with Danish names
  compared by sound. "Merge with…" lists likely duplicates first.
- Themes: five built in (Nova, Heritage, Fjord, Meadow, Ink); admins choose
  the family site's theme and make their own, and members can pick a different
  one on their profile.
- Static family website: Tools → Family website exports the whole tree as a
  zip of plain pages, with the interactive tree chart.
- Research checklist behind the person page's "research completeness" bar,
  and a "Missing" filter on the People list.
- Full-text search (`/search`, and a search box in the header) across notes,
  citations, events, places, marriages, roles, research notes and records.
- Tree cards say how each person is related to the centre person, and the line
  between partners shows the marriage year.
- People list: search, filters, sort and page are kept in the URL; header
  sorting; "Similar spellings"; one- or two-line rows; grouping by last name,
  birth century or birth parish; a Columns menu; "My ancestors" and "Open
  research notes" filters; Settings → People list.
- Overview: "Your place in the tree" and "Continue where you left off".
- Data integrity check for record ages that disagree with a recorded birth.
- Development tools on localhost: the component showcase.

### Changed

- The shared component library moved to shadcn/ui on Base UI. React Aria stays
  for the photo grid, file drop zone, tag chips and calendar.
- The tree chart moved into its own package (`packages/tree-chart`), shared
  with the static family website.

## 2026-10-09

### Added

- Tree display settings on the Settings page: photos, gender badge, mourning
  band, relationship labels, marriage years, date detail, direct-line
  highlighting, and the chart and direction the tree opens with.
- Getting around a big tree: re-centring glides instead of reloading, "Find in
  tree", a minimap, and full keyboard control.
- Doing things from the tree: a right-click menu on cards, a "+" menu to add
  relatives, export as PNG, PDF or SVG, and the tree reopening where each
  member left it.
- Personal details opens as a readable profile with an Edit button.
- Family events (children's births and deaths, a spouse's or parent's death)
  in the Life events timeline.
- Presumed deceased: a hint on the person page, a Tools check to mark everyone
  it applies to, and the same rule in GEDCOM import.

## 2026-10-08

### Added

- Merge a duplicate into a person ("Merge with…"), with a preview of what
  moves.
- Show both sides, ancestors only, or descendants only on the tree.
- Remove a parent, spouse or child relationship from the tree's side panel.
- GEDCOM 7.0 export alongside 5.5.1.
- Members and roles (Admin, Editor, Viewer) and a Members page.
- Joining by invitation only: email invitations valid for 14 days, with a role,
  an optional "this is you" person and a personal message.
- Living people are shown to Viewers by name only.

### Changed

- The tree view is now drawn with topola (it was React Flow), with relatives,
  ancestors and descendants charts, two directions, and pan/zoom.
- Immich is optional: when it isn't configured or can't be reached, the photo
  features are turned off and the Overview says why.

## 2026-10-06

### Added

- GEDCOM import from the Tools page, with a preview before importing.
- Witnesses, godparents and other roles on a person's records.
- GEDCOM round-trip for privacy restrictions (RESN), research to-dos, place
  coordinates, repositories and external IDs (FamilySearch, Ancestry, REFN,
  EXID), with an "External IDs" card on the person page.
- Add a sibling directly from the tree.
- Physical and virtual albums, album categories, photo book reading mode,
  manual photo order, and captions and Immich tags per photo.
- Delete albums and photos, and remove a photo from an album.

### Changed

- GEDCOM export carries this app's own fields as underscore tags, so export
  followed by import is lossless.
- The language switcher moved to the header.

## 2026-09-29

### Added

- English/Danish language switching, saved to the account. It covers every
  page, backend error messages and Danish free-text dates ("ca. 1854").
- GEDCOM 5.5.1 export from the Tools page.
- Data integrity checks and a two-store consistency check (Postgres vs. the
  Apache AGE graph).
- "Download all albums" as a queued zip, with a notification when it's ready.
- Set a person's profile photo from an Immich photo, with a circular crop.
- Album date and place, with a filters panel and sort.

## 2026-09-27

### Added

- Notifications: a bell in the header for finished background jobs, with mark
  as read and delete.
- Personal notes: a Notes page with each member's own markdown notes.
- Database backup and restore on the Tools page, run as background jobs.

## 2026-09-26

### Added

- Family card on the person page.
- Research notes per person.

## 2026-09-25

### Added

- People list (renamed from "Person list") with real pagination.
- Profile page: display name, phone number, password, light/dark/system mode,
  and the person who is you.

## 2026-09-23

### Added

- Markdown notes: a rich editor for every notes field.
- Tree view (`/tree`): ancestors and descendants around one person, expandable
  generation by generation, with a docked detail panel and adding relatives
  from the tree.
- Family photo library via Immich: albums, upload, adding existing photos,
  face detection linked to people, and a person's Photos card.

### Changed

- Birth and death are recorded as life events, so they're cited like any other
  event.

## 2026-09-22

### Added

- A list of everyone in the tree, with avatars, gender, living/deceased badge
  and age.
- Settings, including editable dropdown options (Settings → Dropdown options).

### Changed

- The frontend moved to TanStack Start (SSR), with its server side as a proxy
  to the backend.

### Fixed

- Editing an alternate name.
- Orphaned relationship links.

## 2026-09-21

### Added

- Person records: names, nicknames, title and suffix, gender, birth and death
  with approximate or range dates, living/deceased flag, notes, and a computed
  age.
- Alternate names, with notes, editable after adding.
- Life events (christening, burial, emigration, occupation, …) with
  structured per-type detail fields, sorted chronologically.
- Relationships: parents, spouses and children, with parentage type.
- Marriages/unions with status, start/end dates and places, and more than one
  per pair.
- Sources and citations on a person or on a specific fact, with a confidence
  level.
- A human-readable public id per person (e.g. `LZ4Y-9K2`).
- Unified, forgiving date entry with a live preview.
- Autocomplete on title and suffix.
- Person profile photo, uploaded to the backend.
- Printable single-person report (family group sheet).
- Delete a person who has no recorded relatives, and confirm before removing
  names, events or relationships.
- Sign-in by email/password or Google.
- Dark mode.

## 2026-09-20

- First commit: the monorepo (NestJS backend, React frontend, Postgres with
  Apache AGE).
