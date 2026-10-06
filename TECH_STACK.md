# Tech stack

What this project is built from, and why. Versions are pinned centrally in the
`catalog:` block of `pnpm-workspace.yaml`; the numbers below were current when
the stack was assembled (September 2026).

## At a glance

| Layer                           | Choice                               | Version                    |
| ------------------------------- | ------------------------------------ | -------------------------- |
| Runtime                         | Node.js                              | 24 LTS                     |
| Language                        | TypeScript                           | 6.0.3                      |
| Package manager                 | pnpm (workspaces + catalog)          | 12.5.1                     |
| Build orchestration             | Turborepo                            | 2.11.2                     |
| Lint / format                   | oxlint / oxfmt                       | 1.83.0 / 0.68.0            |
| Tests                           | Vitest                               | 5.0.1                      |
| Backend                         | NestJS on Express                    | 12.0.3 / Express 5.2.0     |
| API contract                    | tRPC + superjson + Zod               | 11.19.0 / 2.2.6 / 4.6.5    |
| Relational ORM                  | Drizzle ORM + drizzle-kit            | 0.45.2 / 0.31.10           |
| Database                        | PostgreSQL + Apache AGE              | 18 / 1.8.0                 |
| Frontend                        | React + TanStack Start (Vite)        | 19.3.0 / 1.168 / 8.3.0     |
| Routing / data / tables / forms | TanStack Router, Query, Table, Form  | 1.170 / 5.103 / 9.2 / 1.33 |
| Components                      | shadcn/ui (React Aria) on Tailwind   | new-york, slate / 4.3.3    |
| Animation                       | motion                               | 13.4.0                     |
| Authentication                  | better-auth                          | 1.7.5                      |
| Tree view                       | React Flow (`@xyflow/react`) + elkjs | 12.11.6 / 0.12.0           |

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
genealogical rules live — name formatting, lifespan rendering, what a
relationship kind means — so those rules can be tested without a database and
reused on both sides of the wire.

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
input shape is a compile error rather than a runtime 400 — still true after the
TanStack Start migration below, since `apps/frontend`'s server-side proxy client is
built against this same `AppRouter` type. Packages such as `nestjs-trpc` were
deliberately skipped: the integration is about thirty lines, and owning it
avoids a dependency between two fast-moving frameworks.

superjson is configured as the transformer on both ends, so `Date` values survive
the wire — genealogical payloads are full of them.

### TanStack Start, apps/frontend as a proxy to apps/backend

The original `apps/frontend` (a plain Vite SPA) was migrated to TanStack
Start, requested specifically — the user runs it in production elsewhere
already — rather than something this project went looking for. The new app
was built from scratch alongside the old one under a temporary name
(`apps/web`) and took over the `apps/frontend` name only once every page was
ported and verified and the old SPA was deleted; anywhere below that
compares "the old SPA" against `apps/frontend`, they were, briefly, two
different directories. Two decisions made explicit at the start shaped
everything else: **apps/backend keeps sole ownership of the database**
(nothing in it changed, moved, or was rewritten), and **apps/frontend's
server side is a proxy in front of it**, not a second place business logic
can live. See "The proxy architecture" in [CLAUDE.md](CLAUDE.md) for the
concrete mechanics (the tRPC vanilla client, the auth pass-through route, the
photo-upload route, the two-file env split); this section is about why.

That framing turned what could have been a full backend rewrite into a
frontend-shape change plus a thin proxy layer, which is why it was safe to do
incrementally: the highest-consequence code (the seven graph-transactional
person mutations, session/auth logic) never moved, so the old SPA and the new
TanStack Start app could run side by side against the exact same live backend
for the whole migration with no risk of the two drifting on business logic —
there was only ever one implementation of it.

Two protocol-layer choices, each checked against an alternative:

- **Keep tRPC, call it server-side, rather than converting apps/backend to
  REST.** apps/frontend's server functions use a plain `@trpc/client` vanilla
  client from server-side code only — the browser never talks to tRPC
  directly. This kept apps/backend's 30 existing procedures, their Zod
  validation, and `protectedProcedure`'s auth gating completely untouched,
  against the cost of every server function being a thin, slightly
  boilerplate-y wrapper (see CLAUDE.md). Converting to REST would have meant
  touching the one part of the system this migration was explicitly trying
  not to touch, for a protocol-shape preference with no functional benefit
  here — apps/frontend's own components never see tRPC's types either way.
- **Proxy `/api/auth/*` through apps/frontend too, rather than leaving it
  cross-origin.** The alternative — pages proxied, auth left pointed directly
  at apps/backend — would have kept exactly the cross-origin cookie
  machinery (`CORS_ORIGINS`, `credentials: "include"`, `trustedOrigins`) that
  caused real, multi-session debugging pain earlier in this project (hung
  Save/login requests eventually traced to devcontainer port-forwarding
  across the frontend/backend origin split). Proxying auth too means the
  browser has exactly one origin for everything, which is what actually
  removes that class of bug rather than just working around one instance of
  it.

One gap found and deliberately not worked around: `createServerFn` buffers an
entire multipart request body into memory before the handler runs, with no
streaming and no way to reject an oversized upload before the bytes have
already arrived — an open, unaddressed upstream issue as of this migration.
The photo upload/delete endpoint is a Start **API route**
(`server.handlers`) instead, which forwards the raw, unparsed request the
same way `fetch` would — sidestepping the limitation entirely rather than
accepting degraded behavior or reaching for a streaming-multipart dependency
this app's 5MB cap doesn't actually need.

Checked against the "Recommending or adding a library" rule in
[CLAUDE.md](CLAUDE.md) before committing to this: `@tanstack/react-start` was,
at the time of the migration, still formally in Release Candidate status
(confirmed directly against the live docs, not inferred from its version
number) roughly a year after reaching RC, though shipping multiple releases a
week with healthy issue triage — actively developed, not abandoned, but not
a library that had graduated its own stated maturity bar either. Named
explicitly rather than glossed over, and weighed against the user's own
direct production experience running it elsewhere, which is what tipped the
decision — not a claim that the RC label stopped mattering.

### Postgres + Apache AGE: two stores, one database

Genealogical data is half records and half graph. People, sources and citations
are relational and are modelled with Drizzle. Relationships (`PARENT_OF`,
`SPOUSE_OF`) are a graph, and pedigree questions — _who are this person's
ancestors, and how many generations back_ — are variable-length traversals that
recursive CTEs express awkwardly and Cypher expresses directly.

Apache AGE puts both in the same database, which is the point: a single
connection pool means a write can create the `persons` row and its graph node in
one transaction (`inGraphTransaction`), so the two halves cannot diverge.

Drizzle was chosen over TypeORM despite TypeORM's first-party Nest integration,
because AGE needs per-connection setup (`LOAD 'age'`, then `search_path`) and
Drizzle sits directly on a `pg` pool that we own. TypeORM hides its pool. Drizzle
also accepts a checked-out `PoolClient`, which is what lets a Drizzle write join
an open Cypher transaction. Wiring it into Nest is a twenty-line module.

Costs, stated plainly: AGE is a niche extension with a smaller community than
Postgres proper, it requires a custom image, and Cypher results come back as
`agtype` that needs decoding (`parseAgtype`). The graph layer is confined to
`packages/db` so that this is one file's problem rather than the application's.

Two sharp edges are documented in code and in [CLAUDE.md](CLAUDE.md):

1. The graph is named `family_tree`, not `genealogy`, because `create_graph()`
   creates a same-named schema and the database and role are both `genealogy` —
   a colliding name makes `"$user"` on the search path shadow `public` and sends
   every `CREATE TABLE` into the graph's schema.
2. AGE parses the graph name, query text and result column list at plan time, so
   none of them can be bound parameters. `cypher()` validates all three and
   requires user values to travel through `params`; those guards are unit-tested.

### Photo uploads: one REST controller, multer, local disk

`person-photo.controller.ts` is the one REST endpoint in an otherwise all-tRPC
API — tRPC's contract is JSON in, JSON (well, superjson) out, and has no
first-class way to accept `multipart/form-data`. Rather than bending tRPC to
fit or reaching for a heavier upload library, this is a plain Nest
`@Controller` using `@nestjs/platform-express`'s `FileInterceptor` (already a
dependency for the Express platform adapter) with `multer` for the multipart
parsing. It re-implements the same `auth.api.getSession` check
`protectedProcedure` does, by hand, since it sits outside tRPC's context.

`multer` was checked against the "Recommending or adding a library" rule in
[CLAUDE.md](CLAUDE.md) before adding it: both `multer` (2.4.0) and
`@types/multer` had released within the current month at the time this was
added, and multer is what `@nestjs/platform-express` itself documents and
bundles for file uploads — there was no lighter-weight alternative to
consider that Nest's own file-upload story doesn't already assume.

Uploaded files are written to `UPLOADS_DIR` (default `./data/uploads`, a
plain filesystem path, not S3 or any object-storage service) and served back
at `/uploads/<filename>` via `app.useStaticAssets`. This fits the "self-hosted
single server" deployment model the rest of the stack assumes (see the
Postgres section above) — no external storage dependency, at the cost of
needing `UPLOADS_DIR` mounted as a volume in the eventual docker-compose
packaging (still 🚧, see [FEATURES.md](FEATURES.md)) so uploads survive a
container recreate, the same way `postgres-data` already does.

The `persons.photo_path` column stores just the filename, never a URL — the
frontend joins it with the backend's own origin (`publicBackendUrl` from
`apps/frontend/src/lib/env.ts`) at render time, so nothing in the database is tied
to a specific host or port. This one endpoint is also the reason
`apps/frontend/src/routes/api/people/$id/photo.ts` exists as a raw Start API
route rather than a `createServerFn`: see "TanStack Start, apps/frontend as a
proxy" below.

### A second, human-readable id per person

`persons.id` (the UUID primary key) is what every foreign key and graph node
uses, but it's not something a person would ever read aloud or write down.
`persons.public_id` — `generatePublicId()` in
`apps/backend/src/person/public-id.ts` — is a short id in the same spirit as
FamilySearch's PID (`LZXY-ABC`): one letter, six more letters-or-digits,
formatted `XXXX-XXX`. Always starts with a letter on purpose, so it never
reads as a bare number. Generated once at creation and never changes;
`PersonService.create` retries a few times on a unique-constraint collision
(SQLSTATE 23505), which at ~56 billion combinations should never actually
fire. The DB enforces the shape with a `CHECK` constraint added directly in
the migration SQL (`persons_public_id_format`) rather than through Drizzle's
schema builder, since the column is never user-editable and Drizzle doesn't
need to know about it to do its job.

