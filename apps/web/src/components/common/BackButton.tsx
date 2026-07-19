'use client';

import { useRouter } from 'next/navigation';
import { useT } from '../../lib/i18n';
import s from './BackButton.module.css';

type Props = { href?: string; onClick?: () => void };

export default function BackButton({ href, onClick }: Props) {
  const router = useRouter();
  const { t } = useT();

  function handleClick() {
    if (onClick) onClick();
    else if (href) router.push(href);
    else router.back();
  }

  return (
    <button type="button" className={s.backBtn} onClick={handleClick} aria-label={t('common.back')}>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M10 13L5 8l5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </button>
  );
}
