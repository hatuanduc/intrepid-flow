'use client';

import { useEffect } from 'react';
import { type GasLink } from '../../lib/api';
import { useT } from '../../lib/i18n';
import s from './GasLinkFrameModal.module.css';

type Props = {
  link: GasLink | null;
  onClose: () => void;
};

export default function GasLinkFrameModal({ link, onClose }: Props) {
  const { t } = useT();

  useEffect(() => {
    if (!link) return;
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [link, onClose]);

  if (!link) return null;

  return (
    <div className={s.overlay} onClick={onClose}>
      <div className={s.frame} onClick={e => e.stopPropagation()}>
        <div className={s.header}>
          <span className={s.headerIcon}>{link.icon}</span>
          <span className={s.headerTitle}>{link.name}</span>
          <div className={s.headerActions}>
            <a className={s.openTab} href={link.url} target="_blank" rel="noopener noreferrer">
              {t('gasLinks.openInNewTab')}
            </a>
            <button className={s.closeBtn} onClick={onClose} aria-label={t('common.close')}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
        </div>
        <p className={s.hint}>{t('gasLinks.frameLoadHint')}</p>
        <div className={s.body}>
          <iframe
            src={link.url}
            className={s.iframe}
            sandbox="allow-scripts allow-forms allow-popups allow-same-origin allow-top-navigation-by-user-activation"
          />
        </div>
      </div>
    </div>
  );
}
