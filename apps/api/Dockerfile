FROM node:22-alpine
WORKDIR /app

# Prisma's engine needs the real openssl binary to detect libssl/version at
# runtime — Alpine's base image doesn't ship one, and without it Prisma
# silently guesses wrong (defaults to openssl-1.1.x) and the engine fails to
# start ("Could not parse schema engine response"). curl is needed by the
# container's own HEALTHCHECK (docker-compose.prod.yml) — also absent on Alpine.
RUN apk add --no-cache openssl curl

RUN npm install -g pnpm@9

# Copy workspace manifests (enables layer caching — reinstall only on lockfile changes)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY apps/worker/package.json ./apps/worker/
COPY apps/reconcile-lambda/package.json ./apps/reconcile-lambda/
COPY prisma/ ./prisma/

# --ignore-scripts skips playwright install from worker postinstall
# Run prisma generate explicitly after
RUN pnpm install --frozen-lockfile --ignore-scripts
RUN pnpm db:generate

# Copy source and build
COPY apps/api/ ./apps/api/
RUN pnpm --filter @intrepid/api build

EXPOSE 4000
# Migration runs in a dedicated `migrate` compose service, not here
CMD ["node", "apps/api/dist/main.js"]
