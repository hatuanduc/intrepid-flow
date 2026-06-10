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

const Icon = {
  chevronDown: <ChevronDownIcon />,
  bell: <BellIcon />,
  gear: <GearIcon />,
  pin: <PinIcon />,
  home: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M1.5 6.5L7 1.5l5.5 5v6a.5.5 0 01-.5.5H9V9.5H5V13H2a.5.5 0 01-.5-.5v-6z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
    </svg>
  ),
  workflow: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="1" y="1" width="4" height="3" rx="1" stroke="currentColor" strokeWidth="1.2"/>
      <rect x="9" y="5" width="4" height="3" rx="1" stroke="currentColor" strokeWidth="1.2"/>
      <rect x="1" y="10" width="4" height="3" rx="1" stroke="currentColor" strokeWidth="1.2"/>
      <path d="M5 2.5h2.5a1 1 0 011 1V5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      <path d="M5 11.5h2.5a1 1 0 001-1V8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  ),
};

const MAIN_NAV: NavItem[] = [
  { label: 'Tổng quan', href: '/', icon: Icon.home },
];

const WORKFLOW_NAV: NavItem[] = [
  { label: 'Quy trình', href: '/modules', icon: Icon.workflow },
];

const DEFAULT_SHORTCUTS: NavItem[] = [];

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

export default function DashboardLayout({ user, children }: { user: User; children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const account = useDropdown();
  const [shortcuts] = useState<NavItem[]>(DEFAULT_SHORTCUTS);

  function handleLogout() {
    clearToken();
    router.replace('/login');
  }

  function navClass(href: string) {
    const exact = href === '/' ? pathname === '/' : pathname.startsWith(href);
    return [s.navItem, exact ? s.navActive : ''].filter(Boolean).join(' ');
  }

  return (
    <div className={s.shell}>
      {/* ── TOPBAR ── */}
      <header className={s.topbar}>
        <div className={s.accountZone} ref={account.ref}>
          <button className={s.accountBtn} onClick={() => account.setOpen(v => !v)}>
            <span className={s.accountAvatar}>{initials(user.name, user.email)}</span>
            <span className={s.accountName}>{user.name ?? user.email}</span>
            <span className={s.chevron}>{Icon.chevronDown}</span>
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
          <button className={s.iconBtn} title="Cài đặt" onClick={() => router.push('/settings')}>{Icon.gear}</button>
        </div>
      </header>

      {/* ── BODY ── */}
      <div className={s.body}>
        <nav className={s.sidebar}>
          <div className={s.navGroup}>
            {MAIN_NAV.map(item => (
              <Link key={item.href} href={item.href} className={navClass(item.href)}>
                <span className={s.navIcon}>{item.icon}</span>
                {item.label}
              </Link>
            ))}
          </div>

          <div className={s.navGroup}>
            <span className={s.navGroupLabel}>Phím tắt</span>
            {shortcuts.length === 0 ? (
              <span className={s.navHint}>Ghim các trang hay dùng</span>
            ) : (
              shortcuts.map(item => (
                <Link key={item.href + item.label} href={item.href} className={navClass(item.href)}>
                  <span className={s.navIcon}>{Icon.pin}</span>
                  {item.label}
                </Link>
              ))
            )}
          </div>

          <div className={s.sidebarDivider} />

          <div className={s.navGroup}>
            <span className={s.navGroupLabel}>Tự động hóa</span>
            {WORKFLOW_NAV.map(item => (
              <Link key={item.href} href={item.href} className={navClass(item.href)}>
                <span className={s.navIcon}>{item.icon}</span>
                {item.label}
              </Link>
            ))}
          </div>
        </nav>

        <main className={s.content}>
          {children}
        </main>
      </div>
    </div>
  );
}
