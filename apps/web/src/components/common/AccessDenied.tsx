'use client';

import { useT } from '../../lib/i18n';
import s from './AccessDenied.module.css';

export default function AccessDenied() {
  const { t } = useT();
  return (
    <div className={s.wrap}>
      <svg className={s.icon} viewBox="0 0 40 40" fill="none">
        <rect x="1" y="1" width="38" height="38" rx="10" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M20 13v8M20 25v2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
      </svg>
      <p className={s.title}>{t('accessDenied.title')}</p>
      <p className={s.desc}>{t('accessDenied.description')}</p>
    </div>
  );
}
