# Bank Statement Sync — Architecture Design

## Overview
Tự động lấy sao kê ngân hàng từ HSBCnet và đồng bộ vào Google Sheets tracker.

## Source
- **Portal**: HSBCnet (https://www1.secure.hsbcnet.com)
- **Login**: username "INTREPID1" + 2FA mobile approval
- **Accounts**:
  - HSBC 001 — current account, receipt only
  - HSBC 002 — current account, payment only

## Destination
- Google Sheets tracker: `VN_GBA1BB_2026_Bank Book_Tracker_v1.0`
- Local copy: `C:\Users\PC025-1\Downloads\VN_GBA1BB_2026_Bank Book _Tracker_v1.0.xlsx`
- Sheets quan tâm: `HSBC 001`, `HSBC 002`
- Logic: chỉ sync khi ending balance thay đổi

## 2FA Handling
- HSBCnet tự push notification đến điện thoại sau khi nhập username
- Worker (Playwright) chờ trang chuyển sau khi user approve trên phone
- UI hiển thị trạng thái "Đang chờ xác thực..." trong lúc chờ
- Timeout: nếu quá X phút không approve → job failed với lý do "2FA timeout"

## Architecture

### Services
```
apps/api     — NestJS API + WebSocket Gateway
apps/worker  — NestJS Worker, BullMQ processor + Playwright
apps/web     — Next.js UI
```

### Infrastructure (Docker)
```
PostgreSQL   — port 5433
Redis        — port 6379 (BullMQ queue)
```

### Tech Stack
| Component        | Choice     | Reason                              |
|------------------|------------|-------------------------------------|
| Queue            | BullMQ     | TypeScript native, better than Bull |
| Redis            | redis:7-alpine | Lightweight, standard           |
| Browser automation | Playwright | Better than Puppeteer, stable    |
| Realtime status  | Socket.io  | Built-in NestJS support             |
| GSheets          | TBD        | API online or local xlsx update     |

## Job State Machine
```
pending
  → launching_browser    (Playwright starting)
  → navigating           (Opening HSBCnet)
  → waiting_2fa          (Chờ approve trên điện thoại)
  → authenticated        (2FA passed)
  → downloading          (Lấy statement từ ngân hàng)
  → parsing              (Parse data)
  → comparing            (So sánh ending balance)
  → syncing              (Update GSheets/DB)
  → completed ✓
  → failed (reason: timeout_2fa | download_error | parse_error | ...)
```

## DB Tables (to add)

### bank_accounts
```
id, bank_name, account_number, account_title, currency,
type (receipt|payment), is_active, created_at
```

### bank_sync_jobs
```
id, bank_account_id, status, triggered_by (user_id),
started_at, completed_at, error_message,
rows_downloaded, rows_synced, created_at
```

### bank_transactions (optional — if storing in DB too)
```
id, job_id, bank_account_id, date, description,
debit, credit, balance, reference, created_at
```

## UI

### Dashboard card
- Animated intro card trong /modules page
- Hiện thị: bank logo → arrow animation → system icon
- Badge: "Đang bật" / "Tắt"

### Job management page (/bank-statement)
- Header: tên module + nút "Chạy đồng bộ"
- Tabs: HSBC 001 | HSBC 002
- Job list table: status, started, duration, rows synced, error
- Real-time status via WebSocket (no polling)
- Status badge animate khi đang chạy

### Workflow menu (sidebar)
- Click "Quy trình" → dropdown các module đang bật
- Mỗi item link đến trang riêng của module

## Permissions
```
bank_statement:view   — Xem danh sách job
bank_statement:run    — Chạy job đồng bộ
```

## Decisions
- [x] Trigger: **scheduled** (cron) + **manual** override
- [x] GSheets: **online API** — service account JSON key, sheet link provided
  - Sheet: https://docs.google.com/spreadsheets/d/1h5gC1vqRfPvZ7DANAnAog-u5bDNNbpZRCaVuxAfzyQ0
- [ ] Schedule: mấy giờ / ngày? (ví dụ: 8:00 sáng mỗi ngày)
- [ ] Timeout 2FA: bao nhiêu phút chờ approve?
- [ ] Browser: headless (server) hay visible (local test)?
