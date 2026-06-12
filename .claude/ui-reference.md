# Intrepid UI Reference
> Dùng file này làm chuẩn khi tạo bất kỳ trang mới nào trong project.

---

## 1. DESIGN TOKENS

### Colors (dùng trực tiếp — không qua CSS variable vì dùng CSS Modules)

```
/* Text */
#1a1f36   — primary text, headings, bold values
#3c4257   — secondary text, labels, table cell content
#697386   — muted text, descriptions, timestamps
#8898aa   — placeholder, hints, disabled
#a3acb9   — very muted

/* Backgrounds */
#ffffff   — surface (cards, panels, table bg)
#f6f9fc   — page background, hover bg, table header
#f7fafc   — table header bg
#f0f4f8   — subtle bg, disabled bg
#fafbfd   — hover row bg (lighter variant)

/* Border */
#e3e8ee   — standard border (cards, dividers, inputs)
#f0f4f8   — light divider (table row separator)
#c4cdd6   — strong border

/* Brand / Accent */
#635bff   — primary CTA buttons, active states
#4f46e5   — primary button hover
#625afa   — active nav, active tab underline (slightly brighter variant)
#f0effe   — accent light bg (active nav item, selected state)
#ebe8ff   — tab count badge when active

/* Status */
#059669   — green dot (active)
#0e6245   — green text (active badge)
#d1fae5   — green badge bg
#df1b41   — error text
#fff0f3   — error bg
#fecaca   — error border
#64748b   — inactive/locked text
#f1f5f9   — inactive badge bg
```

### Typography

```
Font stack: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif
           (Geist via var(--font-geist-sans) trong Topbar/BrandLogo)

Sizes:
  11px — badges, uppercase labels, meta info
  12px — secondary labels, role descriptions, timestamps
  13px — table body, form labels, buttons, tab text, dropdown items
  14px — form inputs, card descriptions
  15px — panel titles
  20px — page titles (h1)

Weights:
  400 — body text
  500 — buttons, nav items, labels, form labels
  600 — page titles, section headers, active tabs, badge text
  700 — stat values (nếu có)
```

### Spacing (luôn dùng bội số của 4px)

```
Page padding:  28px 32px  (padding của .page wrapper)
Card padding:  20px 22px
Panel padding: 24px
Section gap:   24–28px
Form gap:      16px giữa fields
Element gap:   8px giữa items nhỏ
```

### Border Radius

```
6px   — buttons, inputs, small chips
8px   — dropdown, table wrapper, role cards
10px  — badges, cards, panels
12px  — large cards, module cards
50%   — avatars
```

### Shadows

```
Table / card:  0 1px 3px rgba(49,49,93,.06), 0 1px 2px rgba(0,0,0,.04)
Dropdown:      0 4px 20px rgba(0,0,0,.10), standard border
Right panel:   -8px 0 40px rgba(0,0,0,.12)
```

---

## 2. PAGE ANATOMY

### Cấu trúc chuẩn của mọi trang trong (dashboard)

```
apps/web/src/
  app/(dashboard)/
    [feature]/page.tsx        ← Next.js page, export metadata, import feature component
  features/
    [feature]/
      FeaturePage.tsx         ← 'use client', logic + UI
      FeaturePage.module.css  ← scoped CSS
      SubComponent.tsx        ← panel, modal, etc.
      SubComponent.module.css
```

### Layout của một trang list (Users, Roles, Modules...)

Open/borderless table style (Stripe-inspired) — no outer box, full-width, row separators only.

```
.page (padding: 28px 32px, no max-width)
  ├── .pageHeader (flex, space-between, mb: 20-24px)
  │     ├── h1.pageTitle (font: 20px/600/#1a1f36)
  │     └── button.btnPrimary (+ Thêm ...)
  │
  ├── .chips (flex, gap: 8px, mb: 12px)              ← stats chips: filter + count display
  │     └── button.chip / button.chipSelected
  │
  ├── .filterBar (transparent bg, border-bottom only) ← search input
  │     └── .searchWrap → .searchInput
  │
  └── .tableWrap (no outer border, no border-radius)
        └── table.table
              ├── thead: th uppercase, 11px, #8898aa, no bg, border-bottom only
              └── tbody: tr hover bg #fafbfd, td row separator only
```

