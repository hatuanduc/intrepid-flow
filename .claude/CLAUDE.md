# Project Guidelines

## Tech Stack & Project Structure

Monorepo (npm workspaces):
- `apps/api` — **NestJS** backend, port 4000, Prisma + PostgreSQL
- `apps/web` — **Next.js** (App Router), port 3000, TypeScript, CSS Modules

```
apps/
  api/src/
    modules/[feature]/         ← feature modules (controller + service + dto/)
    common/
      filters/                 ← global HTTP exception filter
      decorators/              ← @HasPermission()
      guards/                  ← PermissionGuard
    prisma/                    ← PrismaModule (@Global), PrismaService
  web/src/
    app/
      (dashboard)/             ← protected layout, UserContext, page routes
      login/                   ← public login page
    features/settings/         ← Users/Roles/Permissions feature pages
    components/
      common/                  ← PageLoader, RightPanel, Pagination, CanAccess, AccessDenied
      layout/                  ← DashboardLayout (sidebar, topbar)
      icons/                   ← all SVG icon components
    hooks/                     ← useHasPermission, useHasAnyPermission
    lib/
      api.ts                   ← tất cả API calls (dùng request() helper)
      auth.ts                  ← getToken / setToken / clearToken (localStorage)
    styles/
      ui.module.css            ← shared CSS design primitives (single source of truth)
```

Dev: `npm run dev` từ root chạy cả api lẫn web đồng thời.

## UI Design System
Full reference: @ui-reference.md — **read this before building any new page or component.**

When building UI components:
- Use CSS variables from globals.css (see table below) — never hardcode hex values for common tokens
- Follow component patterns in ui-reference.md §3: buttons, tables, badges, more-menu, group-header
- Animations: 0.15s ease for micro-interactions (hover, focus), 0.22s cubic-bezier for panels
- Never use inline styles — always CSS Modules (`.module.css`)
- Never use `<a href>` for internal navigation — always `<Link>` from `next/link`

## Shared CSS Module

Tất cả design primitives sống tại `apps/web/src/styles/ui.module.css` — **single source of truth**.

Mỗi page/feature module dùng `composes` để kế thừa, không copy CSS:

```css
/* features/xxx/XxxPage.module.css */
.page { padding: 28px 32px; }  /* page-specific */

/* shared via composes */
.pageHeader { composes: pageHeader from '../../../styles/ui.module.css'; }
.btnPrimary { composes: btnPrimary from '../../../styles/ui.module.css'; }
.th         { composes: th         from '../../../styles/ui.module.css'; }
.td         { composes: td         from '../../../styles/ui.module.css'; }
/* ... */

/* table row behavior (page-level descendant rules) */
.table { width: 100%; border-collapse: collapse; }
.table tr:hover .td { background: var(--bg-hover); }
.table tr:last-child .td { border-bottom: none; }
.table tbody tr { cursor: pointer; }
```

```tsx
/* Phải thêm className={s.th} và className={s.td} vào phần tử HTML */
<th className={s.th}>Tên</th>
<td className={s.td}>...</td>
```

**Quy tắc:** Khi thay đổi chuẩn (font, spacing, màu), chỉ sửa `ui.module.css` — tất cả trang tự cập nhật.

## Typography Rules

Stripe-inspired — 3 sizes, 3 colors, consistent weight. **Do not introduce new sizes.**

| Zone | Size | Weight | Color |
|---|---|---|---|
| Page title (h1) | 20px | 600 | `var(--color-ink)` |
| Table header (th) | 12px | 600 | `var(--color-secondary)` |
| Table cell / body text | 13px | 500 | `var(--color-secondary)` |
| Name / primary value | 13px | 500 | `var(--color-ink)` |
| Meta text (email, timestamp, desc) | 12px | 400 | `var(--color-muted)` |
| Form label | 13px | 500 | `var(--color-secondary)` |
| Form input | 14px | 400 | `var(--color-ink)` |
| Button | 13px | 500 | — |
| Chip / filter label | 12px | 500 | `var(--color-secondary)` |
| Badge / count pill | 11px | 600 | — |

**3 font colors only:** `--color-ink` (primary), `--color-secondary` (default), `--color-muted` (meta). Do not use raw hex text colors.

## CSS Variables (globals.css)
Common tokens live in `:root` in `globals.css`. **Always use `var()` — never hardcode the raw hex.**

