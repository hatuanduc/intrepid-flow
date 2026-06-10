'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useState, useRef, useEffect } from 'react';
import { clearToken } from '../../lib/auth';
import s from './DashboardLayout.module.css';
import {
  BellIcon,
  ChartIcon,
  ChevronDownIcon,
  CustomersIcon,
  GearIcon,
  GoodsIcon,
  MoreIcon,
  OrderIcon,
  PinIcon,
  PlusIcon,
  PurchaseIcon,
} from '../icons';

/* ── Types ── */
type NavItem = { label: string; href: string; icon?: React.ReactNode };

type User = {
  id: string;
  email: string;
  name: string | null;
  roles: string[];
  permissions: string[];
};

/* ── Icons (inline SVG — no dep) ── */
const Icon = {
  chevronDown: <ChevronDownIcon />,
  bell: <BellIcon />,
  gear: <GearIcon />,
  plus: <PlusIcon />,
  pin: <PinIcon />,
  order: <OrderIcon />,
  customers: <CustomersIcon />,
  goods: <GoodsIcon />,
  purchase: <PurchaseIcon />,
  chart: <ChartIcon />,
  more: <MoreIcon />,
  home: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M1.5 6.5L7 1.5l5.5 5v6a.5.5 0 01-.5.5H9V9.5H5V13H2a.5.5 0 01-.5-.5v-6z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
    </svg>
  ),
};

/* ── NAV CONFIG ── */
const MAIN_NAV: NavItem[] = [
  { label: 'Tổng quan', href: '/', icon: Icon.home },
  { label: 'Đơn hàng', href: '/orders', icon: Icon.order },
  { label: 'Khách hàng', href: '/customers', icon: Icon.customers },
];

const PRODUCTS_NAV: NavItem[] = [
  { label: 'Hàng hóa', href: '/goods', icon: Icon.goods },
  { label: 'Đặt hàng', href: '/orders', icon: Icon.order },
  { label: 'Mua hàng', href: '/purchases', icon: Icon.purchase },
  { label: 'Khách hàng', href: '/customers', icon: Icon.customers },
];

const MORE_NAV: NavItem[] = [
  { label: 'Báo cáo', href: '/reports', icon: Icon.chart },
];

const DEFAULT_SHORTCUTS: NavItem[] = [];

/* ── Dropdown hook ── */
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

/* ── Initials helper ── */
function initials(name: string | null, email: string) {
  if (name) {
    const parts = name.trim().split(' ');
    return (parts[0][0] + (parts[parts.length - 1]?.[0] ?? '')).toUpperCase();
  }
  return email[0].toUpperCase();
}

/* ── Main component ── */
export default function DashboardLayout({
  user,
  children,
}: {
  user: User;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const account = useDropdown();
  const quickAdd = useDropdown();
  const settings = useDropdown();

  const [showMore, setShowMore] = useState(false);
  const [shortcuts] = useState<NavItem[]>(DEFAULT_SHORTCUTS);

  function handleLogout() {
    clearToken();
    router.replace('/login');
  }

  function navClass(href: string) {
    return [s.navItem, pathname === href ? s.navActive : ''].filter(Boolean).join(' ');
  }

  return (
    <div className={s.shell}>
      {/* ── TOP BAR ── */}
      <header className={s.topbar}>
        {/* Account button */}
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
              <button className={s.dropdownItem} onClick={handleLogout}>
                Đăng xuất
              </button>
            </div>
          )}
        </div>

        {/* Search */}
        <div className={s.searchWrap}>
          <input className={s.search} placeholder="Tìm kiếm..." type="search" />
        </div>

        {/* Right actions */}
        <div className={s.rightActions}>
          {/* Notifications */}
          <button className={s.iconBtn} title="Thông báo">
            <BellIcon />
          </button>

          {/* Settings */}
          <button className={s.iconBtn} title="Cài đặt" onClick={() => router.push('/settings')}>
            {Icon.gear}
          </button>

          {/* Quick-create dropdown */}
          <div ref={quickAdd.ref} style={{ position: 'relative' }}>
            <button className={s.quickAddBtn} onClick={() => quickAdd.setOpen(v => !v)} title="Tạo nhanh">
              {Icon.plus}
            </button>
            {quickAdd.open && (
              <div className={[s.dropdown, s.dropdownRight].join(' ')}>
                <span className={s.dropdownSection}>Tạo nhanh</span>
                <button className={s.dropdownItem} onClick={() => { quickAdd.setOpen(false); router.push('/invoices/new'); }}>
                  <span>Hóa đơn</span>
                  <kbd>C I</kbd>
                </button>
                <button className={s.dropdownItem} onClick={() => { quickAdd.setOpen(false); router.push('/orders/new'); }}>
                  <span>Đơn hàng</span>
                  <kbd>C O</kbd>
                </button>
                <button className={s.dropdownItem} onClick={() => { quickAdd.setOpen(false); router.push('/purchases/new'); }}>
                  <span>Phiếu mua hàng</span>
                  <kbd>C P</kbd>
                </button>
                <button className={s.dropdownItem} onClick={() => { quickAdd.setOpen(false); router.push('/customers/new'); }}>
                  <span>Khách hàng</span>
                  <kbd>C K</kbd>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── BODY ── */}
      <div className={s.body}>
        {/* SIDEBAR */}
        <nav className={s.sidebar}>
          {/* Main nav */}
          <div className={s.navGroup}>
            {MAIN_NAV.map(item => (
              <a key={item.href + item.label} href={item.href} className={navClass(item.href)}>
                <span className={s.navIcon}>{item.icon}</span>
                {item.label}
              </a>
            ))}
          </div>

          {/* Shortcuts */}
          <div className={s.navGroup}>
            <span className={s.navGroupLabel}>Phím tắt</span>
            {shortcuts.length === 0 ? (
              <span className={s.navHint}>Ghim các trang hay dùng</span>
            ) : (
              shortcuts.map(item => (
                <a key={item.href + item.label} href={item.href} className={navClass(item.href)}>
                  <span className={s.navIcon}>{Icon.pin}</span>
                  {item.label}
                </a>
              ))
            )}
          </div>

          {/* Divider */}
          <div className={s.sidebarDivider} />

          {/* Products */}
          <div className={s.navGroup}>
            <span className={s.navGroupLabel}>Nghiệp vụ</span>
            {PRODUCTS_NAV.map(item => (
              <a key={item.href + item.label} href={item.href} className={navClass(item.href)}>
                <span className={s.navIcon}>{item.icon}</span>
                {item.label}
              </a>
            ))}

            {/* More toggle */}
            <button className={s.navMoreBtn} onClick={() => setShowMore(v => !v)}>
              <span className={s.navIcon}>{Icon.more}</span>
              Thêm
              <span className={[s.chevron, showMore ? s.chevronUp : ''].filter(Boolean).join(' ')}>
                {Icon.chevronDown}
              </span>
            </button>

            {showMore && MORE_NAV.map(item => (
              <a key={item.href} href={item.href} className={[navClass(item.href), s.navItemIndent].join(' ')}>
                <span className={s.navIcon}>{item.icon}</span>
                {item.label}
              </a>
            ))}
          </div>
        </nav>

        {/* CONTENT */}
        <main className={s.content}>
          {children}
        </main>
      </div>
    </div>
  );
}
