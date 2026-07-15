'use client';

import React from 'react';
import Link from 'next/link';
import { useT } from '../../lib/i18n';
import s from './SettingsHub.module.css';

type Card = { titleKey: string; descKey: string; href: string; icon: React.ReactNode };
type Group = { labelKey: string; cards: Card[] };

const GROUPS: Group[] = [
  {
    labelKey: 'groupUsers',
    cards: [
      {
        titleKey: 'usersTitle',
        descKey: 'usersDesc',
        href: '/settings/users',
        icon: (
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="5" r="3" stroke="currentColor" strokeWidth="1.3"/>
            <path d="M2 14c0-3.314 2.686-5 6-5s6 1.686 6 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
        ),
      },
      {
        titleKey: 'rolesTitle',
        descKey: 'rolesDesc',
        href: '/settings/roles',
        icon: (
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
            <circle cx="5.5" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.3"/>
            <path d="M1.5 13c0-2.485 1.791-4 4-4s4 1.515 4 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            <path d="M10.5 7.5l1.5 1.5 2.5-2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        ),
      },
    ],
  },
  {
    labelKey: 'groupConnections',
    cards: [
      {
        titleKey: 'gsheetTitle',
        descKey: 'gsheetDesc',
        href: '/settings/connections',
        icon: (
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
            <rect x="2.5" y="1.5" width="11" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
            <path d="M5 5.5h6M5 8h6M5 10.5h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            <path d="M10 1.5v3.5h3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        ),
      },
      {
        titleKey: 'hsbcTitle',
        descKey: 'hsbcDesc',
        href: '/settings/job/bank-statement',
        icon: (
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
            <rect x="1.5" y="4" width="13" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
            <path d="M4.5 8h2M9.5 8h2M4.5 10.5h2M9.5 10.5h2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            <path d="M2 4L8 1l6 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        ),
      },
      {
        titleKey: 'currencyTitle',
        descKey: 'currencyDesc',
        href: '/settings/currency',
        icon: (
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3"/>
            <path d="M8 2c0 0-3 2-3 6s3 6 3 6M8 2c0 0 3 2 3 6s-3 6-3 6" stroke="currentColor" strokeWidth="1.3"/>
            <path d="M2 8h12" stroke="currentColor" strokeWidth="1.3"/>
          </svg>
        ),
      },
    ],
  },
  {
    labelKey: 'groupWorkflows',
    cards: [
      {
        titleKey: 'bankStatementTitle',
        descKey: 'bankStatementDesc',
        href: '/settings/job/bank-statement',
        icon: (
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
            <rect x="2" y="3" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
            <path d="M5 7h6M5 9.5h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            <path d="M5 1v2M11 1v2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
        ),
      },
    ],
  },
  {
    labelKey: 'groupReports',
    cards: [
      {
        titleKey: 'reportArTitle',
        descKey: 'reportArDesc',
        href: '/settings/job/report-ar',
        icon: (
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
            <path d="M2 12L6 8l3 3 5-6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            <rect x="1.5" y="1.5" width="13" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
          </svg>
        ),
      },
    ],
  },
  {
    labelKey: 'groupSystem',
    cards: [
      {
        titleKey: 'notificationsTitle',
        descKey: 'notificationsDesc',
        href: '/settings/notifications',
        icon: (
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
            <path d="M8 2a5 5 0 0 0-5 5v3l-1 1.5h12L13 10V7a5 5 0 0 0-5-5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
            <path d="M6.5 13.5a1.5 1.5 0 0 0 3 0" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
        ),
      },
    ],
  },
];

export default function SettingsRoot() {
  const { t } = useT();

  return (
    <div className={s.page}>
      {GROUPS.map((group) => (
        <div key={group.labelKey} className={s.group}>
          <p className={s.groupTitle}>{t(`settingsHub.${group.labelKey}`)}</p>
          <div className={s.grid}>
            {group.cards.map((card) => (
              <Link
                key={card.href + card.titleKey}
                href={card.href}
                className={s.card}
              >
                <span className={s.cardIcon}>{card.icon}</span>
                <span className={s.cardBody}>
                  <span className={s.cardTitle}>{t(`settingsHub.${card.titleKey}`)}</span>
                  <span className={s.cardDesc}>{t(`settingsHub.${card.descKey}`)}</span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