| Variable | Value | Dùng cho |
|---|---|---|
| `--color-ink` | `#1a1f36` | headings, primary text |
| `--color-secondary` | `#3c4257` | table cells, labels |
| `--color-muted` | `#697386` | descriptions, timestamps |
| `--color-subtle` | `#a3acb9` | placeholders, hints |
| `--color-border` | `#e3e8ee` | card, input, divider borders |
| `--color-border-light` | `#f0f4f8` | table row separator |
| `--color-border-strong` | `#c4cdd6` | strong border |
| `--color-accent` | `#635bff` | primary buttons, CTA |
| `--color-accent-hover` | `#4f46e5` | button hover |
| `--color-accent-active` | `#625afa` | tab underline, active text, avatar bg |
| `--color-accent-light` | `#f0effe` | active nav bg, selected bg |
| `--bg-surface` | `#ffffff` | cards, panels |
| `--bg-page` | `#f6f9fc` | page bg, hover bg |
| `--bg-table-head` | `#f7fafc` | table header bg |
| `--bg-hover` | `#fafbfd` | row hover |
| `--bg-subtle` | `#f0f4f8` | disabled, count badges |

**Nếu một giá trị dùng ở nhiều nơi mà chưa có variable** → thêm vào `:root` trong `globals.css` trước khi dùng.

Giá trị **không** cần variable: màu badge semantic (green/red/gray cho status) — chúng đi theo cặp bg+text cố định, ít thay đổi.

## Table structure
Open/borderless style (Stripe-inspired) — no outer box, full width. Every list page uses this layout (see ui-reference.md §2, §3.2b, §3.2c, §3.3):
1. `.chips` — stats chips row (filter + count), `margin-bottom: 12px` (see §3.2b)
2. `.filterBar` — search input, `background: transparent`, `border-bottom: 1px solid var(--color-border)` only
3. `.tableWrap` — no outer border, no border-radius, `overflow: visible`
- `thead`: no background, `border-bottom: 1px solid var(--color-border)` only, `12px/600` text `var(--color-secondary)` (no uppercase)
- `tbody tr`: hover bg `var(--bg-hover)`, row separator `1px solid var(--color-border-light)`
- Last column: `⋯` more-menu button (see §3.7)
- Name column: avatar initials (30px circle, **multi-color** via `avatarColor()`) + name (see §3.4)
- Role column: `<RoleBadge>` component with color per role type (see §3.5b)
- `.page`: `padding: 28px 32px`, no `max-width`

## Table row interaction pattern
Every table row and group row follows this pattern:
- **Click row** → opens detail/edit RightPanel for that item
- **`⋯` button** (last column) → dropdown with actions; click must `e.stopPropagation()` to prevent row click
- **`⋯` button visibility**: `opacity: 0` by default, `opacity: 1` on row hover (`tr:hover .moreBtn`), `opacity: 1` when dropdown is open (`.moreBtnOpen` class)
- **Dropdown actions**: "Chỉnh sửa" (opens edit panel) + "Xóa" (shows confirm modal)
- **Delete confirm modal**: inline overlay with item name, "Hủy" + red "Xóa" button, error state
- **System rows** (isSystem: true): may omit "Xóa" from the dropdown
- Group rows (non-table): use `<div role="button">` instead of `<button>` so the inner `⋯` `<button>` is valid HTML

## Right Panel (not Modal)
Use `RightPanel` component from `components/common/RightPanel` for create/edit forms.
Use modal only for destructive confirm (delete, lock).
See ui-reference.md §4 for full usage pattern.

## View-First, Edit-On-Demand Pattern

Trang hiển thị thông tin (profile, detail, settings) nên theo pattern: **chỉ hiện thị mặc định, show form khi click Edit**.

**Khi nào dùng:**
- Trang profile/account, trang chi tiết của entity
- Card/section có nhiều fields cần hiển thị nhưng ít khi edit

**3 variants tuỳ độ phức tạp:**

| Trường hợp | Pattern |
|---|---|
| 1 field đơn giản (tên) | Inline edit mode: toggle giữa text ↔ input trong cùng card |
| Nhiều fields liên quan | RightPanel slide-in khi click Edit |
| Action nguy hiểm (đổi mật khẩu) | Riêng biệt — button trong edit mode → mở RightPanel |

**Cấu trúc card view-first (inline edit mode):**