### Layout của một trang settings-hub (links đến sub-sections)

```
.page
  ├── groups: nhóm cards theo chủ đề
  │     ├── .group → .groupTitle (label nhỏ uppercase)
  │     └── .grid → button.card (icon + title + desc)
  └── (không cần RightPanel, click card → navigate)
```

---

## 3. COMPONENT PATTERNS

### 3.1 Page Header

```tsx
<div className={s.pageHeader}>
  <h1 className={s.pageTitle}>Tên trang</h1>
  <button className={s.btnPrimary} onClick={...}>+ Thêm mục</button>
</div>
```

```css
.pageHeader { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
.pageTitle  { font-size: 20px; font-weight: 600; color: #1a1f36; letter-spacing: -0.3px; margin: 0; }
```

### 3.2 Tab Bar (filter theo trạng thái)

- Dùng khi cần filter "Tất cả / Đang hoạt động / Đã khóa" hoặc tương tự
- Tab active: border-bottom 2px #625afa, text color #625afa
- Count badge: pill nhỏ, active → bg #ebe8ff / text #625afa

```css
.tabs         { display: flex; border-bottom: 1px solid #e3e8ee; }
.tab          { padding: 10px 16px; font-size: 13px; font-weight: 500; color: #697386;
                border: none; background: none; border-bottom: 2px solid transparent;
                margin-bottom: -1px; cursor: pointer; }
.tab:hover    { color: #1a1f36; }
.tabActive    { color: #625afa; border-bottom-color: #625afa; }
.tabCount     { background: #f0f4f8; color: #697386; font-size: 11px; font-weight: 600;
                padding: 1px 6px; border-radius: 10px; }
```

### 3.2b Stats Chips (thay thế Tab Bar cho filter + count)

Dùng thay cho tab bar khi muốn hiển thị count + filter đồng thời (gọn hơn tab).
Khi chip được chọn: border accent, bg accent-light, text accent-active.

```tsx
const chips = [
  { key: 'all',      label: 'Tất cả',         count: items.length },
  { key: 'active',   label: 'Đang hoạt động', count: active.length },
  { key: 'inactive', label: 'Đã khóa',        count: inactive.length },
];

<div className={s.chips}>
  {chips.map(c => (
    <button
      key={c.key}
      className={[s.chip, filter === c.key ? s.chipSelected : ''].filter(Boolean).join(' ')}
      onClick={() => setFilter(c.key)}
    >
      <span className={s.chipLabel}>{c.label}</span>
      <span className={s.chipCount}>{c.count}</span>
    </button>
  ))}
</div>
```

```css
.chips        { display: flex; gap: 6px; margin-bottom: 12px; }
.chip         { display: flex; align-items: center; gap: 6px; padding: 5px 10px;
                border: 1px solid var(--color-border); border-radius: 6px;
                background: var(--bg-surface); font-size: 12px; font-weight: 500;
                color: var(--color-secondary); cursor: pointer;
                transition: border-color 0.15s, background 0.15s; }
.chip:hover   { background: var(--bg-page); }
.chipSelected { border-color: var(--color-accent-active); background: var(--color-accent-light);
                color: var(--color-accent-active); }
.chipCount    { font-size: 11px; font-weight: 600; background: var(--bg-subtle);
                color: var(--color-muted); padding: 1px 5px; border-radius: 10px; }
.chipSelected .chipCount { background: #ebe8ff; color: var(--color-accent-active); }
```

### 3.2c Filter Bar (search input, đặt trên table)

Nằm ngay trên `.tableWrap`, dùng `border-radius: 8px 8px 0 0` và `border-bottom: none` để liên kết với table.

