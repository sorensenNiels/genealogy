# CLAUDE.md

Guidance for Claude Code when working in this repository.

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

Run `pnpm check` and `pnpm test` before reporting work as done. A `make` target
exists for each of these if you prefer (`make check`, `make dev`, …).

## Layout

```
apps/backend      NestJS 12 on Express, exposing a single tRPC router at /trpc
apps/frontend     Vite + React + TanStack Router/Query/Table/Form, shadcn/ui
packages/core     Framework-free domain model (people, dates, relationships)
packages/db       Drizzle schema + the Apache AGE (Cypher) access layer
packages/ui       shadcn/ui components and the shared Tailwind theme
```

Dependency direction is one-way: `frontend → ui → (nothing)`, `frontend → core`,
`backend → db → core`. The frontend imports `AppRouter` from the backend **as a
type only**; never import backend runtime code into the frontend.

## Conventions that will bite you

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
  dependencies would be undefined.
- A new shadcn component: `pnpm dlx shadcn@latest add <name>` from `packages/ui`,
  which is configured as the component target in `components.json` — but it
  scaffolds against Radix + `cmdk` regardless, since this project is on React
  Aria Components. Treat its output as a starting point only: swap every
  primitive import to `react-aria-components` and remove whatever it added to
  `package.json`. See "shadcn/ui on React Aria Components" in
  [TECH_STACK.md](TECH_STACK.md) for the API differences to expect. Add a demo
  section for it to `apps/frontend/src/routes/dev.components.tsx` — every
  component in the package gets one there, so both themes can be checked at a
  glance without hunting for a real page that happens to use it. If it has any
  real interaction (opens, selects, toggles), add a `<name>.test.tsx` next to
  it using `@react-aria/test-utils` — see "Component tests" in
  [TECH_STACK.md](TECH_STACK.md). A visual demo doesn't catch a dropdown that
  silently stopped opening; a test that drives it like a user does, does.
- A new hook shared across the frontend: `packages/ui/src/hooks/`, following
  `use-theme.ts`. Exported via the `@genealogy/ui/hooks/*` alias already
  configured in `components.json`.
- A new route: create a file under `apps/frontend/src/routes/`. `routeTree.gen.ts`
  is generated by the `routes` turbo task and is not committed.
- A schema change: edit `packages/db/src/schema.ts`, then `pnpm db:generate` and
  `pnpm db:migrate`. If the change adds people, remember the matching graph node.