```tsx
// Card header: tiêu đề + Edit/Save/Cancel
<div className={s.cardHead}>
  <span className={s.cardTitle}>Thông tin</span>
  {!editing ? (
    <button className={s.btnEdit} onClick={startEdit}><EditIcon /> Chỉnh sửa</button>
  ) : (
    <div className={s.editActions}>
      <button className={s.btnCancel} onClick={cancelEdit}>Hủy</button>
      <button className={s.btnSave} form="my-form" type="submit">Lưu thay đổi</button>
    </div>
  )}
</div>

// Rows: label + value (view) hoặc label + input (edit)
<div className={s.infoRow}>
  <span className={s.infoLabel}>Tên hiển thị</span>
  {editing
    ? <input className={s.input} value={name} onChange={...} autoFocus />
    : <span className={s.infoValue}>{displayName}</span>}
</div>
<div className={s.infoRow}>
  <span className={s.infoLabel}>Email</span>
  <span className={s.infoValue}>{email}</span>  {/* luôn read-only */}
</div>
```

**Quy tắc:**
- Row label width cố định (~140px), value flex-1
- Email / ID / system fields: **luôn read-only**, không edit dù ở edit mode
- `displayName` là local state riêng để cập nhật ngay sau save, không cần reload
- Sau save thành công: `setDisplayName(newValue); setEditing(false);` + toast success
- Nếu card chỉ có 1–2 editable fields → inline edit mode thay vì mở thêm RightPanel

## API Controller & DTO Pattern (NestJS)

Mỗi module có cấu trúc:
```
modules/[feature]/
  dto/
    create-[feature].dto.ts     ← request body IN (POST)
    update-[feature].dto.ts     ← request body IN (PUT/PATCH)
    [feature]-response.dto.ts   ← response OUT (dùng cho Swagger, không expose password/sensitive fields)
  [feature].controller.ts
  [feature].service.ts
```

**DTO request** — dùng class-validator + @ApiProperty:
```typescript
export class CreateXxxDto {
  @ApiProperty({ example: '...' })
  @IsString() @MinLength(1)
  name!: string;          // luôn dùng ! (definite assignment)
}
```

**DTO response** — chỉ @ApiProperty, không có validator:
```typescript
export class XxxResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty({ nullable: true }) name!: string | null;
}
```

**Controller** — luôn có đủ Swagger decorators + RBAC guards:
```typescript
@ApiTags('Feature')
@ApiBearerAuth()
@Controller('management')
@UseGuards(JwtAuthGuard, PermissionGuard)   // thứ tự: Jwt trước, Permission sau
export class XxxController {
  @Get('items')
  @HasPermission('xxx:view')
  @ApiOperation({ summary: '...' })
  @ApiResponse({ status: 200, type: XxxResponseDto, isArray: true })
  async list() { ... }

  @Post('items')
  @HasPermission('xxx:create')
  @ApiOperation({ summary: '...' })
  async create(@Body() body: CreateXxxDto) { ... }
}
```

**Service** — throw NestJS exceptions (không dùng `throw new Error()`):
```typescript
throw new NotFoundException('USER_NOT_FOUND');
throw new ConflictException('EMAIL_EXISTS');
throw new UnprocessableEntityException('ROLE_NOT_FOUND');
```

Swagger UI: `http://localhost:4000/docs`

## API Error Handling (NestJS)

Global exception filter tại `apps/api/src/common/filters/http-exception.filter.ts` — mọi lỗi đều trả về format nhất quán:

```json
{ "statusCode": 409, "code": "EMAIL_EXISTS", "message": "EMAIL_EXISTS" }
{ "statusCode": 400, "code": "VALIDATION_ERROR", "message": "email must be an email" }
{ "statusCode": 500, "code": "INTERNAL_ERROR", "message": "Internal server error" }
```

- Throw lỗi trong service: dùng NestJS exceptions (`NotFoundException`, `ConflictException`, `UnprocessableEntityException`, ...) với error code string làm message
- **Không dùng** `throw new Error(...)` — dùng `throw new HttpException('CODE', HttpStatus.XXX)` để filter bắt được
- Controllers dùng **DTO** (không dùng `body: any`) — đặt trong `dto/` cạnh controller
- ValidationPipe global: `whitelist: true, transform: true`

## Form Validation (Frontend)

Validate client-side trước khi gửi API. Pattern chuẩn — inline error dưới field, clear khi user gõ lại:

```tsx
const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

function clearField(field: string) {
  setFieldErrors(prev => { const next = { ...prev }; delete next[field]; return next; });
}

function validate() {
  const errs: Record<string, string> = {};
  if (!name.trim()) errs.name = 'Vui lòng nhập tên.';
  if (!email.trim()) errs.email = 'Vui lòng nhập email.';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errs.email = 'Email không hợp lệ.';
  if (!password) errs.password = 'Vui lòng nhập mật khẩu.';
  else if (password.length < 6) errs.password = 'Mật khẩu tối thiểu 6 ký tự.';
  return errs;
}

async function submit(e: React.FormEvent) {
  e.preventDefault();
  const errs = validate();
  if (Object.keys(errs).length > 0) { setFieldErrors(errs); return; }
  setFieldErrors({});
  // ... gọi API
}
```

```tsx
// Trong JSX
<input
  className={`${s.input} ${fieldErrors.name ? s.inputError : ''}`}
  onChange={e => { setName(e.target.value); clearField('name'); }}
/>
{fieldErrors.name && <span className={s.fieldError}>{fieldErrors.name}</span>}
```

CSS cần có trong module (thêm vào `.module.css` của form):
```css
.inputError { border-color: #df1b41 !important; }
.inputError:focus { border-color: #df1b41 !important; box-shadow: 0 0 0 3px rgba(223,27,65,0.10) !important; }
.fieldError { font-size: 12px; color: #df1b41; margin-top: -2px; }
```

**Fields cần validate:**
- `required`: thông báo "Vui lòng nhập..."
- `email`: check format với regex
- `password` (create): min 6 ký tự
- `password` (edit): chỉ check nếu có nhập
- `roleIds` / select list: ít nhất 1 item

Không dùng `noValidate` hay HTML5 native validation — dùng custom hoàn toàn để control UI.

## Pagination

Dùng `<Pagination>` từ `components/common/Pagination` cho mọi table có list data.

- Tự **ẩn** khi `total ≤ pageSize` — không cần điều kiện ngoài
- Đặt **bên trong** `.tableWrap` (sau `</table>`) để border-top tự tách
- Reset `page` về 1 khi filter/search thay đổi

```tsx
import Pagination from '../../../components/common/Pagination';

// State
const [page, setPage] = useState(1);
const [pageSize, setPageSize] = useState(20);

// Slice sau khi filter
const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

// Trong JSX — bên trong .tableWrap, sau </table>
<Pagination
  page={page}
  pageSize={pageSize}
  total={filtered.length}
  onPageChange={setPage}
  onPageSizeChange={size => { setPageSize(size); setPage(1); }}
/>
```

## Mobile Responsive

Breakpoint duy nhất: **768px** (mobile ≤ 768px, desktop > 768px).

**Layout shell** (DashboardLayout) đã handle:
- Sidebar ẩn mặc định trên mobile, slide-in qua hamburger menu
- Hamburger button chỉ hiện trên mobile (`display: none` → `display: flex` tại `@media (max-width: 768px)`)
- Overlay mờ khi sidebar mở

**Trong page/feature CSS**, cần thêm responsive cho:
```css
/* Content padding */
.page { padding: 28px 32px; }
@media (max-width: 768px) {
  .page { padding: 16px; }
}

/* Table: ẩn cột ít quan trọng trên mobile */
@media (max-width: 768px) {
  .table th:nth-child(2),
  .table td:nth-child(2) { display: none; }  /* ẩn cột email */
}

/* Cards: 1 cột trên mobile */
@media (max-width: 768px) {
  .grid { grid-template-columns: 1fr; }
}
```

**Quy tắc:**
- Không dùng `px` cố định cho width khi có thể dùng `%` hoặc `min()` / `max()`
- Touch target tối thiểu **44px** height cho button/link trên mobile
- Nếu table có nhiều cột → ẩn cột ít quan trọng trên mobile (`@media` + `display: none`)
- Panel/modal: `width: 100%; border-radius: 0` trên mobile (slide từ bottom hoặc fullscreen)

## Database Naming Convention (Prisma + PostgreSQL)

- **Table names**: snake_case, số nhiều → `users`, `bank_statements`, `user_roles`
- **Column names**: snake_case → `is_active`, `created_at`, `user_id`
- **Prisma model**: PascalCase singular → `User`, `BankStatement`
- **Prisma fields**: camelCase → `isActive`, `createdAt` (TS code dùng bình thường)
- Luôn thêm `@map("snake_case")` cho mọi camelCase field
- Luôn thêm `@@map("snake_case_plural")` cho mọi model
- Relation fields (virtual, không phải column) **không cần** `@map`