Existing rows (from before this column existed) were backfilled in the same
migration that added the column — a per-row `random()`-driven `UPDATE`
mirroring `generatePublicId()`'s own alphabet and shape, not a separate
script, since it only ever needed to run once.

### shadcn/ui on React Aria Components, not Radix or Base UI

New components are pulled from Adobe's React Aria Components
(`react-aria-components`) rather than shadcn's original Radix preset or the
Base UI preset it was briefly switched to. `card.tsx`, `input.tsx` and
`table.tsx` wrap plain elements and have never needed to change across either
switch; `button.tsx`, `select.tsx`, `popover.tsx`, `dialog.tsx` and
`combobox.tsx` each wrap the matching React Aria component.

This was a deliberate, user-directed choice over Base UI, made after checking
(per the "Recommending or adding a library" rule in
[CLAUDE.md](CLAUDE.md)) that `react-aria-components` is still actively
released — it and its `react-aria`/`react-stately` siblings all shipped
within the current month. React Aria's own accessibility track record (it
predates Base UI by years and backs Adobe's Spectrum design system in
production) was the deciding factor over re-verifying Base UI's, which was
comparatively new at the time it was first adopted here.

As with the Base UI switch before it, `pnpm dlx shadcn add` is not usable
as-is: it fetches the default Radix + `cmdk` registry entries regardless of
which headless library the project actually uses, so every generated file's
primitive import needs hand-swapping to `react-aria-components`. The
new-york/slate visual design was kept as-is; only the primitive layer
underneath it changed.

Points that will bite you, coming from either Radix or Base UI:

- **No separate `Trigger` component for `Popover`/`Dialog`.** React Aria's
  `DialogTrigger` takes the trigger element as its first child directly — any
  pressable component works, most often this package's own `Button`. Base UI
  needed a dedicated `PopoverTrigger`/`DialogTrigger` wrapper; here, don't add
  one.
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
  presence-only attributes styled the same way as Base UI's
  `data-open`/`data-starting-style` were: plain Tailwind `data-hovered:…`
  (no brackets needed) plus a `transition` utility for enter/exit, since this
  project has no `tailwindcss-animate`/`tw-animate-css` plugin installed for
  the `animate-in`/`fade-in-0` utility classes shadcn's generated files
  otherwise assume.
