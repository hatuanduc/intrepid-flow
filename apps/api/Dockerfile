FROM node:22-alpine
WORKDIR /app

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
