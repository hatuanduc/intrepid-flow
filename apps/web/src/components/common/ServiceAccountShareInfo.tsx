'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getServiceAccountStatus, type ServiceAccountStatus } from '../../lib/api';
import { useHasPermission } from '../../hooks/useHasPermission';
import { useT } from '../../lib/i18n';
import { Spinner } from './PageLoader';
import s from './ServiceAccountShareInfo.module.css';

function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <rect x="5" y="5" width="9" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
      <path d="M3 11H2.5A1.5 1.5 0 0 1 1 9.5v-7A1.5 1.5 0 0 1 2.5 1h7A1.5 1.5 0 0 1 11 2.5V3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d="M2.5 8.5L6 12L13.5 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

export default function ServiceAccountShareInfo({ accessLevel = 'viewer' }: { accessLevel?: 'viewer' | 'editor' }) {
  const { t } = useT();
  const access = accessLevel === 'editor' ? t('serviceAccountShare.editorAccess') : t('serviceAccountShare.viewerAccess');
  const canConfigConnections = useHasPermission('system:config');
  const [status, setStatus] = useState<ServiceAccountStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    Promise.resolve()
      .then(() => getServiceAccountStatus())
      .then(setStatus)
      .catch(() => setStatus({ hasServiceKey: false, clientEmail: null }))
      .finally(() => setLoading(false));
  }, []);

  function handleCopy(email: string) {
    navigator.clipboard.writeText(email).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  if (loading) {
    return (
      <div className={s.card}>
        <Spinner size={18} />
      </div>
    );
  }

  if (!status?.hasServiceKey || !status.clientEmail) {
    return (
      <div className={s.warningCard}>
        <p className={s.warningTitle}>{t('serviceAccountShare.notConfiguredTitle')}</p>
        <p className={s.warningDesc}>{t('serviceAccountShare.notConfiguredDesc')}</p>
        {canConfigConnections && (
          <Link className={s.linkBtn} href="/settings/connections">
            {t('serviceAccountShare.goToConnections')}
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className={s.card}>
      <p className={s.cardTitle}>{t('serviceAccountShare.title')}</p>
      <p className={s.cardDesc}>{t('serviceAccountShare.desc', { access })}</p>
      <div className={s.emailRow}>
        <span className={s.emailValue}>{status.clientEmail}</span>
        <button
          type="button"
          className={`${s.btnCopy} ${copied ? s.btnCopied : ''}`}
          onClick={() => handleCopy(status.clientEmail!)}
          title={copied ? t('connections.copied') : t('connections.copyEmail')}
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
        </button>
      </div>
      <p className={s.cardHint}>{t('serviceAccountShare.hint', { access })}</p>
    </div>
  );
}