```tsx
<div className={s.filterBar}>
  <div className={s.searchWrap}>
    <svg className={s.searchIcon}>...</svg>
    <input className={s.searchInput} placeholder="Tìm tên, email..." ... />
    {search && <button className={s.searchClear} onClick={() => setSearch('')}>✕</button>}
  </div>
</div>
```

```css
.filterBar    { padding: 10px 0; background: transparent;
                border: none; border-bottom: 1px solid var(--color-border);
                display: flex; align-items: center; gap: 10px; }
.searchWrap   { position: relative; display: flex; align-items: center;
                flex: 1; max-width: 280px; }
.searchIcon   { position: absolute; left: 9px; color: var(--color-subtle); pointer-events: none; }
.searchInput  { padding: 6px 28px; font-size: 13px; border: 1.5px solid var(--color-border);
                border-radius: 6px; background: var(--bg-surface); color: var(--color-ink);
                outline: none; width: 100%; transition: border-color 0.15s, box-shadow 0.15s; }
.searchInput:focus { border-color: var(--color-accent-active);
                     box-shadow: 0 0 0 3px rgba(98,90,250,.10); }
.searchClear  { position: absolute; right: 8px; background: none; border: none;
                color: var(--color-muted); cursor: pointer; font-size: 11px; padding: 0; }
```

### 3.3 Table

Open/borderless style — no outer box, full width, row separators only (Stripe-inspired).

- `thead`: no background, only `border-bottom: 1px solid #e3e8ee`
- `tbody tr`: hover `#fafbfd`, row separator `1px solid #f0f4f8`
- No outer border, no border-radius on `.tableWrap`
- Column cuối cùng: nút `⋯` ẩn khi không hover, hiện khi hover row

```css
.tableWrap  { background: #fff; overflow: visible; }
.table      { width: 100%; border-collapse: collapse; }
.table th   { font-size: 12px; font-weight: 600; color: #3c4257; text-align: left;
              padding: 10px 16px; background: transparent; border-bottom: 1px solid #e3e8ee; }
.table td   { padding: 6px 16px; font-size: 13px; font-weight: 500; color: #3c4257;
              border-bottom: 1px solid #f0f4f8; vertical-align: middle; }
.table tr:last-child td { border-bottom: none; }
.table tr:hover td      { background: #fafbfd; }
```

### 3.4 Name Cell (với avatar initials — multi-color)

Avatar màu được pick theo ký tự đầu của tên, không dùng màu cố định.

```tsx
const AVATAR_COLORS = [
  '#635bff', '#09825d', '#1a56db', '#7c3aed',
  '#c44c0a', '#0e7490', '#92400e', '#be185d',
];
function avatarColor(name: string) {
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
}

<div className={s.nameCell}>
  <span className={s.avatar} style={{ background: avatarColor(name) }}>
    {name[0].toUpperCase()}
  </span>
  <span className={s.userName}>{name}</span>
</div>
```

```css
.nameCell   { display: flex; align-items: center; gap: 10px; }
.avatar     { width: 26px; height: 26px; border-radius: 50%; color: #fff;
              font-size: 10px; font-weight: 600; display: flex; align-items: center;
              justify-content: center; flex-shrink: 0; }
              /* background set inline via avatarColor() */
.userName   { font-weight: 500; color: #1a1f36; }
```

### 3.5 Status Badges

```tsx
// Active
<span className={s.badgeActive}>Hoạt động</span>

// Inactive / Locked
<span className={s.badgeInactive}>Đã khóa</span>

// Module On
<span className={s.badgeOn}>Đang bật</span>

// Module Off
<span className={s.badgeOff}>Tắt</span>
```

```css
/* Cấu trúc chung */
.badge*     { display: inline-flex; align-items: center; gap: 5px;
              font-size: 12px; font-weight: 500; padding: 2px 8px; border-radius: 20px; }

/* Active — green dot */
.badgeActive  { background: #d1fae5; color: #0e6245; }
.badgeActive::before { content: ''; width: 6px; height: 6px; border-radius: 50%;
                       background: #059669; flex-shrink: 0; }

/* Inactive */
.badgeInactive { background: #f1f5f9; color: #64748b; }

/* Module on */
.badgeOn  { background: #d1fae5; color: #065f46; font-size: 11px; font-weight: 600; }

/* Module off */
.badgeOff { background: #f1f5f9; color: #64748b; font-size: 11px; font-weight: 600; }
```

