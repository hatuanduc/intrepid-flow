'use client';

import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useState, useRef, useEffect } from 'react';
import { clearToken } from '../../lib/auth';
import s from './DashboardLayout.module.css';
import { BellIcon, ChevronDownIcon, GearIcon, PinIcon } from '../icons';

type NavItem = { label: string; href: string; icon?: React.ReactNode };

type User = {
  id: string;
  email: string;
  name: string | null;
  roles: string[];
  permissions: string[];
};

/* ── Icons ── */
const HomeIcon = (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path d="M1.5 6.5L7 1.5l5.5 5v6a.5.5 0 01-.5.5H9V9.5H5V13H2a.5.5 0 01-.5-.5v-6z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
  </svg>
);
const WorkflowIcon = (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <rect x="1" y="1" width="4" height="3" rx="1" stroke="currentColor" strokeWidth="1.2"/>
    <rect x="9" y="5" width="4" height="3" rx="1" stroke="currentColor" strokeWidth="1.2"/>
    <rect x="1" y="10" width="4" height="3" rx="1" stroke="currentColor" strokeWidth="1.2"/>
    <path d="M5 2.5h2.5a1 1 0 011 1V5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    <path d="M5 11.5h2.5a1 1 0 001-1V8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
  </svg>
);
const SettingsIcon = (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path d="M5.8 1.5h2.4l.4 1.6a5 5 0 011.1.65l1.55-.55 1.2 2.08-1.2 1.06a5 5 0 010 1.28l1.2 1.06-1.2 2.08-1.55-.55a5 5 0 01-1.1.65l-.4 1.62H5.8l-.4-1.62a5 5 0 01-1.1-.65l-1.55.55L1.55 8.7l1.2-1.06a5 5 0 010-1.28L1.55 5.3l1.2-2.08 1.55.55a5 5 0 011.1-.65L5.8 1.5z" stroke="currentColor" strokeWidth="1.2"/>
    <circle cx="7" cy="7" r="1.5" stroke="currentColor" strokeWidth="1.2"/>
  </svg>
);
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

/* ── Nav definitions ── */
const MAIN_NAV: NavItem[] = [
  { label: 'Tổng quan', href: '/', icon: HomeIcon },
];

// Always-visible feature items in "Chức năng"
const FEATURE_NAV: NavItem[] = [
  { label: 'Quy trình', href: '/modules', icon: WorkflowIcon },
  { label: 'Cài đặt', href: '/settings', icon: SettingsIcon },
];

// Hidden under "Xem thêm" — add future features here
const MORE_NAV: NavItem[] = [];

// Only items from feature sections can be pinned to shortcuts
const ALL_PINNABLE: NavItem[] = [...FEATURE_NAV, ...MORE_NAV];
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

/* ── Derive shortcuts: manual pins first, then most recently visited ── */
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

  return [...pinned, ...auto];
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

  /* Track visits to feature pages → update shortcut suggestions */
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

  /* Feature nav item row — with pin/unpin button */
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
              <button className={s.dropdownItem} onClick={() => { account.setOpen(false); router.push('/settings'); }}>
                Cài đặt cá nhân
              </button>
              <div className={s.dropdownDivider} />
              <button className={s.dropdownItem} onClick={handleLogout}>Đăng xuất</button>
            </div>
          )}
        </div>

        <div className={s.searchWrap}>
          <input className={s.search} placeholder="Tìm kiếm..." type="search" />
        </div>

        <div className={s.rightActions}>
          <button className={s.iconBtn} title="Thông báo"><BellIcon /></button>
          <button className={s.iconBtn} title="Cài đặt" onClick={() => router.push('/settings')}><GearIcon /></button>
        </div>
      </header>

      {/* ── BODY ── */}
      <div className={s.body}>
        {sidebarOpen && <div className={s.sidebarOverlay} onClick={closeSidebar} />}

        <nav className={`${s.sidebar} ${sidebarOpen ? s.sidebarOpen : ''}`}>

          {/* Main — not pinnable */}
          <div className={s.navGroup}>
            {MAIN_NAV.map(item => (
              <Link key={item.href} href={item.href} className={navClass(item.href)} onClick={closeSidebar}>
                <span className={s.navIcon}>{item.icon}</span>
                {item.label}
              </Link>
            ))}
          </div>

          {/* Shortcuts — auto-populated from feature visits, pin/unpin on hover */}
          <div className={s.navGroup}>
            <span className={s.navGroupLabel}>Phím tắt</span>
            {shortcuts.length === 0 ? (
              <span className={s.navHint}>Truy cập chức năng để tạo phím tắt</span>
            ) : (
              shortcuts.map(item => (
                <div key={item.href} className={s.navItemWrap}>
                  <Link href={item.href} className={navClass(item.href)} onClick={closeSidebar}>
                    <span className={s.navIcon}>{item.icon}</span>
                    {item.label}
                  </Link>
                  <button
                    className={`${s.pinBtn} ${isPinned(item.href) ? s.pinBtnActive : ''}`}
                    onClick={e => togglePin(item, e)}
                    title={isPinned(item.href) ? 'Bỏ ghim' : 'Ghim trang này'}
                  >
                    <PinIcon />
                  </button>
                </div>
              ))
            )}
          </div>

          <div className={s.sidebarDivider} />

          {/* Chức năng */}
          <div className={s.navGroup}>
            <span className={s.navGroupLabel}>Chức năng</span>
            {FEATURE_NAV.map(item => <FeatureNavItem key={item.href} item={item} />)}

            {/* Xem thêm — framework for future feature items */}
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
