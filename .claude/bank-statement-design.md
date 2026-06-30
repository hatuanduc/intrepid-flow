# Bank Statement Sync — Architecture Design

## Overview
Tự động lấy sao kê ngân hàng từ HSBCnet, lưu vào DB, đồng bộ lên Google Sheets tracker theo từng quốc gia / tài khoản.

---

## 1. Login Flow (HSBCnet Playwright)

URL: `https://www1.secure.hsbcnet.com`

### Steps
```
1. Check session còn dùng được không
   → Nếu còn (cookies + URL check) → skip login, đi thẳng vào
   → Nếu hết → tiến hành login

2. Điền username "INTREPID1" → Continue

3. Màn hình 2FA: chọn "Send a notification to my mobile" (đã chọn sẵn) → Continue
   → DB log: status = waiting_2fa

4. Chờ trang chuyển sang màn hình tài khoản (Playwright waitForURL / waitForSelector)
   → Timeout: 90 giây

5. Nếu 60 giây không thấy thay đổi → màn hình hiện "Didn't receive notification?"
   → Click "Resend notification" 1 lần
   → Chờ thêm 60 giây

6. Nếu vẫn không vào được → job failed, reason: timeout_2fa

7. Đã vào được → URL chứa "/accounts" hoặc Landing page
   → Lưu session cookies vào file để dùng lại lần sau
   → DB log: status = authenticated
```

### Session Persistence
- Cookies được serialize lưu vào file: `apps/worker/sessions/hsbcnet.json`
- Mỗi lần khởi động worker → load cookies vào context trước
- Xác nhận session còn dùng: navigate đến `/accounts` → check URL không redirect về login
- Nếu session hết hạn → xóa file, chạy lại login flow

---

## 2. Data Download Flow (Actual HSBCnet UI — verified via DevTools)

### 2.1 Post-Login Landing

Sau khi 2FA thành công, URL có dạng:
```
https://www1.secure.hsbcnet.com/uims/portal/HSBCnet/Landing;jsessionid=...#/landing
```
Check session bằng cách detect URL chứa `/Landing` hoặc `/accounts` (KHÔNG redirect về login).

---

### 2.2 Account Discovery (từ "Change account" switcher)

**Flow:**
```
1. Navigate đến account detail bất kỳ (click row đầu tiên trong bảng tài khoản)
   Selector: table.accounts-table tr.table__row--clickable:first-child td.table__cell--at span[role="button"]

2. Click vào ô "Change account" (search box)
   Selector: input[aria-label*="account number or title"]
   Placeholder: "Change account"

3. Dropdown hiện ra với tất cả accounts (role="listbox")
   Selector: ul.switcher-option[role="listbox"]

4. Scrape toàn bộ li items:
   Selector: li.switcher-option--item[role="option"]
   Structure của mỗi item:
     <li class="switcher-option--item" role="option">
       <p class="switcher-option--number">INTREPID VIETNAM LTD</p>   ← companyName
       <p class="switcher-option--account">
         001-797281-003        ← accountNumber (text node trực tiếp)
         <i>VN</i>             ← countryCode
         <span>VND</span>      ← currency
       </p>
     </li>
```

**Kết quả trả về:** `Array<{ companyName, accountNumber, countryCode, currency }>`

**Sync vào DB:**
- Account đã tồn tại (theo `accountNumber`) → skip
- Account mới → insert vào `bank_accounts` + tạo notification ("X tài khoản mới được phát hiện")

---

### 2.3 Per-Account Statement Download (tuần tự)

Với mỗi account trong danh sách active:

```
1. Nhập accountNumber vào ô "Change account" search
   Selector: input[aria-label*="account number or title"]
   Action: fill(accountNumber)

2. Chờ dropdown xuất hiện, click vào result đầu tiên
   Selector: li.switcher-option--item[role="option"]:first-child
   If không tìm thấy → log error, skip account

3. Trang chi tiết account load xong
   Waitfor: span#showing_actual_range_quick_link  (vùng "Showing X transactions from...")

4. Click "Specify date range"
   Selector: span#showing_actual_range_quick_link

5. Filter panel hiện ra. Click vào Date range combobox
   Selector: div[id*="rangeDate"]

6. Picker mở ra — điền ngày bắt đầu và ngày kết thúc
   Format: dd/mm/yyyy
   (Playwright: tìm input trong picker và fill, hoặc tương tác với calendar)

7. Click "Apply"
   Selector: input.form__control-button[type="submit"]

8. Check kết quả:
   - Nếu "No transactions found":
     Selector: p.table__error-message
     Action: log warning, skip export, tiếp tục account tiếp theo
   - Nếu có data: tiếp tục step 9

9. Click Export dropdown
   Selector: button#export-dropdown-trigger

10. Trong dropdown: chọn "Transactions" radio (nếu chưa chọn)
    Selector: radio/option "Transactions" trong ul#export-dropdown

11. Click "Excel"
    Selector: li/span có class user-action__drop-option--clickable chứa text "Excel"

12. File download trong tab mới (Playwright waitForEvent('download'))
    Filename pattern: AISTMTPRINT*.xlsx (~8-10 KB mỗi file)

13. Đọc buffer, đóng tab download, tiếp tục account tiếp theo
```

---

### 2.4 Date Range Setting (configurable trong Settings)

Setting lưu trong `BankJobSettings`:
```
syncDateMode: 'today' | 'yesterday' | 'last_7_days' | 'custom'
syncCustomDays: Int  // chỉ dùng khi mode='custom': D-N đến D
```

Tính toán khi chạy:
```typescript
function computeDateRange(mode: string, customDays: number): { from: Date; to: Date } {
  const today = new Date(); today.setHours(0,0,0,0);
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  switch (mode) {
    case 'today':     return { from: today,     to: today };
    case 'yesterday': return { from: yesterday, to: yesterday };
    case 'last_7_days': {
      const from = new Date(today); from.setDate(today.getDate() - 6);
      return { from, to: today };
    }
    case 'custom': {
      const from = new Date(today); from.setDate(today.getDate() - customDays);
      return { from, to: today };
    }
    default: return { from: yesterday, to: yesterday };
  }
}
```

---

### 2.5 Excel Column Layout (verified từ actual file)

```
Account name | Account number | Bank name | Currency | Location | BIC | IBAN |
Account status | Account type |
Closing ledger balance | Closing ledger brought forward from |
Closing available balance | Closing available brought forward from |
Current ledger balance | Current ledger as at |
Current available balance | Current available as at |
Bank reference | Narrative | Customer reference | TRN type |
Credit amount | Debit amount | Balance | Post date
```

Row dedup hash: SHA256 của `accountNumber + postDate + narrative + bankReference + debitAmount + creditAmount`
(Không hash Balance — có thể thay đổi theo thời gian)

---

### 2.6 Notification khi phát hiện account mới

Khi `discoverAccounts()` tìm thấy account chưa có trong DB:
- Insert vào `bank_accounts`
- Insert notification vào bảng `notifications` (nếu có) hoặc log trong job
- UI: hiện badge trên chuông + message "X tài khoản mới được phát hiện trong HSBCnet — click để xem"
- Click → navigate đến `/settings/bank-statement/countries`

---

## 3. Data Storage (DB)

### Hash Strategy
- **Row hash**: SHA256 của `accountNumber + postDate + narrative + bankReference + debitAmount + creditAmount` — dùng để dedup
- **Header hash**: SHA256 của tên tất cả column headers (join bằng `|`) — dùng để detect thay đổi template

### DB Tables (Prisma)