### 3.5b Role Badges (màu theo loại vai trò)

Phân loại bằng cách check `name.toLowerCase()`:

```tsx
function RoleBadge({ name }: { name: string }) {
  const lower = name.toLowerCase();
  const cls = lower.includes('admin') || lower.includes('quản trị') ? s.roleAdmin
    : lower.includes('owner') || lower.includes('chủ') ? s.roleOwner
    : lower.includes('editor') || lower.includes('biên') ? s.roleEditor
    : s.roleViewer;
  return <span className={`${s.roleBadge} ${cls}`}>{name}</span>;
}
```

```css
.roleBadge  { display: inline-flex; align-items: center; font-size: 11px; font-weight: 600;
              padding: 2px 8px; border-radius: 10px; white-space: nowrap; }
.roleAdmin  { background: #ede9fe; color: #5b21b6; }
.roleOwner  { background: #1e293b; color: #e2e8f0; }
.roleEditor { background: #dbeafe; color: #1e40af; }
.roleViewer { background: var(--bg-subtle); color: var(--color-secondary); }
```

### 3.6 Buttons

```tsx
// Primary — CTA chính
<button className={s.btnPrimary}>+ Thêm</button>

// Secondary — hành động phụ
<button className={s.btnSecondary}>Hủy</button>

// Enable/Disable module
<button className={s.btnEnable}>Bật quy trình</button>
<button className={s.btnDisable}>Tắt quy trình</button>
```

```css
.btnPrimary   { padding: 8px 16px; font-size: 13px; font-weight: 500; border-radius: 6px;
                border: none; background: #635bff; color: #fff; cursor: pointer; }
.btnPrimary:hover:not(:disabled) { background: #4f46e5; }
.btnPrimary:disabled { opacity: 0.5; cursor: not-allowed; }

.btnSecondary { padding: 8px 18px; font-size: 13px; font-weight: 500; border-radius: 6px;
                border: 1.5px solid #e3e8ee; background: #fff; color: #3c4257; cursor: pointer; }
.btnSecondary:hover { background: #f6f9fc; }
```

### 3.7 ⋯ More Menu (hành động trên row)

```tsx
<div className={s.moreWrap}>
  <button className={s.moreBtn}>⋯</button>
  {open && (
    <div className={s.moreDropdown}>
      <button className={s.moreItem}>Chỉnh sửa</button>
      <button className={s.moreItemDanger}>Xóa</button>
    </div>
  )}
</div>
```

```css
.moreBtn     { width: 28px; height: 28px; border: none; background: none; border-radius: 6px;
               cursor: pointer; color: #8898aa; display: flex; align-items: center; justify-content: center; }
.moreBtn:hover { background: #f0f4f8; color: #1a1f36; }

.moreDropdown { position: absolute; right: 0; top: calc(100% + 4px); background: #fff;
                border: 1px solid #e3e8ee; border-radius: 8px; padding: 4px;
                box-shadow: 0 4px 20px rgba(0,0,0,.10); min-width: 140px; z-index: 10; }

.moreItem     { display: block; width: 100%; padding: 7px 12px; font-size: 13px; color: #1a1f36;
                background: none; border: none; border-radius: 6px; text-align: left; cursor: pointer; }
.moreItem:hover { background: #f6f9fc; }
.moreItemDanger { color: #df1b41; }
.moreItemDanger:hover { background: #fff0f3; }
```

### 3.8 Group Header (dùng cho Roles page, grouped lists)

```tsx
<div className={s.group}>
  <div className={s.groupHeader}>
    <ChevronIcon /> <span className={s.groupLabel}>Vai trò hệ thống</span>
    <span className={s.groupCount}>{roles.length}</span>
  </div>
  <div className={s.groupBody}>
    {roles.map(r => <button className={s.roleRow}>...</button>)}
  </div>
</div>
```

