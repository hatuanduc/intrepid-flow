'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  getArSettings, updateArSettings,
  listArGsheets, upsertArGsheet,
  type ArSettings, type ArGsheetConfig,
} from '../../../lib/api';
import { useHasPermission } from '../../../hooks/useHasPermission';
import AccessDenied from '../../../components/common/AccessDenied';
import PageLoader from '../../../components/common/PageLoader';
import { useToast } from '../../../components/common/Toast';
import s from './ReportArSettingsPage.module.css';

type Tab = 'connect' | 'gsheets';

export default function ReportArSettingsPage() {
  const canConfig = useHasPermission('report_ar:config');
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('gsheets');
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<ArSettings | null>(null);
  const [gsheets, setGsheets] = useState<ArGsheetConfig[]>([]);

  async function load() {
    setLoading(true);
    try {
      const [s, g] = await Promise.all([getArSettings(), listArGsheets()]);
      setSettings(s);
      setGsheets(g);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (canConfig) load(); }, [canConfig]);

  if (!canConfig) return <AccessDenied />;
  if (loading) return <PageLoader />;

  return (
    <div className={s.page}>
      <div className={s.pageHeader}>
        <button className={s.backBtn} onClick={() => router.push('/settings')}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M10 13L5 8l5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <h1 className={s.pageTitle}>Cài đặt AR Report</h1>
      </div>

      <div className={s.tabs}>
        {([
          ['gsheets', 'Google Sheets'],
          ['connect', 'Kết nối'],
        ] as [Tab, string][]).map(([key, label]) => (
          <button
            key={key}
            className={`${s.tab} ${tab === key ? s.tabActive : ''}`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'connect' && settings && (
        <ConnectTab
          settings={settings}
          onSaved={(s) => { setSettings(s); toast.success('Đã lưu thông tin kết nối.'); }}
          toast={toast}
        />
      )}
      {tab === 'gsheets' && (
        <GsheetsTab
          gsheets={gsheets}
          onSaved={() => load()}
          toast={toast}
        />
      )}
    </div>
  );
}

// ─── Tab: Kết nối ─────────────────────────────────────────────────────────────

function ConnectTab({
  settings,
  onSaved,
  toast,
}: {
  settings: ArSettings;
  onSaved: (s: ArSettings) => void;
  toast: ReturnType<typeof useToast>;
}) {
  const [serviceKey, setServiceKey] = useState('');
  const [showInput, setShowInput] = useState(!settings.hasServiceKey);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const result = await updateArSettings({ googleServiceKeyJson: serviceKey.trim() || null });
      onSaved(result);
      setServiceKey('');
      setShowInput(false);
    } catch {
      toast.error('Lưu thất bại. Vui lòng thử lại.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={s.section}>
      <div className={s.card}>
        <div className={s.cardTitle}>Google Service Account</div>
        <p className={s.cardDesc}>
          Service account cần có quyền đọc (Viewer) trên Google Spreadsheet chứa dữ liệu AR.
        </p>

        <div className={s.statusRow}>
          <span className={s.statusLabel}>Trạng thái key:</span>
          {settings.hasServiceKey
            ? <span className={s.badgeActive}>Đã cấu hình</span>
            : <span className={s.badgeInactive}>Chưa cấu hình</span>
          }
          {settings.hasServiceKey && !showInput && (
            <button className={s.linkBtn} onClick={() => setShowInput(true)}>
              Thay thế
            </button>
          )}
        </div>

        {showInput && (
          <>
            <div className={s.field}>
              <label className={s.label}>
                {settings.hasServiceKey ? 'Service Account JSON mới' : 'Service Account JSON'}
              </label>
              <textarea
                className={s.textarea}
                placeholder={'{"type": "service_account", "project_id": "...", ...}'}
                value={serviceKey}
                onChange={e => setServiceKey(e.target.value)}
                rows={8}
                autoFocus
              />
            </div>
            <div className={s.formActions}>
              {settings.hasServiceKey && (
                <button className={s.btnSecondary} onClick={() => { setShowInput(false); setServiceKey(''); }}>
                  Hủy
                </button>
              )}
              <button className={s.btnPrimary} onClick={save} disabled={saving || !serviceKey.trim()}>
                {saving ? 'Đang lưu...' : 'Lưu key'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Tab: Google Sheets ───────────────────────────────────────────────────────

function GsheetsTab({
  gsheets,
  onSaved,
  toast,
}: {
  gsheets: ArGsheetConfig[];
  onSaved: () => void;
  toast: ReturnType<typeof useToast>;
}) {
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [addingNew, setAddingNew] = useState(false);

  const openEdit = (code: string) => { setEditingCode(code); setAddingNew(false); };
  const openNew  = () => { setEditingCode(null); setAddingNew(true); };
  const closeForm = () => { setEditingCode(null); setAddingNew(false); };

  const editing = editingCode ? gsheets.find(g => g.countryCode === editingCode) ?? null : null;

  return (
    <div className={s.section}>
      <div className={s.sectionHeader}>
        <div>
          <div className={s.sectionTitle}>Spreadsheet theo quốc gia</div>
          <div className={s.sectionDesc}>Mỗi quốc gia liên kết với một Google Spreadsheet chứa dữ liệu AR.</div>
        </div>
        <button className={s.btnPrimary} onClick={openNew}>+ Thêm</button>
      </div>

      {gsheets.length === 0 && !addingNew ? (
        <div className={s.empty}>Chưa có cấu hình nào. Thêm spreadsheet để bắt đầu.</div>
      ) : (
        <div className={s.configList}>
          {gsheets.map(g => (
            <div key={g.countryCode} className={s.configRow}>
              <div className={s.configMain}>
                <span className={s.countryBadge}>{g.countryCode}</span>
                <div className={s.configDetails}>
                  <span className={s.configId}>{g.spreadsheetId}</span>
                  <span className={s.configMeta}>Sheet: {g.sheetName}</span>
                </div>
              </div>
              <div className={s.configActions}>
                {g.isActive
                  ? <span className={s.badgeActive}>Đang bật</span>
                  : <span className={s.badgeInactive}>Tắt</span>
                }
                <button className={s.editBtn} onClick={() => openEdit(g.countryCode)}>Sửa</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {(addingNew || editingCode) && (
        <GsheetForm
          initial={editing}
          onClose={closeForm}
          onSaved={() => { closeForm(); onSaved(); }}
          toast={toast}
        />
      )}
    </div>
  );
}

function GsheetForm({
  initial,
  onClose,
  onSaved,
  toast,
}: {
  initial: ArGsheetConfig | null;
  onClose: () => void;
  onSaved: () => void;
  toast: ReturnType<typeof useToast>;
}) {
  const [countryCode, setCountryCode] = useState(initial?.countryCode ?? '');
  const [spreadsheetId, setSpreadsheetId] = useState(initial?.spreadsheetId ?? '');
  const [sheetName, setSheetName] = useState(initial?.sheetName ?? 'TH');
  const [spreadsheetUrl, setSpreadsheetUrl] = useState(initial?.spreadsheetUrl ?? '');
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function validate() {
    const errs: Record<string, string> = {};
    if (!countryCode.trim()) errs.countryCode = 'Vui lòng nhập country code.';
    if (!spreadsheetId.trim()) errs.spreadsheetId = 'Vui lòng nhập Spreadsheet ID.';
    if (!sheetName.trim()) errs.sheetName = 'Vui lòng nhập tên sheet.';
    return errs;
  }

  async function save() {
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    setSaving(true);
    try {
      await upsertArGsheet(countryCode.trim().toUpperCase(), {
        spreadsheetId: spreadsheetId.trim(),
        sheetName: sheetName.trim(),
        spreadsheetUrl: spreadsheetUrl.trim() || undefined,
        isActive,
      });
      toast.success(initial ? 'Đã cập nhật cấu hình.' : 'Đã thêm cấu hình.');
      onSaved();
    } catch {
      toast.error('Lưu thất bại. Vui lòng thử lại.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={s.formCard}>
      <div className={s.formTitle}>{initial ? 'Chỉnh sửa cấu hình' : 'Thêm cấu hình mới'}</div>

      <div className={s.formGrid}>
        <div className={s.field}>
          <label className={s.label}>Country Code *</label>
          <input
            className={`${s.input} ${errors.countryCode ? s.inputError : ''}`}
            value={countryCode}
            onChange={e => { setCountryCode(e.target.value.toUpperCase()); setErrors(p => { const n = {...p}; delete n.countryCode; return n; }); }}
            placeholder="TH"
            disabled={!!initial}
            maxLength={5}
          />
          {errors.countryCode && <span className={s.fieldError}>{errors.countryCode}</span>}
        </div>

        <div className={s.field}>
          <label className={s.label}>Sheet Name *</label>
          <input
            className={`${s.input} ${errors.sheetName ? s.inputError : ''}`}
            value={sheetName}
            onChange={e => { setSheetName(e.target.value); setErrors(p => { const n = {...p}; delete n.sheetName; return n; }); }}
            placeholder="TH"
          />
          {errors.sheetName && <span className={s.fieldError}>{errors.sheetName}</span>}
        </div>
      </div>

      <div className={s.field}>
        <label className={s.label}>Spreadsheet ID *</label>
        <input
          className={`${s.input} ${errors.spreadsheetId ? s.inputError : ''}`}
          value={spreadsheetId}
          onChange={e => { setSpreadsheetId(e.target.value); setErrors(p => { const n = {...p}; delete n.spreadsheetId; return n; }); }}
          placeholder="1wQFumTUIQCKs2fR4Q4q3xVR4a8QIGYPjcJ1LLcs6bNw"
        />
        {errors.spreadsheetId && <span className={s.fieldError}>{errors.spreadsheetId}</span>}
      </div>

      <div className={s.field}>
        <label className={s.label}>Spreadsheet URL (tùy chọn)</label>
        <input
          className={s.input}
          value={spreadsheetUrl}
          onChange={e => setSpreadsheetUrl(e.target.value)}
          placeholder="https://docs.google.com/spreadsheets/d/..."
        />
      </div>

      <div className={s.toggleRow}>
        <span className={s.toggleLabel}>Đang bật</span>
        <button
          className={`${s.toggle} ${isActive ? s.toggleOn : ''}`}
          onClick={() => setIsActive(v => !v)}
          type="button"
        />
      </div>

      <div className={s.formActions}>
        <button className={s.btnSecondary} onClick={onClose}>Hủy</button>
        <button className={s.btnPrimary} onClick={save} disabled={saving}>
          {saving ? 'Đang lưu...' : 'Lưu'}
        </button>
      </div>
    </div>
  );
}
