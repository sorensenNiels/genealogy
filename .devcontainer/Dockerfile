FROM mcr.microsoft.com/devcontainers/typescript-node:24-trixie

# turbo has no corepack equivalent, so it stays pinned here explicitly.
# pnpm's version is NOT set here: corepack reads it from the single source of
# truth, `packageManager` in the root package.json, so the two can never drift.
ARG TURBO_VERSION=2.11.4

# psql/pg_isready for AGE (Cypher) spelunking and the readiness gate in
# post-create.sh — and, since BackupService shells out to `pg_dump`
# (apps/backend/src/backup/backup.service.ts), a client whose major version
# is not older than the server's. Debian trixie's own repo only carries
# postgresql-client-17 (`apt-cache policy postgresql-client-17`), but
# docker-compose.yml's `db` service runs Postgres 18 — an older pg_dump
# refuses outright to dump a newer server ("aborting because of server
# version mismatch"), which is exactly how this went unnoticed until a real
# backup was attempted: `pg_dump` failing that way exits non-zero before
# writing anything, so BackupProcessor's job just fails with no dump file
# and no notification, silently. The PGDG apt repo is what actually ships a
# postgresql-client-18 package for Debian.
RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
       ca-certificates curl gnupg lsb-release \
  && install -d /usr/share/postgresql-common/pgdg \
  && curl -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc --fail \
       https://www.postgresql.org/media/keys/ACCC4CF8.asc \
  && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt trixie-pgdg main" \
       > /etc/apt/sources.list.d/pgdg.list \
  && apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
       postgresql-client-18 \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

# The base image ships corepack disabled. Enabling it makes `pnpm` resolve to
# whatever version package.json#packageManager pins, fetching it on first use.
RUN corepack enable \
  && npm install -g "turbo@${TURBO_VERSION}" \
  && npm cache clean --force

ENV PNPM_HOME=/home/node/.local/share/pnpm
ENV PATH=$PNPM_HOME:$PATH

# The workspace is a bind mount, so a store under $HOME would sit on a different
# filesystem and pnpm could not hard-link from it. Left at pnpm's own fallback
# (node_modules/.pnpm-store) it stays on the same device, and survives container
# rebuilds because it lives in the mounted repo.
RUN mkdir -p "$PNPM_HOME" && chown -R node:node /home/node/.local

USER node

# Pre-fetches the pinned pnpm binary into corepack's cache at build time rather
# than on the first `pnpm install` inside the running container. Must match
# `packageManager` in the root package.json — corepack enforces that match on
# every invocation, so a mismatch here just costs a redundant download, not a
# wrong version.
RUN corepack prepare --activate pnpm@12.5.1
