# The image that runs the server, the worker and the operator commands (deploy/README.md). The monorepo layout is kept,
# because the server finds the built web app and counter beside its own build (apps/server/src/main.ts).
FROM node:22-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl gnupg build-essential python3 \
 && install -d /usr/share/keyrings \
 && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /usr/share/keyrings/pgdg.gpg \
 && echo "deb [signed-by=/usr/share/keyrings/pgdg.gpg] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" > /etc/apt/sources.list.d/pgdg.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends postgresql-client-17 \
 && rm -rf /var/lib/apt/lists/*

RUN corepack enable
# Retry slow package downloads instead of failing the build.
ENV npm_config_fetch_retries=5 npm_config_fetch_timeout=120000 npm_config_network_concurrency=8
WORKDIR /app
COPY . .
RUN --mount=type=cache,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile
RUN pnpm build

ENV NODE_ENV=production
WORKDIR /app/apps/server
EXPOSE 3000
CMD ["node", "dist/main.js"]
