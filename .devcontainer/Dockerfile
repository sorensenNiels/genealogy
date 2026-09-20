FROM mcr.microsoft.com/devcontainers/typescript-node:24-trixie

# turbo has no corepack equivalent, so it stays pinned here explicitly.
# pnpm's version is NOT set here: corepack reads it from the single source of
# truth, `packageManager` in the root package.json, so the two can never drift.
ARG TURBO_VERSION=2.11.2

# postgresql-client gives us psql/pg_isready for AGE (Cypher) spelunking and
# for the readiness gate in post-create.sh.
RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
       postgresql-client \
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