- **`onPress`, not `onClick`, for this package's `Button`.** `onClick` still
  works (React Aria keeps it as a compatibility alias) but normalizes worse
  across mouse/touch/keyboard/screen-reader activation; prefer `onPress` in
  new code. Plain native `<button>` elements (not this package's `Button`)
  are unaffected and keep using `onClick`.

### Markdown notes: MDXEditor, not Tiptap

Every `notes` field across the app (`persons`, `personNames`, `unions`,
`personEvents` — the last renamed from `description`, a plain `Input`, on
2026-09-23, specifically to bring it into this convention) is stored as
plain markdown text and edited through a shared WYSIWYG component,
`@genealogy/ui/components/markdown-editor`, rather than a plain `Input` — see
the "notes field" rule in [CLAUDE.md](CLAUDE.md#adding-to-the-stack).
Read-only display goes through the counterpart `markdown-content`, built on
`react-markdown`.

Checked against the "Recommending or adding a library" rule before adding
either:

- **[MDXEditor](https://mdxeditor.dev/) (`@mdxeditor/editor`) over
  [Tiptap](https://tiptap.dev/) (`@tiptap/react`) for the editor itself.**
  Both are actively maintained — `@mdxeditor/editor` 4.2.5 and `@tiptap/react`
  3.31.3 were each published within the prior three weeks at the time of this
  decision — but they differ on what they consider their native storage
  format. MDXEditor is built (on Lexical) to parse markdown in and serialize
  markdown back out on every change, so a `notes` field round-trips as plain
  text with no extra layer. Tiptap's native format is HTML/JSON; getting
  markdown in and out of it needs a community extension
  (`tiptap-markdown`), which had gone unpublished for over a year against a
  Tiptap core that had since moved from v2 to v3 — exactly the kind of
  plausible-but-unmaintained dependency this rule exists to catch, so it was
  ruled out here despite Tiptap's larger ecosystem.
- **`react-markdown` for read-only rendering, not MDXEditor's own `readOnly`
  mode.** MDXEditor's docs say plainly not to use it that way — "don't use
  this mode to render content for consumption." `react-markdown`'s own last
  npm release is over a year old, but its repository had commits within the
  prior month at the time of this decision and a small, well-triaged open
  issue count — a stable, low-churn library rather than an abandoned one, the
  distinction this rule asks for.

Both only render client-side: `MarkdownEditor` follows `use-theme.ts`'s
placeholder-then-swap pattern (a plain `<textarea>` bound to the same value
until mounted, then the real editor), since Lexical touches `contentEditable`
at mount and cannot run during SSR. `MarkdownContent` has no such
restriction — `react-markdown` touches no browser APIs and renders identically
server- and client-side.

### Dark mode: a hand-rolled toggle, not `next-themes`

Dark mode is a plain `.dark` class on `<html>`, driven by
`packages/ui/src/hooks/use-theme.ts` — the first hook in the package, and the
reason `packages/ui/src/hooks/` exists (`components.json` already reserved a
`@genealogy/ui/hooks` alias for it, unused until now). The preference is
tri-state: an explicit `"light"`/`"dark"` stored in `localStorage` always
wins; absent one, the resolved theme follows `prefers-color-scheme` live via a
`matchMedia` listener. `packages/ui/src/components/theme-toggle.tsx` is a
ready-made toggle button built on the hook; `apps/frontend/src/routes/__root.tsx`
places it in the header.

`next-themes` was deliberately not used, even though `apps/frontend` now does
render server-side (see "TanStack Start, apps/frontend as a proxy" below) — the
FOUC-prevention need `next-themes` solves is met by the same hand-rolled inline
`<script>` this project already had (see below), and `use-theme.ts` itself was
made SSR-safe directly (start from a placeholder, read the real
`localStorage`/`matchMedia` value in a client-only `useEffect`) rather than
reaching for a library for it. The inline `<script>` in `<head>`, before any
stylesheet — now rendered by `__root.tsx`'s document shell rather than a
static `index.html`, since Start owns the whole document — reads the same
`localStorage` key (falling back to `matchMedia`) and sets `.dark`
synchronously, before React hydrates. It duplicates the hook's resolution
logic by hand — there's no way to share code between an inline script and a
TypeScript module, so keep the two in sync by hand if the storage key or
resolution rule ever changes. No new CSS was needed: `packages/ui/src/styles.css`
already defined full `:root`/`.dark` variables from day one, they were just
never reachable.

### Motion for animation, applied by hand to React Aria components

`motion` (Framer Motion's current package name) drives the one animation this
project has deliberately built so far: spring-based entry/exit on the four
overlay components (`popover`, `dialog`, `select`, `combobox`). This was
chosen over **Animate UI**, a shadcn-CLI-style component registry that looked
like a shortcut — its own `packages/ui/package.json` depends on `radix-ui`,
not `react-aria-components` (one of its own doc pages claims React Aria; the
source says otherwise), and adopting it would have reintroduced Radix right
after the Radix → Base UI → React Aria consolidation this repo already went
through. It had also gone quiet — no commits in the ~9 months before this was
checked, despite still calling itself "Beta." `motion` itself was verified
separately as actively released and is what Animate UI's own animations run
on anyway, so it's used directly against this project's own React
Aria–based components instead.

The pattern is React Aria's own documented one for animating `Modal`/`Popover`
exits with Motion (see the "Animation" section of the styling guide): wrap the
overlay component with `motion.create(...)` and give it an `isExiting` prop
so it stays mounted until the exit animation finishes, keyed off a
`'unmounted' | 'hidden' | 'visible'` state tracked wherever `onOpenChange`
fires. `packages/ui/src/hooks/use-overlay-transition.ts` builds that state
machine once and hands it to the matching Content component via React
context, so `popover.tsx`/`dialog.tsx`/`select.tsx`/`combobox.tsx` each only
need their own `variants` shape, and no consumer of `Popover`/`Dialog`/
`Select`/`Combobox` ever sees the state machine at all.

One sharp edge hit while building this: `Select` and `Combobox` cannot use the
same "return `null` while unmounted" trick that `Dialog`/`Popover` use freely.
React Aria needs to resolve a `Select`/`ComboBox`'s current value against its
item collection to display a label — including before the popup has ever been
opened — and that collection is built from the actual `SelectItem`/
`ComboBoxItem` elements existing in the React tree. Returning `null` from
`SelectContent`/`ComboboxContent` before first open made the collection
empty, so the trigger showed "Select an item" instead of the real value even
though a matching option existed. The fix: always render the item list (never
return `null` there), and only vary the Motion `animate`/`isExiting` props
between the "hidden" and "visible" states — `Popover`/`Dialog` don't have this
requirement, since their content is arbitrary and has no collection to keep
discoverable.

A second, unrelated bug surfaced while writing the regression tests for the
above: `combobox.tsx` has no separate trigger button, just the search input,
so it fell back to React Aria's default `menuTrigger="input"` — which only
opens on an actual edit, not on focus or a plain click. Clicking into the
"Add relative" search field did nothing until you typed a character. Fixed by
setting `menuTrigger="focus"` explicitly, which also reads better anyway (see
every match immediately, then narrow by typing).

A third bug, found much later (reported as "the Sex dropdown doesn't open"):
`select.tsx` and `combobox.tsx` both wrapped React Aria's `Popover` directly
with `motion.create(Popover)`, the same pattern `popover.tsx` uses
successfully. For `Select`/`Combobox` specifically this left the popover
permanently at its `initial` opacity — mounted, positioned correctly,
interactive (keyboard/click selection both worked, and `tester.open()` in a
test would call it open) — but invisible, because `opacity: 0` was stuck in
the DOM forever. Confirmed with Playwright against the real dev server
(`getComputedStyle(...).opacity` stayed `"0"` indefinitely after opening,
across repeated open/close cycles) — `pnpm test` was green throughout,
because jsdom does not reproduce this at all (see below).

Root cause: `PopoverContent` returns `null` until first opened, so
`MotionPopover` only ever mounts once there's a real `hidden → visible`
transition to perform, and Motion animates it normally. `SelectContent`/
`ComboboxContent` can't do that (see the sharp edge above — they must stay
mounted so the item collection resolves a label before first open), so
`MotionPopover` mounts immediately on page load with `initial="hidden"` and
`animate="hidden"` _already equal_ — a no-op first render. React Aria's
`Popover` itself then re-renders on its own, independent of our animation
state, to recompute its position (`--trigger-anchor-point`/`--trigger-width`,
written directly into the same inline `style` attribute Motion writes
`opacity`/`transform` into) every time the trigger's size or placement is
recalculated. That later re-render stomps Motion's animated values back to
whatever it computed, which — since Motion never got a real mount-time
transition to run — was never anything but the `initial` hidden values.

Fixed by not handing `Popover` itself to `motion.create()`. Instead, `Popover`
renders un-wrapped (still taking `isExiting` directly as a prop, which is all
that's needed to keep it mounted before first open — passing that prop
short-circuits `Popover`'s own `!state.isOpen && !isExiting → return null`
check regardless of Motion), and a plain `motion.create("div")` goes one level
inside it, wrapping just the `ListBox`. A plain div never participates in
`Popover`'s own position recomputation, so nothing ever overwrites what Motion
writes to it.

**This class of bug cannot be caught by this package's component tests.**
jsdom has no real layout/paint engine, so it does not reproduce React Aria's
position-recompute-driven style-stomping at all — a version of `select.tsx`
with this exact bug passes every test in `select.test.tsx` unchanged (checked
directly: reverting the fix and re-running `pnpm test` still shows all green).
Anything that depends on an element's real computed style over real elapsed
time — stuck opacity, mispositioned overlays, a transition that never
completes — needs verification against the actual dev server in a real
browser (this project's pattern: a throwaway Playwright script driven from
the CLI, checking `getComputedStyle` on the real DOM), not just
`@react-aria/test-utils` assertions. Keep this in mind before trusting a
green `pnpm test` for anything animation- or layout-shaped.

### Component tests: Vitest + React Testing Library + `@react-aria/test-utils`

`packages/ui` had zero test coverage before both of the bugs above shipped
silently — `pnpm test` there was a no-op (`vitest run --passWithNoTests`,
default `environment: "node"`, unable to render React at all). Fixed with:

- `vitest.config.ts` in `packages/ui` setting `environment: "jsdom"` and a
  `vitest.setup.ts` (imports `@testing-library/jest-dom/vitest` for matchers
  like `toBeVisible`, plus `ResizeObserver`/`scrollIntoView`/pointer-capture
  stubs jsdom doesn't implement but React Aria's overlay positioning and
  interaction layers call). That setup file lives outside `src/` (matching
  where Vitest itself looks for it) but is added to `tsconfig.json`'s
  `include` too — otherwise `tsc` never sees the jest-dom augmentation and
  every matcher fails to typecheck even though the tests themselves pass.
- `@react-aria/test-utils` — React Aria's own ARIA-pattern testers
  (`new User().createTester("Select", { root })`, `.createTester("ComboBox", ...)`,
  etc.), which drive components the way a real user would (via
  `@testing-library/user-event`) and query by role rather than
  implementation detail. This is what actually caught both bugs above: a
  hand-rolled `fireEvent.click` on the trigger wouldn't have exercised the
  same open/value-resolution path a real click does.

One test file per component with meaningful behavior (`select.test.tsx`,
`combobox.test.tsx`, `dialog.test.tsx`, `popover.test.tsx`, `tabs.test.tsx`,
plus lighter render/interaction checks for `button`/`switch`/`checkbox`).
Purely presentational components (`card`, `input`, `table`, `badge`,
`avatar`, `separator`) don't have their own test files yet — add one if a bug
is ever found in one, same as any other component.

### better-auth, hosted entirely in the backend

Authentication (email/password + Google OAuth) is better-auth, mounted as an
Express handler inside the NestJS backend (`apps/backend/src/auth/`) rather than
split across frontend and backend. The frontend has no auth logic of its own —
`apps/frontend/src/lib/auth-client.ts` is a `better-auth/react` client that talks to
`/api/auth` on **its own** origin now, not the backend's: `apps/frontend/src/routes/
api/auth/$.ts` proxies every request through to the backend unmodified (see
"TanStack Start, apps/frontend as a proxy" below), the same relationship the
server-side tRPC client has with `/trpc`.

The NestJS integration is hand-rolled rather than built on the community
`@thallesp/nestjs-better-auth` package (which better-auth's own docs point to):
this backend has zero Nest `@Controller` routes — everything goes through the
one tRPC router — so a package built around Nest guards and decorators for
controllers doesn't fit what's actually needed, which is an Express mount
(`main.ts`) and a tRPC context lookup (`trpc.context.ts`), both small. This is
the same reasoning already applied to the tRPC↔Nest bridge itself instead of
`nestjs-trpc` (below): owning ~20 lines beats a dependency shaped for a
different architecture. `protectedProcedure` sits next to `publicProcedure` in
`trpc.base.ts`, built on the tRPC middleware pattern, but isn't applied to
`person.router.ts` — gating specific data behind login is a separate product
decision from having the capability available.

The Drizzle adapter (`better-auth/adapters/drizzle`) reuses the same `pg` pool
and Drizzle instance as the rest of the app (`DatabaseModule`'s `DRIZZLE`
provider), so `user`/`session`/`account`/`verification` are ordinary tables in
`packages/db/src/schema.ts` migrated the same way as everything else
(`pnpm db:generate` / `pnpm db:migrate`) — no separate auth database or
migration tooling. Row IDs on those four tables are plain `text`, not the
`uuid().defaultRandom()` the rest of the schema uses, because better-auth
generates its own IDs application-side.

Google OAuth credentials (`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`) must be
created by hand in Google Cloud Console — there is no way to provision these
programmatically, and `.env.example` documents the redirect URI Google needs.

### TanStack across the frontend

Router (file-based, with automatic code splitting via the Vite plugin), Query for
server state, Table for grids, Form for input. One family, one set of
conventions. `@trpc/tanstack-react-query` — the hook-based `useTRPC()` +
`.queryOptions()`/`.mutationOptions()` integration the pre-migration SPA used —
is gone along with the pre-migration SPA: `apps/frontend`'s server functions
call tRPC server-side only (see "TanStack Start, apps/frontend as a proxy" below), so route
components use plain `useQuery`/`useMutation` with hand-written query keys,
same as they would for any other data source.

TanStack Table v9 is a substantial departure from v8: `useTable` replaces
`useReactTable`, and optional row models are registered as feature slots inside
`tableFeatures({})` rather than passed as table options. v8 examples will not
work. The people table currently registers no optional features because ordering
is done in SQL, where it can span the whole result set rather than the page.

shadcn/ui components are vendored into `packages/ui` rather than installed, which
is how shadcn is meant to be used — they are source you own. `components.json`
points the CLI at that package, so `shadcn add` lands components in the right
place.

**File-based routes nest purely on path prefix, regardless of whether the
"parent" file renders an `<Outlet />`.** `people.$personId.print.tsx` (the
original, pre-migration SPA's flat-file naming) was first added expecting a
route independent of `people.$personId.tsx` — same URL prefix, unrelated page.
Instead, the generator's `RoutePrefixMap` (longest matching existing route path
wins) made it a _child_ of `people.$personId` automatically, and since that
route's component returns its own full JSX with no `<Outlet />`, the child
silently never rendered: the URL changed on navigation but the parent's
content stayed on screen, with no console error. Fixed with the Remix-style
trailing-underscore escape — the file is `people.$personId_.print.tsx` — which
only changes the route's internal `id` (and what the file-route generator
writes as the first argument to `createFileRoute`); the actual URL
(`/people/$personId/print`) and every `<Link to="...">` calling it are
unaffected. `apps/frontend` ported this into a directory layout
(`routes/people/$personId_.print.tsx` alongside `routes/people/$personId.tsx`)
and the same escape hatch still applies unchanged — `@tanstack/react-start`'s
Vite plugin generates the route tree now instead of the old SPA's
`@tanstack/router-cli` (`tsr generate`), but both are the same underlying
`@tanstack/react-router` file-route convention. Reach for the trailing
underscore any time a new route needs to share a URL prefix with an existing
route file but not its layout.

### Person names: "First names" and "Last names", nowhere else

A person's given names and surname are always labeled **"First names"** and
**"Last names"** on every form that lets someone type or edit them — the main
person record, the quick "create and link" dialogs under Parents/Spouses/
Children, and the alternate-name form under "Alternate names". Never "Given
names", "Surname", or singular "Last name" — those crept in as forms were
added independently and read as inconsistent once several existed side by
side. `packages/core/src/person.ts` still calls the underlying fields `given`
and `surname` (matching GEDCOM vocabulary, which `sexSchema`'s comment already
leans on) — only the user-facing label changed, not the wire format.

There is deliberately no separate "Middle names" field. `given` holds every
given name a person has, middle ones included, unsplit and in source order —
the `personNameSchema` comment says so directly. A dedicated `middleName`
column existed briefly and was removed once it became clear it just
duplicated what "First names" was already documented to hold; the migration
that dropped it folds any existing middle name back onto the end of `given`
rather than discarding it.

### Configurable dropdown options, not hardcoded enums

Five closed-vocabulary dropdowns — life event types, alternate-name types,
citation confidence levels, spouse union statuses, and parent relationship
types — are backed by a single `configurableOptions` table
(`packages/db/src/schema.ts`) rather than Postgres enums or hardcoded Zod
`z.enum([...])` lists, and are managed from `/settings` (the gear icon in the
nav) instead of requiring a code change + migration for every new value.
Each row is `{ topic, key, label, sortOrder, isProtected }`; `key` is what
`person_events.event_type`, `person_names.name_type`, `citations.confidence`,
`unions.status` and the `PARENT_OF` graph edge's `parentage` property
actually store, and is immutable once created — only `label`/`sortOrder` can
change afterwards, so relabeling or reordering an option never orphans
existing data. The four Postgres columns above were converted from `enum` to
plain `text` for this (see migration `0015`); `parentage` never had a column
at all, since it already lived as a bare agtype string on the graph edge.

Two dropdowns stay hardcoded on purpose: `citationFactType`
(person/name/event/union) and `gender` (M/F/U) are structural — code branches on
their exact value in ways a runtime-editable list can't safely support (e.g.
a citation's `factId` is required or forbidden depending on `factType`).
Three individual `event_type` option keys are seeded `isProtected: true` for
the same reason at a smaller scale: `"other"` (a required-label rule keys off
it), and `"birth"`/`"death"` (the person form's dedicated vitals fields key
off them — see "Birth and death are events" below); `parentage`'s `"birth"`
is protected too, for the Parents UI's Father/Mother slots — a different
`"birth"`, in a different topic, not to be confused with `event_type`'s.
Protected options can be relabeled but never deleted. `EVENT_DETAIL_FIELDS`
(the extra fields immigration/burial/death/etc. get, like ship name or cause
of death) stays a hardcoded map keyed by the built-in event-type strings; an
admin-added event type gets only the generic date/place/notes fields,
not bonus ones — a deliberate limitation, not an oversight.

### Birth and death are events

Until 2026-09-23, `birth`/`birthPlace`/`death`/`deathPlace` were columns on
`persons`, and `person_events` held "life events beyond birth/death" —
christening, burial, and the rest. That split was arbitrary (a birth record
has the same shape as a christening record: a date, a place, type-specific
detail, citations) and it had a real user-facing cost: the "Life events" card
on a person's own page queries `person_events`, so it silently never showed
someone's birth or death — the bug that triggered this change. It also forced
`citations.factType` to special-case `"birth"`/`"death"` as two more
null-`factId` cases alongside `"person"`, since there was no row for a
citation to point at.

Birth and death are now ordinary `person_events` rows (`eventType`
`"birth"`/`"death"`, both seeded `isProtected: true` — see "Configurable
dropdown options" above), so a birth citation is just `factType: "event"`
with that row's id, like any other event, and `citationFactType` shrank to
`person`/`name`/`event`/`union`. The person page still creates and edits them
as a dedicated pair of fields ("Date of Birth"/"Place of Birth", etc.)
rather than through the generic "+ Add event" dialog — that's a UX choice
(one canonical birth, easy to find), not a data-model one, and it's enforced
in one place: `PersonService.addEvent` rejects a second `"birth"`/`"death"`
row for the same person regardless of which UI path tried to create it. Once
created, the row is fully editable from the "Life events" list like anything
else (date, place, detail — e.g. cause of death) except its type, which the
list's `EventForm` locks for exactly those two rows.

The part this doesn't come for free on is reads: `persons.birth` used to be
a plain `jsonb` column, read by `calculateAge`/`formatLifespan`
(`packages/core/src/person.ts`) on every person list row, tree node, and the
print report. Rather than keep a denormalized `persons.birth` cache "in sync"
with the real event row — reintroducing the exact two-sources-of-truth
problem this change removes, one level down — `personsWithVitals`
(`packages/db/src/vitals.ts`) left-joins `persons` to its own birth/death
`person_events` rows and re-assembles the same `{birth, birthPlace, death,
deathPlace}` shape the API has always returned. `PersonService` routes every
person read (`list`/`byId`/`relatives`/`tree`/photo mutations) through it,
and `create`/`update` split their input into a `persons` write plus a
birth/death upsert (`upsertVitalEvent`) in the same transaction. The payoff:
**zero ripple on the frontend or on `packages/core`'s types** —
`createPersonSchema`/`updatePersonSchema`/`Person` still carry
`birth`/`birthPlace`/`death`/`deathPlace` exactly as before, now documented
as assembled rather than stored, so the person form, list, tree, and print
report needed no changes at all. The left join is only safe because
`addEvent`'s guard above keeps birth/death at most one row per person per
type — anything less strict would multiply rows.

Migration `0016` is data-preserving, not additive: it moves every existing
person's `birth`/`death` into `person_events`, repoints any citation that
referenced the old `"birth"`/`"death"` fact types at the new rows, and only
then narrows `citation_fact_type` and drops the four `persons` columns —
verified against the real dev database (11 people, 9 births and 2 deaths
carried across with dates/places intact) before being treated as done.

### One Save button component, not one per form

Every form that saves or creates a record uses `SaveButton`
(`packages/ui/src/components/save-button.tsx`) instead of a bare `Button
type="submit"`. It renders a small red dot once the form is dirty, and
swaps the dot for a spinner (disabling the button) while the save is in
flight — first built for the person-details page's Save button, then pulled
out once a second and third form needed the identical behaviour rather than
re-implementing it slightly differently each time. `isDirty`/`isPending`
come from the owning TanStack Form's own store
(`useStore(form.store, (s) => s.isDirty / s.isSubmitting)`), not from a
mutation's own `isPending` — a form whose `onSubmit` awaits more than one
mutation (`CreateAndLinkForm`, creating a person then linking them) would
otherwise report "not pending" between the two calls, since the first
mutation's own `isPending` flips back to `false` before the second one
starts.

A handful of forms track a Select's value in `useState` rather than a
`form.Field` (`NameForm`'s name type, `EventForm`'s event type — both
backed by `configurableOptions`, see above), which the form's own `isDirty`
can't see change on its own; those combine it with a manual comparison
against the value's initial snapshot. `CitationForm` has no TanStack Form
at all — every field is `useState` — so it snapshots all of them once on
mount and compares the whole set; the snapshot uses `useState`, not
`useRef`, because reading `ref.current` during render is flagged by
oxlint's `react(refs)` rule even though the value itself never changes here.

`SaveButton` defaults its underlying `type` to `"submit"` but lets a caller
override it to `"button"` — added specifically for `CitationForm`'s
`embedded` mode (see below), where relying on native form submission is
actively wrong, not just unnecessary.

**A `type="submit"` button submits its nearest ancestor `<form>` no matter
how deeply it's nested inside other elements — including, for React
specifically, across a `createPortal` boundary.** React's synthetic events
bubble through the _React component tree_ (parent/child relationships), not
the DOM tree a portal actually renders into (this is documented React portal
behaviour, not a bug — "the portal still exists in the React tree, regardless
of position in the DOM tree"). Every `Dialog` in this app (`dialog.tsx`)
renders its content through React Aria's `Modal`, which portals: the content
is a DOM sibling of wherever the trigger sits, but still a React descendant
of it. Building the event-citation UI (see `EventCitations`/`CitationForm`'s
`fixedFact`/`embedded` props under "Sources & citations" in FEATURES.md) hit
this directly: an inner `CitationForm`, opened from inside an event's own
edit dialog, has its own `SaveButton` ("Add"). Even with the inner form
correctly `preventDefault`-ing its own submit, clicking "Add" _also_
synthetically re-triggered the **outer** `EventForm`'s `onSubmit` — which
closes that dialog on success — because React re-dispatches the submit event
up the React tree regardless of the portal. Traced with a `MutationObserver`
and confirmed independent of pointer events (reproduced via keyboard Enter
alone) and independent of nesting depth (still fired with the inner form
rendered as plain embedded content, no portal, no dialog-in-dialog at all —
once nesting was ruled out as the cause, the shared-form-ancestor explanation
was the one left standing). The fix is the `type="button"` + `onPress`
override above, used whenever a `SaveButton` lives inside another form's
subtree, React-tree-nested or not — `stopPropagation` was considered but
doesn't reach across an _actual_ DOM/native form submission the way it does a
synthetic one, so it wouldn't have covered the embedded (non-portalled) case.

### Tree view: React Flow + elkjs, with elk doing only half the job

The tree view (`/tree`) renders with React Flow (`@xyflow/react` — the
package "React Flow" now ships under; the old `reactflow` name is its
predecessor) for the canvas, and elkjs for layout. Both checked against the
"Recommending or adding a library" rule in CLAUDE.md on 2026-09-23:
`@xyflow/react` last published 2026-09-01, elkjs 2026-07-17 — both actively
maintained. This was the option already recorded in FEATURES.md before this
was built, not a fresh choice.

elk does _not_ decide row placement, despite that looking like its job.
elk's layered algorithm ("Sugiyama-style") can only place a node relative to
its edges, and always treats an edge as "target is at least one layer below
source" — there's no such thing as a same-layer edge to it. Feeding it a
spouse edge (to keep a couple on one row) either gets ignored or makes elk
shift one side down a layer to keep the edge routable. elk's own
`partitioning` feature looks like the fix (assign nodes a partition, expect
same-partition nodes to land on the same row) but isn't: verified
empirically that partitioning only constrains _ordering between_ partitions
(everything in partition 0 comes before partition 1), not that two
same-partition nodes share a layer — two parents of the same child, given
the same partition, still landed one layer apart.

So row assignment is done by hand, once, before elk ever runs:
`computeGenerations` (`apps/frontend/src/lib/tree-layout.ts`) floods outward
from the root person — +1 down a `PARENT_OF` edge, -1 up one, +0 across a
`SPOUSE_OF` edge — and that number becomes `y` directly, overriding whatever
y elk would have computed. elk is only asked to lay out the `PARENT_OF`
edges (never spouse edges), and only its `x` output is kept, for left-to-
right ordering (crossing minimization) within each already-fixed row. A
spouse with no blood edge of their own anywhere in the collected set (a pure
in-law, e.g. the root's own spouse) never reaches elk at all — they're
placed beside whichever partner elk did position, at that partner's exact
`y`, in a fixed-point pass over the spouse edges afterward.

On the data side, `treeAround` (`packages/db/src/graph.ts`) walks one
generation at a time via `parentsOf`/`childrenOf`, rather than a single
Cypher `MATCH ...-[:PARENT_OF*1..N]->...` returning `nodes(path)`/
`relationships(path)`. `cypher()`'s `parseAgtype` (`packages/db/src/age.ts`)
only strips the `::vertex`/`::edge`/`::path` annotation AGE appends to a
_single_ value per column — a list of vertices/edges each carrying their own
inline annotation isn't valid JSON once spliced together, so the list form
was never wired up. Costs a query per generation instead of one; fine at the
depths (4 up, 4 down by default) a tree view renders.

**Provenance, not just presence, decides "+ Add relative" vs. "Load more".**
The obvious rule — "show an add button if this person has no recorded
father/mother/child" — is wrong on its own, because absence in the fetched
tree isn't the same as absence in the graph. `treeAround`'s walk is
asymmetric: it follows an ancestor's own parents further up, but never asks
whether that ancestor has _other_ children (the root's aunts and uncles);
symmetrically for descendants, their children are followed but their other
parents never checked. So "no edge found" can mean "genuinely has none" or
"we simply never looked at that side of this specific person," and those
need different UI: an add-relative dialog for the first, a "load more" action
for the second. `treeAround` now returns `parentsKnownIds`/`childrenKnownIds`
— exactly the ids that were themselves used as a query source in each
direction, captured from the walk's own frontier rather than inferred after
the fact — and the tree view (`apps/frontend/src/routes/tree.tsx`) gates on
that instead of on edge presence. "Load more" itself needed no new backend
endpoint: it reuses `person.relatives` (already existed for the person page)
one hop at a time and merges the result into local state, rather than
refetching and relaying out the whole tree.

### Long-running work: BullMQ + a shared Redis

Anything that shouldn't run inline on a request — the first example being
outbound mail — goes through a BullMQ queue (`@nestjs/bullmq`) rather than
being awaited directly in a tRPC procedure. `QueueModule`
(`apps/backend/src/queue/queue.module.ts`) is `@Global`, the same pattern as
`DatabaseModule`/`AuthModule`: it opens one shared `ioredis` connection from
`REDIS_URL` and hands it to `BullModule.forRootAsync`, so any feature module
can `BullModule.registerQueue({ name: "..." })` for its own queue without
wiring Redis itself. Checked against the "Recommending or adding a library"
rule in CLAUDE.md on 2026-09-27: `bullmq` and `ioredis` are both under
active development with frequent releases; `@nestjs/bullmq` (the official
NestJS integration) tracks Nest's own major versions and was last released
in step with this repo's Nest 12.

**Redis is core infrastructure, not Immich-only.** Immich's own compose
profile (see below) used to run its own `immich-redis`; that's gone. There
is exactly one Redis in `docker-compose.yml` now — the always-on `redis`
service, published on the host like `db` — and Immich's containers, when
`profiles: [immich]` is enabled, point `REDIS_HOSTNAME` at that same
instance instead of running a second one. This was a deliberate call,
confirmed with the user on 2026-09-27 rather than assumed: the alternative
(keeping Redis behind the immich profile) would have made a core feature —
sending mail — depend on optional infrastructure, contradicting the
"Immich must be fully optional" invariant recorded further down this file.
`REDIS_URL` is accordingly a required env var (`config/env.ts`), unlike
`IMMICH_URL`/`IMMICH_API_KEY`.

**Mail is the first (and so far only) queue.** `apps/backend/src/mail/`:
`MailService` owns the SMTP transport and Handlebars rendering and can be
unit-tested without a queue at all; `MailRouter` (`mail.send`, tRPC) enqueues
a job; `MailProcessor` (`@Processor("mail")`, extends `WorkerHost`) is the
worker half, running in this same process — there's no separate worker
deployment, matching this app's existing single-process shape. The template
to render is a fixed enum (`mailTemplateSchema` in `packages/core`), not an
arbitrary caller-supplied filename, for the same path-traversal reason a few
other things in this app are a closed set rather than free text. `SMTP_HOST`
is optional config, same pattern as Immich's: unset, `MailService` falls
back to nodemailer's `jsonTransport`, which never opens a network
connection and instead logs the fully rendered message — so the queue and
its worker are exercisable in dev without a real mail provider configured,
and a job still "succeeds" instead of piling up retries against a transport
that was never going to work.

### Photos & albums: Immich, self-hosted, proxied like everything else

The photo library (`/photos`, and the "Photos" card on a person's page) is
built on [Immich](https://immich.app) rather than a bespoke upload/gallery/
face-detection stack — checked against the "Recommending or adding a
library" rule in CLAUDE.md on 2026-09-21 before the idea went into
FEATURES.md, and re-checked on 2026-09-23 before building: still actively
released (v3.2.2 at build time), active issue/PR turnaround. Building face
detection and clustering from scratch was never seriously considered —
that's a research problem, not a CRUD feature, and Immich already solves it
well. This app never stores photo bytes or face data of its own; it links
to what Immich already has.

**Immich runs in `docker-compose.yml` as part of the default `docker compose
up`.** It's a 3-container stack of its own (Postgres w/ pgvecto.rs, the app
server, a machine-learning service for face detection) at maybe 6-8GB of RAM
for the ML container alone. It originally sat behind a `profiles: ["immich"]`
gate so that cost was opt-in; that gate was removed (2026-10-06) because the
photo library is a core dependency of this app, and one command should bring
up everything it needs. The app itself still tolerates Immich being absent
(`ImmichService.isConfigured`), so a self-hosted deployment can leave it out.
Versions
are pinned to the exact v3.2.2 image digests from Immich's own release, not
`:release`, for the same reason the rest of this repo pins versions in the
catalog rather than a floating range. Because the compose file already runs
this app's own Postgres as `db`, the container is named `immich-db` with
`DB_HOSTNAME` overridden to match — Immich's own compose file assumes the
service name `database`, which would silently point it at nothing (or at
this app's own Postgres) if left unchanged. Redis is _not_ Immich-only
infrastructure here — see "Long-running work: BullMQ + a shared Redis"
above: Immich's `REDIS_HOSTNAME` points at the same always-on `redis`
service apps/backend's queues use, not a Redis of its own.

**The proxy architecture (see the top-level section in this file) extends
to Immich, unmodified in shape.** `apps/backend/src/immich/immich.service.ts`
is the only thing in the repo holding `IMMICH_API_KEY`; it's an optional
config pair (`apps/backend/src/config/env.ts`) so the app boots fine with
Immich never configured at all — every route and card checks
`isImmichConfigured` first and either hides itself (`PersonPhotosCard`) or
shows a setup message (`/photos`'s `NotConfigured`), never a broken
request. tRPC (`immich.router.ts`) carries JSON — people, albums, asset
metadata. Binary thumbnails don't fit tRPC's JSON transport any better than
this app's own local-disk photo uploads do, so they get the same treatment:
a REST controller (`immich-asset.controller.ts`) with its own manual
session check, mirrored on the frontend by proxy API routes
(`routes/api/immich/**`) that forward bytes without buffering them through
`createServerFn` — the same reasoning already recorded above for
`routes/api/people/$id/photo.ts`.

**The person↔Immich relationship is a link table, not a foreign key on
`persons`.** `person_immich_links` (`packages/db/src/schema.ts`) maps one
person to potentially several Immich "people" (Immich clusters faces per
photo-set, not per real individual — the same person can end up as two
separate Immich people if, e.g., their look changed enough over decades of
photos), with `immichPersonId` unique so one Immich person can't be linked
to two different tree people at once. It's a plain Postgres table, not a
graph edge — nothing about it is a genealogical relationship the graph
layer needs to traverse, it's just foreign-key metadata, same category as a
citation.

**A dangling link (the linked Immich person gets deleted in Immich) fails
open, not closed, and there's no code written to prevent or clean it up.**
`ImmichService.linkedPeople` drops any link whose `GET /people/{id}` 404s
rather than surfacing an error, so a stale link just quietly stops
contributing photos instead of breaking the person's page. This was a
deliberate choice, not an oversight: Immich is the system of record for
whether a person-cluster still exists, and reconciling that eagerly (a
webhook, a periodic sweep) was judged not worth building until a real
workflow shows it's needed — accepted as the known cost of the fast-follow
decision below, since without a profile-photo picker pointing at Immich the
only consequence of a stale link today is a photo grid that's short a few
thumbnails.

**Picking a person's profile photo from Immich, with a circular crop.** The
deferral above was the plan until the user asked for it directly. Built
with **no backend change at all**: `PersonService.setPhoto` already stores
whatever image bytes it's handed under `UPLOADS_DIR`, keyed by
`persons.photoPath` (a single nullable string, no "source" concept, mime-
checked only as `image/*`) — so the crop's output is just another image
file as far as that endpoint is concerned. The whole feature is new
frontend work:

- `packages/ui/src/components/image-crop-dialog.tsx` (`ImageCropDialog`) —
  built on `react-easy-crop` (checked before adding: last stable release
  2026-07-24, canary builds as recent as 2026-09-05, so actively
  maintained; one small runtime dependency, `normalize-wheel`) rather than
  hand-rolled drag/zoom/pinch math. `cropShape="round"` gives the circular
  selection UI directly. On confirm, a canvas draws just the selected pixel
  region and exports a plain **square** JPEG via `canvas.toBlob()` — not a
  circular PNG with real alpha transparency. `Avatar`'s own CSS already
  renders it however the call site wants (the header portrait is actually
  `rounded-xl`, not `rounded-full` — only the small avatar variant is a
  true circle), so baking in transparency would add complexity for no
  visible difference, the same way every comparable product (GitHub,
  Slack, ...) handles this. Uses the existing `ControlledDialogContent`
  shell (the same "no adjacent trigger" pattern `TagFaceDialog` already
  uses), not `ImageViewer`'s full-viewport black shell — a crop tool is a
  modest utility dialog, not a full-bleed photo viewer.
- `apps/frontend/src/routes/people/-set-photo-from-immich-dialog.tsx` — the
  picker step, two tabs (this person's own linked photos via the existing
  `listPersonPhotos`, or the whole library via the existing
  `searchImmichAssets` — the same picker `AddAssetsDialog` already uses,
  just single-select-and-advance instead of accumulate-then-confirm). The
  user explicitly wanted _any_ photo, not just ones already face-linked to
  this person, which is why "All photos" exists alongside the person-scoped
  tab.
- `-person-header-card.tsx`'s `PersonPhoto`: the single click-to-upload
  button became a `DropdownMenu` ("Upload a photo" / "Choose from Immich"),
  gated on `isImmichConfigured()` exactly like `PersonPhotosCard` already
  hides itself when Immich isn't configured. The crop dialog's output
  uploads through the _exact same_ `/api/people/$id/photo` proxy route the
  plain file-picker upload already posts to — verified live: a synthetic
  image blob uploaded that way correctly replaces `photoPath` and deletes
  the previous file, the same cleanup `setPhoto` already did for a manual
  re-upload.

**One real gap found during live verification, not a code defect:**
Immich's `GET /people` only lists a "person" once it has at least one
detected face — a person record with photos uploaded but no face ever
recognized in them (a scanned photo where faces are too small, or a group
photo Immich hasn't finished processing) simply won't appear to link
against yet. That's Immich's own indexing behavior, confirmed directly
against its API rather than assumed, and there's nothing to fix on this
app's side — it just means "no faces found yet" is a real, expected empty
state, not always a config problem.

**Write surface, added later (2026-09-27): albums, upload, face tagging —
create/add only, never delete.** The above was the original, deliberately
minimal "browse and link only" version; it was later expanded, on request,
into album creation, photo upload, adding existing photos to an album, and
tagging a detected face to a genealogy person, all from within this app.
What stayed unchanged: Immich remains the sole source of truth for albums/
assets/faces (still no local schema beyond `person_immich_links`), the
proxy architecture is untouched (every new binary/multipart route follows
the same REST-controller-with-manual-session-check shape as the thumbnail
routes above), and — a deliberate line, not an oversight — this app can
create and add but never delete an album or a photo. Removing something
stays a job for Immich's own UI, the same trust boundary the "dangling link
fails open" design above already assumes.

**`IMMICH_API_KEY` needs write scopes now, not just read**: `asset.upload`,
`album.create`, `album.update`, `album.assetCreate`, `person.create`,
`face.update`, `job.create` (the last one for the Tools page's "Re-scan for
faces" action below). A read-only key 403s on every one of the new calls —
see the next point for why that used to be a worse experience than it
needed to be.

**A real bug fixed while building this**: `ImmichService`'s private
`request()` only ever threw `BadRequestException`, never
`NotFoundException`, even on a 404 — only the separate `requestBinary()`
had that mapping. That meant `getPerson()`'s `catch (NotFoundException)`
never actually caught a real 404, so the "dangling link fails open" promise
made two sections up didn't fully hold for `link()`/`linkedPeople()`. Fixed
by moving the 404 mapping into `request()` itself. While there, `request()`
now also includes the response body in its thrown message — a write
failing is almost always actionable (403 = the API key lacks a scope, 400 =
a bad request body), and a bare "403 Forbidden" gave no hint which.

**A second, related real bug, found live while building the data-integrity
checker's "dangling Immich link" check**: the 404-mapping fix above wasn't
actually enough. Immich's real `GET /people/{id}` returns **400**, not 404,
for a person id that doesn't exist at all — `{"message": "Not found or no
person.read access"}`, conflating "doesn't exist" with "no permission" into
one status the OpenAPI spec doesn't make obvious. `getPerson()`'s
`catch (NotFoundException)` never caught this, so every real dangling-link
case (an Immich person actually deleted or merged away) threw a raw 500
instead of the "fails open" behavior every caller assumes — this includes
`linkedPeople()`, and so a person's own Photos card, not just the new
integrity check. Confirmed by seeding a link at a syntactically valid but
nonexistent UUID and watching it 500 before the fix, then return `[]`
cleanly after. Fixed by also catching `BadRequestException` in `getPerson()`
when its message matches `/not found/i` — scoped to that one method rather
than folded into `request()` itself, since a 400 elsewhere (bad upload,
malformed body) is a real error that should keep throwing.

**Three face states, not two — the key design finding for tagging.**
Immich auto-creates an (often unnamed) `Person` for nearly every detected
face; `person: null` on `GET /faces` is the rare case, not the common one.
So a face is one of: **linked** (has an Immich person, and that person has
a `person_immich_links` row — clicking it in the viewer navigates straight
to that genealogy person); **untagged** (has an Immich person, no link row
yet — the common case, and it needs no Immich write at all beyond the
existing `link()` call, which already best-effort-renames the cluster);
or **unknown** (no Immich person yet — rare, needs `POST /people` then
`PUT /faces/{id}` via the new `tagFace`, then `link()`). `TagFaceDialog`
picks between the plain `link` call and `tagFace` based on exactly this,
not a single unified "tag" action.

**`tagFace`'s write ordering, and its one unrecoverable-by-code failure
mode.** Order: (1) a local uniqueness precheck (`assertLinkable`, shared
with `link()`) before any remote write; (2) `POST /people` if the caller
picked "new person" rather than an existing cluster; (3) `PUT /faces/{id}`
— and note the endpoint name is misleading: confirmed directly against
Immich's server source (`FaceController`/`PersonService.reassignFacesById`),
the **path** parameter is the _person_ being assigned to and the _face_ id
goes in the request **body**, the opposite of what the OpenAPI schema names
alone suggest; (4) `link()` to record the mapping locally. If step 4 fails
after step 3 already succeeded, the face is tagged in Immich but not yet
linked here — visible and retryable from the same dialog, since the
Immich person id from step 2/3 is still known; there's no distributed
transaction across this app's Postgres and Immich's own database to make
that atomic.

**Re-scanning faces (Tools page), and why it can't be a single admin API
call.** Immich already queues its own face-detection job automatically
whenever an asset is ingested — nothing in `uploadAsset` triggers it, and
nothing needs to. The Tools page's "Re-scan for faces" action exists for
what that automatic pass misses: a photo added before face recognition was
enabled, or a face the first detection pass didn't catch. Immich's
library-wide manual job endpoint (`POST /jobs`, `ManualJobName`) is
admin-only and doesn't even list facial recognition among its allowed
values — the per-asset `POST /assets/jobs` (`AssetJobName: "refresh-faces"`,
not admin-gated) is the only way this app's own API key can force a
re-scan, so `ImmichService.rescanAllFaces` walks the whole library via the
same cursor-paginated `searchMetadata` every asset-listing method already
uses, then calls it in batches of 500 asset ids. It's a BullMQ job — a new
`immich-face-scan` queue, `ImmichFaceScanProcessor`, mirroring `backup`'s
queue+processor shape exactly — because a large library means many batched
requests. "Done" here means every asset has been resubmitted for
detection, not that detection itself has finished: that still runs
asynchronously in Immich's own `machine-learning` service, invisible to
this app, so the completion notification's wording says "requested" rather
than implying an instant result.

**Upload is disk-streamed, not buffered in memory, at both ends.**
`BackupController`'s pattern reused: `immich-asset.controller.ts`'s upload
route uses multer's `diskStorage`, not the `FileInterceptor` default of
memory storage, so `IMMICH_MAX_UPLOAD_BYTES` (50MB by default — sized for
flatbed scans of old photos, not phone snapshots) doesn't mean N concurrent
uploads each hold a full file in this process's memory during the inbound
parse. Forwarding it on to Immich still reads the file into memory once
(true zero-copy streaming would need the `form-data` package, since Node's
built-in `FormData`/`Blob` can't stream from a file path) — a bounded,
one-copy tradeoff judged reasonable at this app's scale rather than adding
a new dependency for it.

**Unlinking a face, directly from the photo viewer.** Previously the only
way to undo a wrong tag was a chip on the person's own Photos card
(`-immich-photos-card.tsx`) — clicking a "linked" face box in
`-asset-viewer.tsx` only navigated to the person. `FaceBoxOverlay`'s label
now gets a leading X (immediate, no confirmation — matches the Photos
card's own chip) for a linked box; needed no backend change at all, since
`facesForAsset` already returns `linkedPerson.linkId` for every linked
face. The box itself had to move from being the label's _parent_ `Button`
to a _sibling_ of it, inside a small positioned wrapper `<div>` — React
Aria doesn't allow nesting one interactive control inside another, and the
label now needs its own independently-clickable icon next to the box's own
click target.

**A real bug `unlink` had from day one, only exposed once unlinking became
reachable from the photo viewer**: `link()` best-effort renames the Immich
person cluster to the tree person's name (so Immich's own UI shows the
same name) — `unlink()` never had a mirror-image step to clear that name
back out. Confirmed live: unlink a face, and its box kept showing the
_previous_ person's name indefinitely, not a stale-cache appearance —
`facesForAsset`'s own response still had the old name in it. Fixed by
having `unlink()` look up the link's `immichPersonId` before deleting the
row, then best-effort `renamePerson(immichPersonId, "")` — same "never
blocks the operation itself" philosophy as `link()`'s own rename. An empty
Immich name means `FaceBoxOverlay` simply shows no label at all for that
box (`box.label && (...)`, and `""` is falsy) rather than a wrong one,
until it's relinked to someone.

**The "Link a face" picker not showing everyone — two causes, one fixable,
one not.** `ImmichService.listPeople` hardcoded `withHidden=false`,
silently excluding any Immich person marked hidden — changed to
`withHidden=true`. Separately, and confirmed live against the real
instance (`total: 7` in Immich's own response, only 5 people actually
returned, `hidden: 0`): Immich only lists a person via `/people` once it
has at least one detected face promoted to a distinct cluster — a real,
already-documented Immich limitation, not something excluding hidden
people touches, and not fixable from this app's side. Since Immich's
`/people` has no server-side name-search parameter at all (checked its
OpenAPI spec), `ImmichPersonPicker` was rebuilt around fetching everyone
in one call (`size: 1000`, Immich's own documented max) plus a client-side
name filter, replacing the old 24-per-page Prev/Next UX that made a real
person easy to miss even when technically reachable.

**Downloading a whole album, via Immich's own two-step archive API, not a
zip library in this app.** `POST /download/info` (`{ albumId }`) returns
one or more `{ assetIds, size }` groups — Immich splits into more than one
only if the total exceeds its own configured limit; `POST
/download/archive` (`{ assetIds, archiveName }`) streams back the actual
zip bytes. `ImmichService.downloadArchive` is a dedicated `fetch`, not
`request()` (always parses JSON) or `requestBinary()` (buffers the whole
response into a `Buffer`, fine for a thumbnail, not an album-sized zip) —
it hands back the raw body stream, and
`ImmichAssetController.downloadAlbum` pipes it straight to the response
via `Readable.fromWeb`. v1 scope, confirmed with the user up front: a
single zip only — if Immich ever reports more than one archive group for
an album (unusual at this app's scale), the route returns a clear error
rather than silently truncating or building multi-part download support.
The frontend proxy route for this one is the one place in the Immich proxy
set that has to forward the incoming query string (`?filename=`) onto the
target — every sibling thumbnail/preview/original proxy route drops it,
a known gotcha this one deliberately doesn't repeat.

**A second, headless dialog primitive, added to `packages/ui` rather than
duplicated in `apps/frontend`.** `TagFaceDialog` needed a controlled
dialog with no adjacent trigger button (it opens from clicking a face box
that lives on the photo itself, the same shape `ImageViewer` already
solved for the lightbox). Building that by hand a second time would have
meant `apps/frontend` importing `react-aria-components`/`motion` directly
for the first time, breaking the "the app only ever goes through
`@genealogy/ui`" convention — instead, `dialog.tsx`'s `DialogContent` was
split into a shared `DialogSurface` (the Motion/Modal/Dialog shell) plus a
new exported `ControlledDialogContent`, which `DialogContent` itself now
also delegates to.

**Album date, place, and tags (added 2026-09-28): a local table keyed by
Immich's album id, not pushed into Immich itself.** Immich's own album
object has no date/place/tag concept, and the user's actual problem — a
large pile of albums pulled in from different sources — is a local
organizing need, not something Immich's API could hold even if this app
wanted it to. `packages/db/src/schema.ts`'s `album_metadata` table follows
the same "plain `text` id, not a foreign key" convention
`immich_album_asset_order`/`person_immich_links` already established for
referencing Immich's own ids. `date`/`place` mirror `person_events`'
columns exactly (`jsonb` `HistoricalDate`, plain nullable `text`), so an
album gets the same "circa 1970s" wording a person's birth date does, for
free, via the existing `HistoricalDateInput`/`splitHistoricalDateText`/
`joinHistoricalDateText` machinery — moved from `people/-shared.tsx` into
`apps/frontend/src/lib/format-date.ts` once a route outside `people/`
needed it too, and re-exported from the old spot so every existing import
kept working unchanged.

**Tags are a plain `text[]` column, not a normalized tags/join-table
pair — a deliberate skip of the "more correct" relational design.** This
is a single-user app with at most a few thousand albums; `ImmichService
.listAlbums` fetches every Immich album and every `album_metadata` row in
two unfiltered calls and does all search/tag/place/date-range/"missing
info" filtering and sorting in plain TypeScript over the merged list,
rather than pushing any of it into SQL. A join table would only pay off at
a scale this app doesn't operate at, and would have meant two new tables
instead of one array column. `listAlbumTags` (`SELECT DISTINCT
unnest(tags)`, aggregated in TS since even that stayed simple enough not
to need a raw SQL `unnest`) feeds the tag autocomplete — see
`packages/ui/src/components/tag-input.tsx` (`TagInput`) below.

**`TagInput`: a new multi-value autocomplete built from two existing
pieces, not a new primitive from scratch.** No tag/chip picker existed
anywhere in `packages/ui` before this. Rather than hand-rolling one,
`TagInput` combines the existing `Autocomplete` component (already does
free-text-plus-suggestions) as the "add a tag" input with React Aria's own
`TagGroup`/`Tag` (available via `react-aria-components`, unused elsewhere
in this package until now) for the removable-chip row. `Autocomplete` only
ever reports every keystroke — it has no notion of "commit" — so `TagInput`
holds its own draft string and commits a chip on Enter or ",". One
component serves two different roles unchanged: assigning tags to an
album (`EditAlbumDialog`) and filtering the album grid by tag
(`AlbumGrid`'s Filters panel), just with different `value`/`onChange`
wiring. One non-obvious test-writing gotcha hit while covering it: React
Aria marks the rest of the page `aria-hidden` while a `ComboBox`'s
suggestion popover is open (so background content doesn't clutter the
accessibility tree) — a `getByRole` query for the tag chips fails while
that popover is still open even though the chips are still in the DOM and
in `value`; the test has to close the popover (`{Escape}`) first.

**Album zip downloads are queued (BullMQ) and delivered via notification,
not a synchronous request/response — the same shape `BackupService` already
uses, and for the same reason.** The old version streamed Immich's own
generated zip straight through one HTTP request and refused outright once
an album exceeded Immich's single-archive size limit ("too large to
download as a single file yet"). `AlbumZipService`
(`apps/backend/src/immich/album-zip.service.ts`) enqueues instead, and
**embraces** a large job producing multiple archives rather than refusing:
one `notifications.create` call per zip file Immich's own
`/download/info` splits a request into (confirmed live it accepts a plain
`assetIds` array, not just `albumId`), each with its own `actionUrl`. "One
album" and "every album in the library" (the Tools page's new "Download
all albums", next to "Backup database") turned out to be the same job with
a different asset-id set — `resolveJobScope(albumId?)` either fetches one
album's assets or unions every album's assets (deduped, since a photo can
be in more than one album), so there's exactly one code path for both. The
empty-album/empty-library check runs synchronously in the tRPC procedure,
before enqueueing anything — a job that fails after being queued has no
notification and thus fails silently (an existing, accepted gap in the
backup job too), so the one case that's cheap to check up front is checked
up front rather than left to that same silent failure.

**Internationalization: `i18next`/`react-i18next`, a per-request instance, and
a central error-translation tRPC link — not a shared singleton, and not
per-server-function try/catch.** Checked before adding: both packages had
releases within the last month at the time (actively maintained); no
`i18next-browser-languagedetector`, since the current language is
account-preference-driven, not `Accept-Language`-driven. Per the user's own
architectural call: the NestJS backend stays English-only forever, and every
message it sends is translated _in the frontend layer_.

- **A fresh `i18next` instance is created per SSR request**
  (`apps/frontend/src/i18n/create-i18n-instance.ts`'s `createI18nInstance`),
  not a shared module-level singleton — this codebase already hit the exact
  failure mode a shared instance would reintroduce: `trpc-proxy-client.ts`'s
  own comment documents a prior live bug where a module-level singleton
  reading per-request state (the auth cookie) leaked one request's value into
  a concurrent request's response, because one Node process serves many
  users at once. The client bundle still only ever needs one instance per
  page load (`RootComponent`'s `useState(() => createI18nInstance(language))`
  lazy initializer, created once and mutated in place by `i18n.changeLanguage()`
  from the profile page's language switcher).
- **The language preference lives on the account**
  (`userProfiles.language`, nullable `text`, no default — absence resolves to
  `"en"` at the read layer, mirroring the existing `phoneNumber` column's
  convention), not just a cookie, per the user's explicit choice. A `lang`
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
  This required moving `@trpc/server` from `apps/frontend`'s `devDependencies`
  to `dependencies`, since `@trpc/server/observable` (used to build the link)
  is now a real runtime import, not just a type.
- **Danish free-text date parsing is real parser logic, not translated
  labels.** `packages/core/src/historical-date.ts`'s quality-word regexes
  (`approximate`/`before`/`after`/`between`/`fromTo`) and month-name tables
  are now keyed by a `language: Language = "en"` parameter threaded through
  every exported function, with parallel `EN`/`DA` `DateLanguage` tables
  (`LANGUAGES: Record<Language, DateLanguage>`). GEDCOM (`packages/core/src/
  gedcom.ts`) deliberately stays English-only regardless of UI language — its
  own date grammar is fixed by the GEDCOM 5.5.1 spec, not this app's locale,
  and it has its own separate `GEDCOM_MONTHS` table untouched by this change.
- **Format-date helpers stay plain functions with a `language` parameter, not
  hooks** (`apps/frontend/src/lib/format-date.ts`) — a deliberate deviation
  from calling them "thin hooks," since they're also called from non-component
  call sites like a `@tanstack/react-table` cell renderer in `people/index.tsx`,
  which can't call a hook.
- **Deliberately out of scope for this pass** (not yet re-litigated, just not
  attempted): `packages/ui`'s own components keep their internal default
  copy in English (only strings passed in from call sites are translated);
  configurable-options values (event types, confidence levels, etc.) are
  never translated, since they're user-authored data via the Settings page,
  not app strings — the same reasoning as "Configurable dropdown options, not
  hardcoded enums" above; better-auth's own auth-flow error messages stay
  English, since that's a separate flow from the tRPC error-translation link;
  and the dev-only `/dev/components` showcase page is untranslated.

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
- **GEDCOM import and export (Tools page).** The domain
  model was already shaped for this — `HistoricalDate` keeps the source's
  own wording, and `gender` uses the GEDCOM vocabulary — and export
  (`apps/backend/src/gedcom/gedcom.service.ts`) builds on both directly.
  `GedcomService.exportAll()` pulls every `persons`/`personNames`/
  `personEvents`/`unions`/`sources`/`citations` row plus every `PARENT_OF`
  edge (`allParentOfEdges` in `packages/db/src/graph.ts`, added alongside
  `allPersonNodeIds` for the two-store consistency checker — nothing before
  either listed the _whole_ graph unfiltered) in a handful of queries, no
  BullMQ job: a GEDCOM file is plain text, small enough at this app's scale
  to build and return within one request, unlike `pg_dump`'s streamed
  binary.
  - Date parsing/display (`packages/core/src/historical-date.ts`) is a
    first pass at the wordings this app's own fields produce — exact
    day/month/year, month/year, bare year, ISO `YYYY-MM-DD`/`YYYY-MM`,
    abt/bef/aft qualifiers, and `BET ... AND ...`/`FROM ... TO ...` ranges —
    not the full GEDCOM date grammar (no double-dating, no calendar
    escapes). `packages/core/src/gedcom.ts`'s `toGedcomDate` re-runs the
    same `parseHistoricalDateDetailed` this app already uses for
    display/sorting (not a second parser) and maps the result onto GEDCOM's
    `ABT`/`BEF`/`AFT`/`BET ... AND ...` grammar; an unparsed date falls back
    to the original wording verbatim rather than dropping it.
  - **A real bug caught by live-testing against the real environment, not
    just typechecking**: a GEDCOM pointer used as a line's _value_ (`1 HUSB
    @I7@`) needs `@...@` wrapping distinct from `GedcomWriter.line`'s own
    `xref` parameter, which is only for a record's _own_ declaration line
    (`0 @I1@ INDI`) — conflating the two produced a bare `1 HUSB I7`
    (invalid GEDCOM) instead of a real pointer. Fixed with a dedicated
    `gedcomPointer(xref)` helper, used everywhere a `HUSB`/`WIFE`/`CHIL`/
    citation-`SOUR` line references another record.
  - **GEDCOM 5.5.1's `FAM` record has only `HUSB`/`WIFE` slots**, no third
    "parent" tag — assigned by `gender` where it decides (a lone mother
    goes in `WIFE`), by a stable id order when it doesn't; two
    `U`/same-gender parents can't be represented more precisely in 5.5.1.
    (Until 2026-10-06 the code only ever used id order, despite this note
    saying gender — see `assignParentSlots`.) A child with more than two
    parents (birth _and_ adoptive) is split into one FAM per parentage pair.
  - **Each `unions` row is its own FAM.** Children are linked to a parent
    _pair_ via `PARENT_OF` edges, not to a specific union, so a couple who
    divorced and remarried gets their children on the earliest union's FAM
    and a second, childless FAM for the later marriage — both marriages'
    dates survive instead of collapsing into one. A `SPOUSE_OF` edge with
    no union and no shared children still gets a bare `HUSB`/`WIFE` FAM.
  - **Interoperability fixes (2026-10-06):** the header now has the
    `DATE`, `SUBM` record (the exporting user's name) and `GEDC.FORM
    LINEAGE-LINKED` that 5.5.1 requires; every INDI carries `FAMC`/`FAMS`
    back-links; events use their own tag where GEDCOM has one
    (`gedcomEventTag` in core — the reverse of the importer's table, so
    the two can't disagree) and `EVEN` + `TYPE <option label>` otherwise;
    parentage goes on `INDI.FAMC.PEDI` when both parents share one of
    5.5.1's four values, and as Ancestry/FTM's per-parent `_FREL`/`_MREL`
    under `CHIL` otherwise (it used to be a non-standard `CHIL.PEDI`,
    with one value for both parents); confidence is `QUAY` 0–3 for the
    four seeded levels; repositories are real `REPO` records.
  - **This app's own fields with no 5.5.1 home travel as underscore
    tags**, which other programs ignore and the importer reads back — so
    export → import is lossless for everything GEDCOM is meant to carry:
    `_STAT` (union status beyond married/divorced/annulled), `_END` (a
    union ending that isn't a divorce/annulment), `_DETAIL` + `TYPE`
    (event details without a standard sub-tag; occupation/employer/
    address/cause of death use `OCCU`'s value/`AGNC`/`ADDR`/`CAUS`),
    `NAME._DATE` (name-variant "since"), `_VOLUME`/`_ENTRY`/`_CERT`
    (citation fields), and `SOUR._TYPE` (source type). Verified live by
    importing a file exercising each of these, exporting it, and diffing
    the re-parsed plan against the original: no differences.
  - **A family (or `HUSB`/`WIFE`/`CHIL` reference) that resolves to a person
    id with no matching `persons` row is dropped, not emitted as a
    malformed pointer.** This surfaced real graph/Postgres drift in the
    live environment during testing (a `PARENT_OF` edge pointing at a child
    id no `persons` row matched) — exactly the class of problem the
    two-store consistency checker (below) exists to report on its own,
    rather than only being noticed as a side effect of exporting.
  - Deliberately out of scope: no `OBJE` (photo) records (Immich-hosted
    photos aren't portable outside this app, and `persons.photoPath` local
    uploads have no externally resolvable URL); no `researchNotes`/
    `userNotes` (app-specific, not part of GEDCOM's model). Notes are
    exported as their raw markdown — readable as plain text, but other
    programs show the `**`/`#` markup literally.
  - **A second real bug caught only by exporting live data, and it wasn't
    in the exporter**: `cypher()` (`packages/db/src/age.ts`) spliced its
    result columns into `AS (childId ag_catalog.agtype, ...)` unquoted, and
    Postgres folds an unquoted identifier to lower case — so every
    camelCase column (`allParentOfEdges`' `parentId`/`childId`,
    `parentsOfMany`'s `childId`) came back keyed `childid` and decoded as
    `null`. The export silently wrote no `FAM` records at all, and the
    People list's Parents column got nothing to group by. Fixed at the root
    by double-quoting each column (safe — `assertIdentifier` already limits
    them to `[A-Za-z0-9_]`), with a regression test in `age.test.ts`.
    Single-word lower-case columns (`p`, `id`, `count`) were never
    affected, which is why most graph reads looked fine.
  - A third export bug the import round trip exposed: a non-vital event's
    `DATE`/`PLAC`/`NOTE`/`SOUR` were written at level 3, nested under
    `2 TYPE` instead of beside it under `1 EVEN` — other programs read that
    as an undated event. Now level 2.
- **GEDCOM import: preview, then add everyone as new people.** The
  decision that shaped it: **no person matching.** Deciding whether an
  incoming "Peder Sørensen b. 1801" is the "Peder Sørensen" already in the
  tree, and then merging names/events/relationships/citations, is a much
  bigger problem than reading the file — so import never attempts it.
  Every INDI becomes a new person; the preview step lists incoming people
  whose normalized given+surname matches an existing person (the same rule
  `IntegrityService`'s possible-duplicates check uses, so the two agree),
  and resolving them is left to the user — today by hand, later via the
  planned duplicate-detection/merge feature in FEATURES.md.
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
    UTF-8 (BOM or not) and UTF-16 are recognized; anything that isn't
    valid UTF-8 falls back to Windows-1252 with a warning. ANSEL (GEDCOM
    5.5's own legacy charset) has no `TextDecoder` and isn't decoded — a
    file that declares it and contains non-ASCII gets a warning instead.
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
    lines, unparsed dates (wording kept, bounds null — `@#DJULIAN@` and
    other calendar escapes land here), pointers to missing records, a
    second birth/death (kept as an `"other"` event), inline source
    citations (each becomes a source), source `NOTE`/`TEXT` (`sources` has
    no column for it), and every tag the importer doesn't read, tallied by
    `PARENT.CHILD` path (`INDI.OBJE`, `PLAC.MAP`, `REPO.WWW`, ...).
    **That tally covers nested structures too** — PLAC, ADDR, a citation's
    DATA, FAMC, CHIL, REPO/NOTE records — because the first version only
    checked each record's and event's direct children, so place
    coordinates, structured addresses, citation dates, repository details
    and `FAMC.STAT` all vanished without a trace (found 2026-10-06 by
    reviewing the importer against the 5.5.1 spec, not by a bug report).
    Only change stamps, record ids and submitter links are skipped without
    a warning; `_FSFTID` (FamilySearch person id) was on that list by
    mistake and is now reported.
  - **What the preview made un-silent, it also partly recovers:**
    structured ADDR lines (ADR1…CTRY) are joined when ADDR's own value is
    empty; a citation's `DATA.DATE` becomes a "Recorded: …" line in its
    note; family events beyond a union's one start and one end (an ENGA
    before the MARR, banns, a second MARR from another source) and any
    TYPE/ADDR/AGE/AGNC/CAUS on the start/end become lines in the union's
    notes; a `FAMC.STAT disproven` link is not created (the file asserts
    the opposite), a `challenged` one is created and flagged. Still
    reported-only, pending data-model decisions: external ids
    (`_FSFTID`, `REFN`, `_APID`), repository contact details and call
    numbers, media.
  - **Built 2026-10-06** — the data the importer used to only report,
    each a data-model decision made up front:
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
      check now reports dangling association citations too.
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
      research notes now round-trip — they used to be out of export's
      scope entirely.
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
  - `resolveDate` in `PersonService` unconditionally recomputes
    `earliest`/`latest` from `original` on every write (person birth/death,
    event dates, union start/end dates) as an idempotent backstop, since the
    frontend now sends its own freshly-computed bounds on every save too —
    both sides call the same parser, so they can't disagree.
    `packages/db/scripts/backfill-historical-dates.ts` is a one-off,
    not-wired-into-`db:migrate` script for re-resolving already-stored rows
    after a parser change; not something the GEDCOM exporter needs to care
    about, since it reads whatever `original` currently holds.
- **Data integrity checks and the two-store consistency check (Tools
  page).** Both live in `apps/backend/src/integrity/` (`IntegrityService`),
  report-only for this first pass — no auto-fix, an admin judges each
  finding, same reasoning as GEDCOM export shipping without import first.
  - `checkData()`: dangling citations (a `citations.factId` pointing at a
    since-deleted `personNames`/`personEvents`/`unions` row — the schema's
    own comment says the app, not the database, is responsible for
    clearing these, since Postgres can't cascade a polymorphic foreign
    key), possible duplicate people (same normalized given+surname, grouped
    in JS rather than SQL — simpler at this app's scale than a `GROUP BY`
    plus a second lookup), and dangling Immich links (via a new
    `ImmichService.listDanglingLinks()`, reusing `getPerson`'s own
    fails-open check but surfacing it instead of swallowing it — this is
    exactly what caught the second Immich bug documented above).
  - `checkGraphConsistency()`: diffs every `persons.id` in Postgres against
    every `Person` node id in the Apache AGE graph
    (`allPersonNodeIds`/`allParentOfEdges` in `packages/db/src/graph.ts` —
    added alongside the GEDCOM exporter's own bulk graph read, since nothing
    before either listed the _whole_ graph unfiltered). **Caught a real,
    if transient, false positive during testing**: `GedcomService.exportAll`
    and this checker each run their Postgres/graph reads as separate
    unsynchronized queries, not one consistent snapshot, so a person created
    concurrently between two of those reads can appear in one but not the
    other — not persistent drift, just a point-in-time skew, resolved by
    the time either was re-run. Judged not worth wrapping in a transaction
    for a single-family, low-write-concurrency app; both call sites note it.
- **Restore from backup (Tools page), and the Apache AGE limitation that
  shaped it.** The plan going in was simple: add `--clean --if-exists` to
  the existing `pg_dump` call so the dump is self-contained, then restore is
  just `gunzip | psql`. **Live-testing against the local sandbox database
  (never the real environment) found this doesn't work**: Apache AGE
  installs an event trigger that refuses _any_ plain DDL against its own
  internal label tables (`family_tree._ag_label_vertex`/`_ag_label_edge`) —
  even `DROP TABLE IF EXISTS` — with `ERROR: table "_ag_label_vertex" is
  for label "_ag_label_vertex"`. A `--clean` dump of the whole database
  replays fine for every ordinary table, then fails outright the moment it
  reaches the graph's own tables, partway through a restore.
  - The fix: `BackupService.dumpTo` now runs **two** `pg_dump` invocations,
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
    `RESTORE_MAX_UPLOAD_BYTES` cap) — backups still self-delete after one
    download, unchanged.
- **Media and document storage.** No object store is wired up.
- **Deployment target and CI.** `pnpm check && pnpm test` is the intended gate;
  no pipeline is defined.
