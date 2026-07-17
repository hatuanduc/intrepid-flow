'use client';

import { useEffect } from 'react';
import { useT } from '../../lib/i18n';
import s from './RightPanel.module.css';

type Props = {
  title: string;
  open: boolean;
  onClose: () => void;
  width?: number;
  footer?: React.ReactNode;
  children: React.ReactNode;
};

export default function RightPanel({ title, open, onClose, width = 480, footer, children }: Props) {
  const { t } = useT();
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className={s.root}>
      <div className={s.overlay} onClick={onClose} />
      <div className={s.panel} style={{ width: `min(${width}px, 100vw)` }}>
        <div className={s.header}>
          <span className={s.title}>{title}</span>
          <button className={s.closeBtn} onClick={onClose} aria-label={t('common.close')}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
        <div className={s.body}>{children}</div>
        {footer && <div className={s.footer}>{footer}</div>}
      </div>
    </div>
  );
}
