import React from 'react';
import Link from 'next/link';
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
    label: 'Kết nối',
    cards: [
      {
        title: 'Google Service Account',
        desc: 'Cấu hình service account JSON dùng chung cho tất cả tích hợp Google Sheets trong hệ thống.',
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
        title: 'HSBCnet',
        desc: 'Cấu hình tên đăng nhập HSBCnet để hệ thống tự động đăng nhập và tải sao kê.',
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
        title: 'Tỉ giá',
        desc: 'Quản lý tỉ giá hối đoái quy đổi về USD, tự động cập nhật hàng tháng.',
        href: '/settings/geography',
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
    label: 'Quy trình tự động',
    cards: [
      {
        title: 'Sao kê ngân hàng',
        desc: 'Lịch chạy tự động, cột dữ liệu và mapping quốc gia cho module sao kê.',
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
        desc: 'Cấu hình lịch chạy và mapping cho module báo cáo công nợ phải thu.',
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
    label: 'Hệ thống',
    cards: [
      {
        title: 'Thông báo',
        desc: 'Bật thông báo trên màn hình khi tài khoản đăng nhập thành công.',
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
  return (
    <div className={s.page}>
      {GROUPS.map((group) => (
        <div key={group.label} className={s.group}>
          <p className={s.groupTitle}>{group.label}</p>
          <div className={s.grid}>
            {group.cards.map((card) => (
              <Link
                key={card.href + card.title}
                href={card.href}
                className={s.card}
              >
                <span className={s.cardIcon}>{card.icon}</span>
                <span className={s.cardBody}>
                  <span className={s.cardTitle}>{card.title}</span>
                  <span className={s.cardDesc}>{card.desc}</span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
