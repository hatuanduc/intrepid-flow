# Project Guidelines

## UI Design System
Full reference: @ui-reference.md — **read this before building any new page or component.**

When building UI components:
- Use CSS variables from globals.css (see table below) — never hardcode hex values for common tokens
- Follow component patterns in ui-reference.md §3: buttons, tables, badges, more-menu, group-header
- Animations: 0.15s ease for micro-interactions (hover, focus), 0.22s cubic-bezier for panels
- Never use inline styles — always CSS Modules (`.module.css`)
- Never use `<a href>` for internal navigation — always `<Link>` from `next/link`

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
Every list page uses this layout (see ui-reference.md §2, §3.2b, §3.2c, §3.3):
1. `.chips` — stats chips row (filter + count), `margin-bottom: 12px` (see §3.2b)
2. `.filterBar` — search input bar, `border-radius: 8px 8px 0 0`, `border-bottom: none`
3. `.tableWrap` — `border: 1px solid var(--color-border)`, `border-top: none`, `border-radius: 0 0 8px 8px`
- `thead`: bg `var(--bg-table-head)`, uppercase 11px text `#8898aa`
- `tbody tr`: hover bg `var(--bg-hover)`, row separator `1px solid var(--color-border-light)`
- Last column: `⋯` more-menu button (see §3.7)
- Name column: avatar initials (30px circle, **multi-color** via `avatarColor()`) + name (see §3.4)
- Role column: `<RoleBadge>` component with color per role type (see §3.5b)

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

## Loading / Empty / Error states
- Full-page loading: `<PageLoader />` from `components/common/PageLoader`
- Inline loading: `<Spinner size={20} />` from same file
- Empty: `.empty` class, centered, color `var(--color-subtle)`
- Error: `.error` class, red text on light red bg (see ui-reference.md §7)
