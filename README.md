# intrepid-flow

Monorepo gồm:

- `apps/web`: React + Next.js + TypeScript (UI)
- `apps/api`: Node.js + NestJS + TypeScript (Backend)

## Chạy local

Yêu cầu: Node.js 18+.

```bash
npm install
npm run dev
```

Mặc định:

- Web: http://localhost:3000
- API: http://localhost:4000

## Login demo

- Email: `admin@intrepid.com`
- Password: `intrepid` (có thể đổi bằng `DEMO_PASSWORD` trong `apps/api/.env`)

## Deploy GCP

Xem hướng dẫn IaC + GitHub Actions ở [infra/README.md](infra/README.md).
