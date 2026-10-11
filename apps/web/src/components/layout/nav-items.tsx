import React from 'react';

export type NavItem = { label: string; href: string; icon?: React.ReactNode };
export type NavGroupDef = { label: string; icon: React.ReactNode; children: NavItem[] };

/* ── Icons ── */
export const HomeIcon = (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path d="M1.5 6.5L7 1.5l5.5 5v6a.5.5 0 01-.5.5H9V9.5H5V13H2a.5.5 0 01-.5-.5v-6z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
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
export const MetricsGroupIcon = (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path d="M1.5 10.5C1.5 10.5 3 7 5 8.5C7 10 7.5 5 9.5 5.5S11 5.8 12.5 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
    <circle cx="12.5" cy="3.5" r="1" stroke="currentColor" strokeWidth="1.1"/>
  </svg>
);
export const BankMetricsIcon = (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path d="M2 11.5h10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    <path d="M3.5 11.5V8M6.5 11.5V5.5M9.5 11.5V3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
  </svg>
);
export const ReconcileIcon = (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path d="M1.5 3.5h11M3.5 3.5v7a1 1 0 001 1h5a1 1 0 001-1v-7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M5.5 1.5h3l.7 2h-4.4z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
    <path d="M5.5 6.5h3M5.5 8.5h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
  </svg>
);
export const ToolIcon = (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path d="M9.5 1.5a3 3 0 00-3.7 3.7L1.5 9.5v2h2l4.3-4.3a3 3 0 003.7-3.7L9.7 5.2 8.8 4.3l1.7-1.7z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
export const GasLinksIcon = (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <rect x="1.5" y="2.5" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.2"/>
    <rect x="8" y="2.5" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.2"/>
    <rect x="1.5" y="7" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.2"/>
    <path d="M10.25 7v4.5M8 9.25h4.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
  </svg>
);

/* ── Nav definitions (labels are i18n keys, translated in DashboardLayout) ── */
export const MAIN_NAV: NavItem[] = [
  { label: 'nav.overview', href: '/', icon: HomeIcon },
];

export const FEATURE_NAV: NavItem[] = [];

export const NAV_GROUPS: NavGroupDef[] = [
  {
    label: 'nav.jobs',
    icon: JobsIcon,
    children: [
      { label: 'nav.bankStatement', href: '/bank-statement', icon: BankIcon },
    ],
  },
  {
    label: 'nav.reports',
    icon: ReportsIcon,
    children: [
      { label: 'nav.reportAr', href: '/report-ar', icon: ReportArIcon },
    ],
  },
  {
    label: 'nav.metrics',
    icon: MetricsGroupIcon,
    children: [
      { label: 'nav.bankMetrics', href: '/bank-metrics', icon: BankMetricsIcon },
    ],
  },
  {
    label: 'nav.tool',
    icon: ToolIcon,
    children: [
      // nav.reconcile (the invoice filter-merge tool) hidden — it depends on the AWS
      // Lambda this app no longer talks to (see ReconcileService.assertEnabled()). Page/
      // API stay in place (submitting shows a clear "disabled" toast instead of a broken
      // call), just not linked from the sidebar. nav.settingsReconcile below is unrelated
      // (column config + master customer data, pure DB) and stays visible as normal.
      { label: 'nav.gasLinks', href: '/gas-links', icon: GasLinksIcon },
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

const GSheetIcon = (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <rect x="2" y="1" width="10" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
    <path d="M4 5h6M4 7.5h6M4 10h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    <path d="M9 1v3.5h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const CurrencyIcon = (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
    <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3"/>
    <path d="M8 2c0 0-3 2-3 6s3 6 3 6M8 2c0 0 3 2 3 6s-3 6-3 6" stroke="currentColor" strokeWidth="1.3"/>
    <path d="M2 8h12" stroke="currentColor" strokeWidth="1.3"/>
  </svg>
);
const NotificationsIcon = (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
    <path d="M8 2a5 5 0 0 0-5 5v3l-1 1.5h12L13 10V7a5 5 0 0 0-5-5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
    <path d="M6.5 13.5a1.5 1.5 0 0 0 3 0" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
  </svg>
);

const SETTINGS_SEARCH: SearchEntry[] = [
  { label: 'nav.users',                 href: '/settings/users',              icon: UsersIcon,        breadcrumb: 'nav.settingsGroup' },
  { label: 'nav.roles',                 href: '/settings/roles',              icon: RolesIcon,        breadcrumb: 'nav.settingsGroup' },
  { label: 'nav.connections',           href: '/settings/connections',        icon: GSheetIcon,       breadcrumb: 'nav.settingsConnectionsGroup' },
  { label: 'nav.currency',              href: '/settings/currency',           icon: CurrencyIcon,     breadcrumb: 'nav.settingsConnectionsGroup' },
  { label: 'nav.settingsBankStatement', href: '/settings/job/bank-statement', icon: BankIcon,         breadcrumb: 'nav.settingsGroup' },
  { label: 'nav.settingsReportAr',      href: '/settings/job/report-ar',      icon: ReportArIcon,     breadcrumb: 'nav.settingsGroup' },
  { label: 'nav.notificationsSettings', href: '/settings/notifications',      icon: NotificationsIcon, breadcrumb: 'nav.settingsGroup' },
  { label: 'nav.settingsReconcile',     href: '/settings/reconcile',          icon: ReconcileIcon,    breadcrumb: 'nav.settingsGroup' },
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
