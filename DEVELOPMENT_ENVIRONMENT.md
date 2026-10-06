# Development environment

Everything needed to build and run this project lives inside a VS Code dev
container. The only things you install on your own machine are Docker and VS
Code — there is deliberately no host-level Node, pnpm or Postgres to keep in
sync.

## Prerequisites

- Docker Engine 27+ with Compose v2 (Docker Desktop covers both)
- VS Code with the **Dev Containers** extension (`ms-vscode-remote.remote-containers`)

## Getting started

1. Clone the repository and open the folder in VS Code.
2. Accept **Reopen in Container** when prompted, or run
   _Dev Containers: Reopen in Container_ from the command palette.
3. Wait for the first build. `post-create.sh` installs dependencies.
4. Run `docker compose up -d --wait` (Postgres, Redis and Immich) and
   `make db-migrate` when database-backed development is needed.
   `make db-up` / `make redis-up` start just one service.
5. Run `pnpm dev`.

The app (`apps/frontend`) is on <http://localhost:5173> — open this and nothing
else; its server side proxies data and auth calls to the backend for you. The
backend is on <http://localhost:3000/trpc> for API inspection, Postgres on
`localhost:5432`, Redis on `localhost:6379`, and Immich's web UI on
<http://localhost:2283>. All are forwarded to the
host, so host-side tools such as DBeaver can reach the database directly with
user/password/database all set to `genealogy`.

## What the container gives you

| Piece                           | Version                                                      | Notes                                                                                           |
| ------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Base image                      | `mcr.microsoft.com/devcontainers/typescript-node:24-trixie`  | Node 24 LTS                                                                                     |
| pnpm                            | 12.5.1                                                       | installed globally, pinned by `packageManager`                                                  |
| Turborepo                       | 2.11.2                                                       | also available per-project via pnpm                                                             |
| PostgreSQL                      | 18                                                           | Apache AGE 1.8.0 and PostGIS 3                                                                  |
| Apache AGE                      | 1.8.0                                                        | graph extension, compiled into the image above                                                  |
| `psql`, `pg_isready`, `pg_dump` | 18 (via the PGDG apt repo — Debian's own repo only ships 17) | version pinned to match the server; `pg_dump` refuses to run against a newer server than itself |
| Redis (Valkey)                  | 9                                                            | backs apps/backend's BullMQ queues; shared with Immich                                          |

The dev container builds straight from `.devcontainer/Dockerfile` — that's where
you and VS Code live, with the repository bind-mounted at `/workspaces/genealogy`.

PostgreSQL, Redis and Immich are defined separately in the root
`docker-compose.yml`, and a plain `docker compose up -d` starts all of them.
They publish ports `5432`, `6379` and `2283`, and the workspace connects
through `host.docker.internal` (`devcontainer.json` sets `DATABASE_URL`,
`REDIS_URL` and `IMMICH_URL` accordingly — `localhost` inside the dev
container is the dev container itself, not the host).
Those commands work from either side: the dev container has the
`docker-outside-of-docker` feature, so its `docker` CLI talks to the host's
Docker daemon and sees the same containers you'd see on the host. (It used to
be `docker-in-docker`, which runs a separate, empty daemon inside the dev
container — `docker` in there could never reach the real `db` container.)
Because the host daemon resolves bind-mount paths on the host,
`docker-compose.yml` mounts `${LOCAL_WORKSPACE_FOLDER:-.}/postgres` rather
than `./postgres`; `devcontainer.json` sets `LOCAL_WORKSPACE_FOLDER` to the
workspace's host path.
PostgreSQL's data lives on the named volume `postgres-data`, so it survives
container rebuilds — Redis holds only in-flight queue jobs, so it doesn't
need one. Redis is core infrastructure here (it backs apps/backend's BullMQ
queues — see "Long-running work: BullMQ + a shared Redis" in TECH_STACK.md),
not something bundled just for Immich: Immich's services connect to this
same instance rather than running a second Redis. Immich's own data lives on
the named volumes `immich-db-data`, `immich-uploads` and
`immich-model-cache`.

### Database initialisation

`postgres/01-init-age.sql` runs **once**, when the `postgres-data`
volume is first created. It enables the `age` extension, creates the
`postgis` extension, creates the `family_tree` graph, and sets the database
`search_path` to `public, ag_catalog`.