```prisma
model BankStatement {
  id        String  @id @default(uuid())
  accountId String  @map("account_id")   // ← scalar field: cần @map
  isActive  Boolean @map("is_active")
  createdAt DateTime @map("created_at")
  account   Account @relation(...)       // ← relation field: KHÔNG @map

  @@map("bank_statements")
}
```

## RBAC — Phân quyền theo vai trò

Hệ thống phân quyền 3 lớp: DB schema → Backend guard → Frontend check.

### Permission keys (định nghĩa trong permissions.service.ts, sync on startup)

| Key | Mô tả |
|---|---|
| `users:view` | Xem danh sách user |
| `users:create` | Tạo user mới |
| `users:edit` | Chỉnh sửa user |
| `users:delete` | Xóa user |
| `roles:view` | Xem vai trò |
| `roles:create` | Tạo vai trò |
| `roles:edit` | Chỉnh sửa vai trò |
| `roles:delete` | Xóa vai trò |
| `permissions:view` | Xem danh sách quyền |
| `modules:view` | Xem workflow modules |
| `modules:manage` | Bật/tắt workflow module |

Thêm permission mới → thêm vào `permissions.service.ts` (mảng `CORE_PERMISSIONS`), restart để sync.

### Backend — bảo vệ endpoint

```typescript
// Dùng cả hai guard: JwtAuthGuard (verify token) + PermissionGuard (check permission)
@Controller('management')
@UseGuards(JwtAuthGuard, PermissionGuard)  // thứ tự quan trọng
export class XxxController {
  @Get('items')
  @HasPermission('xxx:view')             // decorator trên method
  async list() { ... }

  @Post('items')
  @HasPermission('xxx:create')
  async create() { ... }

  @Put('items/:id')
  @HasPermission('xxx:edit')
  async update() { ... }

  @Delete('items/:id')
  @HasPermission('xxx:delete')
  async delete() { ... }
}
```

Import:
```typescript
import { PermissionGuard } from '../../common/guards/permission.guard';
import { HasPermission } from '../../common/decorators/has-permission.decorator';
```

Khi thiếu quyền → API trả về `403 { "statusCode": 403, "code": "FORBIDDEN" }`.

`JwtAuthGuard` đã load đầy đủ `roles[]` + `permissions[]` vào `req.authUser` — không cần query thêm.

### Frontend — kiểm tra quyền trong component

```tsx
import { useHasPermission } from '../../../hooks/useHasPermission';
import AccessDenied from '../../../components/common/AccessDenied';
import CanAccess from '../../../components/common/CanAccess';

export default function UsersPage() {
  // ⚠️ QUAN TRỌNG: khai báo TẤT CẢ hooks trước bất kỳ early return nào
  const canView   = useHasPermission('users:view');
  const canCreate = useHasPermission('users:create');
  const canEdit   = useHasPermission('users:edit');
  const canDelete = useHasPermission('users:delete');
  const [items, setItems] = useState([]);
  // ... tất cả useState, useEffect khác ở đây

  // Sau khi khai báo hết hooks, mới được early return
  if (!canView) return <AccessDenied />;

  return (
    <>
      {/* Ẩn/hiện button dựa trên quyền */}
      {canCreate && <button onClick={openPanel}>+ Thêm</button>}

      {/* Hoặc dùng CanAccess wrapper */}
      <CanAccess permission="users:create">
        <button onClick={openPanel}>+ Thêm</button>
      </CanAccess>

      {/* MoreMenu: pass undefined thay vì callback khi không có quyền */}
      <MoreMenu
        onEdit={canEdit ? () => setEdit(item) : undefined}
        onDelete={canDelete ? () => setDelete(item) : undefined}
      />
    </>
  );
}
```

### Lấy thông tin user hiện tại

```tsx
import { useUser } from '../../../app/(dashboard)/user-context';

const user = useUser(); // { id, email, name, roles: string[], permissions: string[] }
```

### Quy tắc RBAC

- **Backend là lớp bảo vệ thực sự** — frontend chỉ là UX (ẩn nút), không phải security
- Mọi endpoint management phải có `@HasPermission()` — không exception
- Khai báo tất cả hooks TRƯỚC `if (!canView) return <AccessDenied />` — React rules of hooks
- `MoreMenu` props dạng optional (`onEdit?`, `onDelete?`) — `return null` nếu không có cả hai
- `AccessDenied`: `components/common/AccessDenied`
- `CanAccess`: `components/common/CanAccess` — props: `permission` + optional `fallback`