```css
.group       { border: 1px solid #e3e8ee; border-radius: 8px; overflow: hidden; background: #fff; }
.groupHeader { display: flex; align-items: center; gap: 8px; padding: 12px 16px;
               background: #f7fafc; border-bottom: 1px solid #e3e8ee; }
.groupLabel  { font-size: 12px; font-weight: 600; color: #3c4257;
               text-transform: uppercase; letter-spacing: 0.05em; }
.groupCount  { font-size: 11px; font-weight: 600; color: #697386;
               background: #eef2f7; padding: 1px 6px; border-radius: 10px; }
```

### 3.9 Row Link (clickable row trong group, không phải table)

```tsx
<button className={s.roleRow} onClick={() => openPanel(role)}>
  <div className={s.roleMain}>
    <span className={s.roleName}>{role.name}</span>
    <span className={s.roleDesc}>{role.description}</span>
  </div>
  <div className={s.roleMeta}>
    <span>X tài khoản</span>
    <span>Y quyền</span>
  </div>
  <ChevronRight />
</button>
```

```css
.roleRow  { display: flex; align-items: center; gap: 16px; padding: 14px 16px;
            border: none; background: none; text-align: left; cursor: pointer;
            border-bottom: 1px solid #f0f4f8; transition: background 0.1s; width: 100%; }
.roleRow:last-child { border-bottom: none; }
.roleRow:hover      { background: #fafbfd; }
```

---

## 4. RIGHT PANEL (Slide-in từ phải)

### Khi nào dùng Right Panel vs Modal
- **Right Panel**: Tạo/sửa entity (Add user, Edit role, Module settings)
- **Modal**: Xác nhận hành động nguy hiểm (Xóa, Khóa tài khoản)

### Sử dụng component có sẵn

```tsx
import RightPanel from '../../../components/common/RightPanel';

<RightPanel
  title="Tiêu đề panel"
  open={isOpen}
  onClose={() => setOpen(false)}
  width={480}          // default 480px
  footer={<>
    <button className={s.btnSecondary} onClick={onClose}>Hủy</button>
    <button className={s.btnPrimary} form="my-form" type="submit">Lưu</button>
  </>}
>
  <form id="my-form" onSubmit={handleSubmit}>
    {/* form fields */}
  </form>
</RightPanel>
```

**Lưu ý quan trọng:**
- Đặt form id và dùng `form="my-form"` trên submit button trong footer (button ở ngoài form)
- `onClose` nên reset state của form
- ESC key tự động đóng panel (đã handle trong component)

### Form trong panel

```css
.form  { display: flex; flex-direction: column; gap: 16px; }
.field { display: flex; flex-direction: column; gap: 6px; }
.label { font-size: 13px; font-weight: 500; color: #3c4257; }

.input { padding: 9px 12px; border-radius: 6px; border: 1.5px solid #e3e8ee;
         background: #fff; font-size: 14px; color: #1a1f36; outline: none;
         transition: border-color 0.15s, box-shadow 0.15s; width: 100%; box-sizing: border-box; }
.input:focus { border-color: #625afa; box-shadow: 0 0 0 3px rgba(98,90,250,.10); }
.input::placeholder { color: #a3acb9; }

.divider { height: 1px; background: #e3e8ee; margin: 4px 0; }
```

### Selectable items trong panel (chọn role, chọn permission...)

```tsx
<label className={[s.optionItem, selected ? s.optionSelected : ''].join(' ')}>
  <input type="checkbox" checked={selected} onChange={...} className={s.checkbox} />
  <span className={s.optionInfo}>
    <span className={s.optionName}>Tên option</span>
    <span className={s.optionDesc}>Mô tả ngắn</span>
  </span>
</label>
```

