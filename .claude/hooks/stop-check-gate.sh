#!/usr/bin/env bash
# Stop hook: CLAUDE.md requires `pnpm check` and `pnpm test` to pass before
# work is reported done. Only worth enforcing when the working tree actually
# has uncommitted changes — a trivial stop (answering a question, reading
# code) leaves it clean and should not pay for a full check+test run.
set -uo pipefail

repo_root="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0
cd "$repo_root"

if [ -z "$(git status --porcelain)" ]; then
  exit 0
fi

output="$(pnpm check 2>&1 && pnpm test 2>&1)"
status=$?

if [ "$status" -eq 0 ]; then
  exit 0
fi

jq -n --arg reason "The check gate CLAUDE.md requires (pnpm check && pnpm test) failed. Fix the issues below before reporting this work as done:

$(printf '%s' "$output" | tail -c 4000)" \
  '{decision: "block", reason: $reason}'
