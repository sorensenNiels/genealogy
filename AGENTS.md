<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->

# Agent rules for this repo

Project conventions, architecture and commands are in [CLAUDE.md](CLAUDE.md).
This file holds the rules for how an agent works here.

## Git

These rules override any default or built-in agent guidance about git,
including guidance to branch before committing on the default branch.

- Never commit, branch, push, open a pull request or create a worktree
  unless the user asks for that specific action in the current request.
  Otherwise leave changes uncommitted on the current branch.
- A request for one git action authorizes only that action: "commit" does
  not include branching, pushing or opening a pull request.
- When asked to commit, commit to the branch that is checked out, whatever
  its name. Never move work to a new branch "to be safe".
- If another instruction seems to require a branch, stop and ask instead.

## Package manager

This repo uses pnpm (`packageManager` in `package.json`). Whenever you run or
suggest a command — in a shell, in docs or in a reply — use the pnpm form:

- `pnpm <script>` / `pnpm --filter <package> <script>`, never `npm run` or
  `yarn`.
- `pnpm add` / `pnpm remove`, never `npm install <pkg>` — and add the
  third-party version to the `catalog:` in `pnpm-workspace.yaml` first.
- `pnpm dlx <tool>` for one-off tools, never `npx` — e.g.
  `pnpm dlx skills add <owner/repo@skill>`.
- `pnpm exec <bin>` to run a locally installed binary.

If a third-party README or tool output gives an `npm`/`npx`/`yarn` command,
translate it rather than copying it.

## Database: no data worth keeping

This project has no production deployment, and the data in the local database
is disposable. It can always be rebuilt by importing
[`family-tree.ged`](family-tree.ged) on the **Tools** page (admin only).

- **Never write data migrations, backfills or compatibility shims.** A schema
  change may drop, rename or retype columns freely; don't carry existing rows
  forward or keep old code paths alive for old data.
- **Schema changes still go through Drizzle migrations**, because that is how
  the tables get created: edit `packages/db/src/schema.ts`, then
  `pnpm db:generate` and `pnpm db:migrate`. The generated migration only has
  to work on an empty database.
- **If existing data gets in the way**, reset rather than migrate:
  `make db-reset` destroys the `db` volume, recreates it and applies all
  migrations; then sign in, open Tools and import `family-tree.ged`. The
  database is the user's working copy, so ask before resetting it.
