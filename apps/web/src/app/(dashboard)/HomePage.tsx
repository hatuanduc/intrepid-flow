'use client';

import Link from 'next/link';
import s from './HomePage.module.css';

export default function HomePage() {
  const now = new Date();
  const dateStr = now.toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className={s.page}>
      <div className={s.header}>
        <h1 className={s.greeting}>Tổng quan</h1>
        <p className={s.date}>{dateStr}</p>
      </div>

      <div className={s.quickGrid}>
        <Link href="/modules" className={s.quickCard}>
          <span className={s.quickIcon}>
            <svg width="20" height="20" viewBox="0 0 14 14" fill="none">
              <rect x="1" y="1" width="4" height="3" rx="1" stroke="currentColor" strokeWidth="1.2"/>
              <rect x="9" y="5" width="4" height="3" rx="1" stroke="currentColor" strokeWidth="1.2"/>
              <rect x="1" y="10" width="4" height="3" rx="1" stroke="currentColor" strokeWidth="1.2"/>
              <path d="M5 2.5h2.5a1 1 0 011 1V5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
              <path d="M5 11.5h2.5a1 1 0 001-1V8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
          </span>
          <span className={s.quickTitle}>Quy trình tự động</span>
          <span className={s.quickDesc}>Bật, tắt và cấu hình các quy trình tự động hóa</span>
        </Link>

        <Link href="/settings" className={s.quickCard}>
          <span className={s.quickIcon}>
            <svg width="20" height="20" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.3"/>
              <path d="M8 1v1.5M8 13.5V15M15 8h-1.5M2.5 8H1M12.364 3.636l-1.06 1.06M4.697 11.303l-1.06 1.06M12.364 12.364l-1.06-1.06M4.697 4.697l-1.06-1.06" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
          </span>
          <span className={s.quickTitle}>Cài đặt hệ thống</span>
          <span className={s.quickDesc}>Quản lý người dùng, vai trò và chi nhánh</span>
        </Link>
      </div>
    </div>
  );
}
