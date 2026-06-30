"use client";
import React from 'react';
import { useRouter } from 'next/navigation';
import s from './SettingsHub.module.css';

type Card = { title: string; desc: string; href: string; icon: React.ReactNode };
type Group = { label: string; cards: Card[] };

const GROUPS: Group[] = [
  {
    label: 'Người dùng & quyền hạn',
    cards: [
      {
        title: 'Tài khoản người dùng',
        desc: 'Tạo, sửa và quản lý tài khoản nhân viên, gán vai trò trong hệ thống.',
        href: '/settings/users',
        icon: (
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="5" r="3" stroke="currentColor" strokeWidth="1.3"/>
            <path d="M2 14c0-3.314 2.686-5 6-5s6 1.686 6 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
        ),
      },
      {
        title: 'Vai trò',
        desc: 'Tạo và cấu hình vai trò, gán nhóm quyền cho từng chức danh.',
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
    label: 'Quy trình tự động',
    cards: [
      {
        title: 'Sao kê ngân hàng',
        desc: 'Cài đặt lịch chạy, cột dữ liệu, mapping quốc gia và Google Sheets cho module sao kê.',
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
    label: 'Báo cáo',
    cards: [
      {
        title: 'Báo cáo AR',
        desc: 'Cấu hình Google Sheets và service account cho module báo cáo công nợ phải thu.',
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
];

export default function SettingsRoot() {
  const router = useRouter();

  return (
    <div className={s.page}>
      {GROUPS.map((group) => (
        <div key={group.label} className={s.group}>
          <p className={s.groupTitle}>{group.label}</p>
          <div className={s.grid}>
            {group.cards.map((card) => (
              <button
                key={card.href + card.title}
                className={s.card}
                onClick={() => router.push(card.href)}
              >
                <span className={s.cardIcon}>{card.icon}</span>
                <span className={s.cardBody}>
                  <span className={s.cardTitle}>{card.title}</span>
                  <span className={s.cardDesc}>{card.desc}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
