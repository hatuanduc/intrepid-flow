# intrepid-flow

Monorepo (pnpm workspaces) gồm:

- `apps/web`: React + Next.js + TypeScript (UI)
- `apps/api`: Node.js + NestJS + TypeScript (Backend)
- `apps/worker`: Node.js + NestJS — background jobs (Playwright, v.v.)

## Chạy local

Yêu cầu: Node.js 18+, pnpm, Docker.

```bash
# 1. Start Postgres + Redis
docker compose -f docker-compose.dev.yml up -d

# 2. Tạo file .env ở ROOT repo (api + worker cùng đọc từ đây, không phải apps/api/.env)
cp .env.example .env
# điền DATABASE_URL="postgresql://intrepid:intrepid@localhost:5433/intrepid", JWT_SECRET, SMTP...

# 3. Install deps
pnpm install

# 4. Migrate DB
pnpm db:migrate:dev

# 5. Chạy dev (api + web + worker song song)
pnpm dev
```

Mặc định:

- Web: http://localhost:3000
- API: http://localhost:4000

## Login demo

- Email: `admin@intrepid.com`
- Password: `intrepid` (có thể đổi bằng `SEED_ADMIN_PASSWORD` trong `.env` ở root)

## Deploy GCP

Xem hướng dẫn IaC + GitHub Actions ở [infra/README.md](infra/README.md).
