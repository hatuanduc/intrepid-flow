'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import {
  getSystemSettings, updateSystemServiceAccount, type SystemSettingsStatus,
} from '../../../lib/api';
import { useHasPermission } from '../../../hooks/useHasPermission';
import { useToast } from '../../../components/common/Toast';
import { useT } from '../../../lib/i18n';
import AccessDenied from '../../../components/common/AccessDenied';
import RightPanel from '../../../components/common/RightPanel';
import PageLoader from '../../../components/common/PageLoader';
import s from './ConnectionsPage.module.css';

function fmtDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

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

function GoogleSheetsIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <rect x="1" y="1" width="20" height="20" rx="3" fill="#0F9D58" opacity="0.12"/>
      <rect x="4" y="3.5" width="14" height="15" rx="1.5" stroke="#0F9D58" strokeWidth="1.4"/>
      <path d="M7 8h8M7 11h8M7 14h5" stroke="#0F9D58" strokeWidth="1.4" strokeLinecap="round"/>
      <path d="M13 3.5v4h5" stroke="#0F9D58" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

export default function ConnectionsPage() {
  const canConfig = useHasPermission('system:config');
  const toast = useToast();
  const { t } = useT();

  const [status, setStatus] = useState<SystemSettingsStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [panelOpen, setPanelOpen] = useState(false);
  const [jsonInput, setJsonInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const derivedClientEmail = useCallback((json: string): string | null => {
    if (!json.trim()) return null;
    try {
      const p = JSON.parse(json) as Record<string, unknown>;
      return typeof p.client_email === 'string' ? p.client_email : null;
    } catch { return null; }
  }, []);

  useEffect(() => {
    if (!canConfig) { setLoading(false); return; }
    getSystemSettings()
      .then(setStatus)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [canConfig]);

  if (!canConfig) return <AccessDenied />;

  function openPanel() {
    setJsonInput(status?.serviceKeyJson ?? '');
    setFormError('');
    setCopied(false);
    setPanelOpen(true);
    setTimeout(() => textareaRef.current?.focus(), 100);
  }

  function handleCopyEmail(email: string) {
    navigator.clipboard.writeText(email).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function validateJson(raw: string): boolean {
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed !== 'object' || !parsed.type || !parsed.private_key) {
        setFormError(t('connections.jsonInvalid'));
        return false;
      }
      return true;
    } catch {
      setFormError(t('connections.jsonMalformed'));
      return false;
    }
  }

  async function handleSave() {
    const trimmed = jsonInput.trim();
    if (!trimmed) { setFormError(t('connections.jsonRequired')); return; }
    if (!validateJson(trimmed)) return;
    setSaving(true); setFormError('');
    try {
      setStatus(await updateSystemServiceAccount(trimmed));
      setPanelOpen(false);
      toast.success(t('connections.saveSuccess'));
    } catch { setFormError(t('connections.saveFailed')); }
    finally { setSaving(false); }
  }

  async function handleClear() {
    setSaving(true);
    try {
      setStatus(await updateSystemServiceAccount(null));
      setPanelOpen(false);
      toast.success(t('connections.deleteSuccess'));
    } catch { toast.error(t('connections.deleteFailed')); }
    finally { setSaving(false); }
  }

  return (
    <div className={s.page}>
      <div className={s.pageHeader}>
        <h1 className={s.pageTitle}>{t('connections.title')}</h1>
      </div>

      {loading ? <PageLoader /> : (
        <div className={s.section}>
          <p className={s.sectionTitle}>{t('connections.googleWorkspace')}</p>
          <div className={s.cards}>
            <div className={s.card}>
              <div className={s.cardLeft}>
                <span className={s.cardIcon}><GoogleSheetsIcon /></span>
                <div className={s.cardInfo}>
                  <span className={s.cardName}>{t('connections.serviceAccountName')}</span>
                  <span className={s.cardDesc}>{t('connections.serviceAccountDesc')}</span>
                  {status?.hasServiceKey && status.updatedAt && (
                    <span className={s.cardMeta}>{t('connections.lastUpdated')}: {fmtDateTime(status.updatedAt)}</span>
                  )}
                </div>
              </div>
              <div className={s.cardRight}>
                {status?.hasServiceKey
                  ? <span className={s.badgeConfigured}>{t('connections.configured')}</span>
                  : <span className={s.badgeMissing}>{t('connections.notConfigured')}</span>}
                <button className={s.btnEdit} onClick={openPanel}>
                  {status?.hasServiceKey ? t('connections.update') : t('connections.configure')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <RightPanel
        title={t('connections.panelTitle')}
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        width={520}
        footer={
          <>
            {status?.hasServiceKey && (
              <button className={s.btnDanger} onClick={handleClear} disabled={saving}>{t('connections.delete')}</button>
            )}
            <button className={s.btnSecondary} onClick={() => setPanelOpen(false)}>{t('connections.cancel')}</button>
            <button className={s.btnPrimary} onClick={handleSave} disabled={saving}>
              {saving ? t('connections.saving') : t('connections.save')}
            </button>
          </>
        }
      >
        <div className={s.form}>
          {(() => {
            const email = derivedClientEmail(jsonInput) ?? (status?.hasServiceKey ? status.clientEmail : null);
            if (!email) return null;
            return (
              <div className={s.field}>
                <label className={s.label}>Service Account Email</label>
                <div className={s.emailRow}>
                  <span className={s.emailValue}>{email}</span>
                  <button
                    type="button"
                    className={`${s.btnCopy} ${copied ? s.btnCopied : ''}`}
                    onClick={() => handleCopyEmail(email)}
                    title={copied ? t('connections.copied') : t('connections.copyEmail')}
                  >
                    {copied ? <CheckIcon /> : <CopyIcon />}
                  </button>
                </div>
              </div>
            );
          })()}
          <div className={s.field}>
            <label className={s.label}>{t('connections.jsonLabel')}</label>
            <span className={s.hint}>
              {t('connections.jsonHint').split('Editor').map((part, i, arr) =>
                i < arr.length - 1
                  ? <span key={i}>{part}<strong>Editor</strong></span>
                  : <span key={i}>{part}</span>
              )}
            </span>
            <textarea
              ref={textareaRef}
              className={`${s.textarea} ${formError ? s.textareaError : ''}`}
              placeholder={'{\n  "type": "service_account",\n  "project_id": "...",\n  "private_key": "...",\n  ...\n}'}
              value={jsonInput}
              onChange={e => { setJsonInput(e.target.value); setFormError(''); setCopied(false); }}
              rows={16}
              spellCheck={false}
            />
            {formError && <span className={s.fieldError}>{formError}</span>}
          </div>
        </div>
      </RightPanel>
    </div>
  );
}
