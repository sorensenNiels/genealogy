# Tech stack

What this project is built from, and why. Versions are pinned centrally in the
`catalog:` block of `pnpm-workspace.yaml`; the numbers below were current when
each piece was added (September–October 2026).

## At a glance

| Layer                           | Choice                                 | Version                    |
| ------------------------------- | -------------------------------------- | -------------------------- |
| Runtime                         | Node.js                                | 24 LTS                     |
| Language                        | TypeScript                             | 6.0.3                      |
| Package manager                 | pnpm (workspaces + catalog)            | 12.5.1                     |
| Build orchestration             | Turborepo                              | 2.11.2                     |
| Lint / format                   | oxlint / oxfmt                         | 1.83.0 / 0.68.0            |
| Tests                           | Vitest                                 | 5.0.1                      |
| Backend                         | NestJS on Express                      | 12.0.3 / Express 5.2.0     |
| API contract                    | tRPC + superjson + Zod                 | 11.19.0 / 2.2.6 / 4.6.5    |
| Relational ORM                  | Drizzle ORM + drizzle-kit              | 0.45.2 / 0.31.10           |
| Database                        | PostgreSQL + Apache AGE + PostGIS      | 18 / 1.8.0 / 3.6           |
| Background jobs                 | BullMQ on Valkey (Redis-compatible)    | 6.3.9 / 9                  |
| Frontend                        | React + TanStack Start (Vite)          | 19.3.0 / 1.168 / 8.3.0     |
| Routing / data / tables / forms | TanStack Router, Query, Table, Form    | 1.170 / 5.103 / 9.2 / 1.33 |
| Components                      | shadcn/ui (React Aria) on Tailwind     | new-york, slate / 4.3.3    |
| Animation                       | motion                                 | 13.4.0                     |
| Markdown notes                  | MDXEditor / react-markdown             | 4.2.5 / 10.1.0             |
| Internationalization            | i18next + react-i18next                | 26.4.2 / 17.0.15           |
| Authentication                  | better-auth                            | 1.7.5                      |
| Tree view                       | topola + d3-zoom                       | 3.10.4 / 3.0.0             |
| Photo library                   | Immich (self-hosted, separate service) | 3.2.2                      |

## Repository shape

```
apps/backend      NestJS + tRPC over Express
apps/frontend     TanStack Start — renders every page; its server side proxies
                  data/auth calls to apps/backend over HTTP (see below)
packages/core     Domain model, no framework dependencies
packages/db       Drizzle schema + Apache AGE access layer
packages/ui       shadcn/ui components + shared Tailwind theme
```

`apps/` holds things you can run; `packages/` holds things they share.
Dependencies point one way: `frontend → ui`, `frontend → core`, `backend → db → core`.
`apps/frontend` has no dependency on `packages/db` at all — see "TanStack Start,
apps/frontend as a proxy" below. It takes a **type-only** dependency on the backend
to obtain `AppRouter`.

`packages/core` is intentionally free of React, Nest, Drizzle and pg. It is where
genealogical rules live — name formatting, lifespan rendering, date parsing,
GEDCOM parsing, what a relationship kind means — so those rules can be tested
without a database and reused on both sides of the wire.

## Decisions worth knowing

### The whole monorepo is ESM

Not a preference — NestJS 12 and its ecosystem packages ship ESM-only, so there is
no CommonJS half left to stay compatible with. Node-targeted packages therefore
use `"module": "nodenext"` and relative imports carry explicit `.js` extensions.
The frontend and `packages/ui` use bundler resolution instead, since Vite resolves
them.

### TypeScript 6, not 7

TypeScript 7.0 (the native port) ships the `tsc` executable only and drops the
programmatic compiler API. The Nest CLI calls into that API, so `nest build` and
`nest start` fail outright on 7.0. The API is expected back in 7.1; the catalog
entry carries a comment marking that as the upgrade trigger. The decorator and
metadata emit TypeScript 7 produces was verified as correct — this is purely
about tooling, not language features.

### oxlint and oxfmt instead of ESLint and Prettier

Same job, roughly two orders of magnitude faster, single binary, one editor
extension. The cost is a smaller rule set and a handful of rules that assume
React or Node idioms the frameworks here contradict. Those are switched off with
a stated reason in `.oxlintrc.json` rather than silently, notably:

- `typescript/consistent-type-imports` is off for `apps/backend`. NestJS
  constructor injection depends on `design:paramtypes` metadata; converting an
  injected dependency to `import type` erases the runtime value and breaks DI
  with no compile error. This is the sharpest edge in the repository.
- `typescript/no-extraneous-class` is off for the backend, because a Nest module
  is an empty decorated class by design.
- `react-perf` is not enabled. It flags every inline handler and prop object,
  which is idiomatic React and not a measured problem here.

### A version catalog rather than per-package ranges

Package manifests depend on `"catalog:"`, resolved from `pnpm-workspace.yaml`.
React in `apps/frontend` therefore cannot drift from React in `packages/ui`, and
an upgrade is a one-line change in one file. This matters more than usual in a
codebase written largely by an agent, where a plausible-looking version range can
be introduced in a package nobody is currently reading.

### NestJS + tRPC, without a bridging library

tRPC routers are plain Nest providers that build their router from a **method**,
not a field initializer — class fields are evaluated before the constructor body,
so a field would capture `undefined` dependencies. `TrpcRouter.applyMiddleware`
mounts the assembled router on the Express instance at `/trpc` during bootstrap,
and `AppRouter` is inferred from the builder's return type:

```ts
export type AppRouter = ReturnType<TrpcRouter["build"]>;
```

Nothing is hand-written or code-generated, so renaming a procedure or changing an
input shape is a compile error rather than a runtime 400 — including in
`apps/frontend`, whose server-side proxy client is built against this same
`AppRouter` type. Packages such as `nestjs-trpc` were deliberately skipped: the
integration is about thirty lines, and owning it avoids a dependency between two
fast-moving frameworks.

superjson is configured as the transformer on both ends, so `Date` values survive
the wire — genealogical payloads are full of them.

### TanStack Start, apps/frontend as a proxy to apps/backend

`apps/frontend` is TanStack Start (it replaced a plain Vite SPA; the user
already runs Start in production elsewhere). Two decisions shape it:
**apps/backend keeps sole ownership of the database**, and **apps/frontend's
server side is a proxy in front of it**, not a second place business logic can
live. See "The proxy architecture" in [CLAUDE.md](CLAUDE.md) for the concrete
mechanics (the tRPC vanilla client, the auth pass-through route, the
photo-upload route, the two-file env split); this section is about why.

That framing kept the highest-consequence code — the graph-transactional person
mutations and session/auth logic — in exactly one place, so the migration was a
frontend-shape change plus a thin proxy layer rather than a backend rewrite.

Two protocol-layer choices, each checked against an alternative:

- **Keep tRPC, call it server-side, rather than converting apps/backend to
  REST.** apps/frontend's server functions use a plain `@trpc/client` vanilla
  client from server-side code only — the browser never talks to tRPC
  directly. This keeps apps/backend's procedures, their Zod validation, and
  `protectedProcedure`'s auth gating untouched, at the cost of every server
  function being a thin, slightly boilerplate-y wrapper (see CLAUDE.md).
  Converting to REST would be a protocol-shape preference with no functional
  benefit — apps/frontend's own components never see tRPC's types either way.
- **Proxy `/api/auth/*` through apps/frontend too, rather than leaving it
  cross-origin.** Leaving auth pointed directly at apps/backend would keep the
  cross-origin cookie machinery (`CORS_ORIGINS`, `credentials: "include"`,
  `trustedOrigins`) that caused real debugging pain earlier (hung Save/login
  requests traced to devcontainer port-forwarding across the origin split).
  One origin for everything removes that class of bug rather than working
  around one instance of it.

`createServerFn` buffers an entire multipart request body into memory before
the handler runs, with no streaming and no way to reject an oversized upload
early — an open upstream issue. Uploads therefore go through Start **API
routes** (`server.handlers`) instead, which forward the raw, unparsed request —
sidestepping the limitation rather than adding a streaming-multipart
dependency.

Library check: `@tanstack/react-start` was still formally a Release Candidate
when adopted (confirmed against its docs, roughly a year after reaching RC),
though shipping multiple releases a week with healthy issue triage. That risk
was named explicitly and accepted on the strength of the user's own production
experience with it — not a claim that the RC label doesn't matter.

### Postgres + Apache AGE: two stores, one database

Genealogical data is half records and half graph. People, sources and citations
are relational and are modelled with Drizzle. Relationships (`PARENT_OF`,
`SPOUSE_OF`) are a graph, and pedigree questions — _who are this person's
ancestors, and how many generations back_ — are variable-length traversals that
recursive CTEs express awkwardly and Cypher expresses directly.

Apache AGE puts both in the same database, which is the point: a single
connection pool means a write can create the `persons` row and its graph node in
one transaction (`inGraphTransaction`), so the two halves cannot diverge.
PostGIS is installed in the same image (`postgres/Dockerfile`) for place
coordinates — see "GEDCOM import" below.

Drizzle was chosen over TypeORM despite TypeORM's first-party Nest integration,
because AGE needs per-connection setup (`LOAD 'age'`, then `search_path`) and
Drizzle sits directly on a `pg` pool that we own. TypeORM hides its pool. Drizzle
also accepts a checked-out `PoolClient`, which is what lets a Drizzle write join
an open Cypher transaction. Wiring it into Nest is a twenty-line module.

Costs, stated plainly: AGE is a niche extension with a smaller community than
Postgres proper, it requires a custom image, and Cypher results come back as
`agtype` that needs decoding (`parseAgtype`). The graph layer is confined to
`packages/db` so that this is one file's problem rather than the application's.

Sharp edges, documented in code and in [CLAUDE.md](CLAUDE.md):

1. The graph is named `family_tree`, not `genealogy`, because `create_graph()`
   creates a same-named schema and the database and role are both `genealogy` —
   a colliding name makes `"$user"` on the search path shadow `public` and sends
   every `CREATE TABLE` into the graph's schema.
2. AGE parses the graph name, query text and result column list at plan time, so
   none of them can be bound parameters. `cypher()` validates all three and
   requires user values to travel through `params`; those guards are unit-tested.
3. `cypher()` double-quotes each result column. Postgres folds an unquoted
   identifier to lower case, so a camelCase column (`childId`) would come back
   keyed `childid` and decode as `null` — silently.
4. AGE has no index on vertex properties. `MATCH (p:Person {id: ...})` is a label
   scan; bulk writes match by vertex id (`id(p) = ...`) instead, which hits the
   label table's primary key — see "GEDCOM import" below for the numbers.

### Photo uploads: one REST controller, multer, local disk

`person-photo.controller.ts` handles a person's own profile photo. tRPC's
contract is JSON in, JSON (well, superjson) out, with no first-class way to
accept `multipart/form-data`, so this — like the other binary endpoints added
since (Immich assets, backup download/restore) — is a plain Nest `@Controller`
using `@nestjs/platform-express`'s `FileInterceptor` with `multer`. Each such
controller re-implements the `auth.api.getSession` check `protectedProcedure`
does, by hand, since it sits outside tRPC's context.

