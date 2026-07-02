'use client';

import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useState, useRef, useEffect } from 'react';
import { clearToken } from '../../lib/auth';
import s from './DashboardLayout.module.css';
import { BellIcon, ChevronDownIcon, GearIcon, PinIcon } from '../icons';
import {
  MAIN_NAV, FEATURE_NAV, NAV_GROUPS, MORE_NAV, ALL_PINNABLE, ALL_SEARCH_ITEMS,
  type NavItem, type NavGroupDef, type SearchEntry,
} from './nav-items';

type User = {
  id: string;
  email: string;
  name: string | null;
  roles: string[];
  permissions: string[];
};

/* ── Icons (layout-only, not in nav-items) ── */
const MenuIcon = (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <path d="M2 4.5h14M2 9h14M2 13.5h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);
const DotsHIcon = (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <circle cx="3" cy="7" r="1.2" fill="currentColor"/>
    <circle cx="7" cy="7" r="1.2" fill="currentColor"/>
    <circle cx="11" cy="7" r="1.2" fill="currentColor"/>
  </svg>
);
const ChevronRightSmIcon = (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
    <path d="M3.5 2L6.5 5l-3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const SearchIconSvg = (
  <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
    <circle cx="5.5" cy="5.5" r="4" stroke="currentColor" strokeWidth="1.3"/>
    <path d="M9 9l2.5 2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
  </svg>
);
const AccountMenuIcon = (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <circle cx="7" cy="5" r="2.3" stroke="currentColor" strokeWidth="1.3"/>
    <path d="M2.5 12c0-2 2.02-3.5 4.5-3.5s4.5 1.5 4.5 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
  </svg>
);
const SettingsMenuIcon = (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <circle cx="7" cy="7" r="1.8" stroke="currentColor" strokeWidth="1.3"/>
    <path d="M7 1.5v1.2M7 11.3v1.2M1.5 7h1.2M11.3 7h1.2M3.28 3.28l.85.85M9.87 9.87l.85.85M3.28 10.72l.85-.85M9.87 4.13l.85-.85" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
  </svg>
);
const SignOutMenuIcon = (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path d="M9.5 5l2.5 2.5-2.5 2.5M12 7.5H6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M6 2.5H3a.5.5 0 00-.5.5v8a.5.5 0 00.5.5h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
  </svg>
);

/* ── Inline search bar with dropdown ── */
function SearchBar() {
  const router  = useRouter();
  const [query, setQuery]   = useState('');
  const [open,  setOpen]    = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef  = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  const norm = (v: string) => v.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  const filtered: SearchEntry[] = query.trim()
    ? ALL_SEARCH_ITEMS.filter(item =>
        norm(item.label).includes(norm(query)) ||
        (item.breadcrumb && norm(item.breadcrumb).includes(norm(query)))
      )
    : ALL_SEARCH_ITEMS;

  useEffect(() => { setActive(0); }, [query]);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Ctrl+K / Cmd+K focuses the input
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  function navigate(href: string) {
    setOpen(false);
    setQuery('');
    inputRef.current?.blur();
    router.push(href);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') { setOpen(false); setQuery(''); inputRef.current?.blur(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, filtered.length - 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
    if (e.key === 'Enter' && filtered[active]) navigate(filtered[active].href);
  }

  const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform);

  return (
    <div className={s.searchWrap} ref={wrapRef}>
      <div className={s.searchInputWrap}>
        <span className={s.searchInputIcon}>{SearchIconSvg}</span>
        <input
          ref={inputRef}
          className={s.search}
          placeholder="Tìm kiếm..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          autoComplete="off"
          spellCheck={false}
        />
        {!query && <kbd className={s.searchKbd}>{isMac ? '⌘K' : 'Ctrl K'}</kbd>}
        {query && (
          <button className={s.searchClear} onMouseDown={e => { e.preventDefault(); setQuery(''); inputRef.current?.focus(); }}>✕</button>
        )}
      </div>

      {open && (
        <div className={s.searchDropdown}>
          {filtered.length === 0 ? (
            <div className={s.searchEmpty}>Không tìm thấy &ldquo;{query}&rdquo;</div>
          ) : (
            <>
              <div className={s.searchDropdownLabel}>{query ? 'Kết quả' : 'Điều hướng'}</div>
              {filtered.map((item, i) => (
                <button
                  key={item.href}
                  ref={i === active ? activeRef : null}
                  className={`${s.searchResult} ${i === active ? s.searchResultActive : ''}`}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={e => { e.preventDefault(); navigate(item.href); }}
                >
                  <span className={s.searchResultIcon}>{item.icon}</span>
                  <span className={s.searchResultLabel}>
                    {item.breadcrumb && (
                      <span className={s.searchResultBreadcrumb}>{item.breadcrumb} &rsaquo;</span>
                    )}
                    {item.label}
                  </span>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

const MAX_SHORTCUTS = 5;

/* ── localStorage helpers ── */
const PINS_KEY   = 'nav-pins-v1';
const VISITS_KEY = 'nav-visits-v1';
type VisitRecord = { href: string; label: string; count: number; last: number };

function loadPins(): string[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(PINS_KEY) ?? '[]'); } catch { return []; }
}
function savePins(hrefs: string[]) {
  localStorage.setItem(PINS_KEY, JSON.stringify(hrefs));
}
function loadVisits(): VisitRecord[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(VISITS_KEY) ?? '[]'); } catch { return []; }
}
function recordVisit(href: string, label: string) {
  const visits = loadVisits();
  const idx = visits.findIndex(v => v.href === href);
  if (idx >= 0) { visits[idx].count++; visits[idx].last = Date.now(); }
  else visits.push({ href, label, count: 1, last: Date.now() });
  localStorage.setItem(VISITS_KEY, JSON.stringify(visits));
}

function deriveShortcuts(pinnedHrefs: string[]): NavItem[] {
  const pinned = pinnedHrefs
    .map(href => ALL_PINNABLE.find(n => n.href === href))
    .filter(Boolean) as NavItem[];

  const remaining = MAX_SHORTCUTS - pinned.length;
  if (remaining <= 0) return pinned.slice(0, MAX_SHORTCUTS);

  const pinnedSet = new Set(pinnedHrefs);
  const visits = loadVisits()
    .filter(v => !pinnedSet.has(v.href) && ALL_PINNABLE.some(n => n.href === v.href))
    .sort((a, b) => b.last - a.last)
    .slice(0, remaining);

  const auto = visits
    .map(v => ALL_PINNABLE.find(n => n.href === v.href))
    .filter(Boolean) as NavItem[];

  const combined = [...pinned, ...auto];
  const seenLabels = new Set<string>();
  return combined.filter(item => {
    if (seenLabels.has(item.label)) return false;
    seenLabels.add(item.label);
    return true;
  });
}

/* ── Hooks ── */
function useDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);
  return { open, setOpen, ref };
}

function initials(name: string | null, email: string) {
  if (name) {
    const parts = name.trim().split(' ');
    return (parts[0][0] + (parts[parts.length - 1]?.[0] ?? '')).toUpperCase();
  }
  return email[0].toUpperCase();
}

/* ══════════════════════════════════════════════ */
export default function DashboardLayout({ user, children }: { user: User; children: React.ReactNode }) {
  const router   = useRouter();
  const pathname = usePathname();
  const account  = useDropdown();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [moreOpen, setMoreOpen]       = useState(false);
  const [pinnedHrefs, setPinnedHrefs] = useState<string[]>(() => loadPins());
  const [shortcuts, setShortcuts]     = useState<NavItem[]>(() => deriveShortcuts(loadPins()));

  /* Track visits */
  useEffect(() => {
    const match = ALL_PINNABLE.find(item =>
      item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
    );
    if (match) {
      recordVisit(match.href, match.label);
      setShortcuts(deriveShortcuts(loadPins()));
    }
  }, [pathname]);


  function handleLogout() { clearToken(); router.replace('/login'); }
  function closeSidebar()  { setSidebarOpen(false); }

  function navClass(href: string) {
    const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
    return [s.navItem, active ? s.navActive : ''].filter(Boolean).join(' ');
  }

  function isPinned(href: string) { return pinnedHrefs.includes(href); }

  function togglePin(item: NavItem, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const next = isPinned(item.href)
      ? pinnedHrefs.filter(h => h !== item.href)
      : [...pinnedHrefs, item.href];
    setPinnedHrefs(next);
    savePins(next);
    setShortcuts(deriveShortcuts(next));
  }

  function FeatureNavItem({ item }: { item: NavItem }) {
    return (
      <div className={s.navItemWrap}>
        <Link href={item.href} className={navClass(item.href)} onClick={closeSidebar}>
          <span className={s.navIcon}>{item.icon}</span>
          {item.label}
        </Link>
        <button
          className={`${s.pinBtn} ${isPinned(item.href) ? s.pinBtnActive : ''}`}
          onClick={e => togglePin(item, e)}
          title={isPinned(item.href) ? 'Bỏ ghim' : 'Ghim vào phím tắt'}
        >
          <PinIcon />
        </button>
      </div>
    );
  }

  function CollapseGroup({ group }: { group: NavGroupDef }) {
    const isChildActive = group.children.some(c =>
      c.href === '/' ? pathname === '/' : pathname.startsWith(c.href)
    );
    const [open, setOpen] = useState(isChildActive);

    return (
      <div>
        <button
          className={`${s.navGroupParent} ${open || isChildActive ? s.navGroupParentOpen : ''}`}
          onClick={() => setOpen(v => !v)}
        >
          <span className={s.navIcon}>{group.icon}</span>
          <span style={{ flex: 1, textAlign: 'left' }}>{group.label}</span>
          <span className={`${s.moreChevron} ${open ? s.moreChevronOpen : ''}`}>
            {ChevronRightSmIcon}
          </span>
        </button>
        {open && (
          <div className={s.navGroupKids}>
            {group.children.map(item => (
              <Link
                key={item.href}
                href={item.href}
                className={`${navClass(item.href)} ${s.navItemIndent}`}
                onClick={closeSidebar}
              >
                <span className={s.navIcon}>{item.icon}</span>
                {item.label}
              </Link>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={s.shell}>
      {/* ── TOPBAR ── */}
      <header className={s.topbar}>
        <button className={s.menuBtn} onClick={() => setSidebarOpen(v => !v)} aria-label="Menu">
          {MenuIcon}
        </button>

        <div className={s.accountZone} ref={account.ref}>
          <button className={s.accountBtn} onClick={() => account.setOpen(v => !v)}>
            <span className={s.accountAvatar}>{initials(user.name, user.email)}</span>
            <span className={s.accountName}>{user.name ?? user.email}</span>
            <span className={s.chevron}><ChevronDownIcon /></span>
          </button>
          {account.open && (
            <div className={s.dropdown}>
              <div className={s.dropdownHeader}>
                <span className={s.dropdownAvatar}>{initials(user.name, user.email)}</span>
                <div className={s.dropdownUserInfo}>
                  <span className={s.dropdownUserName}>{user.name ?? '—'}</span>
                  <span className={s.dropdownUserEmail}>{user.email}</span>
                </div>
              </div>
              <div className={s.dropdownDivider} />
              <button className={s.dropdownItem} onClick={() => { account.setOpen(false); router.push('/account'); }}>
                <span className={s.dropdownItemIcon}>{AccountMenuIcon}</span>Tài khoản
              </button>
              <button className={s.dropdownItem} onClick={() => { account.setOpen(false); router.push('/settings'); }}>
                <span className={s.dropdownItemIcon}>{SettingsMenuIcon}</span>Cài đặt
              </button>
              <div className={s.dropdownDivider} />
              <button className={s.dropdownItem} onClick={handleLogout}>
                <span className={s.dropdownItemIcon}>{SignOutMenuIcon}</span>Đăng xuất
              </button>
            </div>
          )}
        </div>

        <SearchBar />

        <div className={s.rightActions}>
          <button className={s.iconBtn} title="Thông báo"><BellIcon /></button>
          <button className={s.iconBtn} title="Cài đặt" onClick={() => router.push('/settings')}><GearIcon /></button>
        </div>
      </header>

      {/* ── BODY ── */}
      <div className={s.body}>
        {sidebarOpen && <div className={s.sidebarOverlay} onClick={closeSidebar} />}

        <nav className={`${s.sidebar} ${sidebarOpen ? s.sidebarOpen : ''}`}>

          <div className={s.navGroup}>
            {MAIN_NAV.map(item => (
              <Link key={item.href} href={item.href} className={navClass(item.href)} onClick={closeSidebar}>
                <span className={s.navIcon}>{item.icon}</span>
                {item.label}
              </Link>
            ))}
          </div>

          <div className={s.navGroup}>
            <span className={s.navGroupLabel}>Phím tắt</span>
            {shortcuts.length === 0 ? (
              <span className={s.navHint}>Truy cập chức năng để tạo phím tắt</span>
            ) : (
              shortcuts.map(item => (
                <div key={item.href} className={s.navItemWrap}>
                  <Link href={item.href} className={s.navItem} onClick={closeSidebar}>
                    <span className={s.navIcon}>{item.icon}</span>
                    {item.label}
                  </Link>
                  <button
                    className={`${s.pinBtn} ${isPinned(item.href) ? s.pinBtnActive : ''}`}
                    onClick={e => togglePin(item, e)}
                    title={isPinned(item.href) ? 'Bỏ ghim' : 'Ghim vào phím tắt'}
                  >
                    <PinIcon />
                  </button>
                </div>
              ))
            )}
          </div>

          <div className={s.sidebarDivider} />

          <div className={s.navGroup}>
            <span className={s.navGroupLabel}>Chức năng</span>

            {FEATURE_NAV.map(item => (
              <Link key={item.href} href={item.href} className={navClass(item.href)} onClick={closeSidebar}>
                <span className={s.navIcon}>{item.icon}</span>
                {item.label}
              </Link>
            ))}

            {NAV_GROUPS.map(group => (
              <CollapseGroup key={group.label} group={group} />
            ))}

            <button
              className={`${s.moreExpandBtn} ${moreOpen ? s.moreExpandBtnOpen : ''}`}
              onClick={() => setMoreOpen(v => !v)}
            >
              <span className={s.navIcon}>{DotsHIcon}</span>
              <span>Xem thêm</span>
              <span className={`${s.moreChevron} ${moreOpen ? s.moreChevronOpen : ''}`}>
                {ChevronRightSmIcon}
              </span>
            </button>

            {moreOpen && (
              MORE_NAV.length > 0
                ? <div className={s.moreExpandItems}>
                    {MORE_NAV.map(item => <FeatureNavItem key={item.href} item={item} />)}
                  </div>
                : <div className={s.moreEmpty}>Chưa có tính năng nào</div>
            )}
          </div>

        </nav>

        <main className={s.content}>{children}</main>
      </div>

    </div>
  );
}
