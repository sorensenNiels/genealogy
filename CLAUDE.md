# CLAUDE.md

Guidance for Claude Code when working in this repository. The rules for how an
agent works here — git, package manager, the disposable database — are in
AGENTS.md, imported here so they always load:

@AGENTS.md

## What this is

A genealogy application: people, the relationships between them, and the sources
that evidence both. Built as a pnpm + Turborepo monorepo. `apps/` holds runnable
applications, `packages/` holds the libraries they share.

This codebase is written by Claude with human review. Optimise for a reviewer:
explain _why_ in comments where the reason is not obvious from the code, and keep
decisions recorded in [TECH_STACK.md](TECH_STACK.md) rather than only in a commit
message.

## Working environment

Everything runs inside the VS Code dev container. **Node is not installed on the
host** — never try to run `pnpm`, `node` or `tsc` outside the container. If you
are operating from the host, shell into it:

```bash
devcontainer exec --workspace-folder . bash -lc "<command>"
```

**`docker` inside the dev container drives the host's Docker** (the
`docker-outside-of-docker` feature), so `docker compose ...` and `make db-up`
from in here manage the same containers as on the host — including the `db`
service holding the dev data. `docker compose down -v` or `make db-reset`
destroys that data — ask first (see "Database" in AGENTS.md). Bind mounts in
`docker-compose.yml` are resolved on the host, so they use
`${LOCAL_WORKSPACE_FOLDER:-.}` (set in `devcontainer.json`) rather than a bare
`./` path. Inside the container, Postgres is reached at `host.docker.internal`
(`DATABASE_URL`/`PGHOST` already point there).

See [DEVELOPMENT_ENVIRONMENT.md](DEVELOPMENT_ENVIRONMENT.md) for the full setup.

## Commands

| Command                       | What it does                                                              |
| ----------------------------- | ------------------------------------------------------------------------- |
| `pnpm dev`                    | Backend (:3000), frontend (:5173), and package watchers                   |
| `pnpm build`                  | Build every package and app, in dependency order                          |
| `pnpm check`                  | `format:check` + `lint` + `typecheck` — the gate to pass before finishing |
| `pnpm test`                   | Vitest across the workspace                                               |
| `pnpm lint` / `pnpm lint:fix` | oxlint                                                                    |
| `pnpm format`                 | oxfmt, writes in place                                                    |
| `pnpm db:generate`            | Generate a Drizzle migration from `packages/db/src/schema.ts`             |
| `pnpm db:migrate`             | Apply pending migrations                                                  |
| `pnpm db:studio`              | Drizzle Studio                                                            |

Run `pnpm check` and `pnpm test` before reporting work as done. The Makefile
mirrors most of these under slightly different names (`make fmt`,
`make db-generate`, …) — note `make lint` applies fixes, unlike `pnpm lint` —
and adds `db-up`/`db-reset`/`redis-up` for the containers; `make help` lists
them.

## Layout

```
apps/backend      NestJS 12 on Express, exposing a single tRPC router at /trpc
apps/frontend     TanStack Start — renders every page (SSR + client), on
                  React + TanStack Router/Query/Table/Form, shadcn/ui
packages/core     Framework-free domain model (people, dates, relationships)
packages/db       Drizzle schema + the Apache AGE (Cypher) access layer
packages/ui       shadcn/ui components and the shared Tailwind theme
```