```css
.optionItem     { display: flex; align-items: flex-start; gap: 10px; padding: 10px 12px;
                  border: 1.5px solid #e3e8ee; border-radius: 8px; cursor: pointer; }
.optionItem:hover { border-color: #c7d2fe; background: #fafbff; }
.optionSelected   { border-color: #625afa; background: #f5f3ff; }
.checkbox         { width: 15px; height: 15px; accent-color: #625afa; }
.optionName       { font-size: 13px; font-weight: 500; color: #1a1f36; }
.optionDesc       { font-size: 12px; color: #697386; }
```

### Section header trong panel (nhóm permissions...)

```tsx
<label className={s.moduleHeader}>
  <input type="checkbox" ... className={s.checkbox} />
  <span className={s.moduleName}>TÊN MODULE</span>
</label>
<div className={s.permList}>
  {perms.map(p => <label className={s.permRow}>...</label>)}
</div>
```

```css
.moduleHeader { display: flex; align-items: center; gap: 10px; padding: 10px 14px;
               background: #f7fafc; cursor: pointer; border-bottom: 1px solid #e3e8ee; }
.moduleName   { font-size: 12px; font-weight: 600; color: #3c4257;
               text-transform: uppercase; letter-spacing: 0.05em; }
.permRow      { display: flex; align-items: center; gap: 10px; padding: 9px 14px;
               cursor: pointer; border-bottom: 1px solid #f5f7fa; }
.permRow:hover { background: #fafbfd; }
```

---

## 5. MODULE CARDS (trang /modules)

```tsx
<div className={[s.card, isEnabled ? s.cardEnabled : ''].join(' ')}>
  <div className={s.cardTop}>
    <span className={[s.iconWrap, isEnabled ? s.iconEnabled : ''].join(' ')}>
      <ModuleIcon />
    </span>
    <span className={isEnabled ? s.badgeOn : s.badgeOff}>
      {isEnabled ? 'Đang bật' : 'Tắt'}
    </span>
  </div>
  <h3 className={s.cardTitle}>{name}</h3>
  <p className={s.cardDesc}>{description}</p>
  <div className={s.cardFooter}>
    <button className={isEnabled ? s.btnDisable : s.btnEnable}>
      {isEnabled ? 'Tắt quy trình' : 'Bật quy trình'}
    </button>
  </div>
</div>
```

```css
.card        { background: #fff; border: 1px solid #e3e8ee; border-radius: 10px;
               padding: 20px; display: flex; flex-direction: column; gap: 10px; }
.cardEnabled { border-color: #c7d2fe; }
.iconWrap    { width: 40px; height: 40px; border-radius: 10px; background: #f6f9fc;
               color: #697386; display: flex; align-items: center; justify-content: center; }
.iconEnabled { background: #f0effe; color: #625afa; }
.cardTitle   { font-size: 14px; font-weight: 600; color: #1a1f36; margin: 0; }
.cardDesc    { font-size: 13px; color: #697386; line-height: 1.55; margin: 0; flex: 1; }
.cardFooter  { margin-top: 4px; padding-top: 14px; border-top: 1px solid #f0f4f8; }

.btnEnable   { padding: 7px 14px; font-size: 13px; font-weight: 500; border-radius: 6px;
               border: 1px solid #c7d2fe; background: #f0effe; color: #625afa; cursor: pointer; }
.btnEnable:hover { background: #e0e7ff; }
.btnDisable  { padding: 7px 14px; font-size: 13px; font-weight: 500; border-radius: 6px;
               border: 1px solid #e3e8ee; background: #f6f9fc; color: #697386; cursor: pointer; }
.btnDisable:hover { background: #eef2f7; }
```

---

## 6. EMPTY STATE

```tsx
<div className={s.empty}>Không có dữ liệu.</div>
// hoặc với icon:
<div className={s.emptyState}>
  <span className={s.emptyIcon}><SomeIcon /></span>
  <p className={s.emptyTitle}>Chưa có dữ liệu</p>
  <p className={s.emptyDesc}>Tạo mục đầu tiên để bắt đầu.</p>
</div>
```