```prisma
// Tài khoản ngân hàng (auto-discovered hoặc manual add)
model BankAccount {
  id            String @id @default(uuid())
  accountNumber String @unique @map("account_number")
  accountName   String @map("account_name")
  bankName      String @map("bank_name")
  currency      String
  countryCode   String @map("country_code")  // VN, MY, ID, PH, SG
  isActive      Boolean @default(true) @map("is_active")
  createdAt     DateTime @default(now()) @map("created_at")

  syncJobAccounts BankSyncJobAccount[]
  transactions    BankTransaction[]
  @@map("bank_accounts")
}

// Một lần chạy sync (bao gồm tất cả countries/accounts trong scope)
model BankSyncJob {
  id           String    @id @default(uuid())
  status       String    // pending | checking_session | logging_in | waiting_2fa | authenticated | downloading | storing | syncing_sheets | completed | failed
  triggeredBy  String?   @map("triggered_by")  // user_id hoặc "cron"
  startedAt    DateTime? @map("started_at")
  completedAt  DateTime? @map("completed_at")
  errorMessage String?   @map("error_message")
  logs         Json      @default("[]")  // [{time, status, message}]
  createdAt    DateTime  @default(now()) @map("created_at")

  accountJobs BankSyncJobAccount[]
  @@map("bank_sync_jobs")
}

// Tiến trình download/sync của từng account trong 1 job
model BankSyncJobAccount {
  id             String    @id @default(uuid())
  jobId          String    @map("job_id")
  bankAccountId  String    @map("bank_account_id")
  status         String    // pending | downloading | parsing | storing | syncing | completed | failed | skipped
  rowsDownloaded Int       @default(0) @map("rows_downloaded")
  rowsInserted   Int       @default(0) @map("rows_inserted")
  rowsDuplicate  Int       @default(0) @map("rows_duplicate")
  rowsSynced     Int       @default(0) @map("rows_synced")
  errorMessage   String?   @map("error_message")
  createdAt      DateTime  @default(now()) @map("created_at")

  job         BankSyncJob @relation(fields: [jobId], references: [id])
  bankAccount BankAccount @relation(fields: [bankAccountId], references: [id])
  @@map("bank_sync_job_accounts")
}

// Giao dịch đã download
model BankTransaction {
  id                String   @id @default(uuid())
  bankAccountId     String   @map("bank_account_id")
  jobId             String   @map("job_id")
  postDate          DateTime @map("post_date")
  narrative         String?
  bankReference     String?  @map("bank_reference")
  customerReference String?  @map("customer_reference")
  trnType           String?  @map("trn_type")
  creditAmount      Decimal? @map("credit_amount") @db.Decimal(18,2)
  debitAmount       Decimal? @map("debit_amount") @db.Decimal(18,2)
  balance           Decimal? @db.Decimal(18,2)
  dataHash          String   @map("data_hash")
  rawData           Json     @map("raw_data")
  createdAt         DateTime @default(now()) @map("created_at")

  bankAccount BankAccount @relation(fields: [bankAccountId], references: [id])
  @@unique([bankAccountId, dataHash])
  @@map("bank_transactions")
}

// Template header config (lưu để detect thay đổi)
model BankDownloadTemplate {
  id          String   @id @default(uuid())
  name        String   @unique  // "hsbcnet_transaction"
  headers     Json     // string[] — danh sách header column
  headerHash  String   @map("header_hash")  // SHA256 để compare
  isActive    Boolean  @default(true) @map("is_active")
  updatedAt   DateTime @updatedAt @map("updated_at")
  createdAt   DateTime @default(now()) @map("created_at")
  @@map("bank_download_templates")
}

// Mapping công ty → quốc gia
model BankCountryMapping {
  id          String   @id @default(uuid())
  companyName String   @unique @map("company_name")
  countryCode String   @map("country_code")
  isActive    Boolean  @default(true) @map("is_active")
  createdAt   DateTime @default(now()) @map("created_at")
  @@map("bank_country_mappings")
}

// Cấu hình chung cho bank sync jobs
model BankJobSettings {
  id           String   @id @default(uuid())
  scheduleCron String   @default("30 9 * * *") @map("schedule_cron")  // default 9:30 sáng hàng ngày
  isScheduled  Boolean  @default(true) @map("is_scheduled")
  updatedAt    DateTime @updatedAt @map("updated_at")
  createdAt    DateTime @default(now()) @map("created_at")
  @@map("bank_job_settings")
}

// Cấu hình Google Sheet theo quốc gia
model BankGsheetConfig {
  id               String   @id @default(uuid())
  countryCode      String   @unique @map("country_code")
  spreadsheetId    String   @map("spreadsheet_id")
  spreadsheetUrl   String?  @map("spreadsheet_url")
  templateSheetName String? @map("template_sheet_name")  // tên sheet dùng để copy
  serviceKeyJson   String?  @map("service_key_json")  // service account JSON (encrypt trước khi lưu)
  isActive         Boolean  @default(true) @map("is_active")
  createdAt        DateTime @default(now()) @map("created_at")
  updatedAt        DateTime @updatedAt @map("updated_at")
  @@map("bank_gsheet_configs")
}
```

