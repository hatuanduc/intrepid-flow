FROM node:22
WORKDIR /app

RUN npm install -g pnpm@9

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY apps/worker/package.json ./apps/worker/
COPY apps/reconcile-lambda/package.json ./apps/reconcile-lambda/
COPY prisma/ ./prisma/

# --ignore-scripts so pnpm install doesn't auto-download browsers;
# we install Playwright + system deps explicitly for full control
RUN pnpm install --frozen-lockfile --ignore-scripts
RUN pnpm db:generate

# Install Chromium with all required system deps (handles apt-get internally).
# Must be --filter'd to the worker package — bare `pnpm exec` at the workspace
# root runs recursively across every package and fails on the first one
# (e.g. apps/api) that doesn't have playwright as a direct dependency.
RUN pnpm --filter @intrepid/worker exec playwright install --with-deps chromium

COPY apps/worker/ ./apps/worker/
RUN pnpm --filter @intrepid/worker build

CMD ["node", "apps/worker/dist/main.js"]
