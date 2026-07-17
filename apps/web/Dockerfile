FROM node:22-alpine
WORKDIR /app

# curl is needed by the container's own HEALTHCHECK (docker-compose.prod.yml) —
# absent on Alpine by default.
RUN apk add --no-cache curl

RUN npm install -g pnpm@9

# NEXT_PUBLIC_* vars are baked into the bundle at build time — must be build args
ARG NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY apps/worker/package.json ./apps/worker/
COPY apps/reconcile-lambda/package.json ./apps/reconcile-lambda/
COPY prisma/ ./prisma/

RUN pnpm install --frozen-lockfile --ignore-scripts

COPY apps/web/ ./apps/web/
RUN pnpm --filter @intrepid/web build

EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0
# next.config.ts has output: 'standalone' — server.js is self-contained
CMD ["node", "apps/web/.next/standalone/server.js"]
