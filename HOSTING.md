# Hosting local bằng Docker (không AWS)

Hướng dẫn chạy toàn bộ app (`db`, `redis`, `api`, `web`, `worker`) trên 1 máy bằng Docker,
dùng [docker-compose.local.yml](docker-compose.local.yml). Không cần AWS — mọi env/secret nằm
trong file `.env` ở root repo.

> File này độc lập, không phụ thuộc cấu trúc `docs/` — di chuyển/xoá tuỳ ý nếu không cần nữa.

## 1. Yêu cầu

- **Docker Desktop** (Windows/Mac) — cài từ [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop/). Bật WSL2 backend nếu được hỏi (Windows).
- Không cần cài Node/pnpm nếu chỉ chạy qua Docker (chỉ cần khi code/dev trực tiếp — xem [README.md](README.md)).

## 2. Lấy code

```bash
git clone git@github.com:hatuanduc/intrepid-flow.git
cd intrepid-flow
```

> Nếu máy khác đã có image build sẵn trên GHCR (xem mục 5), bước này có thể bỏ qua — chỉ cần
> 2 file `docker-compose.local.yml` + `.env`, không cần code. Nhưng hiện tại chưa push image
> lên GHCR nên vẫn cần clone code để build local trước.

## 3. Tạo file `.env`

```bash
cp .env.example .env
```

Mở `.env`, điền các giá trị thật (xem comment trong từng mục của file để biết ý nghĩa):

| Biến | Ghi chú |
|---|---|
| `DB_PASSWORD` | mật khẩu Postgres — bất kỳ chuỗi mạnh nào |
| `JWT_SECRET` | chuỗi random dài, dùng để ký JWT |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | tài khoản admin đầu tiên (xem mục 6) |
| `SMTP_HOST/PORT/USER/PASS/FROM` | Gmail App Password hoặc SMTP khác |
| `GOOGLE_CLIENT_ID` | OAuth Client ID (Google Cloud Console) — để trống nếu không dùng Sign in with Google |
| `BANK_STATEMENT_PDF_DIR` | để mặc định `/data/bank-statement-pdfs` — khớp volume trong compose, không cần đổi |
| `APP_URL` / `NEXT_PUBLIC_API_BASE_URL` | tạm để `http://localhost:3000` / `http://localhost:4000` (xem mục 8 khi có domain thật) |
| `RECONCILE_BUCKET` / `RECONCILE_LAMBDA_NAME` | để trống — feature này đang tắt (phụ thuộc AWS Lambda cũ) |
| `CLOUDFLARE_TUNNEL_TOKEN` | để trống nếu chưa làm domain (xem mục 8) |

## 4. Build image

```bash
docker compose -f docker-compose.local.yml build
```

Lần đầu sẽ chậm (worker cần tải Chromium ~180MB). Các lần sau chỉ build lại phần code thay đổi.

## 5. Khởi động

```bash
docker compose -f docker-compose.local.yml up -d
```

Kiểm tra tất cả service `healthy`:

```bash
docker compose -f docker-compose.local.yml ps
```

> Khi image đã được build & push lên GHCR qua GitHub Actions (`.github/workflows/pipeline.yml`,
> chạy mỗi khi push lên `main`/`develop`), máy khác chỉ cần 2 file `docker-compose.local.yml` +
> `.env` rồi chạy `docker compose -f docker-compose.local.yml pull && ... up -d` — không cần
> clone code hay build gì cả.

## 6. Seed tài khoản admin (chỉ cần chạy 1 lần, lần đầu tiên)

`migrate` chỉ tạo schema DB (`db:push`), **không** tự seed user — chạy tay:

```bash
docker compose -f docker-compose.local.yml run --rm migrate pnpm db:seed
```

Đăng nhập bằng `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` đã điền ở `.env`.

## 7. Truy cập

- Web: http://localhost:3000
- API: http://localhost:4000 (Swagger: http://localhost:4000/docs)

## 8. Domain thật qua Cloudflare Tunnel (làm sau, khi cần)

1. Cloudflare Zero Trust dashboard → Networks → Tunnels → Create a tunnel.
2. Tab "Public Hostname" của tunnel đó: map `app.yourdomain.vn → http://web:3000` và
   `api.yourdomain.vn → http://api:4000` (dùng tên service Docker, không phải `localhost`,
   vì `cloudflared` sẽ chạy chung network Docker với các service khác).
3. Copy token ở bước "Install connector" → điền vào `CLOUDFLARE_TUNNEL_TOKEN` trong `.env`.
4. Mở comment service `cloudflared` trong [docker-compose.local.yml](docker-compose.local.yml) (đang bị comment tạm).
5. Đổi `APP_URL` / `NEXT_PUBLIC_API_BASE_URL` trong `.env` thành domain thật, và sửa 2 giá trị
   hardcode trong `.github/workflows/pipeline.yml` (job `build-and-push`) rồi push — CI build
   lại image với domain mới.
6. `docker compose -f docker-compose.local.yml up -d` lại.

## 9. Tự khởi động lại khi máy/Docker restart

Mọi service đã có `restart: unless-stopped` — tự lên lại khi Docker daemon chạy lại. Để máy
*reboot xong tự chạy lại hoàn toàn không cần ai đăng nhập*:

- **Windows**: bật auto-login (`netplwiz` → bỏ tick "User must enter a password") + Docker
  Desktop → Settings → General → "Start Docker Desktop when you log in".
- Nếu máy không ai đăng nhập được (chạy như server thật sự), xem xét cài Docker Engine trực
  tiếp trên WSL2 (systemd) thay vì Docker Desktop — không cần auto-login, nhưng setup phức tạp
  hơn, chỉ làm khi auto-login không chấp nhận được.

## 10. Lệnh thường dùng

```bash
# Xem log 1 service
docker compose -f docker-compose.local.yml logs -f api

# Dừng toàn bộ (giữ data)
docker compose -f docker-compose.local.yml down

# Build lại sau khi sửa code, rồi restart
docker compose -f docker-compose.local.yml build && docker compose -f docker-compose.local.yml up -d

# Chạy 1 lệnh bất kỳ trong container api (vd seed lại, backfill...)
docker compose -f docker-compose.local.yml run --rm migrate pnpm db:seed
```

## 11. Lưu ý quan trọng

- **Reconcile** (lọc/merge invoice): đã ẩn khỏi sidebar, API trả 503 — phụ thuộc AWS Lambda cũ,
  không hoạt động ở setup này. Phần cấu hình cột/Master Customer (`/settings/reconcile`) vẫn
  dùng được bình thường (không liên quan AWS).
- **PDF sao kê ngân hàng**: lưu local trong Docker volume `bank_statement_pdfs` (mount chung
  giữa `api` và `worker`) — thay cho S3 trước đây. Dữ liệu còn khi container restart, mất khi
  `docker compose down -v` (xoá volume).
- **HSBCNET_URL**: để trống → worker đăng nhập HSBCnet thật (không còn dùng mock-hsbc).
