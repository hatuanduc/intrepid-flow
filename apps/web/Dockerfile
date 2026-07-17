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

# Standalone output nests under the monorepo root's relative path to the app
# (apps/web/.next/standalone/apps/web/server.js, not .next/standalone/server.js)
# because Next.js finds the pnpm-lock.yaml above apps/web and traces from there.
# public/ and .next/static aren't included in the standalone copy by design
# (meant to be served by a CDN) — copy them in manually so assets aren't 404s.
RUN cp -r apps/web/public apps/web/.next/standalone/apps/web/public && \
    cp -r apps/web/.next/static apps/web/.next/standalone/apps/web/.next/static

EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0
CMD ["node", "apps/web/.next/standalone/apps/web/server.js"]
