# Tech stack

What this project is built from, and why. Versions are pinned centrally in the
`catalog:` block of `pnpm-workspace.yaml`; the numbers below were current when
the stack was assembled (September 2026).

## At a glance

| Layer                           | Choice                              | Version                    |
| ------------------------------- | ----------------------------------- | -------------------------- |
| Runtime                         | Node.js                             | 24 LTS                     |
| Language                        | TypeScript                          | 6.0.3                      |
| Package manager                 | pnpm (workspaces + catalog)         | 12.5.1                     |
| Build orchestration             | Turborepo                           | 2.11.2                     |
| Lint / format                   | oxlint / oxfmt                      | 1.83.0 / 0.68.0            |
| Tests                           | Vitest                              | 5.0.1                      |
| Backend                         | NestJS on Express                   | 12.0.3 / Express 5.2.0     |
| API contract                    | tRPC + superjson + Zod              | 11.19.0 / 2.2.6 / 4.6.5    |
| Relational ORM                  | Drizzle ORM + drizzle-kit           | 0.45.2 / 0.31.10           |
| Database                        | PostgreSQL + Apache AGE             | 18 / 1.8.0                 |
| Frontend                        | React + Vite                        | 19.3.0 / 8.3.0             |
| Routing / data / tables / forms | TanStack Router, Query, Table, Form | 1.170 / 5.103 / 9.2 / 1.33 |
| Components                      | shadcn/ui (Base UI) on Tailwind CSS | new-york, slate / 4.3.3    |
| Authentication                  | better-auth                         | 1.7.5                      |

## Repository shape

```
apps/backend      NestJS + tRPC over Express
apps/frontend     React SPA
packages/core     Domain model, no framework dependencies
packages/db       Drizzle schema + Apache AGE access layer
packages/ui       shadcn/ui components + shared Tailwind theme
```

`apps/` holds things you can run; `packages/` holds things they share.
Dependencies point one way: `frontend → ui`, `frontend → core`,
`backend → db → core`. The frontend additionally takes a **type-only** dependency
on the backend to obtain `AppRouter`.

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
input shape is a compile error in the frontend rather than a runtime 400. Packages
such as `nestjs-trpc` were deliberately skipped: the integration is about thirty
lines, and owning it avoids a dependency between two fast-moving frameworks.

superjson is configured as the transformer on both ends, so `Date` values survive
the wire — genealogical payloads are full of them.

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

### shadcn/ui on Base UI, not Radix

New components are pulled from shadcn's Base UI (`@base-ui/react`) preset rather
than the Radix UI preset it originally shipped with. The switch only touched
`button.tsx` — the one component that used a primitive at all
(`@radix-ui/react-slot`, for the `asChild` polymorphic-render pattern);
`card.tsx`, `input.tsx` and `table.tsx` wrap plain elements and needed no
change. `button.tsx` now wraps Base UI's own `Button` primitive
(`@base-ui/react/button`), which exposes the same polymorphism through a
`render` prop instead of a separate `Slot` component — `asChild` is gone from
`ButtonProps`, replaced by `render` (Base UI's own naming), which was safe
because nothing in the app used `asChild` yet.

The existing new-york/slate visual design was deliberately kept as-is: shadcn's
official Base UI preset (`base-vega`) is a full restyle bundled with the
primitive swap, not just a primitive swap, and re-theming wasn't part of this
change. `components.json` still reads `style: "new-york"` / `baseColor: "slate"`
as a result — the shadcn CLI (v4) only exposes a Base UI vs. Radix choice
through `init`'s `--base` flag as part of a full preset, with no standalone
per-project marker independent of `style`/`baseColor`. `button.tsx`'s import is
the real source of truth for now; the next component that needs a real
interactive primitive (Dialog, Select, etc.) is what will force that
components.json question for real.

### better-auth, hosted entirely in the backend

Authentication (email/password + Google OAuth) is better-auth, mounted as an
Express handler inside the NestJS backend (`apps/backend/src/auth/`) rather than
split across frontend and backend. The frontend has no auth logic of its own —
`apps/frontend/src/lib/auth.ts` is a `better-auth/react` client that talks to
`/api/auth` on the backend's origin, the same relationship the tRPC client
already has with `/trpc`.

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
conventions, and Query is what the tRPC client integrates with natively through
`@trpc/tanstack-react-query`.

TanStack Table v9 is a substantial departure from v8: `useTable` replaces
`useReactTable`, and optional row models are registered as feature slots inside
`tableFeatures({})` rather than passed as table options. v8 examples will not
work. The people table currently registers no optional features because ordering
is done in SQL, where it can span the whole result set rather than the page.

shadcn/ui components are vendored into `packages/ui` rather than installed, which
is how shadcn is meant to be used — they are source you own. `components.json`
points the CLI at that package, so `shadcn add` lands components in the right
place.

## Verified, not assumed

The stack was exercised end to end before being documented: the dev container
builds, `pnpm install` is clean, `pnpm check` (format, lint, typecheck) and
`pnpm test` pass, `pnpm build` produces backend and frontend bundles, `pnpm dev`
starts both servers, migrations apply into `public`, and a three-generation tree
created over tRPC returns the correct ancestors and descendants from Cypher
traversal.

## Not decided yet

These are open, and nothing in the code presumes an answer:

- **Which routes require login.** `protectedProcedure` exists but isn't applied
  anywhere yet — `person.router.ts` stays public until gating specific data is
  a deliberate product decision, not a side effect of adding auth.
- **Production cookie/domain handling.** better-auth's session cookie setup
  today only needs to work for same-site `localhost` ports in dev (the browser
  treats `:5173` and `:3000` as same-site); a real deployment with separate
  frontend/backend domains needs revisiting `trustedOrigins` and cookie
  attributes.
- **GEDCOM import and export.** The domain model is shaped for it —
  `HistoricalDate` keeps the source's own wording, and `sex` uses the GEDCOM
  vocabulary — but no parser exists.
- **Media and document storage.** No object store is wired up.
- **Deployment target and CI.** `pnpm check && pnpm test` is the intended gate;
  no pipeline is defined.
