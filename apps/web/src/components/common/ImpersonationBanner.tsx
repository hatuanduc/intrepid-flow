'use client';

import { stopImpersonation } from '../../lib/auth';
import s from './ImpersonationBanner.module.css';

type Props = { userName: string | null; userEmail: string };

export default function ImpersonationBanner({ userName, userEmail }: Props) {
  function handleStop() {
    stopImpersonation();
    window.location.replace('/');
  }

  return (
    <div className={s.banner}>
      <span className={s.icon}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <circle cx="7" cy="5" r="2.3" stroke="currentColor" strokeWidth="1.3"/>
          <path d="M2.5 12c0-2 2.02-3.5 4.5-3.5s4.5 1.5 4.5 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
        </svg>
      </span>
      <span className={s.text}>
        Đang xem với tư cách <strong>{userName ?? userEmail}</strong>
      </span>
      <button className={s.exitBtn} onClick={handleStop}>
        Thoát chế độ xem
      </button>
    </div>
  );
}