```css
.empty      { font-size: 13px; color: #8898aa; padding: 40px 0; text-align: center; }
.emptyState { text-align: center; padding: 60px 24px; }
.emptyIcon  { width: 48px; height: 48px; background: #f6f9fc; border: 1px solid #e3e8ee;
              border-radius: 12px; display: flex; align-items: center; justify-content: center;
              margin: 0 auto 16px; color: #a3acb9; }
.emptyTitle { font-size: 15px; font-weight: 600; color: #1a1f36; margin: 0 0 6px; }
.emptyDesc  { font-size: 13px; color: #697386; margin: 0 0 20px; }
```

---

## 7. ERROR STATE

```tsx
{error && <div className={s.error}>{error}</div>}
```

```css
.error { font-size: 13px; color: #df1b41; background: #fff0f3;
         border: 1px solid #fecaca; border-radius: 6px; padding: 10px 12px; }
```

---

## 8. LOADING STATE

Dùng `<PageLoader />` cho full-page, `<Spinner size={24} />` cho inline.

```tsx
import PageLoader, { Spinner } from '../../../components/common/PageLoader';

// Full page
if (loading) return <PageLoader />;

// Inline trong block
{loading && <div className={s.empty}><Spinner size={20} /></div>}
```

---

## 9. NAVIGATION ACTIVE STATE

Sidebar sử dụng `startsWith` cho nested routes:

```tsx
function navClass(href: string) {
  const exact = href === '/' ? pathname === '/' : pathname.startsWith(href);
  return [s.navItem, exact ? s.navActive : ''].filter(Boolean).join(' ');
}
```

```css
.navItem    { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 6px;
              font-size: 13px; font-weight: 500; color: #697386; text-decoration: none; }
.navItem:hover { background: #f6f9fc; color: #1a1f36; }
.navActive     { background: #f0effe; color: #625afa; }
```

---

## 10. CHECKLIST KHI TẠO TRANG MỚI

Trước khi viết code, kiểm tra:

- [ ] Có page.tsx trong `app/(dashboard)/[feature]/` không?
- [ ] Feature component ở `features/[feature]/FeaturePage.tsx` chưa?
- [ ] Dùng `<Link>` từ `next/link` thay vì `<a href>` cho navigation
- [ ] Form trong RightPanel: đặt `id` trên form, dùng `form="id"` trên submit button
- [ ] Loading state: `const [loading, setLoading] = useState(true)` + `finally { setLoading(false) }`
- [ ] Error state: `const [error, setError] = useState<string | null>(null)`
- [ ] API calls trong `useEffect(() => { load(); }, [])` — không có dependency ngoài `[]`
- [ ] Tất cả API functions có auth: `auth: true` trong request options
- [ ] Không dùng inline style, dùng CSS Modules
- [ ] Màu sắc chỉ từ tokens ở mục 1 — không tự đặt màu khác

---

## 11. FILE STRUCTURE CHUẨN

```
// Page file (không có logic)
// app/(dashboard)/users/page.tsx
import UsersPage from '../../../features/settings/users/UsersPage';
export const metadata = { title: 'Người dùng' };
export default function Page() { return <UsersPage />; }

// Feature file (có logic)
// features/settings/users/UsersPage.tsx
'use client';
import { useEffect, useState } from 'react';
import { listXxx, type XxxItem } from '../../../lib/api';
import XxxPanel from './XxxPanel';
import s from './UsersPage.module.css';

export default function UsersPage() {
  const [items, setItems] = useState<XxxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [panelOpen, setPanelOpen] = useState(false);

  async function load() {
    setLoading(true);
    try { const r = await listXxx(); setItems(r.items ?? []); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  return (
    <div className={s.page}>
      <div className={s.pageHeader}>
        <h1 className={s.pageTitle}>Tiêu đề</h1>
        <button className={s.btnPrimary} onClick={() => setPanelOpen(true)}>+ Thêm</button>
      </div>
      {/* ... table hoặc group list ... */}
      <XxxPanel open={panelOpen} onClose={() => { setPanelOpen(false); load(); }} />
    </div>
  );
}
```