## API Client Pattern (Frontend)

Tất cả API calls nằm trong `apps/web/src/lib/api.ts`. Dùng internal `request()` helper:

```typescript
// Thêm function mới vào lib/api.ts
export type XxxItem = { id: string; name: string; /* ... */ };

export async function listXxx() {
  return request<{ items: XxxItem[] }>('/management/xxx', { auth: true });
}

export async function createXxx(body: { name: string }) {
  return request<{ item: XxxItem }>('/management/xxx', {
    method: 'POST',
    body: JSON.stringify(body),
    auth: true,
  });
}

export async function updateXxx(id: string, body: Partial<{ name: string }>) {
  return request<{ item: XxxItem }>(`/management/xxx/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
    auth: true,
  });
}

export async function deleteXxx(id: string) {
  return request<{ ok: boolean }>(`/management/xxx/${id}`, {
    method: 'DELETE',
    auth: true,
  });
}
```

- `auth: true` → tự thêm `Authorization: Bearer <token>` header
- API base URL: `http://localhost:4000` (dev) — configurable qua `NEXT_PUBLIC_API_BASE_URL`
- Khi API lỗi → `request()` throw `Error(message)` với `message` là error code từ backend (vd: `'EMAIL_EXISTS'`)

## Thêm trang mới vào Sidebar

Sidebar được định nghĩa trong `apps/web/src/components/layout/DashboardLayout.tsx`:

```typescript
// Luôn hiển thị trong section "Chức năng"
const FEATURE_NAV: NavItem[] = [
  { label: 'Quy trình', href: '/modules', icon: WorkflowIcon },
  { label: 'Cài đặt', href: '/settings', icon: SettingsIcon },
  // Thêm item mới ở đây
  { label: 'Báo cáo', href: '/reports', icon: ReportIcon },
];

// Ẩn dưới "Xem thêm" — dành cho tính năng ít dùng hơn
const MORE_NAV: NavItem[] = [
  // Thêm item ít dùng ở đây
];
```

Items trong `FEATURE_NAV` và `MORE_NAV` có thể pin vào Shortcuts. `MAIN_NAV` (Tổng quan) không có pin.

Icon: tạo inline SVG `14x14` trong cùng file, theo pattern của `WorkflowIcon` / `SettingsIcon`.

## Toast Notifications

Dùng `useToast()` từ `components/common/Toast` để hiện feedback sau các action (create/edit/delete).

```tsx
import { useToast } from '../../../components/common/Toast';

export default function UsersPage() {
  const toast = useToast();

  async function handleCreate() {
    try {
      await createUser(body);
      toast.success('Tạo tài khoản thành công.');
      load();
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      toast.error(ERROR_MESSAGES[code] ?? 'Tạo thất bại. Vui lòng thử lại.');
    }
  }
}
```

**3 loại:** `toast.success()` / `toast.error()` / `toast.info()` — đều nhận 1 string.

**Vị trí:** bottom-left, auto-dismiss sau 4s, có nút × để đóng sớm.

**Quy tắc:**
- Mọi action create/edit/delete phải có toast success + toast error
- Translate error code thành tiếng Việt trước khi pass vào `toast.error()`
- Không dùng `alert()` hay console.log để debug UX

## Loading / Empty / Error states
- Full-page loading: `<PageLoader />` from `components/common/PageLoader`
- Inline loading: `<Spinner size={20} />` from same file
- Empty: `.empty` class, centered, color `var(--color-subtle)`
- Error: `.error` class, red text on light red bg (see ui-reference.md §7)

## i18n — Translations (Vietnamese + English)

Translation files: `apps/web/src/lib/i18n/en.ts` and `vi.ts`.

**Rule: whenever any UI text is added or changed, also update the corresponding keys in both `en.ts` and `vi.ts`.**

Usage:
```tsx
import { useT } from '../../../lib/i18n';
const { t, lang } = useT();
t('namespace.key')
t('namespace.key', { param: value })  // {param} interpolation
```

- All user-visible strings go through `t()` — no hardcoded text in components
- Keys use dot-notation: `namespace.key` (e.g. `bankSettings.saveSettings`)
- `en.ts` exports `Translations` type — TypeScript enforces `vi.ts` has same shape
- `lang` is `'vi' | 'en'` — use for locale-aware formatting (`Intl.DateTimeFormat`)
- Language persisted in `localStorage` key `'app.language'`, default `'en'`
