'use client';

import { useEffect, useState, useRef } from 'react';
import {
  getSystemSettings, updateSystemServiceAccount, type SystemSettingsStatus,
} from '../../../lib/api';
import { useHasPermission } from '../../../hooks/useHasPermission';
import { useToast } from '../../../components/common/Toast';
import AccessDenied from '../../../components/common/AccessDenied';
import RightPanel from '../../../components/common/RightPanel';
import PageLoader from '../../../components/common/PageLoader';
import s from './ConnectionsPage.module.css';

function fmtDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
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

  const [status, setStatus] = useState<SystemSettingsStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [panelOpen, setPanelOpen] = useState(false);
  const [jsonInput, setJsonInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!canConfig) { setLoading(false); return; }
    getSystemSettings()
      .then(setStatus)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [canConfig]);

  if (!canConfig) return <AccessDenied />;

  function openPanel() {
    setJsonInput(''); setFormError(''); setPanelOpen(true);
    setTimeout(() => textareaRef.current?.focus(), 100);
  }

  function validateJson(raw: string): boolean {
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed !== 'object' || !parsed.type || !parsed.private_key) {
        setFormError('JSON không hợp lệ — cần có trường "type" và "private_key".');
        return false;
      }
      return true;
    } catch {
      setFormError('JSON không đúng định dạng.');
      return false;
    }
  }

  async function handleSave() {
    const trimmed = jsonInput.trim();
    if (!trimmed) { setFormError('Vui lòng dán nội dung JSON.'); return; }
    if (!validateJson(trimmed)) return;
    setSaving(true); setFormError('');
    try {
      setStatus(await updateSystemServiceAccount(trimmed));
      setPanelOpen(false);
      toast.success('Đã lưu service account thành công.');
    } catch { setFormError('Lưu thất bại. Vui lòng thử lại.'); }
    finally { setSaving(false); }
  }

  async function handleClear() {
    setSaving(true);
    try {
      setStatus(await updateSystemServiceAccount(null));
      setPanelOpen(false);
      toast.success('Đã xóa service account.');
    } catch { toast.error('Xóa thất bại. Vui lòng thử lại.'); }
    finally { setSaving(false); }
  }

  return (
    <div className={s.page}>
      <div className={s.pageHeader}>
        <h1 className={s.pageTitle}>Kết nối & Tích hợp</h1>
      </div>

      {loading ? <PageLoader /> : (
        <div className={s.section}>
          <p className={s.sectionTitle}>Google Workspace</p>
          <div className={s.cards}>
            <div className={s.card}>
              <div className={s.cardLeft}>
                <span className={s.cardIcon}><GoogleSheetsIcon /></span>
                <div className={s.cardInfo}>
                  <span className={s.cardName}>Google Service Account</span>
                  <span className={s.cardDesc}>
                    Dùng chung cho tất cả modules — Sao kê NH, Báo cáo AR và các tích hợp Google Sheets khác.
                  </span>
                  {status?.hasServiceKey && status.updatedAt && (
                    <span className={s.cardMeta}>Cập nhật lần cuối: {fmtDateTime(status.updatedAt)}</span>
                  )}
                </div>
              </div>
              <div className={s.cardRight}>
                {status?.hasServiceKey
                  ? <span className={s.badgeConfigured}>✓ Đã cấu hình</span>
                  : <span className={s.badgeMissing}>Chưa cấu hình</span>}
                <button className={s.btnEdit} onClick={openPanel}>
                  {status?.hasServiceKey ? 'Cập nhật' : 'Cấu hình'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <RightPanel
        title="Google Service Account"
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        width={520}
        footer={
          <>
            {status?.hasServiceKey && (
              <button className={s.btnDanger} onClick={handleClear} disabled={saving}>Xóa</button>
            )}
            <button className={s.btnSecondary} onClick={() => setPanelOpen(false)}>Hủy</button>
            <button className={s.btnPrimary} onClick={handleSave} disabled={saving}>
              {saving ? 'Đang lưu...' : 'Lưu'}
            </button>
          </>
        }
      >
        <div className={s.form}>
          <div className={s.field}>
            <label className={s.label}>Service Account JSON</label>
            <span className={s.hint}>
              Tạo service account trong Google Cloud Console, tải file JSON và dán nội dung vào đây.
              Account cần có quyền <strong>Editor</strong> trên các spreadsheet cần truy cập.
            </span>
            <textarea
              ref={textareaRef}
              className={`${s.textarea} ${formError ? s.textareaError : ''}`}
              placeholder={'{\n  "type": "service_account",\n  "project_id": "...",\n  "private_key": "...",\n  ...\n}'}
              value={jsonInput}
              onChange={e => { setJsonInput(e.target.value); setFormError(''); }}
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
