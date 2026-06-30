# Report AR — Design Document

## 1. Mục tiêu

Tích hợp báo cáo Accounts Receivable (AR) vào ứng dụng, cho phép:
- Cấu hình Google Spreadsheet nguồn (spreadsheetId, sheet name, service account key)
- Tải và xử lý dữ liệu AR trực tiếp từ Google Sheets
- Hiển thị dashboard AR: tổng quan, phân tích theo thương hiệu, chi tiết chưa xuất HĐ, chi tiết quá hạn

Nguồn GAS tham khảo: `D:\github-private\intrepid-coe-report-gas`

---

## 2. Data Model (Google Sheets)

**Sheet nguồn:** Sheet tab theo country code (mặc định "TH")

| Cột | Index | Tên field | Mô tả |
|-----|-------|-----------|-------|
| A | 0 | Type | Loại kinh doanh (Retail, Consignment, Store Management) |
| B | 1 | Period | Kỳ kế toán, format "YYYY Month" (vd: "2026 May") |
| D | 3 | Brand | Tên thương hiệu / khách hàng |
| I | 8 | Issued | Ngày phát hành HĐ (có giá trị = đã xuất HĐ) |
| J | 9 | Collected | Ngày thu tiền (có giá trị = đã thu) |
| K | 10 | Amount Accrue USD | Số tiền accrued (dùng khi chưa xuất HĐ) |
| L | 11 | Amount Invoice USD | Số tiền HĐ (dùng khi đã xuất HĐ) |
| P | 15 | Amount Latest USD | Số tiền mới nhất (fallback) |
| AG | 32 | Group Status | Trạng thái phân loại AR |

**Dữ liệu bắt đầu từ row 3** (row 1-2 là header).

### Group Status values
- `Pending collection under credit term` — Đã xuất HĐ, còn trong hạn tín dụng
- `Pending collection over due` — Đã xuất HĐ, quá hạn thu tiền
- `Pending confirmation` — Chờ xác nhận trước khi xuất HĐ
- `Collected` — Đã thu tiền (loại khỏi tính toán AR)

---

## 3. Logic xử lý dữ liệu

### Chọn amount (ưu tiên theo loại)

```
isIssued = col I có giá trị hợp lệ
isCollected = col J có giá trị hợp lệ

amount =
  if isIssued: amountInvoice(L) || amountAccrue(K) || amountLatest(P)
  else:        amountAccrue(K) || amountLatest(P)
```

### Kiểm tra date cell hợp lệ

```
isValidDate(val) = val không phải: rỗng, "0", "false", "#DIV/0!"
```

### Tính toán AR Summary

```
totalAR    = Σ amount where NOT isCollected
unbilled   = Σ amount where NOT isCollected AND NOT isIssued
underTerm  = Σ amount where isIssued AND NOT isCollected AND status = "Pending collection under credit term"
overdue    = Σ amount where isIssued AND NOT isCollected AND status = "Pending collection over due"
```

### AR by Brand

Nhóm theo Brand (col D), đếm số dòng (không phải amount) theo từng category:
- `unbilled`: NOT isCollected AND NOT isIssued
- `overdue`: isIssued AND NOT isCollected AND status = overdue
- `underTerm`: isIssued AND NOT isCollected AND status = under term
- Sắp xếp theo total desc

### Detail rows

**Unbilled:** NOT isCollected AND NOT isIssued
**Overdue:** isIssued AND NOT isCollected AND status = overdue

Columns: period (display), brand, bizClass, amount, status
Sorted: period sortKey desc → brand asc

---

## 4. Database Schema

```prisma
model ArGsheetConfig {
  id             String   @id @default(uuid())
  countryCode    String   @unique @map("country_code")  // e.g., "TH"
  spreadsheetId  String   @map("spreadsheet_id")
  sheetName      String   @default("TH") @map("sheet_name")
  spreadsheetUrl String?  @map("spreadsheet_url")
  isActive       Boolean  @default(true) @map("is_active")
  createdAt      DateTime @default(now()) @map("created_at")
  updatedAt      DateTime @updatedAt @map("updated_at")
  @@map("ar_gsheet_configs")
}

model ArReportSettings {
  id                   String   @id @default(uuid())
  googleServiceKeyJson String?  @map("google_service_key_json")
  updatedAt            DateTime @updatedAt @map("updated_at")
  createdAt            DateTime @default(now()) @map("created_at")
  @@map("ar_report_settings")
}
```

---

## 5. Permissions

| Key | Mô tả |
|-----|-------|
| `report_ar:view` | Xem báo cáo AR |
| `report_ar:config` | Cấu hình cài đặt AR |

---

## 6. API Endpoints

Base path: `/management/report-ar`

| Method | Path | Permission | Mô tả |
|--------|------|-----------|-------|
| GET | `/settings` | `report_ar:config` | Lấy global settings (service key masked) |
| PUT | `/settings` | `report_ar:config` | Cập nhật global settings |
| GET | `/settings/gsheets` | `report_ar:config` | Danh sách gsheet configs |
| PUT | `/settings/gsheets/:countryCode` | `report_ar:config` | Upsert gsheet config |
| GET | `/data` | `report_ar:view` | Tải + xử lý dữ liệu AR từ Sheets |

### GET /data query params

| Param | Default | Mô tả |
|-------|---------|-------|
| `country` | `TH` | Country code để chọn ArGsheetConfig |

### Response /data

```typescript
type ArDataResponse = {
  summary: {
    totalAR: number;
    unbilled: number;
    underTerm: number;
    overdue: number;
  };
  byBrand: {
    brand: string;
    unbilled: number;
    underTerm: number;
    overdue: number;
    total: number;
  }[];
  unbilledRows: {
    period: string;     // "May 2026"
    brand: string;
    bizClass: string;
    amount: number;
    status: string;
  }[];
  overdueRows: {
    period: string;
    brand: string;
    bizClass: string;
    amount: number;
    status: string;
  }[];
};
```

---

## 7. Frontend Structure

```
apps/web/src/
  app/(dashboard)/
    report-ar/page.tsx                        ← Route
    settings/job/report-ar/page.tsx           ← Settings route
  features/
    report-ar/
      ReportArPage.tsx                        ← Report dashboard
      ReportArPage.module.css
    settings/
      report-ar/
        ReportArSettingsPage.tsx              ← Settings (2 tabs)
        ReportArSettingsPage.module.css
```

### Report Page Tabs

1. **Tổng quan** — Summary cards (totalAR, unbilled, overdue, underTerm) + AR by Brand horizontal bar chart (CSS-based)
2. **Chưa xuất HĐ** — Bảng unbilledRows: Period | Brand | Loại KD | Amount | Status
3. **Quá hạn** — Bảng overdueRows: Period | Brand | Loại KD | Amount | Status

### Settings Page Tabs

1. **Kết nối** — Google Service Account Key JSON (textarea, masked)
2. **Spreadsheets** — List gsheet configs per country (country code, spreadsheet ID, sheet name, spreadsheet URL)

---

## 8. Navigation

Thêm nav group mới **"Báo cáo"** vào sidebar:
```
NAV_GROUPS → thêm group "Báo cáo"
  children: [{ label: 'AR', href: '/report-ar', icon: ReportArIcon }]
```

Settings search: `/settings/job/report-ar` → breadcrumb "Cài đặt"

---

## 9. Amount Formatting

```
>= 1,000,000  → "$X.XM"
>= 1,000      → "$X.XK"
else          → "$X"
```

---

## 10. Dependencies

- `googleapis` — thêm vào `apps/api/package.json` (đã có trong worker)
- Không cần thêm chart library cho frontend (dùng CSS bar chart)