---

## 4. Job State Machine

```
pending
  → checking_session      kiểm tra session HSBCnet còn dùng được không
  → logging_in            nhập username, submit
  → waiting_2fa           đang chờ approve trên điện thoại (UI hiện countdown)
  → authenticated         đã vào được, lưu session
  → downloading           đang lấy từng account lần lượt
  → storing               đang parse Excel + lưu vào DB (dedup)
  → syncing_sheets        đang push lên Google Sheets
  → completed ✓
  → failed                lý do: timeout_2fa | session_error | download_error | parse_error | sheet_error
```

Log được ghi liên tục vào `bank_sync_jobs.logs` JSON array: `[{ time, status, message }]`

---

## 5. Google Sheets Sync

### Layout Sheet
Mỗi account = 1 sheet, sheet name = account_number (vd: `001-797281-001`)

```
C6:  Account name  (ví dụ: INTREPID VIETNAM LTD)
C7:  Account number (ví dụ: 001-797281-001)
C8:  Bank name (ví dụ: HK and Shanghai Banking Corp Ltd)
```

Data rows bắt đầu từ **row 11** (append thêm vào blank row cuối):
```
Col B: Post date   (dd-MMM-yy, ví dụ: 2-Jan-26)
Col C: Narrative
Col D: Bank reference
Col E: Credit amount
Col F: Debit amount
```

### Logic Sync
1. Với mỗi account trong job:
   - Tìm sheet tên `account_number` trong spreadsheet
   - Nếu chưa có → copy từ `template_sheet_name` → rename
   - Ghi thông tin account vào C6, C7, C8 (chỉ khi mới tạo sheet)
   - Tìm row cuối có data (last non-empty row từ row 11)
   - Append các transactions mới (chỉ những row chưa có — so sánh theo post_date + bank_reference)

### Cấu hình Settings
Setting > Job > Bank Statement > Sync Google Spreadsheet:
- Mỗi quốc gia: URL spreadsheet, Template sheet name
- Service account JSON key (upload hoặc paste)

---

## 6. Country / Company Mapping (default)

| Company Name | Country Code |
|---|---|
| INTREPID VIETNAM LTD | VN |
| INTREPID MALAYSIA SDN. BHD | MY |
| INTREPID DIGITAL I PT | ID |
| INTREPID PHILIPPINES INC. | PH |
| DATAMART VIET NAM CO., LTD | DM_VN |
| INTREPID DIGITAL COMMERCE PL | SG |

---

## 7. Architecture

### Services
```
apps/api     — NestJS API, job endpoints, SSE endpoint
apps/worker  — NestJS Worker, BullMQ processor, Playwright, Google Sheets API
apps/web     — Next.js UI
```

### Infrastructure (docker-compose.dev.yml)
```yaml
db:    postgres:16-alpine, port 5433
redis: redis:7-alpine, port 6379    ← cần thêm
```

### Tech Stack
| Component | Choice | Lý do |
|---|---|---|
| Queue | BullMQ | TypeScript native, reliable |
| Redis | redis:7-alpine | required by BullMQ |
| Browser automation | Playwright | stable, supports download intercept |
| Realtime status | SSE (Server-Sent Events) | đơn giản hơn WebSocket, phù hợp read-only stream |
| GSheets | googleapis (service account) | online, không cần local Excel |

### SSE Flow
```
Frontend → GET /bank-statement/jobs/:id/stream (EventSource)
API → pipe SSE events từ BullMQ job progress events
Worker → cập nhật job.logs + emit progress qua BullMQ
```

---

## 8. Settings UI Structure

