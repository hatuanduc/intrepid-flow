import React from 'react';

export type NavItem = { label: string; href: string; icon?: React.ReactNode };
export type NavGroupDef = { label: string; icon: React.ReactNode; children: NavItem[] };

/* ── Icons ── */
export const HomeIcon = (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path d="M1.5 6.5L7 1.5l5.5 5v6a.5.5 0 01-.5.5H9V9.5H5V13H2a.5.5 0 01-.5-.5v-6z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
  </svg>
);
export const WorkflowIcon = (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <rect x="1" y="1" width="4" height="3" rx="1" stroke="currentColor" strokeWidth="1.2"/>
    <rect x="9" y="5" width="4" height="3" rx="1" stroke="currentColor" strokeWidth="1.2"/>
    <rect x="1" y="10" width="4" height="3" rx="1" stroke="currentColor" strokeWidth="1.2"/>
    <path d="M5 2.5h2.5a1 1 0 011 1V5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    <path d="M5 11.5h2.5a1 1 0 001-1V8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
  </svg>
);
export const SettingsIcon = (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path d="M5.8 1.5h2.4l.4 1.6a5 5 0 011.1.65l1.55-.55 1.2 2.08-1.2 1.06a5 5 0 010 1.28l1.2 1.06-1.2 2.08-1.55-.55a5 5 0 01-1.1.65l-.4 1.62H5.8l-.4-1.62a5 5 0 01-1.1-.65l-1.55.55L1.55 8.7l1.2-1.06a5 5 0 010-1.28L1.55 5.3l1.2-2.08 1.55.55a5 5 0 011.1-.65L5.8 1.5z" stroke="currentColor" strokeWidth="1.2"/>
    <circle cx="7" cy="7" r="1.5" stroke="currentColor" strokeWidth="1.2"/>
  </svg>
);
export const BankIcon = (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <rect x="1.5" y="4" width="11" height="8.5" rx="1" stroke="currentColor" strokeWidth="1.2"/>
    <path d="M4 7.5h2M8 7.5h2M4 10h2M8 10h2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    <path d="M1.5 4L7 1l5.5 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
export const JobsIcon = (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <rect x="2" y="2" width="10" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
    <path d="M4.5 5h5M4.5 7h5M4.5 9h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
  </svg>
);
export const ReportsIcon = (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <rect x="1.5" y="1.5" width="11" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
    <path d="M4 9.5V7M7 9.5V5M10 9.5V3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
  </svg>
);
export const ReportArIcon = (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path d="M2 12L5 8l3 2 4-6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
    <circle cx="12" cy="4" r="1.5" stroke="currentColor" strokeWidth="1.2"/>
  </svg>
);

/* ── Nav definitions ── */
export const MAIN_NAV: NavItem[] = [
  { label: 'Tổng quan', href: '/', icon: HomeIcon },
];

export const FEATURE_NAV: NavItem[] = [
  { label: 'Quy trình', href: '/modules', icon: WorkflowIcon },
  { label: 'Cài đặt', href: '/settings', icon: SettingsIcon },
];

export const NAV_GROUPS: NavGroupDef[] = [
  {
    label: 'Công việc',
    icon: JobsIcon,
    children: [
      { label: 'Sao kê NH', href: '/bank-statement', icon: BankIcon },
    ],
  },
  {
    label: 'Báo cáo',
    icon: ReportsIcon,
    children: [
      { label: 'AR', href: '/report-ar', icon: ReportArIcon },
    ],
  },
];

export const MORE_NAV: NavItem[] = [];

export const ALL_PINNABLE: NavItem[] = [
  ...FEATURE_NAV,
  ...NAV_GROUPS.flatMap(g => g.children),
  ...MORE_NAV,
];

// Settings sub-pages — searchable only, not in sidebar nav
const UsersIcon = (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
    <circle cx="8" cy="5" r="3" stroke="currentColor" strokeWidth="1.3"/>
    <path d="M2 14c0-3.314 2.686-5 6-5s6 1.686 6 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
  </svg>
);
const RolesIcon = (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
    <circle cx="5.5" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.3"/>
    <path d="M1.5 13c0-2.485 1.791-4 4-4s4 1.515 4 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    <path d="M10.5 7.5l1.5 1.5 2.5-2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const SETTINGS_SEARCH: SearchEntry[] = [
  { label: 'Tài khoản người dùng', href: '/settings/users',              icon: UsersIcon, breadcrumb: 'Cài đặt' },
  { label: 'Vai trò',              href: '/settings/roles',              icon: RolesIcon, breadcrumb: 'Cài đặt' },
  { label: 'Sao kê NH',            href: '/settings/job/bank-statement', icon: BankIcon,     breadcrumb: 'Cài đặt' },
  { label: 'AR Report',            href: '/settings/job/report-ar',      icon: ReportArIcon, breadcrumb: 'Cài đặt' },
];

// Flat list for search
export type SearchEntry = NavItem & { breadcrumb?: string };

export const ALL_SEARCH_ITEMS: SearchEntry[] = [
  ...MAIN_NAV,
  ...FEATURE_NAV,
  ...NAV_GROUPS.flatMap(g => g.children.map(c => ({ ...c, breadcrumb: g.label }))),
  ...SETTINGS_SEARCH,
  ...MORE_NAV,
];
