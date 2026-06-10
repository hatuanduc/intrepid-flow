# apps/api — Tiemen API (NestJS)

NestJS API using Prisma for DB access.

## Structure

- `src/main.ts` — app entry, bootstraps NestJS
- `src/app.module.ts` — root module
- `src/prisma/` — Prisma service and schema
- `src/modules/auth/` — Auth module: login, me, JWT guard
- `src/modules/users/` — Users module
- `src/modules/roles/` — Roles module
- `src/modules/permissions/` — Permissions module

## Quickstart (local, using Supabase/Neon/Postgres)

1. Copy example env:

```bash
cp apps/api/.env.example apps/api/.env
# Fill DATABASE_URL, DIRECT_URL, JWT_SECRET with your values
```

2. Install deps and generate Prisma client:

```bash
cd apps/api
npm install
npx prisma generate
```

3. Create dev migration (requires reachable DB):

```bash
npm run prisma:migrate:dev
npm run seed
npm run start:dev
```

## Notes

- In CI/production run migrations once from pipeline: `npm run prisma:migrate:deploy`.
- Do NOT run migrations from multiple replicas; run from a single deploy job.
- Seed script is idempotent (checks existing records).
- Port: `4000` (or set `PORT` env var).

## Migrations & Supabase

- Use `DATABASE_URL` for pooled connection (runtime) and `DIRECT_URL` for direct connection (migrations/generate).
- When migrating to Cloud SQL later, use `pg_dump` / `pg_restore`.