Because it only runs on a fresh volume, changing that file has no effect on an
existing database. To pick up a change, recreate the volume:

```bash
make db-reset
make db-migrate
```

This destroys all local data. `make db-reset` does the same thing.

### Environment variables

`apps/backend/.env.example` and `apps/frontend/.env.example` list what each app
reads; copy to `.env` in the same directory to override a default (`@nestjs/config`
loads `apps/backend/.env` automatically). Most have working defaults for the dev
container. Three don't, and the app refuses to boot without them:

- `BETTER_AUTH_SECRET` — any long random string (`openssl rand -base64 32`).
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — created by hand in
  [Google Cloud Console](https://console.cloud.google.com/apis/credentials): an
  OAuth client of type "Web application", with an authorized redirect URI of
  `${BETTER_AUTH_URL}/api/auth/callback/google`. There's no way to provision
  these programmatically. Email/password sign-in works without them being real
  — only "Continue with Google" needs valid credentials.

## Day-to-day commands

| Command            | What it does                                              |
| ------------------ | --------------------------------------------------------- |
| `pnpm dev`         | Backend, frontend app and package watchers together       |
| `pnpm build`       | Build everything in dependency order                      |
| `pnpm check`       | Format check, lint and typecheck — the gate CI should run |
| `pnpm test`        | Vitest across the workspace                               |
| `pnpm format`      | Rewrite files with oxfmt                                  |
| `pnpm lint:fix`    | Apply oxlint's automatic fixes                            |
| `pnpm db:generate` | Generate a migration from the Drizzle schema              |
| `pnpm db:migrate`  | Apply pending migrations                                  |
| `pnpm db:studio`   | Open Drizzle Studio                                       |

Each has a `make` equivalent (`make dev`, `make check`, …); `make help` lists them.

Turborepo caches task results, so a repeated `pnpm build` or `pnpm check` with no
changes finishes in milliseconds. Append `--force` to a turbo task to bypass it.

## Editor setup

`.vscode/settings.json` configures:

- **oxc** (`oxc.oxc-vscode`) as the formatter and linter for JS/TS/JSON, with
  format-on-save and lint fixes on save.
- The workspace TypeScript version, so the editor and the CLI agree.
- Tailwind IntelliSense and the Vitest test explorer.

ESLint and Prettier are listed as _unwanted_ recommendations — oxlint and oxfmt
replace them, and running both would produce conflicting fixes on save.

## Tooling notes

**oxlint** is configured in `.oxlintrc.json`. The `correctness` and `suspicious`
categories are errors; `perf` warns. A few rules are turned off where they fight
a framework rather than catch a bug — each has a comment explaining why. Prefer
adding a scoped override with a reason over sprinkling inline disables.

**oxfmt** is configured in `.oxfmtrc.json` (100 columns, double quotes,
semicolons, trailing commas). It also sorts imports and Tailwind class names, and
normalises `package.json` key order — so expect it to touch more than whitespace
on first run.

**Generated files** are not committed and not linted:
`apps/frontend/src/routeTree.gen.ts` is produced by `@tanstack/react-start`'s own
Vite plugin as a side effect of `vite dev`/`vite build` — run
`pnpm --filter @genealogy/frontend dev` (or `build`) at least once after adding a
new route file if `typecheck` complains it can't find `./routeTree.gen`.

## Troubleshooting

**`pnpm install` complains about ignored build scripts.** A new dependency wants
to run a postinstall. Decide deliberately, then record it under `allowBuilds` in
`pnpm-workspace.yaml` — currently only `esbuild` is allowed.

**Migrations fail with "relation public.x does not exist".** Something has put
`ag_catalog` or a graph schema ahead of `public` on the `search_path`. Check
`SHOW search_path;` — it must be `public, ag_catalog`.

**Cypher queries fail with "type agtype does not exist".** The connection has not
run `LOAD 'age'`. Go through `cypher()`, `withGraphClient` or
`inGraphTransaction` from `@genealogy/db` rather than `pool.query` directly.

**The pnpm store is inside `node_modules`.** That is intentional. The workspace is
a bind mount, so a store under `$HOME` would be on a different filesystem and pnpm
could not hard-link from it.