`multer` passed the library check: actively released, and it's what
`@nestjs/platform-express` itself documents and bundles for file uploads.

Uploaded files are written to `UPLOADS_DIR` (default `./data/uploads`, a plain
filesystem path, not object storage) and served back at `/uploads/<filename>`
via `app.useStaticAssets`. This fits the self-hosted single-server deployment
model, at the cost of needing `UPLOADS_DIR` on a persistent volume once
deployment packaging exists (🚧, see [IDEAS.md](IDEAS.md)).

The `persons.photo_path` column stores just the filename, never a URL — the
frontend joins it with the backend's own origin (`publicBackendUrl` from
`apps/frontend/src/lib/env.ts`) at render time, so nothing in the database is tied
to a specific host or port.

### A second, human-readable id per person

`persons.id` (the UUID primary key) is what every foreign key and graph node
uses, but it's not something a person would ever read aloud or write down.
`persons.public_id` — `generatePublicId()` in
`apps/backend/src/person/public-id.ts` — is a short id in the same spirit as
FamilySearch's PID (`LZXY-ABC`): one letter, six more letters-or-digits,
formatted `XXXX-XXX`. Always starts with a letter on purpose, so it never
reads as a bare number. Generated once at creation and never changes;
`PersonService.create` (and GEDCOM import) retries on a unique-constraint
collision (SQLSTATE 23505), which at ~56 billion combinations should never
actually fire. The DB enforces the shape with a `CHECK` constraint added
directly in the migration SQL (`persons_public_id_format`) rather than through
Drizzle's schema builder, since the column is never user-editable.

### shadcn/ui on React Aria Components, not Radix or Base UI

Components are built on Adobe's React Aria Components (`react-aria-components`)
rather than shadcn's original Radix preset or its Base UI preset (both were used
here before). Plain-element components (`card`, `input`, `table`) wrap native
elements; interactive ones (`button`, `select`, `popover`, `dialog`,
`combobox`, ...) each wrap the matching React Aria component.

A deliberate, user-directed choice: `react-aria-components` and its
`react-aria`/`react-stately` siblings are actively released, and React Aria's
accessibility track record (it backs Adobe's Spectrum design system in
production) was the deciding factor.

`pnpm dlx shadcn add` is not usable as-is: it fetches the default Radix + `cmdk`
registry entries regardless of which headless library the project uses, so
every generated file's primitive import needs hand-swapping to
`react-aria-components`. The new-york/slate visual design is kept; only the
primitive layer underneath it differs.

Points that will bite you, coming from Radix or Base UI:

- **No separate `Trigger` component for `Popover`/`Dialog`.** React Aria's
  `DialogTrigger` takes the trigger element as its first child directly — any
  pressable component works, most often this package's own `Button`. Don't add
  a `PopoverTrigger`/`DialogTrigger` wrapper. For a dialog opened from
  something that isn't adjacent to it (a face box on a photo, a menu item), use
  `ControlledDialogContent` from `dialog.tsx` — a controlled dialog with no
  trigger, sharing the same `DialogSurface` shell as `DialogContent`.
- **List items are identified by `id`, not `value`.** In `Select`/`ComboBox`,
  an item's `id` is what `value`/`onChange` matches against; `value` is a
  separate, optional data payload. Passing an object as `value` (the Base UI
  pattern) is a type error here.
- **`ListBoxItem`/`ComboBoxItem` need an explicit `textValue`** whenever their
  children aren't a single plain string (e.g. a name plus a parenthesized
  lifespan) — React Aria uses it for type-ahead and warns loudly at runtime
  if it's missing and can't be inferred.
- **Components without a visible `<Label>` need an explicit `aria-label`.**
  Unlike native `<select>`/`<input>`, wrapping a React Aria component in a
  plain `<label>` element does not associate it accessibly; React Aria warns
  in the console when this is missed; treat that warning as a bug, not noise.
- **States are `data-hovered`/`data-pressed`/`data-focus-visible`/
  `data-disabled`/`data-selected`/`data-entering`/`data-exiting`**, all
  presence-only attributes: plain Tailwind `data-hovered:…` (no brackets
  needed) plus a `transition` utility for enter/exit. There's no
  `tailwindcss-animate`/`tw-animate-css` plugin, so the `animate-in`/`fade-in-0`
  classes shadcn's generated files assume don't exist here.
- **`onPress`, not `onClick`, for this package's `Button`.** `onClick` still
  works (React Aria keeps it as a compatibility alias) but normalizes worse
  across mouse/touch/keyboard/screen-reader activation. Plain native `<button>`
  elements are unaffected and keep using `onClick`.