Dependency direction is one-way: `frontend → ui → (nothing)`, `frontend → core`,
`backend → db → core`. `apps/frontend` never touches `packages/db` — it has no
database access at all. Its server side (`apps/frontend/src/server/`) is a proxy:
every server function calls apps/backend's tRPC router over HTTP through a
server-side vanilla client (`server/trpc-proxy-client.ts`), forwarding the
browser's session cookie so apps/backend's own `protectedProcedure`/auth
gating runs unmodified. `AppRouter` is imported from the backend **as a type
only**; never import backend runtime code into `apps/frontend`.
This is why the browser only ever has one origin (`apps/frontend`'s) for both
pages and auth — see "The proxy architecture" below for what that
buys and what to watch for when extending it.

## Conventions that will bite you

**Never let a route file be empty while `pnpm dev` runs.** TanStack Start's
route generator watches `apps/frontend/src/routes/` and replaces any route
file it sees empty with a placeholder ("Hello /…"). An edit that truncates
then rewrites a file (a script's `open(path, "w")`, a shell `>` redirect) can
hit that instant and lose the whole file — it happened to
`people/$personId.tsx`. Write route files atomically: a temp file in the
same folder with a `-` prefix (which the generator ignores), then rename it
over the original. After bulk edits or `pnpm format`, check with
`grep -rln 'Hello "/' apps/frontend/src/routes`.

**Every procedure is gated by role.** `protectedProcedure` is any signed-in
member (reads, and their own notes/notifications/profile), `editorProcedure`
any change to the tree or photos, `adminProcedure` members, Settings, Tools,
merging and deleting (`apps/backend/src/trpc/trpc.base.ts`). Pick one for
every new procedure — a mutation on `protectedProcedure` lets a Viewer write.
A read that returns person data goes through `PersonRedactor`
(`apps/backend/src/privacy/`), so Viewers see living people by name only; a
REST controller uses `requireRole`. In the UI, wrap a page in
`ReadOnlyProvider` for a Viewer and gate anything the scope can't see (plain
buttons, drag handlers) with `usePermissions()`.

**The whole monorepo is ESM.** NestJS 12 ships ESM-only, so there is no CJS half.
Relative imports in Node-targeted packages (`core`, `db`, `backend`) must carry an
explicit `.js` extension — `import { x } from "./thing.js"` — even though the file
is `thing.ts`. The frontend and `ui` use bundler resolution and omit extensions.

**TypeScript is pinned to 6.x, not 7.** TypeScript 7.0 ships the `tsc` executable
only and drops the programmatic compiler API that `nest build` and `nest start`
call into. Do not bump `typescript` in the catalog until 7.1 restores it.

**Third-party versions live in one place.** `pnpm-workspace.yaml` holds a
`catalog:`; package manifests depend on `"catalog:"` rather than a literal range.
Add a new dependency by adding it to the catalog first.

**`consistent-type-imports` is off for `apps/backend`.** NestJS constructor
injection reads `design:paramtypes` emitted by `emitDecoratorMetadata`. Rewriting
an injected dependency to `import type` erases it and breaks DI at runtime with no
compile error.

**Nest module classes are empty by design**, so `no-extraneous-class` is off for
the backend too.

## The two-store model

Relational records (people, sources, citations) live in ordinary Postgres tables
via Drizzle. Relationships (`PARENT_OF`, `SPOUSE_OF`) live as edges in an Apache
AGE graph. Both sit in the same database and share one connection pool, so a write
can span them in a single transaction — use `inGraphTransaction` from
`@genealogy/db` whenever you touch both, or the two halves will drift.

Things to know before writing graph code:

- The graph is named **`family_tree`**, not `genealogy`. `create_graph()` makes a
  schema of the same name, and both the database and the role are called
  `genealogy` — a graph of that name would create a `genealogy` schema that the
  default `"$user"` search path resolves to ahead of `public`, silently diverting
  every `CREATE TABLE` into it.
- `search_path` is `public, ag_catalog`, in that order, and every AGE reference in
  `packages/db` is fully qualified (`ag_catalog.cypher`, `ag_catalog.agtype`). Do
  not reorder it to put `ag_catalog` first, as AGE's own docs suggest.
- AGE parses the graph name, query body and result column list at plan time, so
  **none of them can be bound parameters** — they are spliced into the SQL.
  Treat the Cypher text as code and pass every user-supplied value through
  `params`. `cypher()` guards this, and the guards are unit-tested; don't
  route around them.
- Every connection needs `LOAD 'age'` before it can parse `agtype`. `cypher()`,
  `withGraphClient` and `inGraphTransaction` handle this; raw `pool.query` does not.
- Variable-length traversals are depth-capped on purpose. A badly-sourced tree can
  record someone as their own ancestor, and an unbounded match never returns.

## The proxy architecture

The decision that shapes `apps/frontend`: **apps/backend keeps sole ownership of
the database** — its tRPC procedures, auth, and the two-store model above all
live there. `apps/frontend`'s server side exists only to give the browser a single origin;
it is a thin, mechanical proxy, not a second place business logic can live.

Concretely:

- `apps/frontend/src/server/trpc-proxy-client.ts` is one server-side tRPC vanilla
  client (`@trpc/client`, not `@trpc/tanstack-react-query`) pointed at
  apps/backend's `/trpc`. Its `fetch` override forwards the incoming request's
  `cookie` header — that's the entire auth story on apps/frontend's side; there is no
  session check of its own, because apps/backend's `protectedProcedure` still
  runs the real one.
- `apps/frontend/src/routes/api/auth/$.ts` is a raw byte-for-byte pass-through of every
  `/api/auth/*` request to apps/backend's better-auth handler — method, headers,
  body, and critically the response's `Set-Cookie` — untouched. better-auth's
  session logic, Google OAuth flow, and cookie issuance all still run in Nest.
- `apps/frontend/src/routes/api/people/$id/photo.ts` does the same for photo
  upload/delete, as a Start **API route** (`server.handlers`), not a
  `createServerFn` — `createServerFn` buffers the entire multipart body into
  memory with no streaming (an open, unaddressed upstream limitation), which a
  raw route sidesteps since it forwards the request unparsed.
- Uploaded-photo `<img>` reads are the one deliberate exception: they point
  directly at apps/backend (`publicBackendUrl` in `lib/env.ts`, the
  `VITE_`-prefixed, client-bundle-visible counterpart of the server-only
  `backendUrl` in `server/env.ts`) rather than through a proxy route, because a
  plain `<img src>` isn't subject to CORS regardless and the endpoint is
  already unauthenticated. Don't add a proxy for this unless it turns out to
  matter — it hasn't.
- `server/env.ts` (`backendUrl`, `process.env`-based) and `lib/env.ts`
  (`publicBackendUrl`, `import.meta.env`-based) are deliberately separate
  files. Don't merge them: anything in `lib/env.ts` can end up in the client
  bundle, where `process` doesn't exist.

**Adding a new piece of data to a page in `apps/frontend` is a two-step, not a
one-step, change**: add or reuse the procedure on apps/backend, then add a
matching `createServerFn` wrapper in `apps/frontend/src/server/functions/
<domain>.functions.ts` (grouped by domain — `person`, `source`,
`settings`, `immich`, `gedcom`, ...) that calls it through `trpcProxy` —
queries use `{ method: "GET" }`, mutations `{ method: "POST" }`, and the
`.validator()` should reuse a real Zod schema from `@genealogy/core` wherever
one already exists rather than hand-rolling a new one. Call the server function
from the route component with plain `useQuery`/`useMutation` — there is no
`useTRPC()` hook in `apps/frontend`, and no shared typed router object the way
`AppRouter` gives the backend; each server function is an independently
imported function, grouped into files by domain purely as a convention.

## Recommending or adding a library

Before suggesting a third-party package — in conversation or in code — check
that it is actually maintained: look at its npm page for the last publish date
and its repository for the last commit/release and how open issues/PRs are
being handled. Say what you found (e.g. "last released 14 months ago, still
getting patch releases" vs. "no commits in 8 years") rather than presenting the
suggestion as settled fact. Treat a package with no meaningful activity in the
last year or two as a real risk to name explicitly, not a detail to omit — this
matters more than usual here because this codebase is written by an agent, so a
plausible-sounding but abandoned dependency can otherwise slip in unchallenged
(this is why `react-family-tree`, dead for 8 years, was almost adopted for the
tree view). This applies to every recommendation, not just the one that
prompted it.

## Adding to the stack

- A new tRPC procedure: add it to a feature router (e.g.
  `apps/backend/src/person/person.router.ts`), which is built by a method, not a
  field initializer — class fields run before the constructor body, so `this`
  dependencies would be undefined. Then wire it into `apps/frontend` per "The proxy
  architecture" above — a procedure with no matching server function is unusable
  from any page.
- A new shadcn component: `pnpm dlx shadcn@latest add <name>` from
  `packages/ui` puts the Base UI primitive in `components/ui/` — vendor code,
  never edited by hand, skipped by lint and format. Then build or extend the
  component the app actually imports in `components/<name>.tsx`, composing
  the primitive into an app-level API (`apps/frontend` may not import
  `components/ui/*` — lint enforces it). See "shadcn/ui on Base UI" in
  [TECH_STACK.md](TECH_STACK.md); the move from React Aria is in progress, and
  React Aria stays for the grid/drop zone/tag group/calendar. Add a demo
  section for it to `apps/frontend/src/routes/dev.components.tsx` (the
  component showcase, linked from Tools → Development tools on localhost) — every
  component in the package gets one there, so both themes can be checked at a
  glance without hunting for a real page that happens to use it. If it has any
  real interaction (opens, selects, toggles), add a `<name>.test.tsx` next to
  it that drives it with Testing Library and `user-event`. A visual demo
  doesn't catch a dropdown that silently stopped opening; a test that drives
  it like a user does, does.
- A new hook shared across the frontend: `packages/ui/src/hooks/`, following
  `use-theme.ts`. Exported via the `@genealogy/ui/hooks/*` alias already
  configured in `components.json`. Since it now also renders under `apps/frontend`'s
  SSR, it cannot touch `window`/`document`/`localStorage` during the initial
  render — read them in a `useEffect` (client-only, never runs during SSR) and
  start state from a placeholder instead, the way `use-theme.ts` does.
- A new route: create a file under `apps/frontend/src/routes/`. `routeTree.gen.ts`
  is generated by `@tanstack/react-start`'s own Vite plugin as a side effect of
  `vite dev`/`vite build` (not a separate CLI step) and is not committed — run
  `pnpm --filter @genealogy/frontend dev` or `... build` at least once after adding
  a route file if `typecheck` complains it can't find `./routeTree.gen`.
- A schema change: edit `packages/db/src/schema.ts`, then `pnpm db:generate` and
  `pnpm db:migrate`. If the change adds people, remember the matching graph node.
  The migration only has to work on an empty database — no backfills (see
  "Database" in AGENTS.md).
- **A dropdown or radio group with a closed set of choices: never a static
  `z.enum([...])`/Postgres `pgEnum`.** Add a topic to `configurableOptions`
  instead (`packages/db/src/schema.ts`), seed it in the migration, and add its
  key to `configurableTopicSchema` in `packages/core/src/configurable-options.ts`
  — see "Configurable dropdown options, not hardcoded enums" in
  [TECH_STACK.md](TECH_STACK.md) for the full shape (`topic`/`key`/`label`/
  `sortOrder`/`isProtected`) and the existing topics to follow as
  examples. The field that stores the choice is plain `text`, not an enum
  column — enums require a migration to add a value, which defeats the point.
  Fetch options for the UI via the `listOptions` server function
  (`apps/frontend/src/server/functions/settings.functions.ts`) and look up display
  labels with `labelFor`/`optionsFor` from `apps/frontend/src/lib/
  person-display.tsx`, rather than a hardcoded `Record<Type, string>` label
  map — `selectOptionsFor(options, topic)` there hands a topic straight to a
  `Select`'s `options`. The only exception is a field that's genuinely structural — code
  branches on the exact value in a way a runtime-editable list can't safely
  support (`citationFactType`, `gender`) — and even then, prefer tying it to the
  database if there's any real doubt; ask rather than assume it's structural.
- **A Save/Add button that submits a form: always `SaveButton`**
  (`@genealogy/ui/components/save-button`), never a bare `Button
  type="submit"`. It shows a small red dot once the form is dirty, and swaps
  the dot for a spinner (and disables the button) while the save is in
  flight — one look everywhere, first built for the person-details Save
  button. Pass `isDirty`/`isPending` from the TanStack Form instance driving
  the form via `useFormDirtyPending(form)`
  (`@genealogy/ui/hooks/use-form-dirty-pending`), which reads `isDirty` and
  `isSubmitting` off its store — `isSubmitting` covers a multi-mutation
  `onSubmit` correctly, a single mutation's own `isPending` doesn't. If a
  Select or other picker for the form lives in its own `useState` instead of
  a `form.Field` — which several person-page forms do, for a dropdown backed
  by `configurableOptions` — the form's `isDirty` won't see a change to it;
  OR in a manual comparison against that state's initial value, the way
  `NameForm` (`routes/people/-alternate-names.tsx`) and `EventForm`
  (`-event-form.tsx`) do. A
  form with no TanStack Form at all (`CitationForm`) snapshots its `useState`
  fields once on mount and compares against that snapshot instead — see its
  comment for why a `useState` snapshot is used there rather than a `useRef`
  (reading `ref.current` during render is an oxlint error). Extra disable
  conditions (a required field, an incomplete sub-form) go through
  `SaveButton`'s own `disabled` prop, which is OR'd with `isPending`, not a
  separate check bypassing the component. The only forms exempt from this are
  ones with no clean/dirty baseline to compare against — sign in/sign up
  (`login.tsx`) — which stay plain `Button`s.
- **A notes field: always `MarkdownEditor` for editing, `MarkdownContent` for
  read-only display** (`@genealogy/ui/components/markdown-editor` /
  `markdown-content`), never a plain `Input`/`Textarea` or raw text
  interpolation. The field itself stays plain `text` in the schema — the
  markdown is just the convention for what that text contains, the same way a
  configurable-options key is "just text" until the app agrees what it means.
  See "Markdown notes" in [TECH_STACK.md](TECH_STACK.md) for why MDXEditor was
  picked over Tiptap. `MarkdownEditor` is SSR-unsafe (Lexical touches
  `contentEditable` at mount) and follows the same placeholder-then-swap
  pattern as `use-theme.ts`, so it's already safe to drop into any form
  without extra guarding.
