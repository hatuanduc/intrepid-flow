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

# Xvfb — HSBCnet's Akamai WAF fingerprints vanilla headless Chromium and blocks it
# ("Service Unavailable"); running headed Chrome against a virtual display passes.
RUN apt-get update && apt-get install -y --no-install-recommends xvfb && rm -rf /var/lib/apt/lists/*

COPY apps/worker/ ./apps/worker/
RUN pnpm --filter @intrepid/worker build

# Not using `xvfb-run` — its SIGUSR1-based "Xvfb is ready" handshake relies on shell
# job-control signal semantics that don't reliably work with a shell as container PID 1.
# Starting Xvfb in the background with a fixed short sleep is more reliable here.
#
# rm -f the stale lock first: `restart: unless-stopped` restarts this same container
# (filesystem intact) rather than recreating it, so if the host was hard-stopped
# (e.g. EC2 stop/start) Xvfb never got to clean up /tmp/.X99-lock on its own. Left in
# place, the next Xvfb refuses to bind :99 ("Server is already active for display 99")
# and the script would otherwise carry on into `node` anyway with no real X server behind
# DISPLAY=:99, so every Playwright job fails with "Missing X server or $DISPLAY".
CMD ["/bin/sh", "-c", "rm -f /tmp/.X99-lock && Xvfb :99 -screen 0 1920x1080x24 -nolisten tcp & sleep 2 && DISPLAY=:99 exec node apps/worker/dist/main.js"]