```
Settings > Job                        ← section mới trong /settings
  └── Bank Statement
        ├── Schedule                   /settings/job/bank-statement (trang chính)
        │     - Toggle bật/tắt cron
        │     - Giờ chạy (time picker → convert sang cron)
        │     - Preview: "Chạy lúc 09:30 hàng ngày"
        │
        ├── Download Template          /settings/job/bank-statement/template
        │     - Xem/edit header columns
        │     - Hiện header hash
        │     - Cảnh báo khi header thay đổi so với template lưu
        │
        ├── Country Mappings           /settings/job/bank-statement/countries
        │     - Table: company name ↔ country code
        │     - Add/edit/delete mapping
        │
        └── Google Sheets Config       /settings/job/bank-statement/gsheets
              - Per country: spreadsheet URL, template sheet name
              - Upload/paste service account JSON
```

---

## 9. Permissions

```
bank_statement:view    — Xem danh sách job, transactions
bank_statement:run     — Chạy job đồng bộ
bank_statement:config  — Chỉnh cấu hình (settings)
```

---

## 10. UI Pages

### /bank-statement — Job Management
```
Header: "Sao kê ngân hàng" + nút "Chạy đồng bộ"
Chips: Tất cả / Thành công / Thất bại
Table:
  - Thời gian bắt đầu
  - Trạng thái (badge animate khi đang chạy)
  - Tài khoản xử lý (count)
  - Giao dịch (rows downloaded / synced)
  - Thời gian chạy
  - Lỗi (nếu có)
  - ⋯ menu: Xem log | Chạy lại

Click row → mở panel xem chi tiết log từng bước
SSE live update khi job đang chạy
```

### Dashboard card trong /modules
- Animated card: icon HSBC → arrow animation → GSheets icon
- Badge: "Đang bật"
- Footer: nút "Xem jobs" link đến /bank-statement

---

## 11. Decisions
- [x] Trigger: **scheduled** (cron) + **manual** từ UI
- [x] GSheets: **online API** — service account JSON key
  - Sheet: https://docs.google.com/spreadsheets/d/1h5gC1vqRfPvZ7DANAnAog-u5bDNNbpZRCaVuxAfzyQ0
- [x] 2FA: chờ 60s → resend 1 lần → chờ thêm 60s → fail nếu không vào được
- [x] Realtime: **SSE** (không dùng WebSocket)
- [x] Session: persist cookies vào file `apps/worker/sessions/hsbcnet.json`
- [x] Download: "Previous day" date range, Export > Transactions > Excel
- [x] Dedup: hash per row (accountNumber + postDate + narrative + bankRef + amounts)
- [x] GSheet layout: row 11+, col B=date, C=narrative, D=bankRef, E=credit, F=debit
- [x] Schedule: **09:30 sáng ICT** (`30 9 * * *`), cấu hình được trong Settings > Job > Bank Statement
  - Lưu vào `bank_job_settings.schedule_cron` — worker đọc từ DB khi start, không hardcode
  - User có thể bật/tắt schedule và đổi giờ từ UI
- [x] Browser: **headless** mặc định, override qua env `PLAYWRIGHT_HEADLESS=false` (local debug)

---

## 12. Implementation Order

### Phase 1 — Infrastructure
1. Add `redis` service vào `docker-compose.dev.yml`
2. Tạo `apps/worker` NestJS app (BullMQ + Playwright)

### Phase 2 — DB
3. Thêm tất cả Prisma models trên vào schema
4. Migration + seed default data (country mappings, download template)

### Phase 3 — Settings API + UI
5. API endpoints cho template, country mappings, gsheet config
6. Settings UI pages (3 sub-pages)

### Phase 4 — Worker
7. Playwright: login flow + session persistence
8. Playwright: 2FA wait + retry logic
9. Playwright: per-account download (filter → export Excel)
10. Excel parser (exceljs): extract transactions
11. DB storage với dedup
12. Google Sheets service: append rows

### Phase 5 — Job Management
13. API: trigger job, list jobs, job detail, SSE stream
14. BullMQ job processor wiring
15. UI: /bank-statement page với SSE live status

### Phase 6 — Dashboard card
16. Animated card trong /modules
