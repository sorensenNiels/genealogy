#!/usr/bin/env bash
# Runs as `predev`, before `turbo run dev` claims :3000 (backend) and :5173
# (frontend). `nest start --watch` and Vite don't always exit when a terminal
# is killed or the container restarts, so a stale process can still be
# holding one of these ports. The next `pnpm dev` then either fails to bind,
# or — worse — a half-dead old process keeps answering some requests while
# the new one answers others, which looks exactly like requests randomly
# hanging with no error in the browser.
set -euo pipefail

for port in 3000 5173; do
  pids=$(lsof -ti "tcp:${port}" 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo "predev: killing stale process(es) on port ${port}: ${pids}"
    kill -9 $pids 2>/dev/null || true
  fi
done
