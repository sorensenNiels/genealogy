#!/usr/bin/env bash
# Runs once, after the dev container is created. Must be idempotent: VS Code
# re-runs it whenever the container is rebuilt.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
repo_root="$(pwd)"

# The repo is bind-mounted, so its owner uid may not match the container user.
git config --global --add safe.directory "$repo_root"

echo "==> Installing workspace dependencies"
# --frozen-lockfile on a clone with a lockfile; plain install bootstraps a fresh repo.
if [ -f pnpm-lock.yaml ]; then
  pnpm install --frozen-lockfile
else
  pnpm install
fi

echo
echo "Dev container ready."
echo "  make db-up    start PostgreSQL (separate Docker Compose project)"
echo "  make db-migrate  apply database migrations after PostgreSQL starts"
echo "  pnpm dev     start api (:3000) and web (:5173)"
echo "  pnpm check   format + lint + typecheck, the same gate CI runs"
