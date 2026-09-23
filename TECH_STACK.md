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
(person/name/event/union) and `sex` (M/F/U) are structural — code branches on
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

**Immich runs in `docker-compose.yml`, but behind a `profiles: ["immich"]`
gate**, not in the default `docker compose up`. It's a 4-container stack of
its own (Postgres w/ pgvecto.rs, Redis, the app server, a machine-learning
service for face detection) at maybe 6-8GB of RAM for the ML container
alone — a cost nobody should pay just to run this app's own tests or work
on an unrelated page. `docker compose --profile immich up -d` opts in.
Versions are pinned to the exact v3.2.2 image digests from Immich's own
release, not `:release`, for the same reason the rest of this repo pins
versions in the catalog rather than a floating range. Because the compose
file already runs this app's own Postgres as `db`/`redis` would collide by
name with Immich's defaults, the containers are named `immich-db` /
`immich-redis` with `DB_HOSTNAME`/`REDIS_HOSTNAME` overridden to match —
Immich's own compose file assumes service names `database`/`redis`, which
would silently point it at nothing (or at this app's own Postgres) if left
unchanged.

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

**Picking a person's profile photo from Immich was deliberately deferred**,
not forgotten: the local-disk upload path (`### Photo uploads` above) is
untouched, and linking a face is step one on its own before "use one of
these linked photos as the header portrait" is worth building — confirmed
with the user as a fast-follow rather than part of this version.

**One real gap found during live verification, not a code defect:**
Immich's `GET /people` only lists a "person" once it has at least one
detected face — a person record with photos uploaded but no face ever
recognized in them (a scanned photo where faces are too small, or a group
photo Immich hasn't finished processing) simply won't appear to link
against yet. That's Immich's own indexing behavior, confirmed directly
against its API rather than assumed, and there's nothing to fix on this
app's side — it just means "no faces found yet" is a real, expected empty
state, not always a config problem.

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
- **GEDCOM import and export.** The domain model is shaped for it —
  `HistoricalDate` keeps the source's own wording, and `sex` uses the GEDCOM
  vocabulary — but no importer/exporter exists. Date parsing/display
  (`packages/core/src/historical-date.ts`) is a first pass at the wordings
  this app's own fields produce — exact day/month/year, month/year, bare
  year, ISO `YYYY-MM-DD`/`YYYY-MM`, abt/bef/aft qualifiers, and `BET ... AND
...`/`FROM ... TO ...` ranges — not the full GEDCOM date grammar (no
  double-dating, no calendar escapes). `resolveDate` in `PersonService`
  unconditionally recomputes `earliest`/`latest` from `original` on every
  write (person birth/death, event dates, union start/end dates) as an
  idempotent backstop, since the frontend now sends its own freshly-computed
  bounds on every save too — both sides call the same parser, so they can't
  disagree. `packages/db/scripts/backfill-historical-dates.ts` is a one-off,
  not-wired-into-`db:migrate` script for re-resolving already-stored rows
  after a parser change; not something a future GEDCOM importer needs to
  care about, since it would supply its own bounds from the fuller grammar
  it reads.
- **Media and document storage.** No object store is wired up.
- **Deployment target and CI.** `pnpm check && pnpm test` is the intended gate;
  no pipeline is defined.
