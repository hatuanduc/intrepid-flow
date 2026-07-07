FROM node:22
WORKDIR /app

RUN npm install -g pnpm@9

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY apps/worker/package.json ./apps/worker/
COPY prisma/ ./prisma/

# --ignore-scripts so pnpm install doesn't auto-download browsers;
# we install Playwright + system deps explicitly for full control
RUN pnpm install --frozen-lockfile --ignore-scripts
RUN pnpm db:generate

# Install Chromium with all required system deps (handles apt-get internally)
RUN pnpm exec playwright install --with-deps chromium

COPY apps/worker/ ./apps/worker/
RUN pnpm --filter @intrepid/worker build

CMD ["node", "apps/worker/dist/main.js"]