- **Interactive controls can't nest.** React Aria refuses a pressable inside
  another pressable — put them side by side in a positioned wrapper instead
  (the photo viewer's face box and its unlink "X" are siblings for this reason).
- **apps/frontend never imports `react-aria-components` or `motion` directly.**
  If a page needs a new primitive shape, add it to `packages/ui` — that's how
  `ControlledDialogContent` and `TagInput` (an `Autocomplete` plus React Aria's
  `TagGroup` for removable chips) came about.

### Markdown notes: MDXEditor, not Tiptap

Every `notes` field across the app is stored as plain markdown text and edited
through a shared WYSIWYG component, `@genealogy/ui/components/markdown-editor`,
rather than a plain `Input` — see the "notes field" rule in
[CLAUDE.md](CLAUDE.md#adding-to-the-stack). Read-only display goes through the
counterpart `markdown-content`, built on `react-markdown`.

Checked against the "Recommending or adding a library" rule before adding
either:

- **[MDXEditor](https://mdxeditor.dev/) (`@mdxeditor/editor`) over
  [Tiptap](https://tiptap.dev/) (`@tiptap/react`) for the editor itself.**
  Both are actively maintained, but they differ on native storage format.
  MDXEditor is built (on Lexical) to parse markdown in and serialize markdown
  back out on every change, so a `notes` field round-trips as plain text with
  no extra layer. Tiptap's native format is HTML/JSON; markdown in and out needs
  a community extension (`tiptap-markdown`) that had gone unpublished for over
  a year against a Tiptap core that had since moved from v2 to v3 — exactly the
  kind of plausible-but-unmaintained dependency the rule exists to catch.
- **`react-markdown` for read-only rendering, not MDXEditor's own `readOnly`
  mode.** MDXEditor's docs say plainly not to use it that way — "don't use
  this mode to render content for consumption." `react-markdown`'s last npm
  release was over a year old when checked, but its repository had recent
  commits and a small, well-triaged issue count — stable and low-churn, not
  abandoned.

`MarkdownEditor` follows `use-theme.ts`'s placeholder-then-swap pattern (a
plain `<textarea>` bound to the same value until mounted, then the real
editor), since Lexical touches `contentEditable` at mount and cannot run during
SSR. `MarkdownContent` has no such restriction — `react-markdown` touches no
browser APIs and renders identically server- and client-side.

### Dark mode: a hand-rolled toggle, not `next-themes`

Dark mode is a plain `.dark` class on `<html>`, driven by
`packages/ui/src/hooks/use-theme.ts`. The preference is tri-state: an explicit
`"light"`/`"dark"` stored in `localStorage` always wins; absent one, the
resolved theme follows `prefers-color-scheme` live via a `matchMedia` listener.
`packages/ui/src/components/theme-toggle.tsx` is a ready-made toggle built on
the hook; `apps/frontend/src/routes/__root.tsx` places it in the header.

`next-themes` isn't needed: the FOUC it prevents is handled by an inline
`<script>` in `__root.tsx`'s document `<head>`, before any stylesheet, that
reads the same `localStorage` key (falling back to `matchMedia`) and sets
`.dark` synchronously before React hydrates; and `use-theme.ts` is SSR-safe by
starting from a placeholder and reading the real value in a client-only
`useEffect`. The inline script duplicates the hook's resolution logic — there's
no way to share code between an inline script and a TypeScript module — so
keep the two in sync by hand if the storage key or resolution rule ever
changes. The colors themselves are the `:root`/`.dark` variables in
`packages/ui/src/styles.css`.

### Motion for animation, applied by hand to React Aria components

`motion` (Framer Motion's current package name) drives spring-based
entry/exit on the overlay components (`popover`, `dialog`, `select`,
`combobox`, plus the photo viewer and photo book). It was chosen over **Animate
UI**, a shadcn-CLI-style registry that looked like a shortcut but depends on
`radix-ui` (despite one of its doc pages claiming React Aria) and had no
commits in the ~9 months before it was checked. `motion` is actively released
and is what Animate UI runs on anyway.

The pattern is React Aria's own documented one for animating `Modal`/`Popover`
exits with Motion (the "Animation" section of its styling guide): wrap the
overlay with `motion.create(...)` and give it an `isExiting` prop so it stays
mounted until the exit animation finishes, keyed off a
`'unmounted' | 'hidden' | 'visible'` state tracked wherever `onOpenChange`
fires. `packages/ui/src/hooks/use-overlay-transition.ts` builds that state
machine once and hands it to the matching Content component via React
context, so each overlay only defines its own `variants`, and no consumer ever
sees the state machine.

Two sharp edges specific to `Select`/`Combobox`:

- **Their item list must always render, even before first open.** React Aria
  resolves a `Select`/`ComboBox`'s current value against its item collection
  to display a label, and that collection is built from the `SelectItem`/
  `ComboBoxItem` elements actually in the React tree. Returning `null` from
  `SelectContent`/`ComboboxContent` while closed (the trick `Dialog`/`Popover`
  use freely) leaves the trigger showing "Select an item" even though a
  matching option exists. Only the Motion `animate`/`isExiting` props vary
  between "hidden" and "visible".
- **Don't hand their `Popover` to `motion.create()`.** Because the content
  stays mounted from page load, Motion's first render has `initial` equal to
  `animate` (a no-op), and React Aria's `Popover` then re-renders on its own to
  recompute its position, writing into the same inline `style` Motion animates
  — stomping opacity back to `0` forever. The popover is open and interactive
  but invisible. Instead `Popover` renders un-wrapped (still taking
  `isExiting`, which is all that keeps it mounted) and a plain
  `motion.create("div")` inside it wraps the `ListBox`.

`combobox.tsx` sets `menuTrigger="focus"`: it has no separate trigger button,
and React Aria's default `"input"` only opens on an actual edit, so clicking
into the field would show nothing until you typed.

**A green `pnpm test` can't vouch for anything layout- or animation-shaped.**
jsdom has no real layout/paint engine, so the stuck-opacity bug above passes
every test in `select.test.tsx` unchanged (checked by reverting the fix).
Stuck opacity, mispositioned overlays, a transition that never completes —
verify those against the dev server in a real browser (this project's pattern:
a throwaway Playwright script checking `getComputedStyle` on the real DOM).

### Component tests: Vitest + React Testing Library + `@react-aria/test-utils`

- `packages/ui/vitest.config.ts` sets `environment: "jsdom"`, with a
  `vitest.setup.ts` that imports `@testing-library/jest-dom/vitest` (matchers
  like `toBeVisible`) and stubs `ResizeObserver`/`scrollIntoView`/pointer
  capture, which jsdom lacks but React Aria's overlay positioning and
  interaction layers call. The setup file lives outside `src/` but is in
  `tsconfig.json`'s `include` — otherwise `tsc` never sees the jest-dom
  augmentation and every matcher fails to typecheck.
- `@react-aria/test-utils` — React Aria's own ARIA-pattern testers
  (`new User().createTester("Select", { root })`, `"ComboBox"`, ...) — drive
  components the way a real user would (via `@testing-library/user-event`) and
  query by role rather than implementation detail. A hand-rolled
  `fireEvent.click` on a trigger doesn't exercise the same
  open/value-resolution path a real click does, which is how the `Select`
  label bug above would have slipped through.

Every component with meaningful behavior has a `<name>.test.tsx` beside it.
Purely presentational ones (`card`, `input`, `table`, `badge`, `avatar`,
`separator`) don't — add one if a bug is ever found in one.

One gotcha when testing anything built on `ComboBox` (`TagInput`,
`Autocomplete`): React Aria marks the rest of the page `aria-hidden` while the
suggestion popover is open, so a `getByRole` query for content outside it fails
even though the content is in the DOM. Close the popover (`{Escape}`) first.

### better-auth, hosted entirely in the backend

Authentication (email/password + Google OAuth) is better-auth, mounted as an
Express handler inside the NestJS backend (`apps/backend/src/auth/`) rather than
split across frontend and backend. The frontend has no auth logic of its own —
`apps/frontend/src/lib/auth-client.ts` is a `better-auth/react` client that talks
to `/api/auth` on **its own** origin: `apps/frontend/src/routes/api/auth/$.ts`
proxies every request through to the backend unmodified (see "TanStack Start,
apps/frontend as a proxy" above).

The NestJS integration is hand-rolled rather than built on the community
`@thallesp/nestjs-better-auth` package (which better-auth's own docs point to):
that package is built around Nest guards and decorators for controllers, while
what's needed here is an Express mount (`main.ts`) and a tRPC context lookup
(`trpc.context.ts`), both small — the same reasoning as skipping `nestjs-trpc`.
Every data procedure is a `protectedProcedure` (`trpc.base.ts`); login is
required to use the app.

The Drizzle adapter (`better-auth/adapters/drizzle`) reuses the same `pg` pool
and Drizzle instance as the rest of the app (`DatabaseModule`'s `DRIZZLE`
provider), so `user`/`session`/`account`/`verification` are ordinary tables in
`packages/db/src/schema.ts` migrated the same way as everything else. Row IDs on
those four tables are plain `text`, not the `uuid().defaultRandom()` the rest of
the schema uses, because better-auth generates its own IDs application-side.

Google OAuth credentials (`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`) must be
created by hand in Google Cloud Console — there is no way to provision these
programmatically, and `.env.example` documents the redirect URI Google needs.

### TanStack across the frontend

Router (file-based, with automatic code splitting via the Vite plugin), Query for
server state, Table for grids, Form for input. One family, one set of
conventions. Server functions call tRPC server-side only (see "TanStack Start,
apps/frontend as a proxy" above), so route components use plain
`useQuery`/`useMutation` with hand-written query keys — there's no
`@trpc/tanstack-react-query`/`useTRPC()` here.

TanStack Table v9 is a substantial departure from v8: `useTable` replaces
`useReactTable`, and optional row models are registered as feature slots inside
`tableFeatures({})` rather than passed as table options. v8 examples will not
work. The people table registers no optional features because ordering is done
in SQL, where it can span the whole result set rather than the page.

shadcn/ui components are vendored into `packages/ui` rather than installed, which
is how shadcn is meant to be used — they are source you own. `components.json`
points the CLI at that package, so `shadcn add` lands components in the right
place.

**File-based routes nest purely on path prefix, regardless of whether the
"parent" file renders an `<Outlet />`.** A route sharing a URL prefix with an
existing route file becomes its _child_ automatically (the generator's longest
matching prefix wins), and if the parent's component has no `<Outlet />` the
child silently never renders — the URL changes, the parent stays on screen, no
console error. The fix is the trailing-underscore escape:
`routes/people/$personId_.print.tsx` sits beside `routes/people/$personId.tsx`
without nesting under it. It only changes the route's internal `id`; the URL
(`/people/$personId/print`) and every `<Link to="...">` are unaffected. Reach for
it whenever a new route needs to share a URL prefix with an existing route but
not its layout.

### Person names: "First names" and "Last names", nowhere else

A person's given names and surname are always labeled **"First names"** and
**"Last names"** on every form that lets someone type or edit them — the main
person record, the quick "create and link" dialogs under Parents/Spouses/
Children, and the alternate-name form. Never "Given names", "Surname", or
singular "Last name". `packages/core/src/person.ts` still calls the underlying
fields `given` and `surname` (matching GEDCOM vocabulary) — only the
user-facing label is fixed, not the wire format.

There is deliberately no separate "Middle names" field. `given` holds every
given name a person has, middle ones included, unsplit and in source order —
the `personNameSchema` comment says so directly. (A `middleName` column existed
briefly; its migration folded any value back onto the end of `given`.)

### Site-wide display settings: `app_settings`, one JSON row per section

Settings that aren't dropdown lists (the first: whether the tree shows the
gender badge) live in `app_settings` (`packages/db/src/schema.ts`) — `key`
is a section (`"tree"`), `value` a JSON object. Each section has a Zod
schema in `packages/core/src/app-settings.ts` where **every field has a
default**, so a section never saved, or saved before a field existed, reads
as a complete object; a new setting is a schema field plus a form field on
the Settings page, never a migration. A stored value that no longer parses
falls back to the defaults (`SettingsService.getTreeSettings`) rather than
breaking the page. Reads are `protectedProcedure` (every member's tree needs
them), writes `adminProcedure`, and the Settings page shows them under
"Display", above the dropdown topics. They're site-wide, not per member — a
per-member override would go on `user_profiles` instead.

### Configurable dropdown options, not hardcoded enums

Closed-vocabulary dropdowns are backed by a single `configurableOptions` table
(`packages/db/src/schema.ts`) rather than Postgres enums or hardcoded Zod
`z.enum([...])` lists, and are managed from `/settings` instead of requiring a
code change + migration for every new value. The topics
(`configurableTopicSchema` in `packages/core/src/configurable-options.ts`) are
life event types, alternate-name types, citation confidence levels, union
statuses, parentage types, research-note types and association roles.

Each row is `{ topic, key, label, sortOrder, isProtected }`; `key` is what the
data column (plain `text`, never an enum) or the `PARENT_OF` edge's `parentage`
property actually stores, and is immutable once created — only
`label`/`sortOrder` can change, so relabeling or reordering an option never
orphans existing data.

Structural fields stay hardcoded on purpose — code branches on their exact
value in ways a runtime-editable list can't safely support: `citationFactType`
(person/name/event/union/association — a citation's `factId` is required or
forbidden depending on it), `gender` (M/F/U), `persons.restriction`, and an
album's `kind`. Some individual option keys are seeded `isProtected: true` for
the same reason at a smaller scale: `event_type`'s `"other"` (a required-label
rule keys off it) and `"birth"`/`"death"` (the person form's dedicated vitals
fields key off them — see "Birth and death are events" below), and
`parentage`'s `"birth"` (the Parents UI's Father/Mother slots — a different
`"birth"`, in a different topic). Protected options can be relabeled but never
deleted. `EVENT_DETAIL_FIELDS` (the extra fields immigration/burial/death/etc.
get, like ship name or cause of death) stays a hardcoded map keyed by the
built-in event-type keys; an admin-added event type gets only the generic
date/place/notes fields — a deliberate limitation, not an oversight.

### Birth and death are events

Birth and death are ordinary `person_events` rows (`eventType`
`"birth"`/`"death"`, both protected options), not columns on `persons`. A birth
record has the same shape as a christening record — a date, a place,
type-specific detail, citations — so a birth citation is just `factType:
"event"` with that row's id, like any other event, and the "Life events" card
shows births and deaths alongside everything else.

The person page still edits them as a dedicated pair of fields ("Date of
Birth"/"Place of Birth", etc.) rather than through the generic "+ Add event"
dialog — a UX choice (one canonical birth, easy to find), not a data-model one,
enforced in one place: `PersonService.addEvent` rejects a second
`"birth"`/`"death"` row for the same person regardless of which UI path tried
to create it. Once created, the row is editable from the "Life events" list
like anything else except its type, which `EventForm` locks for those two.

Reads pay for this. Rather than a denormalized `persons.birth` cache kept "in
sync" with the event row — two sources of truth again, one level down —
`personsWithVitals` (`packages/db/src/vitals.ts`) left-joins `persons` to its
own birth/death `person_events` rows and assembles a `{birth, birthPlace,
death, deathPlace}` shape. `PersonService` routes every person read through it,
and `create`/`update` split their input into a `persons` write plus a
birth/death upsert (`upsertVitalEvent`) in the same transaction, so
`createPersonSchema`/`updatePersonSchema`/`Person` carry those four fields as
assembled values and the form, list, tree and print report don't need to know.
The left join is only safe because `addEvent`'s guard keeps birth/death at most
one row per person per type — anything less strict would multiply rows.

### One Save button component, not one per form

Every form that saves or creates a record uses `SaveButton`
(`packages/ui/src/components/save-button.tsx`) instead of a bare `Button
type="submit"`: a small red dot once the form is dirty, swapped for a spinner
(disabling the button) while the save is in flight. `isDirty`/`isPending` come
from the owning TanStack Form's own store
(`useStore(form.store, (s) => s.isDirty / s.isSubmitting)`), not from a
mutation's own `isPending` — a form whose `onSubmit` awaits more than one
mutation (`CreateAndLinkForm`, creating a person then linking them) would
otherwise report "not pending" between the two calls.

A handful of forms track a Select's value in `useState` rather than a
`form.Field` (`NameForm`'s name type, `EventForm`'s event type), which the
form's own `isDirty` can't see; those OR in a manual comparison against the
initial value. `CitationForm` has no TanStack Form at all, so it snapshots all
its `useState` fields once on mount and compares the whole set; the snapshot
uses `useState`, not `useRef`, because reading `ref.current` during render is
flagged by oxlint's `react(refs)` rule.

**A `SaveButton` inside another form's subtree must be `type="button"` with an
`onPress`.** A `type="submit"` button submits its nearest ancestor `<form>`,
and React's synthetic events bubble through the _React_ tree, not the DOM tree —
so across a `createPortal` boundary too ("the portal still exists in the React
tree, regardless of position in the DOM tree"). Every `Dialog` here portals via
React Aria's `Modal`. A `CitationForm` opened inside an event's edit dialog
(`embedded` mode) therefore also fired the **outer** `EventForm`'s `onSubmit` —
closing that dialog — even with the inner form calling `preventDefault`, and
even when rendered without any portal. `stopPropagation` doesn't cover the
native-submission case, so `SaveButton` lets a caller override `type` to
`"button"` for exactly this.

### Tree view: topola, with our data shaped into GEDCOM families

The tree view (`/tree`) draws with [topola](https://github.com/PeWu/topola), a
genealogy-chart library on D3, plus `d3-zoom` for pan/zoom (topola has none).
It offers three of topola's charts — relatives (the default: ancestors and
descendants plus siblings, aunts/uncles and cousins, as far as they're
loaded), ancestors and descendants; hourglass was offered at first and
dropped as a subset of relatives — each top-down or left-to-right (`?view=` and `?orientation=`
in the URL). A link without them opens with the defaults from the Settings
page's Tree section (`app_settings`, below), which also controls what the
cards show; the tree page waits for those settings so it doesn't draw one
chart and then switch. In-page links always write both params out, since
"left out" means "the Settings default", not "what's on screen".

**Why it replaced React Flow + elkjs (October 2026).** React Flow is a
general node-and-edge canvas; nothing in it knows about generations or
couples, so all the genealogy layout was ours (hand-assigned rows, couples
glued into one elk node, union points for children's lines) and the result
still couldn't become a pedigree, hourglass or relatives chart. Topola is
built for exactly those. Topola's built-in box renderers were tried first and
rejected on sight (cramped, centred text, pastel GEDCOM-viewer look), so it
only does the layout and the lines; the cards are ours (below). The old React
cards' on-card "load ancestors" badge is gone — loading ancestors/descendants
lives in the side panel, which already had it.
Maintenance when adopted: v3.10.4 on 2026-09-04, last commit 2026-10-03,
active but essentially one maintainer — a risk to watch.
`family-chart` (Ancestry-style re-centring) was the other candidate; last
release October 2025 and pre-1.0, so riskier.

**Our data → topola** (`apps/frontend/src/lib/topola-data.ts`, unit-tested).
Topola thinks in GEDCOM families: a couple plus their children, and each
person has at most one family-as-child. Every pair of partners — married, or
simply both parents of the same child — becomes one family keyed by the two
ids, so a marriage and the children it produced are the same family; a lone
parent is a one-partner family; a childless couple still gets one so they
sit together. Where a child has several parent sets (birth, adopted, step,
foster), the chart draws one: birth first, then "unknown" (what most
imported and quickly-added links carry), then adopted, then anything else.
The side panel still lists every parent. Topola only has husband/wife
slots; man/woman go where expected, otherwise the order is just stable — box
colour comes from each person's own sex, not the slot. Dates are passed as
our own localized `formatDisplayDate` text, since topola only knows exact
GEDCOM dates and has no Danish qualifiers.

**The wrapper** (`apps/frontend/src/routes/-topola-chart.tsx`). Topola is
CommonJS-only and needs the DOM, so it's loaded with a dynamic `import()` in
an effect — never during SSR. It draws into an `<svg>` it finds by selector
and sets that svg's size and its `<g>`'s translate itself, so d3-zoom sits
on an outer svg with its own transform layer. The chart is rebuilt only when
the chart type, direction or animation setting changes; a data change (load
more, add, remove) is `setData` + `render`, so topola animates it and the
user's pan/zoom stays.

**Smooth re-centring.** `FamilyTree` is deliberately not keyed by the centre
person. It keeps every `person.tree` fetched this visit (`visitedRoots` +
`useQueries`, merged by `mergeTree`), so a new centre adds to what's drawn:
the same topola handle re-renders with the new `startIndi`, topola moves the
cards it already has, and the view pans to the new centre card in the same
700 ms. If the new centre is already loaded (a double-click on a card) the
move starts at once and its own tree merges in when it arrives; someone
unconnected to what's loaded shows "Loading…" until their tree comes. The
panel's selection is stored with the root it was made under, so a new
centre selects itself without an effect.

**Navigating by card position.** The card renderer reports every drawn
card's centre at the end of each render (`onPositions`), computed from the
layout rather than read off the DOM — so it's the final position even while
cards are still animating, and cards topola is fading out aren't in it.
Find in tree, the minimap and arrow-key movement all work from that map.
Arrow keys are spatial (`nearestCard` in `lib/tree-navigation.ts`, tested):
the nearest card on that side, weighting "nearest generation" for moves
along the generations and "same generation" for sideways moves, so they go
where the eye expects in both layouts. The canvas is `role="application"`
(it handles its own arrow keys) with a help text and a live region
announcing the selected person; the minimap is a mouse shortcut and hidden
from assistive tech. Animation is off when the setting says so or the
browser asks for reduced motion.

**Expand from the card.** The "+" buttons are drawn by our card renderer,
not topola's own expanders — those only fold and unfold people already
loaded and can't fetch. They show where `parentsKnownIds` /
`childrenKnownIds` say there's more to load and the chart would draw it, and
run the same `expandMutation` as the side panel's "Load ancestors".

**The cards** (`apps/frontend/src/routes/-tree-card-renderer.ts`) are a
topola renderer of our own, extending its `CompositeRenderer` (which does the
size bookkeeping and the points lines attach to), drawn with D3 since topola
calls it with D3 selections. A card is fixed-size: the photo (or tinted initials)
on the left with a ♂/♀ badge over one corner and, for someone deceased, a
black mourning band across the other, then a left-aligned name,
`* 1850 † 1921` and a place; the text comes from our own rows
(`treeCard` in `topola-data.ts`), not topola's GEDCOM fields. Fixed size also
sidesteps topola's text measuring, which reads the first `<svg>` in the
document (often a hidden icon, which measures 0). Two layout limits shaped
it: topola's gaps between boxes are hard-coded (15px across, 34px between
generations), so each card reports a box padded on every side and draws
inside it — that padding is the spacing; and lines run to box centres, so
cards are opaque and drawn over them. Colours are in `styles.css` under
`.topola-chart`, from the theme tokens.

On the data side, `treeAround` (`packages/db/src/graph.ts`) walks one
generation at a time via `parentsOf`/`childrenOf`, rather than a single
`MATCH ...-[:PARENT_OF*1..N]->...` returning `nodes(path)`/`relationships(path)`.
`parseAgtype` only strips the `::vertex`/`::edge`/`::path` annotation AGE
appends to a _single_ value per column — a list of vertices/edges each carrying
its own inline annotation isn't valid JSON once spliced together. A query per
generation is fine at the depths (4 up, 4 down by default) a tree view renders. The walk only follows edges from the people it queries, so after it (and
the spouse lookup) `parentEdgesAmong` adds every `PARENT_OF` link between
people already collected — otherwise a spouse picked up beside the root has
no links to the couple's children, and the panel shows them childless. "Load
more" does the same for the people it adds, from their relatives' parents.

**Provenance, not just presence, decides "+ Add relative" vs. "Load more".**
Absence in the fetched tree isn't absence in the graph: `treeAround`'s walk
follows an ancestor's own parents further up but never asks whether that
ancestor has _other_ children (the root's aunts and uncles), and symmetrically
for descendants. So "no edge found" can mean "genuinely has none" (show an
add-relative dialog) or "never looked" (show "Load more"). `treeAround` returns
`parentsKnownIds`/`childrenKnownIds` — exactly the ids that were themselves used
as a query source in each direction — and `apps/frontend/src/routes/tree.tsx`
gates on that. "Load more" reuses `person.relatives` one hop at a time and
merges the result into local state rather than refetching the whole tree.

**Additions and removals are layered over the fetched tree, not refetched.**
"+ Add relative", "Load more" and the panel's remove ✕ each patch local state
(`ExtraTreeData` and `RemovedEdges`, combined in `mergeTree`) instead of
refetching `person.tree`, which would drop everything "Load more" pulled in and
lose the user's pan/zoom. After a removal, `keepConnected` drops anyone no
longer connected to the root. Which part of the merged tree is drawn is up to
the chart type (an ancestor chart simply doesn't walk down); the panel always
reads the whole merged tree, so a spouse or child the chart leaves out still
shows there.

### Long-running work: BullMQ + a shared Redis

Anything that shouldn't run inline on a request goes through a BullMQ queue
(`@nestjs/bullmq`) rather than being awaited in a tRPC procedure. `QueueModule`
(`apps/backend/src/queue/queue.module.ts`) is `@Global`, the same pattern as
`DatabaseModule`/`AuthModule`: it opens one shared `ioredis` connection from
`REDIS_URL` and hands it to `BullModule.forRootAsync`, so a feature module just
calls `BullModule.registerQueue({ name: "..." })` for its own queue. `bullmq`,
`ioredis` and `@nestjs/bullmq` (which tracks Nest's major versions) were all
actively released when checked.

Queues today: `mail`, `backup`, `restore`, `album-zip` and `immich-face-scan`.
Each is a service that enqueues plus a `@Processor` (extends `WorkerHost`) in
the same process — there's no separate worker deployment, matching the app's
single-process shape. A job that produces something for the user (a backup, a
zip, a finished re-scan) reports back through `notifications` rows with an
`actionUrl`. **A job that fails after being queued has no notification and
fails silently** — an accepted gap, so anything cheap to validate (an empty
album, say) is checked synchronously in the tRPC procedure before enqueueing.

**Redis is core infrastructure.** There is exactly one, the always-on `redis`
service in `docker-compose.yml` (Valkey, Redis-compatible), published on the
host like `db`. `REDIS_URL` is accordingly a required env var
(`config/env.ts`), unlike `IMMICH_URL`/`IMMICH_API_KEY`.

**Mail** (`apps/backend/src/mail/`): `MailService` owns the SMTP transport and
Handlebars rendering and can be unit-tested without a queue; `MailRouter`
(`mail.send`) enqueues; `MailProcessor` sends. The template is a fixed enum
(`mailTemplateSchema` in `packages/core`), not a caller-supplied filename, to
rule out path traversal. `SMTP_HOST` is optional: unset, `MailService` falls
back to nodemailer's `jsonTransport`, which logs the rendered message instead of
opening a connection — so the queue is exercisable in dev without a mail
provider, and jobs succeed instead of piling up retries.

### Photos & albums: Immich, self-hosted, proxied like everything else

The photo library (`/photos`, and the "Photos" card on a person's page) is
built on [Immich](https://immich.app) rather than a bespoke upload/gallery/
face-detection stack — actively released (v3.2.2 when built) with active
issue/PR turnaround. Face detection and clustering is a research problem, not a
CRUD feature, and Immich already solves it. **Immich is the system of record
for photo bytes, albums and faces**; this app stores only links and local
metadata layered on top.

#### Running it

Immich runs **on its own**, not in this repo's `docker compose` stack — it's a
3-container application of its own (its Postgres with vector extensions, the
server, and a machine-learning service at maybe 6–8 GB of RAM), and a family
usually already has one, typically on a home NAS. The backend reaches it at
`IMMICH_URL` with an `IMMICH_API_KEY` (`apps/backend/.env`), and tolerates it
being absent. A local copy used to run in the compose stack for development;
it was removed once a real instance was available, along with every link this
app held to that test library (Immich ids aren't portable between instances,
so links to one instance's people, albums and photos mean nothing on
another). Built against Immich v3.2.2; v3.2.4 verified compatible.

#### Proxying

The proxy architecture extends to Immich unchanged in shape.
`apps/backend/src/immich/immich.service.ts` is the only thing holding
`IMMICH_API_KEY`; `IMMICH_URL`/`IMMICH_API_KEY` are optional config
(`apps/backend/src/config/env.ts`), so the app boots without Immich.

Configured isn't the same as usable, since Immich lives on another server
that can be down. `ImmichService.status()` probes it — `/server/version`
(answers at all?) then `/users/me` (key accepted? only a 401 counts as no; a
403 is a valid key without `user.read`) — with a 3 s timeout, and caches the
result for 30 s so a down server costs one timeout per 30 s, not one per page.
Every photo and album feature in the UI gates on that one `["immich",
"status"]` query via `useImmichStatus`/`useImmichAvailable`
(`apps/frontend/src/lib/immich-status.ts`): the Photos nav link, the person
page's Photos card and "Choose from Immich", the Tools page's face rescan and
album zip, and the data-integrity dangling-link check (which would otherwise
fail the whole report). A typed-in `/photos` URL gets `RequireImmich`'s
explanation instead of a broken page. The Overview page shows the status with
a "Check again" that bypasses the cache. Uploaded profile photos aren't
Immich-backed and stay on regardless. tRPC (`immich.router.ts`) carries JSON; binary
thumbnails, previews, originals, uploads and zip downloads go through a REST
controller (`immich-asset.controller.ts`, manual session check), mirrored on
the frontend by raw proxy API routes (`routes/api/immich/**`) that forward bytes
without buffering through `createServerFn`.

Uploads are disk-streamed on the way in (multer `diskStorage`, so
`IMMICH_MAX_UPLOAD_BYTES` — 50 MB by default, sized for flatbed scans — doesn't
mean N concurrent uploads in memory). Forwarding to Immich reads the file into
memory once: true streaming would need the `form-data` package, since Node's
built-in `FormData`/`Blob` can't stream from a path — a bounded one-copy
tradeoff judged reasonable rather than adding a dependency.

`IMMICH_API_KEY` needs write scopes, not just read (names checked against
Immich 3.2.2's OpenAPI spec): `asset.upload`, `asset.update`, `asset.delete`,
`album.create`, `album.update`, `album.delete`, `albumAsset.create`,
`albumAsset.delete`, `person.create`, `person.update`, `face.update`,
`tag.create`, `tag.asset` and `job.create`, plus the matching `.read`/`.view`/
`asset.download` scopes. A key with all permissions is the simple option.
`request()` includes Immich's response body in its error message, so a missing
scope shows up as an actionable 403 rather than a bare "Forbidden".

#### People and faces

**The person↔Immich relationship is a link table, not a foreign key on
`persons`.** `person_immich_links` maps one person to potentially several
Immich "people" (Immich clusters faces, not real individuals — the same person
can end up as two clusters if their look changed over decades), with
`immichPersonId` unique so one cluster can't be linked to two tree people. It's
a plain Postgres table, not a graph edge — it isn't a genealogical relationship
anything traverses.

**A dangling link fails open.** If the linked Immich person is deleted or
merged away in Immich, `ImmichService.getPerson` treats it as gone and
`linkedPeople` drops the link rather than erroring, so the person's page just
shows fewer photos. Note that Immich's `GET /people/{id}` returns **400**, not
404, for a nonexistent id (`"Not found or no person.read access"`), so
`getPerson` catches a `BadRequestException` matching `/not found/i` as well as
`NotFoundException` — scoped to that one method, since a 400 elsewhere is a real
error. Nothing reconciles dangling links eagerly; the Tools page's integrity
check reports them (`ImmichService.listDanglingLinks()`).

**Three face states, not two.** Immich auto-creates an (often unnamed) person
cluster for nearly every detected face. So a face is **linked** (its cluster has
a `person_immich_links` row — clicking it in the viewer navigates to that
person), **untagged** (has a cluster, no link yet — the common case; tagging is
just `link()`), or **unknown** (no cluster yet — rare; `tagFace` does
`POST /people`, then `PUT /faces/{id}`, then `link()`). `TagFaceDialog` picks
between `link` and `tagFace` on exactly this. Two Immich quirks:

- `PUT /faces/{id}`'s **path** parameter is the _person_ being assigned to and
  the _face_ id goes in the **body** — the opposite of what the OpenAPI names
  suggest (confirmed in Immich's server source).
- If `link()` fails after the face was already reassigned in Immich, the face
  is tagged there but not linked here — visible and retryable from the same
  dialog. There's no distributed transaction across the two databases.

`link()` best-effort renames the Immich cluster to the tree person's name, and
`unlink()` best-effort clears it again (an empty name means the viewer shows no
label rather than a stale one); neither rename ever blocks the operation.
Unlinking is available from the photo viewer (an "X" beside a linked face's
label) and from the person's Photos card.

The "Link a face" picker fetches every Immich person in one call (`size: 1000`,
Immich's max, `withHidden=true`) and filters by name client-side, since Immich's
`/people` has no server-side name search. Immich only lists a person once it
has at least one detected face — a cluster-less photo (faces too small, still
processing) simply can't be linked to yet. That's Immich's indexing, not a bug
here.

**Re-scanning faces (Tools page).** Immich already queues face detection on
ingest; the re-scan exists for what that pass missed. Immich's library-wide job
endpoint (`POST /jobs`) is admin-only and doesn't include facial recognition,
so `ImmichService.rescanAllFaces` walks the library via cursor-paginated
`searchMetadata` and calls the per-asset `POST /assets/jobs`
(`"refresh-faces"`) in batches of 500 — as the `immich-face-scan` BullMQ job.
"Done" means every asset was resubmitted, not that detection finished (that
runs inside Immich), so the notification says "requested".

**Profile photo from Immich, with a circular crop.** Needs no backend support
of its own: `PersonService.setPhoto` stores whatever image it's handed, so the
crop's output is just another upload through the same
`/api/people/$id/photo` route. `ImageCropDialog`
(`packages/ui/src/components/image-crop-dialog.tsx`) is built on
`react-easy-crop` (actively released, one small dependency) with
`cropShape="round"`, and exports a plain **square** JPEG — `Avatar`'s CSS does
the rounding, so baking in transparency would add complexity for no visible
difference. The picker (`-set-photo-from-immich-dialog.tsx`) offers this
person's linked photos or the whole library — the user wanted _any_ photo, not
only face-linked ones.

#### Albums

**Physical and virtual albums.** `album_metadata.kind` is set once at creation
and never changes. A **physical** album mirrors a real, scanned album and grows
only by upload; a **virtual** album is a curated collection that only
references photos already in some physical album and is never uploaded to
directly. `albumActionsForKind` (`routes/photos/-album-kind.ts`) decides which
add-photo action a page offers, and `ImmichService.addAssetsToAlbum`/
`uploadAsset` enforce the same rule server-side. A virtual album's photo can
name its physical source (`sourceAlbumsForAssets`). `kind` is a structural,
code-branching field — plain `text` validated by `albumKindSchema`, not a
configurable topic.

**Local metadata, not pushed into Immich.** Immich's album object has no
date/place/tag concept, so `album_metadata` (keyed by Immich's album id as plain
`text`, not a foreign key — the same convention as `person_immich_links` and
`immich_album_asset_order`) holds: `date` (a `HistoricalDate`, so "circa 1970s"
works exactly like a birth date, via the shared `HistoricalDateInput` in
`apps/frontend/src/lib/format-date.ts`), `place`, and for physical
albums a `cover` (color + foil/label/tooled style, picked with
`ColorSwatchPicker`), `found`/`scanned` provenance notes, and `photosPerPage`.
`immich_album_asset_order` stores a manual photo order per album, since Immich
has none.

**Album filtering happens in memory.** This is a single-user app with at most
a few thousand albums: `ImmichService.listAlbums` fetches every Immich album and
every `album_metadata` row in two unfiltered calls and does all
search/place/date-range/"missing info" filtering and sorting in TypeScript over
the merged list.

**Album tags were removed in favor of categories.** Free-form album tags
overlapped with categories (the tags in use were family names), so the tag
field, filter and display are gone. The `album_metadata.tags` column and its
data are deliberately kept in case tags return: nothing reads it and
`upsertAlbumMetadata` never writes it. Immich's own per-photo tags, edited in
the photo viewer, are a separate feature and unaffected.

**Album categories: their own tables, many-to-many, not a configurable
topic.** Categories group albums by family name, place or theme
(`album_categories` + `album_category_members`). They aren't a
`configurableOptions` topic even though they feed a picker: they're created and
renamed while organizing albums on the Photos page (sending someone to Settings
mid-task would be clumsy), they carry a color, and they're user data rather than
a vocabulary code branches on. An album can be in several categories — a
Sørensen–Jensen wedding album belongs to both families — and then appears under
each heading. Categories sort alphabetically, with no manual order.
Memberships reference `album_metadata.album_id` and the category with
`ON DELETE CASCADE`, so deleting either needs no cleanup code; they're written
by `upsertAlbumMetadata` in the same transaction as the metadata row (where an
omitted `categoryIds` means "leave unchanged", unlike every other field there).
Category filtering, grouping and the sidebar counts happen in the browser over
the already-loaded album list, the same in-memory approach as the other album
filters, so switching category is instant and each count respects the other
active filters.

**Photo book.** `PhotoBook` (`packages/ui/src/components/photo-book.tsx`) is a
reading mode that pages through an album's existing flat order
`photosPerPage` at a time, on a chosen paper style — one "N per page" setting
rather than a per-photo page number, so it needs no per-asset storage.

**Deleting.** Albums and photos can be deleted from this app, behind a
confirmation dialog. `deleteAssets` deliberately omits Immich's `force` flag, so
a deleted photo goes to Immich's own trash (recoverable for its retention
period, typically 30 days) rather than being purged; both deletes also prune
this app's local rows (`album_metadata`, `immich_album_asset_order`).

**Zip downloads are queued, and may produce several archives.**
`AlbumZipService` (`apps/backend/src/immich/album-zip.service.ts`) enqueues an
`album-zip` job rather than streaming a zip through one request. Immich's
`POST /download/info` (which accepts a plain `assetIds` array) splits a large
request into several archive groups; the job builds each via
`POST /download/archive` and creates one notification per file, each with its
own `actionUrl`, served by `ImmichAssetController.downloadAlbumZip`. "One
album" and "every album" (the Tools page's "Download all albums") are the same
job with a different asset set — `resolveJobScope(albumId?)` either fetches one
album's assets or unions every album's (deduped, since a photo can be in more
than one album).

### Internationalization: `i18next`, one instance per request, errors translated in one link

`i18next`/`react-i18next` with a fresh instance per SSR request and a central
error-translation tRPC link — not a shared singleton, and not
per-server-function try/catch. Both packages were actively released when
checked. No `i18next-browser-languagedetector`: the language is an account
preference, not `Accept-Language`. English and Danish are supported. **The
NestJS backend stays English-only** (the user's call); every message it sends
is translated _in the frontend layer_.

- **A fresh `i18next` instance is created per SSR request**
  (`apps/frontend/src/i18n/create-i18n-instance.ts`'s `createI18nInstance`),
  not a shared module-level singleton: one Node process serves many users at
  once, and a module-level singleton holding per-request state leaks one
  request's value into another's response — `trpc-proxy-client.ts`'s comment
  documents that exact bug with the auth cookie. The client bundle still only
  ever needs one instance per
  page load (`RootComponent`'s `useState(() => createI18nInstance(language))`
  lazy initializer, created once and mutated in place by `i18n.changeLanguage()`
  from the header's `LanguageMenu`).
- **The language preference lives on the account**
  (`userProfiles.language`, nullable `text`, no default — absence resolves to
  `"en"` at the read layer, mirroring the existing `phoneNumber` column's
  convention), not just a cookie. A `lang`
  cookie (`LANGUAGE_COOKIE` in `profile.functions.ts`) mirrors it, refreshed
  on every `getMyLanguage()`/`updateProfile()` call — this exists purely so
  the error-translation link (a standalone module with no route context) can
  read the current language without a recursive DB round-trip on every failed
  request.
- **`apps/frontend/src/routes/__root.tsx`'s `beforeLoad` resolves the language
  before the first render**, merging it into `RouterContext`, so the very
  first server-rendered HTML byte is already in the right language — no
  client-side flash-then-correct pass the way the dark-mode `use-theme.ts`
  placeholder pattern would produce for translated text (fine for a CSS
  class, not fine for re-labeling the whole page).
- **Backend error messages are translated by one custom tRPC link**
  (`apps/frontend/src/server/trpc-error-translation-link.ts`), added ahead of
  `httpLink` in `trpc-proxy-client.ts`'s `links` array, rather than by
  touching any of the ~40 individual server function files. It rewrites
  `error.message` using `apps/frontend/src/i18n/backend-errors.ts`: an
  exact-match table for the majority of static `BadRequestException`/etc.
  strings across `apps/backend/src`, plus a small list of `{pattern, translate}`
  regex templates for the parameterized ones (file-size limits, "No X with id
  Y", ...). A message matching neither table falls through untranslated
  (English) rather than breaking — a missed translation degrades gracefully.
  **A new backend error string needs an entry there** (and in both locale
  files), or Danish users see it in English. `@trpc/server` is a runtime
  `dependency` of `apps/frontend`, not a dev one, because
  `@trpc/server/observable` builds the link.
- **Danish free-text date parsing is real parser logic, not translated
  labels.** `packages/core/src/historical-date.ts`'s quality-word regexes
  (`approximate`/`before`/`after`/`between`/`fromTo`) and month-name tables
  are keyed by a `language: Language = "en"` parameter threaded through
  every exported function, with parallel `EN`/`DA` `DateLanguage` tables
  (`LANGUAGES: Record<Language, DateLanguage>`). GEDCOM (`packages/core/src/
  gedcom.ts`) deliberately stays English-only regardless of UI language — its
  own date grammar is fixed by the GEDCOM 5.5.1 spec, not this app's locale,
  and it has its own separate `GEDCOM_MONTHS` table.
- **Format-date helpers stay plain functions with a `language` parameter, not
  hooks** (`apps/frontend/src/lib/format-date.ts`), since they're also called
  from non-component call sites like a `@tanstack/react-table` cell renderer in
  `people/index.tsx`, which can't call a hook.
- **Not translated, deliberately:** `packages/ui`'s own components keep their internal default
  copy in English (only strings passed in from call sites are translated);
  configurable-options values (event types, confidence levels, etc.) are
  never translated, since they're user-authored data via the Settings page,
  not app strings — the same reasoning as "Configurable dropdown options, not
  hardcoded enums" above; better-auth's own auth-flow error messages stay
  English, since that's a separate flow from the tRPC error-translation link;
  and the dev-only `/dev/components` showcase page is untranslated.

### GEDCOM export: 5.5.1 or 7.0, built in one request

The Tools page's export (`apps/backend/src/gedcom/gedcom.service.ts`) writes
GEDCOM 5.5.1 by default — still what most genealogy programs read best — or
GEDCOM 7.0 on request (see "GEDCOM 7" below). The domain model was already shaped for it — `HistoricalDate`
keeps the source's own wording, and `gender` uses the GEDCOM vocabulary.
`GedcomService.exportAll()` pulls every relational row plus every
`PARENT_OF`/`SPOUSE_OF` edge (`allParentOfEdges` in `packages/db/src/graph.ts`,
shared with the two-store consistency check) in a handful of queries, with no
BullMQ job: a GEDCOM file is plain text, small enough at this app's scale to
build and return within one request, unlike `pg_dump`'s streamed binary.

- **Dates.** `toGedcomDate` (`packages/core/src/gedcom.ts`) re-runs the same
  `parseHistoricalDateDetailed` the app uses for display and sorting — not a
  second parser — and maps the result onto `ABT`/`BEF`/`AFT`/`BET … AND …`.
  The parser reads Julian dates (`@#DJULIAN@ 3 MAR 1699`, or 7.0's `JULIAN`)
  and double years (`11 FEB 1749/50`): a date part carries its `calendar` and
  `dualYear`, its stored `earliest`/`latest` are always converted to the
  Gregorian calendar (via Julian Day Numbers) so every date sorts on one
  timeline, and display keeps the calendar ("3 March 1699 (Julian)"). Hebrew
  and French Republican dates stay unparsed. An unparsed date is written as
  its original wording rather than dropped. GEDCOM output stays English
  regardless of UI language, with its own `GEDCOM_MONTHS` table.
- **What 5.5.1 requires, and what other programs expect.** The header carries
  `DATE`, a `SUBM` record (the exporting user's name) and `GEDC.FORM
  LINEAGE-LINKED`; every INDI has `FAMC`/`FAMS` back-links; events use their
  own tag where GEDCOM has one (`gedcomEventTag` in core — the reverse of the
  importer's table, so the two can't disagree) and `EVEN` + `TYPE <option
  label>` otherwise; confidence is `QUAY` 0–3 for the four seeded levels;
  repositories are real `REPO` records with their address and contact details,
  and a source's call number goes on `SOUR.REPO.CALN`. A pointer used as a line's _value_
  (`1 HUSB @I7@`) goes through `gedcomPointer(xref)`, distinct from
  `GedcomWriter.line`'s `xref` parameter, which is only for a record's own
  declaration line (`0 @I1@ INDI`) — conflating the two writes an invalid
  bare `I7`.
- **`FAM` has only `HUSB`/`WIFE` slots.** `assignParentSlots` uses `gender`
  where it decides (a lone mother goes in `WIFE`) and a stable id order where
  it doesn't; two `U`/same-gender parents can't be represented more precisely
  in 5.5.1. A child with more than two parents (birth _and_ adoptive) is split
  into one FAM per parentage pair. Parentage goes on `INDI.FAMC.PEDI` when
  both parents share one of 5.5.1's four values, otherwise as Ancestry/FTM's
  per-parent `_FREL`/`_MREL` under `CHIL`.
- **Each `unions` row is its own FAM.** Children are linked to a parent _pair_
  via `PARENT_OF` edges, not to a specific union, so a couple who divorced and
  remarried gets their children on the earliest union's FAM and a second,
  childless FAM for the later marriage — both marriages' dates survive. A
  `SPOUSE_OF` edge with no union and no shared children still gets a bare
  `HUSB`/`WIFE` FAM.
- **This app's own fields with no 5.5.1 home travel as underscore tags**,
  which other programs ignore and the importer reads back, so export → import
  is lossless for everything GEDCOM is meant to carry: `_STAT` (union status
  beyond married/divorced/annulled), `_END` (a union ending that isn't a
  divorce/annulment), `_DETAIL` + `TYPE` (event details without a standard
  sub-tag; occupation/employer/address/cause of death use `OCCU`'s
  value/`AGNC`/`ADDR`/`CAUS`), `NAME._DATE` (name-variant "since"),
  `_VOLUME`/`_ENTRY`/`_CERT` (citation fields), `SOUR._TYPE` (source type),
  `_ASSO` (a name-only associate), `_TODO` (research notes), `_MARKDOWN` (a
  note's formatting, below) and `_EXID` (a generic external id, which 5.5.1
  has no tag for). External ids go out as the tags other programs use:
  FamilySearch's `_FSFTID`, Ancestry's `_APID` (on a person, or on a citation
  as its record pointer), `REFN` + `TYPE`. Verified live — in a scratch
  database — by importing a file exercising each of these, exporting it in
  both versions, and diffing the re-parsed plan against the original: no
  differences for 5.5.1; for 7.0 only the Julian escape's spelling.
- **Notes go out as plain text.** Notes are stored as markdown, and other
  programs show a NOTE verbatim, so `markdownToPlainText`
  (`packages/core/src/markdown-text.ts`) strips the markup. When that loses
  anything, the original follows in a `_MARKDOWN` child that the importer
  prefers — so this app's own round trip keeps the formatting.
- **A reference to a person id with no `persons` row is dropped**, not emitted
  as a malformed pointer. That's graph/Postgres drift — the two-store
  consistency check (below) is where it gets reported.
- **Deliberately out of scope:** no `OBJE` (photo) records — Immich-hosted
  photos aren't portable outside this app, and `persons.photoPath` local
  uploads have no externally resolvable URL; no `userNotes` (app-specific).

#### GEDCOM 7

One exporter, a `version` switch — the two versions differ in well-defined
places, not in structure, so a second exporter would only be a second place
for the two to drift:

- **Header**: `GEDC.VERS 7.0` first, no `FORM` or `CHAR` (a 7.0 file is always
  UTF-8), and a `SCHMA` declaring this app's own extension tags. Those are
  declared under a URN of this app's own (`urn:x-genealogy-app:gedcom:…`),
  since nothing is published at a web address. Third-party tags this exporter
  also writes — `_FSFTID`, `_APID`, `_FREL`/`_MREL`, `_TODO` — are left
  undeclared, which 7.0 allows, rather than inventing URIs on other vendors'
  behalf.
- **Lines**: no `CONC` (7.0 has no length limit; only `CONT` for a newline),
  and no trailing space on an empty line.
- **Dates**: `JULIAN` instead of `@#DJULIAN@`. 7.0 dropped double years and
  free-text dates, so those go in a `PHRASE` under the `DATE` (the new-style
  year in `DATE`, or an empty `DATE` for free text). The importer prefers a
  `PHRASE` that reads as a date, so the wording survives.
- **Enumerations**: 7.0's fixed codes — `NAME.TYPE` (`BIRTH`, `MARRIED`,
  `AKA`, else `OTHER` + `PHRASE` with the option's label), `PEDI` and `RESN` in
  upper case, `ASSO.ROLE` (`GODP`, `WITN`, `OFFICIATOR`, else `OTHER` +
  `PHRASE`), and a name-only associate as `ASSO @VOID@` + `PHRASE`.
- **Ids and events**: a generic external id is `EXID` + `TYPE`; a known event
  with nothing else to say (`DEAT`, `MARR`) carries the payload `Y`.

### GEDCOM import: preview, then add everyone as new people

The Tools page's import reads GEDCOM 5.5.1 (and the GEDCOM 7 constructs
noted below). The decision that shaped it: **no person matching.** Deciding whether an
incoming "Peder Sørensen b. 1801" is the "Peder Sørensen" already in the
tree, and then merging names/events/relationships/citations, is a much
bigger problem than reading the file — so import never attempts it.
Every INDI becomes a new person; the preview step lists incoming people
whose normalized given+surname matches an existing person (the same rule
`IntegrityService`'s possible-duplicates check uses, so the two agree),
and resolving them is left to the user — with "Merge with…" on the person
page (see "Merging people" below); automatic duplicate detection is still an
idea in IDEAS.md.

- **Split by layer.** `packages/core/src/gedcom-import.ts` is pure:
  `decodeGedcomBytes` (bytes → text), `parseGedcom` (text → level-nested
  node tree, CONC/CONT folded in — the mirror of `GedcomWriter.line`),
  and `buildGedcomImportPlan` (tree → plain rows keyed by the file's own
  xrefs, plus warnings). Every mapping decision is unit-tested there
  without a database. `apps/backend/src/gedcom/gedcom-import.service.ts`
  only turns a plan into inserts. No parser library: GEDCOM's line
  grammar is a dozen lines of regex-and-stack, and the exporter already
  hand-rolls its writer — a dependency would add maintenance risk
  (CLAUDE.md's library check) for little gain.
- **Decoded in the browser.** The file's bytes never leave it — the
  Tools page decodes them with `decodeGedcomBytes` and sends plain text
  in a JSON body through ordinary `createServerFn`s (`previewGedcomImport`/
  `importGedcom`), not a raw multipart API route like photo/backup
  uploads: a GEDCOM file is a few MB of text, not a large binary.
  UTF-8 (BOM or not) and UTF-16 are recognized. Anything that isn't valid
  UTF-8 is decoded as ANSEL — GEDCOM 5.5's own legacy charset, which has no
  `TextDecoder` — when the header says `CHAR ANSEL` (`decodeAnsel`: a byte
  table, plus moving each combining diacritic _after_ its letter, since
  ANSEL writes it before, then NFC), else as Windows-1252 with a warning. A
  file that declares ANSEL but is valid UTF-8 is read as UTF-8: mislabelled
  UTF-8 is far more common than real ANSEL.
- **Stateless preview → import.** Both are tRPC mutations taking the same
  text (`gedcomImportInputSchema`, capped at `GEDCOM_IMPORT_MAX_CHARS`);
  `import` re-parses rather than the server holding a parsed plan
  between requests — parsing is milliseconds.
- **Mapping onto configurable options.** The backend loads the live
  `configurableOptions` and the plan only ever emits a key that exists:
  each GEDCOM event tag has a list of candidate `event_type` keys
  (`CHR` → `christening`/`baptism`, `CONF` → `confirmation`, ...) and
  falls back to `"other"` with the English tag name as its label;
  `EVEN`/`FACT` match their `TYPE` against option keys _and_ labels (this
  app's exporter writes the key there). `NAME.TYPE`, `PEDI`/`_FREL`/
  `_MREL`, `QUAY` and family status map the same way. No `PEDI` at all
  means `birth` — how most programs write an ordinary biological child.
- **Families.** A FAM with two partners is a `SPOUSE_OF` edge regardless;
  a `unions` row only when the FAM carries a marriage/engagement/divorce/
  annulment event, a note or a citation. Each `CHIL` gets a `PARENT_OF`
  edge from each partner present. Family-level data on a FAM with only
  one partner has nowhere to go and is dropped with a warning.
- **`isLiving`.** GEDCOM has no living flag. A `DEAT`/`BURI`/`CREM`/
  `PROB` record means deceased — a bare `1 DEAT` (what this app's
  exporter writes for "known dead, no details") sets the flag without an
  empty event. Otherwise, someone born or christened over 110 years ago
  is marked deceased and the preview says how many — leaving them
  "living" would matter once living-person redaction exists.
- **Losses, all reported in the preview rather than silent**: unreadable
  lines, unparsed dates (wording kept, bounds null — Hebrew and French
  Republican calendars land here), pointers to missing records, a
  second birth/death (kept as an `"other"` event), inline source
  citations (each becomes a source), source `NOTE`/`TEXT` (`sources` has
  no column for it), and every tag the importer doesn't read, tallied by
  `PARENT.CHILD` path (`INDI.OBJE`, `REPO.FAX`, ...). The
  tally walks nested structures too — PLAC, ADDR, a citation's DATA, FAMC,
  CHIL, REPO/NOTE records — not just each record's direct children, or
  data nested a level down would vanish without a trace. Only change
  stamps, record ids and submitter links are skipped without a warning.
- **Partly recovered rather than only reported:**
  structured ADDR lines (ADR1…CTRY) are joined when ADDR's own value is
  empty; a citation's `DATA.DATE` becomes a "Recorded: …" line in its
  note; family events beyond a union's one start and one end (an ENGA
  before the MARR, banns, a second MARR from another source) and any
  TYPE/ADDR/AGE/AGNC/CAUS on the start/end become lines in the union's
  notes; a `FAMC.STAT disproven` link is not created (the file asserts
  the opposite), a `challenged` one is created and flagged.
- **Media is reported, not imported — a decision, not a gap.** A 5.5.1
  `OBJE` holds a _file path on the exporting computer_
  (`C:\Users\…\photo.jpg`); the picture itself isn't in the file, so there's
  nothing to import. Only a GEDCOM 7 zip (`.gdz`) carries the files; reading
  one into Immich would be a feature of its own, not part of this importer.
- **Data with its own home in the schema**, each a data-model decision
  made up front rather than squeezed into notes:
  - `_FSFTID`, `REFN` (+`TYPE`), GEDCOM 7 `EXID` (+`TYPE`) and a person's
    `_APID` → **`person_external_ids`** (`system` is structural: the
    exporter writes each as its own tag; CHECK-constrained). An `EXID` whose
    TYPE names familysearch.org is filed as a FamilySearch id. Shown, added
    and removed on the person page's "External IDs" card, with a FamilySearch
    id linked to its profile. Ancestry's `_APID` _on a citation_ is a pointer
    to a record in one of its databases, not a person id, so it's
    `citations.ancestry_apid`.
  - `REPO` records → the **`repositories` table** (name, address, phone,
    email, website); a source links to one (`sources.repository_id`) with its
    shelf mark in `sources.call_number` (`REPO.CALN`). A repository a source
    only names inline (`1 REPO Landsarkivet Viborg`) becomes one too,
    shared by name within the file. Migration `0035` turned the old free-text
    `sources.repository` into rows (one per distinct name), `0036` dropped
    the column. No UI shows repositories yet — that's the "Source library
    page" idea.
  - `ASSO` → the **`associations` table** (`AssociationService`,
    "Witnesses & godparents" card on the person page): someone named in
    a role on a person's record, tied to one of their events
    (`eventId`), one of their marriages (`unionId` — Danish marriage
    witnesses, forlovere, belong to the union, not to either spouse's
    events), or neither. The associate is a person in the tree **or just
    a name as written** — church books name far more godparents than
    will ever be added as people; a CHECK constraint enforces exactly
    one. Roles are a configurable topic (`association_role`, seeded
    godparent/witness/informant/officiant/other) and associations can
    be cited (`citations.factType = "association"`). Relational, not a
    graph edge, same "edges stay thin" rule as `unions`. Import maps
    5.5.1 `RELA` text and GEDCOM 7 `ROLE` codes, Danish words included
    (gudfar/fadder → godparent, forlover → witness); `ASSO` under an
    event (GEDCOM 7/Gramps/RootsMagic style) ties the role to that
    event. Export writes event-tied roles under the event, union-tied
    under `MARR`, the rest under INDI, and name-only associates as this
    app's own `_ASSO <name>` (5.5.1's ASSO must point at a record).
    Deleting a person cascades the roles they _held_ on others'
    records; `PersonService.remove` clears those roles' citations, which
    the cascade can't reach (`factId` isn't an FK), and the integrity
    check reports dangling association citations too.
  - `RESN` → nullable **`persons.restriction`** (privacy/confidential/
    locked; `personRestrictionSchema`, plus a CHECK constraint). Edited
    in the living-status card, shown as a header badge, exported as
    RESN; not yet enforced — that's the living-person redaction feature.
    A GEDCOM 7 file listing several values keeps the most restrictive.
  - `_TODO` → **research notes** (no schema change): inline or a pointer
    to a `0 @T1@ _TODO` record; description from the value/DESC/TEXT/
    NOTE, date/category/priority/place/status as lines in the body,
    resolved when a status says done or a completion date is present.
    Exported back as `_TODO` + `TYPE <noteType>` (+ `_STAT DONE`), so
    research notes round-trip.
  - `PLAC.MAP` → the **`places` table**: one row per place text, a
    PostGIS `geometry(Point, 4326)` with a GiST index, so spatial
    queries work when a map view arrives. Coordinates belong to the
    place, not the event — a conflict within a file keeps the first and
    warns, and an import never overwrites coordinates already stored.
    Exported back as `MAP`/`LATI`/`LONG`. No UI yet.
  - **Two migrations, PostGIS deliberately last.** `0032` (associations,
    restriction, role seeds) needs nothing special; `0033` runs `CREATE
    EXTENSION IF NOT EXISTS postgis` itself — `postgres/01-init-age.sql`
    only runs on a fresh data volume, so a database initialized before
    PostGIS was added to the image never got it — and fails on a server
    without the PostGIS packages without holding back `0032`. Export
    checks `to_regclass('public.places')` so it keeps working on such a
    database, and import only touches `places` when a file has
    coordinates. Drizzle-kit drops the SRID from a `geometry` column
    (`geometry(point)`), so `0033` is hand-edited to `geometry(point,
    4326)`; `0032`'s enum change is `ADD VALUE IF NOT EXISTS` since an
    enum value can't be removed once added.
- **Event types with no matching option** are listed in the preview
  (`plan.unmappedEventTypes`, most-used first) with the key the importer
  would match — a GEDCOM tag's preferred key (`CENS` → `census`), or a
  slug of an `EVEN`'s TYPE text with æ/ø/å transliterated
  (`folketaelling`) — plus a Settings link (new tab, so the selected file
  survives) and a "check again" button. A tag also matches an option by
  its English label, so a Danish-keyed `konfirmation` labelled
  "Confirmation" catches `CONF`. Matters especially for Danish trees,
  where census and confirmation are among the most common records and
  neither is a seeded option.
- **One transaction, bulk writes.** Ids are minted in JS so each table is
  a few multi-row inserts, then the graph half is three bulk Cypher calls
  in the same `inGraphTransaction`: `createPersonNodes` (returns each
  node's AGE vertex id), then `addParentOfMany`/`addSpouseOfMany`
  matching endpoints by **vertex id, not the `id` property**. AGE has no
  index on vertex properties, so `MATCH (p:Person {id: ...})` per edge is
  a label scan — measured ~25 s for 5,000 edges, against ~50 ms by
  `id(p) = ...`, which hits the label table's primary key. A synthetic
  5,000-person / 2,499-family file imports in well under a second, so
  this stays a synchronous request, not a BullMQ job. A `publicId`
  collision retries the whole transaction, same as `PersonService.create`.
- **Stored date bounds.** `resolveDate` in `PersonService` recomputes
  `earliest`/`latest` from `original` on every write (person birth/death,
  event dates, union start/end dates) as an idempotent backstop, since the
  frontend sends its own freshly-computed bounds on every save too —
  both sides call the same parser, so they can't disagree.
  `packages/db/scripts/backfill-historical-dates.ts` is a one-off,
  not-wired-into-`db:migrate` script for re-resolving already-stored rows
  after a parser change; not something the GEDCOM exporter needs to care
  about, since it reads whatever `original` currently holds.

### Members, roles and privacy: invite-only, enforced in the backend

Three roles (`memberRoleSchema` in `packages/core/src/membership.ts`), stored
on better-auth's `user.role` as an `additionalFields` entry with
`input: false` — so it rides on every session with no extra query, and a
client can't set its own at sign-up (verified: an invited Viewer posting
`role: "admin"` still gets `viewer`). **Admin**: members, Settings, Tools
(backup/restore, GEDCOM, integrity, face re-scan, download-all), merging and
deleting people, deleting albums and photos. **Editor**: every change to the
tree and photos. **Viewer**: reads, with living people redacted.

- **Gates live in the backend.** `protectedProcedure` (any member),
  `editorProcedure`, `adminProcedure` in `trpc.base.ts`; every one of the 103
  procedures was classified by a script (reads → member, mutations → editor,
  an explicit admin list, and the member's own things — notes,
  notifications, profile, an album zip — stay member-level). REST
  controllers use `requireRole`. The UI only mirrors this.
- **Sign-up is invite-only**, enforced in better-auth's
  `databaseHooks.user.create.before` (`auth.module.ts`) — the one place every
  new account passes through, email/password and Google alike. It needs a
  pending, unexpired invitation for that email; email/password sign-up must
  also carry the link's `inviteToken`, since unlike Google it proves nothing
  about owning the address. The first account on an empty install is let
  through as admin. Migration `0037` made the oldest existing account admin
  and everyone else viewer.
- **Invitations** (`invitations` table, `MembersService`): email + role +
  optional "this is you" person + message, valid 14 days, one live link per
  address. Only the token's SHA-256 is stored, so the link is shown to the
  admin once (and emailed via the mail queue, in the admin's language, when
  SMTP is set up — `APP_URL` builds the link). `/invite/$token` is public;
  creating the account there accepts it. There must always be one admin
  left, and an admin can't remove themselves.
- **Redaction** (`PersonRedactor`, applied in the routers, not the
  services): a Viewer sees a living person — or one marked private or
  confidential — as name, gender and place in the tree, `redacted: true`;
  dates, places, notes, photo, and their names/events/citations/roles/
  research notes/external ids/linked photos are withheld, and a marriage
  involving them loses its dates and places. A Viewer's own linked person
  isn't redacted for them. Editors and admins see everything.
- **Read-only UI** (`ReadOnlyProvider` in `packages/ui/src/lib/read-only.tsx`):
  inside it, inputs/selects/switches/date and markdown fields go read-only
  and `SaveButton`/`RemoveButton`/`FormDialog` don't render, so a whole page
  of inline forms becomes read-only by wrapping it once. Plain buttons and
  drag handlers it can't recognise are gated with `usePermissions()`.
- **Known limits.** Album browsing isn't redacted — an album is a set of
  photos, not a person, and its faces show names only. The people list's
  birth-date filters and sort still order redacted people by their hidden
  dates. `restriction: "locked"` doesn't yet stop editors editing. better-
  auth's own sign-in/sign-up error texts stay English.

### Merging people: one transaction, nothing overwritten

"Merge with…" on the person page folds a duplicate into the person being
kept (`apps/backend/src/person/person-merge.service.ts`): pick the duplicate,
see a preview of exactly what moves (`person.mergePreview`, writes nothing),
confirm. It's the manual half of duplicate handling — GEDCOM import adds
everyone as new people — and the planned duplicate detection can point here.

- **Everything moves, in one `inGraphTransaction`.** Every table that
  references a person — names, events, unions (both sides), citations,
  associations (as owner and as associate), research notes, Immich links,
  external ids, the account "this is me" link — is re-pointed, and the
  duplicate's `PARENT_OF`/`SPOUSE_OF` edges are re-created on the kept person
  before its node and row are deleted. An edge the kept person already has
  stays as it is (its parentage wins).
- **Nothing on the kept person is overwritten.** Gaps are filled from the
  duplicate (photo, gender if unknown, title, suffix, restriction); notes
  are joined (once, if identical); deceased wins over living. The
  duplicate's own name becomes an alternate name if it's spelled
  differently. A second birth/death becomes an `"other"` event, the same rule
  GEDCOM import uses — a person has at most one of each.
- **Identical facts aren't doubled.** Merging two copies of the same import
  is the common case, so a name, event, union or research note identical to
  one the kept person already has is dropped instead of copied, its
  citations and roles re-pointed to the survivor; identical roles and
  citations are then collapsed too. Verified by importing a file twice into
  a scratch database, merging each duplicate, and exporting: the result
  matched importing it once — except that the two imports' _sources_ stay
  two records, since sources are shared and not part of a person.
- **Refused up front** (`blockers`, shown in the preview): the same person;
  two people recorded as each other's parent, child or spouse; one being
  the other's (depth-capped) ancestor — merging would make someone their
  own ancestor; and both being linked to user accounts, since
  `user_profiles.person_id` is unique.
- Every query inside the transaction runs sequentially: the transaction is
  one `pg` client, and overlapping queries on a client are deprecated (and
  an error in `pg` 9).

### Data integrity checks: report-only

The Tools page's data integrity check and two-store consistency check both
live in `apps/backend/src/integrity/` (`IntegrityService`) and are
report-only — no auto-fix; an admin judges each finding, since the right
repair (delete the citation? re-link it? merge the people?) is a human
call.

- `checkData()`: dangling citations (a `citations.factId` pointing at a
  since-deleted `personNames`/`personEvents`/`unions` row — the schema's
  own comment says the app, not the database, is responsible for
  clearing these, since Postgres can't cascade a polymorphic foreign
  key), possible duplicate people (same normalized given+surname, grouped
  in JS rather than SQL — simpler at this app's scale than a `GROUP BY`
  plus a second lookup), and dangling Immich links (via a new
  `ImmichService.listDanglingLinks()`, reusing `getPerson`'s own
  fails-open check but surfacing it instead of swallowing it).
- `checkGraphConsistency()`: diffs every `persons.id` in Postgres against
  every `Person` node id in the Apache AGE graph
  (`allPersonNodeIds`/`allParentOfEdges` in `packages/db/src/graph.ts`,
  the only reads of the _whole_ graph unfiltered; the GEDCOM exporter
  shares them). **A transient false positive is possible**:
  `GedcomService.exportAll` and this checker each run their Postgres/graph
  reads as separate queries, not one consistent snapshot, so a person
  created concurrently between two of those reads can appear in one but not
  the other — a point-in-time skew that disappears on re-run, not real
  drift. Judged not worth wrapping in a transaction for a single-family,
  low-write-concurrency app; both call sites note it.

### Backup and restore, and the Apache AGE limitation that shaped them

The obvious design — `pg_dump --clean --if-exists` so the dump is
self-contained, then restore is just `gunzip | psql` — **doesn't work**,
as live-testing against a local sandbox database showed: Apache AGE
installs an event trigger that refuses _any_ plain DDL against its own
internal label tables (`family_tree._ag_label_vertex`/`_ag_label_edge`) —
even `DROP TABLE IF EXISTS` — with `ERROR: table "_ag_label_vertex" is
for label "_ag_label_vertex"`. A `--clean` dump of the whole database
replays fine for every ordinary table, then fails outright the moment it
reaches the graph's own tables, partway through a restore.

- So `BackupService.dumpTo` (a `backup` BullMQ job, delivered by
  notification) runs **two** `pg_dump` invocations,
  concatenated into one gzip stream (`{ end: false }` on the first's
  stdout pipe keeps the gzip stream open for the second) — `--schema=public
  --clean --if-exists` for ordinary relational tables (safe to drop and
  recreate), and `--schema=family_tree --data-only` for the graph's own
  tables (data only, **no DDL at all**, since none is replayable).
  `ag_catalog` (AGE's own extension schema — which graphs/labels exist,
  not data this app owns) and `drizzle` (migration-tracking, meaningful
  only to the live instance being restored into) are excluded from both:
  restoring assumes the same already-provisioned Postgres/AGE setup the
  backup came from, not bootstrapping a fresh one.
- `RestoreService.restore` mirrors the split: the relational half applies
  straight from the dump (its own `--clean` handles it); the graph half
  needs a manual `TRUNCATE family_tree._ag_label_vertex,
  _ag_label_edge` first (confirmed live — unlike `DROP`/`CREATE`,
  `TRUNCATE` is one of the few operations AGE actually permits directly
  against its label tables), then the data-only dump's `COPY` statements
  repopulate them. Verified round-trip against the sandbox: insert a
  person + graph node, back up, delete both, restore, confirm both come
  back — including the graph node's own internal AGE id, unchanged.
- `DbOperationLockService`: a small dedicated Redis mutex (`SET ... NX
  PX`, not reusing BullMQ's own connection) so a backup and a restore (or
  two of either) can't run at once against the same live database —
  there's no other such mechanism in this app, and `pg_dump`/`psql` both
  bypass the shared connection pool entirely (`spawn`, not `PG_POOL`), so
  nothing else would stop them colliding.
- Deliberately does **not** add a maintenance-mode banner or pause
  ordinary request traffic during a restore — judged more machinery than
  a self-hosted, single-family tool needs. The Tools page's own warning
  copy says so explicitly, along with the fact that a restore signs
  everyone out afterward (the restored `session` table holds whatever
  sessions existed when the backup was taken, not whoever's currently
  logged in).
- Restore input is a re-upload of a previously-downloaded backup file
  (disk-streamed via `multer`'s `diskStorage`, same pattern as
  `ImmichAssetController.uploadAsset`, just a much larger
  `RESTORE_MAX_UPLOAD_BYTES` cap). A backup file deletes itself after one
  download.

## Verified, not assumed

The stack was exercised end to end before being documented: the dev container
builds, `pnpm install` is clean, `pnpm check` (format, lint, typecheck) and
`pnpm test` pass, `pnpm build` produces backend and frontend bundles, `pnpm dev`
starts both servers, migrations apply into `public`, and a three-generation tree
created over tRPC returns the correct ancestors and descendants from Cypher
traversal. Re-verified after the TanStack Start migration: signing in, every
page, and the seven graph-transactional person mutations were exercised
against the real dev database through `apps/frontend`'s proxy layer, confirmed
byte-for-byte equivalent to calling apps/backend's tRPC router directly (which
it always was — the proxy forwards the request, it doesn't reinterpret it).

## Not decided yet

These are open, and nothing in the code presumes an answer:

- **Production cookie/domain handling.** In dev, `apps/frontend`'s server-side proxy
  means the browser only ever has one origin (`:5173`) for pages and auth
  alike, so the cross-origin cookie questions a separate frontend/backend
  deployment would otherwise raise don't currently arise. A real deployment
  still needs to decide where `apps/frontend` and `apps/backend` actually run
  relative to each other (same host/reverse proxy vs. genuinely separate
  services) and revisit `trustedOrigins`/cookie attributes accordingly if
  they end up on different domains.
- **Media and document storage.** No object store is wired up.
- **Deployment target and CI.** `pnpm check && pnpm test` is the intended gate;
  no pipeline is defined.
