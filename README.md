# Genealogy

An application for recording people, the relationships between them, and the
sources that evidence both.

People, sources and citations are stored as relational records; parent and spouse
relationships are stored as a graph in the same database, so pedigree questions
are traversals rather than recursive joins.

## Quick start

You need Docker and VS Code with the **Dev Containers** extension. Nothing else
is installed on your machine.

1. Open the repository in VS Code.
2. Choose **Reopen in Container**.
3. Run `make db-up` and `make db-migrate`.
4. Run `pnpm dev`.

|          |                                                            |
| -------- | ---------------------------------------------------------- |
| Web      | <http://localhost:5173>                                    |
| Backend  | <http://localhost:3000/trpc>                               |
| Database | `localhost:5432` (`genealogy` / `genealogy` / `genealogy`) |

You only ever open the Web URL — its server side proxies both data and auth
calls to the backend, so the backend URL above is for API inspection, not
browsing.

## Layout

```
apps/backend      NestJS + tRPC over Express
apps/frontend     TanStack Start — renders every page; its server side proxies
                  data and auth calls to apps/backend over HTTP (see TECH_STACK.md)
packages/core     Domain model, framework-free
packages/db       Drizzle schema + Apache AGE graph access
packages/ui       shadcn/ui components and the shared Tailwind theme
```

## Common commands

```bash
pnpm dev          # backend, frontend and package watchers
pnpm build        # build everything in dependency order
pnpm check        # format check, lint, typecheck
pnpm test         # Vitest across the workspace
pnpm db:migrate   # apply pending migrations
```

`make help` lists the same commands as make targets. Use `make db-down` when
database-backed development is finished.

## Documentation

- [DEVELOPMENT_ENVIRONMENT.md](DEVELOPMENT_ENVIRONMENT.md) — setting up and
  working in the dev container, tooling, troubleshooting.
- [TECH_STACK.md](TECH_STACK.md) — what the stack is and why each piece was
  chosen.
- [CLAUDE.md](CLAUDE.md) — working agreements for Claude Code in this repository.
