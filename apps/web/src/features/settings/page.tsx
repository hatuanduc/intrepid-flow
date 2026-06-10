"use client";
import React from 'react';
import { useRouter } from 'next/navigation';
import s from './SettingsHub.module.css';

type Card = { title: string; desc: string; href: string; icon: React.ReactNode };
type Group = { label: string; cards: Card[] };

const GROUPS: Group[] = [
  {
    label: 'Cài đặt tổ chức',
    cards: [
      {
        title: 'Chi nhánh',
        desc: 'Quản lý các chi nhánh kinh doanh, địa chỉ và trạng thái hoạt động.',
        href: '/settings/branches',
        icon: (
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
            <rect x="1.5" y="7" width="4" height="7.5" rx="1" stroke="currentColor" strokeWidth="1.3"/>
            <rect x="6" y="4" width="4" height="10.5" rx="1" stroke="currentColor" strokeWidth="1.3"/>
            <rect x="10.5" y="1.5" width="4" height="13" rx="1" stroke="currentColor" strokeWidth="1.3"/>
          </svg>
        ),
      },
    ],
  },
  {
    label: 'Người dùng & quyền hạn',
    cards: [
      {
        title: 'Tài khoản người dùng',
        desc: 'Tạo, sửa và quản lý tài khoản nhân viên, gán vai trò theo chi nhánh.',
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
      {
        title: 'Quyền hạn',
        desc: 'Xem toàn bộ danh sách quyền hạn trong hệ thống theo từng module.',
        href: '/settings/roles',
        icon: (
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
            <rect x="3" y="7" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
            <path d="M5.5 7V5a2.5 2.5 0 015 0v2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            <circle cx="8" cy="10.5" r="1" fill="currentColor"/>
          </svg>
        ),
      },
    ],
  },
  {
    label: 'Cài đặt hàng hóa',
    cards: [
      {
        title: 'Danh mục & Mã vải',
        desc: 'Quản lý danh mục sản phẩm và mã phân loại hàng hóa.',
        href: '/goods/categories',
        icon: (
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
            <path d="M1.5 3.5h13l-1 9h-11l-1-9z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
            <path d="M5.5 3.5V2.5a2.5 2.5 0 015 0v1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            <path d="M5.5 8h5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
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
