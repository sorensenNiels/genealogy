<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->

# Project status: in development — no data migrations needed

This project has no production deployment and no data worth preserving. The
local database is disposable: it can always be rebuilt from scratch by
importing [`family-tree.ged`](family-tree.ged) through the GEDCOM import on the
**Tools** page (admin only).

What this means when making changes:

- **Don't write data migrations, backfills or compatibility shims.** A schema
  change may drop, rename or retype columns freely. There is no need to carry
  existing rows forward, keep old code paths alive for old data, or make a
  change reversible.
- **The schema itself still goes through Drizzle.** Edit
  `packages/db/src/schema.ts` and run `pnpm db:generate` / `pnpm db:migrate`,
  because that is how the tables get created. The generated migration only has
  to work on an empty database.
- **To start from a clean slate**, run `make db-reset` (it destroys the `db`
  container's volume, recreates it and applies all migrations). Then sign in,
  open Tools and import `family-tree.ged`.
- If an existing database gets in the way of a breaking schema change, reset
  and re-import it rather than writing code to migrate it.
