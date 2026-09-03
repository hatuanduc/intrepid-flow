'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  getBankSettings, updateBankSettings, triggerBankSync,
  listBankGsheets, upsertBankGsheet,
  listBankDriveExportConfigs, upsertBankDriveExportConfig,
  listBankAccounts, listBankAccountNames,
  createBankAccountName, updateBankAccountName, deleteBankAccountName, updateBankAccountSync, updateBankAccountPdfExport,
  type BankJobSettings, type SyncDateMode,
  type BankGsheetConfig, type BankDriveExportConfig, type BankAccount, type BankAccountNameItem,
} from '../../../lib/api';
import { useHasPermission } from '../../../hooks/useHasPermission';
import AccessDenied from '../../../components/common/AccessDenied';
import BackButton from '../../../components/common/BackButton';
import PageLoader from '../../../components/common/PageLoader';
import { useToast } from '../../../components/common/Toast';
import { useT } from '../../../lib/i18n';
import RightPanel from '../../../components/common/RightPanel';
import Select from '../../../components/common/Select';
import ServiceAccountShareInfo from '../../../components/common/ServiceAccountShareInfo';
import Tooltip from '../../../components/common/Tooltip';
import { extractSpreadsheetId, isValidSpreadsheetId } from '../../../lib/googleSheets';
import { extractFolderId, isValidFolderId } from '../../../lib/googleDrive';
import s from './BankStatementSettingsPage.module.css';

type Tab = 'schedule' | 'connect' | 'accounts' | 'gsheets' | 'pdfExport';

export default function BankStatementSettingsPage() {
  const canView = useHasPermission('bank_statement:view');
  const canConfig = useHasPermission('bank_statement:config');
  const toast = useToast();
  const { t } = useT();
  const [tab, setTab] = useState<Tab>('schedule');
  const [loading, setLoading] = useState(true);

  const [settings, setSettings] = useState<BankJobSettings | null>(null);
  const [gsheets, setGsheets] = useState<BankGsheetConfig[]>([]);
  const [driveConfigs, setDriveConfigs] = useState<BankDriveExportConfig[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [accountNames, setAccountNames] = useState<BankAccountNameItem[]>([]);

  async function load() {
    setLoading(true);
    try {
      const [s, g, d, ba, an] = await Promise.all([
        getBankSettings(),
        listBankGsheets(),
        listBankDriveExportConfigs().catch(() => [] as BankDriveExportConfig[]),
        listBankAccounts().catch(() => [] as BankAccount[]),
        listBankAccountNames({ all: true }).catch(() => [] as BankAccountNameItem[]),
      ]);
      setSettings(s);
      setGsheets(g);
      setDriveConfigs(d);
      setBankAccounts(ba);
      setAccountNames(an);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Deferred a tick so load()'s internal setState isn't synchronous with the effect itself.
    if (canView) Promise.resolve().then(() => load());
  }, [canView]);

  // Re-fetch just the accounts data after a create/rename/delete — a rename cascades to
  // bankAccounts server-side (see updateAccountName), so a plain re-fetch keeps both in
  // sync without hand-rolling the same cascade logic client-side. Doesn't touch `loading`
  // so the page doesn't flash back to <PageLoader /> like a full load() would.
  async function refreshAccounts() {
    const [ba, an] = await Promise.all([
      listBankAccounts().catch(() => [] as BankAccount[]),
      listBankAccountNames({ all: true }).catch(() => [] as BankAccountNameItem[]),
    ]);
    setBankAccounts(ba);
    setAccountNames(an);
  }

  if (!canView) return <AccessDenied />;

  if (loading) return <PageLoader />;

  const tabs: [Tab, string][] = [
    ['schedule', t('bankSettings.tabSchedule')],
    ['connect',  t('bankSettings.tabConnect')],
    ['accounts', t('bankSettings.tabAccounts')],
    ['gsheets',  'Google Sheets'],
    ['pdfExport', t('bankSettings.tabPdfExport')],
  ];

  return (
    <div className={s.page}>
      <div className={s.pageHeader}>
        <BackButton href="/settings" />
        <h1 className={s.pageTitle}>{t('bankSettings.title')}</h1>
      </div>

      <div className={s.tabs}>
        {tabs.map(([key, label]) => (
          <button
            key={key}
            className={`${s.tab} ${tab === key ? s.tabActive : ''}`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'schedule' && settings && (
        <ScheduleTab settings={settings} canConfig={canConfig} onSaved={(s) => { setSettings(s); toast.success(t('bankSettings.scheduleSaved')); }} />
      )}
      {tab === 'connect' && settings && (
        <ConnectTab settings={settings} canConfig={canConfig} onSaved={(s) => { setSettings(s); toast.success(t('bankSettings.connectSaved')); }} />
      )}
      {tab === 'accounts' && (
        <AccountsTab
          accountNames={accountNames}
          bankAccounts={bankAccounts}
          driveConfigs={driveConfigs}
          canConfig={canConfig}
          toast={toast}
          onNameToggled={(id, isActive) => setAccountNames(prev => prev.map(n => (n.id === id ? { ...n, isActive } : n)))}
          onAccountToggled={(id, syncEnabled) => setBankAccounts(prev => prev.map(a => (a.id === id ? { ...a, syncEnabled } : a)))}
          onAccountPdfToggled={(id, pdfExportEnabled) => setBankAccounts(prev => prev.map(a => (a.id === id ? { ...a, pdfExportEnabled } : a)))}
          onDriveConfigSaved={(config) => setDriveConfigs(prev => {
            const idx = prev.findIndex(c => c.accountCode === config.accountCode);
            if (idx < 0) return [...prev, config];
            const next = [...prev];
            next[idx] = config;
            return next;
          })}
          onDataChanged={refreshAccounts}
        />
      )}
      {tab === 'gsheets' && settings && (
        <GsheetsTab
          settings={settings}
          gsheets={gsheets}
          accountNames={accountNames}
          canConfig={canConfig}
          onSaved={(s) => { if (s) setSettings(s); else load(); }}
          toast={toast}
        />
      )}
      {tab === 'pdfExport' && (
        <PdfExportTab
          driveConfigs={driveConfigs}
          accountNames={accountNames}
          canConfig={canConfig}
          toast={toast}
          onConfigSaved={(config) => setDriveConfigs(prev => {
            const idx = prev.findIndex(c => c.accountCode === config.accountCode);
            if (idx < 0) return [...prev, config];
            const next = [...prev];
            next[idx] = config;
            return next;
          })}
        />
      )}
    </div>
  );
}

// ─── Tab: Schedule ────────────────────────────────────────────────────────────

const MINUTE_OPTIONS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

function getNextRuns(cronHour: number, cronMinute: number, count: number): Date[] {
  const results: Date[] = [];
  const now = new Date();
  for (let day = 0; results.length < count && day < count + 2; day++) {
    const d = new Date(now);
    d.setDate(now.getDate() + day);
    d.setHours(cronHour, cronMinute, 0, 0);
    if (d > now) results.push(d);
  }
  return results;
}

// Mirrors computeDateRange() in apps/worker/src/bank-sync/services/playwright.service.ts —
// preview only (client-side), so the setting makes clear upfront which dates a mode
// actually covers (e.g. "Last 7 days" never includes today — HSBC data for today can
// still change through the day, so the range always ends at yesterday).
function computeSyncRangePreview(mode: SyncDateMode, customDays: number): { from: Date; to: Date } {
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const yesterday = new Date(today);
  yesterday.setUTCDate(today.getUTCDate() - 1);

  if (mode === 'today') return { from: today, to: today };
  if (mode === 'last_7_days') {
    const from = new Date(yesterday);
    from.setUTCDate(yesterday.getUTCDate() - 6);
    return { from, to: yesterday };
  }
  if (mode === 'custom') {
    const days = customDays > 0 ? customDays : 1;
    const from = new Date(yesterday);
    from.setUTCDate(yesterday.getUTCDate() - (days - 1));
    return { from, to: yesterday };
  }
  return { from: yesterday, to: yesterday }; // 'yesterday'
}

function formatDMY(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getUTCFullYear()}`;
}

function formatRunDate(d: Date, lang: string) {
  const locale = lang === 'vi' ? 'vi-VN' : 'en-US';
  const dayName = d.toLocaleDateString(locale, { weekday: 'long' });
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${dayName}, ${day}/${month}/${d.getFullYear()}`;
}

function ScheduleTab({ settings, canConfig, onSaved }: { settings: BankJobSettings; canConfig: boolean; onSaved: (s: BankJobSettings) => void }) {
  const { t, lang } = useT();
  const router = useRouter();
  const toast = useToast();
  const canRun = useHasPermission('bank_statement:run');
  const [isScheduled, setIsScheduled] = useState(settings.isScheduled);
  const [hour, setHour] = useState(() => parseInt(settings.scheduleCron.split(' ')[1]));
  const [minute, setMinute] = useState(() => parseInt(settings.scheduleCron.split(' ')[0]));
  const [syncDateMode, setSyncDateMode] = useState<SyncDateMode>(settings.syncDateMode ?? 'yesterday');
  const [syncCustomDays, setSyncCustomDays] = useState(settings.syncCustomDays ?? 1);
  const [saving, setSaving] = useState(false);

  // Per-run override — a one-off "Run now" with an explicit range, never persisted
  // to these settings (save() below never sends dateFrom/dateTo).
  const [showDateOverride, setShowDateOverride] = useState(false);
  const [overrideFrom, setOverrideFrom] = useState('');
  const [overrideTo, setOverrideTo] = useState('');
  const [triggering, setTriggering] = useState(false);

  const cron = `${minute} ${hour} * * *`;
  const nextRuns = isScheduled ? getNextRuns(hour, minute, 5) : [];
  const syncRangePreview = computeSyncRangePreview(syncDateMode, syncCustomDays);

  const syncDateModeLabels: Record<SyncDateMode, string> = {
    today:       t('bankSettings.syncToday'),
    yesterday:   t('bankSettings.syncYesterday'),
    last_7_days: t('bankSettings.syncLast7'),
    custom:      t('bankSettings.syncCustom'),
  };

  async function save() {
    setSaving(true);
    try {
      const result = await updateBankSettings({
        scheduleCron: cron,
        isScheduled,
        syncDateMode,
        syncCustomDays: syncCustomDays > 0 ? syncCustomDays : 1,
      });
      onSaved(result);
    } finally {
      setSaving(false);
    }
  }

  async function runNow() {
    if (!overrideFrom || !overrideTo) {
      toast.error(t('bankSettings.dateRangeIncomplete'));
      return;
    }
    if (overrideFrom > overrideTo) {
      toast.error(t('bankSettings.dateRangeInvalid'));
      return;
    }
    setTriggering(true);
    try {
      const job = await triggerBankSync({ dateFrom: overrideFrom, dateTo: overrideTo });
      router.push('/bank-statement/jobs/' + job.id);
    } catch {
      toast.error(t('bankSettings.triggerFailed'));
      setTriggering(false);
    }
  }

  return (
    <div className={s.section}>
      <div className={s.card}>
        <div className={s.scheduleRow}>
          <div className={s.scheduleLabel}>
            <span className={s.scheduleName}>{t('bankSettings.autoSchedule')}</span>
            <span className={s.scheduleDesc}>{t('bankSettings.autoScheduleDesc')}</span>
          </div>
          <button
            className={`${s.toggle} ${isScheduled ? s.toggleOn : ''}`}
            onClick={() => canConfig && setIsScheduled(v => !v)}
            disabled={!canConfig}
          />
        </div>

        {isScheduled && (
          <>
            <div className={s.scheduleDivider} />

            <div className={s.timePicker}>
              <span className={s.timeLabel}>{t('bankSettings.runAt')}</span>
              <div className={s.timeSelects}>
                <Select
                  width={64}
                  value={hour}
                  onChange={setHour}
                  disabled={!canConfig}
                  options={Array.from({ length: 24 }, (_, i) => ({ value: i, label: String(i).padStart(2, '0') }))}
                />
                <span className={s.timeSep}>:</span>
                <Select
                  width={64}
                  value={minute}
                  onChange={setMinute}
                  disabled={!canConfig}
                  options={MINUTE_OPTIONS.map(m => ({ value: m, label: String(m).padStart(2, '0') }))}
                />
                <span className={s.tzBadge}>ICT (UTC+7)</span>
              </div>
              <div className={s.cronPreview}>{cron}</div>
            </div>

            {nextRuns.length > 0 && (
              <>
                <div className={s.scheduleDivider} />
                <div className={s.nextRuns}>
                  <span className={s.nextRunsLabel}>{t('bankSettings.upcomingRuns')}</span>
                  <div className={s.nextRunsList}>
                    {nextRuns.map((d, i) => (
                      <div key={i} className={s.nextRunItem}>
                        <span className={s.nextRunDot} />
                        <span className={s.nextRunDate}>{formatRunDate(d, lang)}</span>
                        <span className={s.nextRunTime}>
                          {String(d.getHours()).padStart(2, '0')}:{String(d.getMinutes()).padStart(2, '0')} ICT
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>

      <div className={s.card}>
        <div className={s.scheduleRow}>
          <div className={s.scheduleLabel}>
            <span className={s.scheduleName}>{t('bankSettings.syncRange')}</span>
            <span className={s.scheduleDesc}>{t('bankSettings.syncRangeDesc')}</span>
          </div>
        </div>
        <div className={s.scheduleDivider} />
        <div className={s.dateRangeRow}>
          <Select
            width={180}
            value={syncDateMode}
            onChange={setSyncDateMode}
            disabled={!canConfig}
            options={(Object.entries(syncDateModeLabels) as [SyncDateMode, string][]).map(([v, label]) => ({ value: v, label }))}
          />
          {syncDateMode === 'custom' && (
            <>
              <span className={s.timeSep}>N =</span>
              <input
                type="number"
                min={1}
                max={365}
                className={s.customDaysInput}
                value={syncCustomDays}
                onChange={e => setSyncCustomDays(Math.max(1, parseInt(e.target.value) || 1))}
                disabled={!canConfig}
              />
              <span className={s.scheduleDesc}>{t('bankSettings.days')}</span>
            </>
          )}
        </div>
        <div className={s.syncRangePreview}>
          {t('bankSettings.syncRangePreview', { from: formatDMY(syncRangePreview.from), to: formatDMY(syncRangePreview.to) })}
        </div>
      </div>

      {canRun && (
        <div className={s.card}>
          <div className={s.scheduleRow}>
            <button type="button" className={s.dateOverrideToggle} onClick={() => setShowDateOverride(v => !v)}>
              {showDateOverride ? t('bankSettings.hideDateOverride') : t('bankSettings.customDateRange')}
            </button>
          </div>
          {showDateOverride && (
            <>
              <div className={s.scheduleDivider} />
              <div className={s.dateOverrideRow}>
                <label className={s.dateOverrideLabel}>
                  {t('bankSettings.dateFrom')}
                  <input
                    type="date"
                    className={s.dateOverrideInput}
                    value={overrideFrom}
                    onChange={e => setOverrideFrom(e.target.value)}
                  />
                </label>
                <label className={s.dateOverrideLabel}>
                  {t('bankSettings.dateTo')}
                  <input
                    type="date"
                    className={s.dateOverrideInput}
                    value={overrideTo}
                    onChange={e => setOverrideTo(e.target.value)}
                  />
                </label>
                <button className={s.btnPrimary} onClick={runNow} disabled={triggering}>
                  {triggering ? t('bankSettings.triggering') : t('bankSettings.runNowWithRange')}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {canConfig && (
        <div>
          <button className={s.btnPrimary} onClick={save} disabled={saving}>
            {saving ? t('bankSettings.saving') : t('bankSettings.saveSettings')}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Tab: Connection ──────────────────────────────────────────────────────────

function ConnectTab({ settings, canConfig, onSaved }: { settings: BankJobSettings; canConfig: boolean; onSaved: (s: BankJobSettings) => void }) {
  const { t } = useT();
  const [editing, setEditing] = useState(false);
  const [username, setUsername] = useState(settings.hsbcnetUsername ?? '');
  const [saving, setSaving] = useState(false);

  function startEdit() { setUsername(settings.hsbcnetUsername ?? ''); setEditing(true); }
  function cancelEdit() { setUsername(settings.hsbcnetUsername ?? ''); setEditing(false); }

  async function save() {
    setSaving(true);
    try {
      const result = await updateBankSettings({
        scheduleCron: settings.scheduleCron,
        isScheduled: settings.isScheduled,
        hsbcnetUsername: username.trim() || null,
        syncDateMode: settings.syncDateMode ?? 'yesterday',
        syncCustomDays: settings.syncCustomDays ?? 1,
      });
      onSaved(result);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={s.section}>
      <div className={s.card} style={{ padding: 0 }}>
        <div className={s.cardHead}>
          <span className={s.cardTitle}>HSBCnet</span>
          {!editing ? (
            canConfig && (
              <button className={s.btnEdit} onClick={startEdit}>
                <EditIcon /> {t('common.edit')}
              </button>
            )
          ) : (
            <div className={s.editActions}>
              <button className={s.btnCancel} type="button" onClick={cancelEdit} disabled={saving}>{t('common.cancel')}</button>
              <button className={s.btnSave} type="button" onClick={save} disabled={saving}>
                {saving ? t('bankSettings.saving') : t('common.save')}
              </button>
            </div>
          )}
        </div>
        <div className={`${s.infoRow} ${s.infoRowLast}`}>
          <span className={s.infoLabel}>HSBCnet Username</span>
          {editing ? (
            <div className={s.infoInput}>
              <input
                className={s.input}
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="INTREPID1"
                autoFocus
              />
              <span className={s.fieldHint}>{t('bankSettings.hsbcnetHint')}</span>
            </div>
          ) : (
            <span className={s.infoValue}>
              {settings.hsbcnetUsername || <span className={s.infoEmpty}>{t('bankSettings.hsbcnetNotConfigured')}</span>}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Account names ───────────────────────────────────────────────────────

function fmtSyncDate(iso: string) {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function AccountNameMoreMenu({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className={s.moreWrap} ref={ref} onClick={e => e.stopPropagation()}>
      <button
        type="button"
        className={`${s.moreBtn} ${open ? s.moreBtnOpen : ''}`}
        onClick={() => setOpen(v => !v)}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <circle cx="2" cy="7" r="1.2" fill="currentColor"/>
          <circle cx="7" cy="7" r="1.2" fill="currentColor"/>
          <circle cx="12" cy="7" r="1.2" fill="currentColor"/>
        </svg>
      </button>
      {open && (
        <div className={s.moreDropdown}>
          <button className={s.moreItem} onClick={() => { setOpen(false); onEdit(); }}>{t('common.edit')}</button>
          <button className={`${s.moreItem} ${s.moreItemDanger}`} onClick={() => { setOpen(false); onDelete(); }}>{t('common.delete')}</button>
        </div>
      )}
    </div>
  );
}

function AccountNamePanel({
  target, open, onClose, onSaved,
}: {
  target: BankAccountNameItem | 'new' | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useT();
  const toast = useToast();
  const isEdit = target !== null && target !== 'new';

  const [name, setName] = useState('');
  const [accountCode, setAccountCode] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    Promise.resolve().then(() => {
      if (isEdit && target) {
        setName(target.name);
        setAccountCode(target.accountCode);
      } else {
        setName(''); setAccountCode('');
      }
      setError(null);
      setFieldErrors({});
    });
  }, [open, target, isEdit]);

  function clearField(field: string) {
    setFieldErrors(prev => { const next = { ...prev }; delete next[field]; return next; });
  }

  function validate() {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = t('bankSettings.accountNameRequired');
    if (!isEdit && !accountCode.trim()) errs.accountCode = t('bankSettings.accountCodeRequired');
    return errs;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) { setFieldErrors(errs); return; }
    setFieldErrors({});
    setError(null);
    setSaving(true);
    try {
      if (isEdit && target) await updateBankAccountName(target.id, { name: name.trim() });
      else await createBankAccountName({ name: name.trim(), accountCode: accountCode.trim().toUpperCase() });
      toast.success(isEdit ? t('bankSettings.updateSuccess') : t('bankSettings.addSuccess'));
      onSaved();
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      if (code === 'ACCOUNT_NAME_EXISTS') setError(t('bankSettings.accountNameExists'));
      else setError(isEdit ? t('bankSettings.updateFailed') : t('bankSettings.addFailed'));
    } finally {
      setSaving(false);
    }
  }

  const footer = (
    <>
      <button type="button" className={s.btnSecondary} onClick={onClose}>{t('common.cancel')}</button>
      <button type="submit" form="account-name-form" className={s.btnPrimary} disabled={saving}>
        {saving ? t('bankSettings.saving') : t('common.save')}
      </button>
    </>
  );

  return (
    <RightPanel
      title={isEdit ? t('bankSettings.editAccountName') : t('bankSettings.addAccountName')}
      open={open}
      onClose={onClose}
      footer={footer}
    >
      <form id="account-name-form" onSubmit={submit} className={s.form}>
        <div className={s.field}>
          <label className={s.label}>{t('bankSettings.colAccountName')}</label>
          <input
            className={`${s.input} ${s.inputFull} ${fieldErrors.name ? s.inputError : ''}`}
            value={name}
            onChange={e => { setName(e.target.value); clearField('name'); }}
            placeholder="INTREPID ECOMMERCE SERVICES"
            autoFocus
          />
          {fieldErrors.name && <span className={s.fieldError}>{fieldErrors.name}</span>}
        </div>
        <div className={s.field}>
          <label className={s.label}>{t('bankSettings.colAccountCode')}</label>
          <input
            className={`${s.input} ${s.inputFull} ${fieldErrors.accountCode ? s.inputError : ''}`}
            value={accountCode}
            onChange={e => { setAccountCode(e.target.value); clearField('accountCode'); }}
            placeholder="TH"
            disabled={isEdit}
          />
          {isEdit && <span className={s.fieldHint}>{t('bankSettings.accountCodeLocked')}</span>}
          {fieldErrors.accountCode && <span className={s.fieldError}>{fieldErrors.accountCode}</span>}
        </div>
        {error && <div className={s.error}>{error}</div>}
      </form>
    </RightPanel>
  );
}

function AccountsTab({
  accountNames, bankAccounts, driveConfigs, canConfig, toast,
  onNameToggled, onAccountToggled, onAccountPdfToggled, onDriveConfigSaved, onDataChanged,
}: {
  accountNames: BankAccountNameItem[];
  bankAccounts: BankAccount[];
  driveConfigs: BankDriveExportConfig[];
  canConfig: boolean;
  toast: ReturnType<typeof useToast>;
  onNameToggled: (id: number, isActive: boolean) => void;
  onAccountToggled: (id: number, syncEnabled: boolean) => void;
  onAccountPdfToggled: (id: number, pdfExportEnabled: boolean) => void;
  onDriveConfigSaved: (config: BankDriveExportConfig) => void;
  onDataChanged: () => void;
}) {
  const { t } = useT();
  const driveConfigMap = Object.fromEntries(driveConfigs.map(c => [c.accountCode, c]));
  const [detailName, setDetailName] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [panelTarget, setPanelTarget] = useState<BankAccountNameItem | 'new' | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BankAccountNameItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const detailAccounts = detailName ? bankAccounts.filter(a => a.accountName === detailName) : [];

  async function toggleGroupPdfExport(e: React.MouseEvent, c: BankAccountNameItem) {
    e.stopPropagation();
    const config = driveConfigMap[c.accountCode];
    // No Drive folder configured yet — nothing to toggle on. Guided by the tooltip below
    // (title) rather than silently no-op-ing; DriveCountryCard on the PDF Export tab is
    // where the folder ID actually gets set.
    if (!config?.rootFolderId || !canConfig || savingId === c.id) return;
    setSavingId(c.id);
    const next = !config.isActive;
    try {
      const updated = await upsertBankDriveExportConfig(c.accountCode, { rootFolderId: config.rootFolderId, isActive: next });
      onDriveConfigSaved(updated);
    } catch {
      toast.error(t('bankSettings.updateFailed'));
    } finally {
      setSavingId(null);
    }
  }

  async function toggleNameStatus(e: React.MouseEvent, c: BankAccountNameItem) {
    e.stopPropagation();
    if (!canConfig || savingId === c.id) return;
    setSavingId(c.id);
    const next = !c.isActive;
    try {
      await updateBankAccountName(c.id, { isActive: next });
      onNameToggled(c.id, next);
    } catch {
      toast.error(t('bankSettings.updateFailed'));
    } finally {
      setSavingId(null);
    }
  }

  async function handleDeleteConfirmed() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteBankAccountName(deleteTarget.id);
      toast.success(t('bankSettings.deleteSuccess'));
      setDeleteTarget(null);
      onDataChanged();
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      setDeleteError(code === 'ACCOUNT_NAME_HAS_ACCOUNTS' ? t('bankSettings.deleteHasAccounts') : t('bankSettings.deleteFailed'));
    } finally {
      setDeleting(false);
    }
  }

  async function toggleAccountSync(a: BankAccount) {
    if (!canConfig || savingId === a.id) return;
    setSavingId(a.id);
    const next = !a.syncEnabled;
    try {
      await updateBankAccountSync(a.id, next);
      onAccountToggled(a.id, next);
    } catch {
      toast.error(t('bankSettings.updateFailed'));
    } finally {
      setSavingId(null);
    }
  }

  async function toggleAccountPdfExport(a: BankAccount) {
    if (!canConfig || savingId === a.id) return;
    setSavingId(a.id);
    const next = !a.pdfExportEnabled;
    try {
      await updateBankAccountPdfExport(a.id, next);
      onAccountPdfToggled(a.id, next);
    } catch {
      toast.error(t('bankSettings.updateFailed'));
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className={s.section}>
      <div className={s.sectionHeadRow}>
        <div>
          <p className={s.sectionTitle}>Account names</p>
          <p className={s.sectionDesc}>{t('bankSettings.accountNamesDesc')}</p>
        </div>
        {canConfig && (
          <button className={s.btnPrimary} onClick={() => setPanelTarget('new')}>{t('bankSettings.addAccount')}</button>
        )}
      </div>

      <div className={s.tableWrap}>
        <table className={s.table}>
          <thead>
            <tr>
              <th className={s.th}>{t('bankSettings.colAccountName')}</th>
              <th className={s.th} style={{ width: 130 }}>{t('bankSettings.colAccountCode')}</th>
              <th className={s.th} style={{ width: 110 }}>{t('bankSettings.colAccounts')}</th>
              <th className={s.th} style={{ width: 80 }}>{t('bankSettings.colSync')}</th>
              <th className={s.th} style={{ width: 80 }}>{t('bankSettings.colPdfExport')}</th>
              {canConfig && <th className={s.th} style={{ width: 40 }} />}
            </tr>
          </thead>
          <tbody>
            {accountNames.length === 0 && (
              <tr><td className={s.td} colSpan={canConfig ? 6 : 5}><span className={s.empty}>{t('bankSettings.noData')}</span></td></tr>
            )}
            {accountNames.map(c => {
              const count = bankAccounts.filter(a => a.accountName === c.name).length;
              return (
                <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => setDetailName(c.name)}>
                  <td className={s.td}>{c.name}</td>
                  <td className={s.td}><CountryBadge code={c.accountCode} /></td>
                  <td className={s.td}>
                    <span className={s.accountCountBadge}>{t('bankSettings.accountsCount', { n: count })}</span>
                  </td>
                  <td className={s.td}>
                    {canConfig ? (
                      <button
                        type="button"
                        className={`${s.toggle} ${c.isActive ? s.toggleOn : ''}`}
                        onClick={e => toggleNameStatus(e, c)}
                        disabled={savingId === c.id}
                        title={c.isActive ? t('bankSettings.syncActiveTitle') : t('bankSettings.syncInactiveTitle')}
                      />
                    ) : (
                      <span className={c.isActive ? s.syncDate : s.syncNever}>
                        {c.isActive ? t('bankSettings.syncActiveTitle') : t('bankSettings.syncInactiveTitle')}
                      </span>
                    )}
                  </td>
                  <td className={s.td}>
                    {(() => {
                      const driveConfig = driveConfigMap[c.accountCode];
                      const active = !!driveConfig?.isActive;
                      if (canConfig) {
                        return (
                          <button
                            type="button"
                            className={`${s.toggle} ${active ? s.toggleOn : ''}`}
                            onClick={e => toggleGroupPdfExport(e, c)}
                            disabled={savingId === c.id || !driveConfig?.rootFolderId}
                            title={
                              !driveConfig?.rootFolderId
                                ? t('bankSettings.pdfExportNoFolderTitle')
                                : active ? t('bankSettings.pdfExportActiveTitle') : t('bankSettings.pdfExportInactiveTitle')
                            }
                          />
                        );
                      }
                      return (
                        <span className={active ? s.syncDate : s.syncNever}>
                          {active ? t('bankSettings.pdfExportActiveTitle') : t('bankSettings.pdfExportInactiveTitle')}
                        </span>
                      );
                    })()}
                  </td>
                  {canConfig && (
                    <td className={s.td}>
                      <AccountNameMoreMenu
                        onEdit={() => setPanelTarget(c)}
                        onDelete={() => setDeleteTarget(c)}
                      />
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <RightPanel
        title={detailName ?? ''}
        open={!!detailName}
        onClose={() => setDetailName(null)}
        width={520}
      >
        {detailName && (
          <div>
            <div className={s.panelEntityMeta}>
              <CountryBadge code={detailAccounts[0]?.accountCode ?? ''} />
              <span className={s.panelAccountCount}>{t('bankSettings.accountsCount', { n: detailAccounts.length })}</span>
            </div>
            <table className={s.table}>
              <thead>
                <tr>
                  <th className={s.th}>{t('bankSettings.colAccountNumber')}</th>
                  <th className={s.th} style={{ width: 80 }}>Currency</th>
                  <th className={s.th}>{t('bankSettings.lastSync')}</th>
                  <th className={s.th} style={{ width: 70 }}>{t('bankSettings.colSync')}</th>
                  <th className={s.th} style={{ width: 70 }}>{t('bankSettings.colPdfExport')}</th>
                </tr>
              </thead>
              <tbody>
                {detailAccounts.length === 0 && (
                  <tr>
                    <td className={s.td} colSpan={5} style={{ textAlign: 'center' }}>
                      <span className={s.syncNever}>{t('bankSettings.noAccountsSynced')}</span>
                    </td>
                  </tr>
                )}
                {detailAccounts.map(a => (
                  <tr key={a.id}>
                    <td className={s.td}><span className={s.accountNumber}>{a.accountNumber}</span></td>
                    <td className={s.td}><span className={s.currencyBadge}>{a.currency}</span></td>
                    <td className={s.td}>
                      {a.lastSyncAt
                        ? <span className={s.syncDate}>{fmtSyncDate(a.lastSyncAt)}</span>
                        : <span className={s.syncNever}>{t('bankSettings.neverSynced')}</span>}
                    </td>
                    <td className={s.td}>
                      {canConfig ? (
                        <button
                          type="button"
                          className={`${s.toggle} ${a.syncEnabled ? s.toggleOn : ''}`}
                          onClick={() => toggleAccountSync(a)}
                          disabled={savingId === a.id}
                          title={a.syncEnabled ? t('bankSettings.syncActiveTitle') : t('bankSettings.syncInactiveTitle')}
                        />
                      ) : (
                        <span className={a.syncEnabled ? s.syncDate : s.syncNever}>
                          {a.syncEnabled ? t('bankSettings.syncActiveTitle') : t('bankSettings.syncInactiveTitle')}
                        </span>
                      )}
                    </td>
                    <td className={s.td}>
                      {canConfig ? (
                        <button
                          type="button"
                          className={`${s.toggle} ${a.pdfExportEnabled ? s.toggleOn : ''}`}
                          onClick={() => toggleAccountPdfExport(a)}
                          disabled={savingId === a.id}
                          title={a.pdfExportEnabled ? t('bankSettings.pdfExportActiveTitle') : t('bankSettings.pdfExportInactiveTitle')}
                        />
                      ) : (
                        <span className={a.pdfExportEnabled ? s.syncDate : s.syncNever}>
                          {a.pdfExportEnabled ? t('bankSettings.pdfExportActiveTitle') : t('bankSettings.pdfExportInactiveTitle')}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </RightPanel>

      <AccountNamePanel
        target={panelTarget}
        open={panelTarget !== null}
        onClose={() => setPanelTarget(null)}
        onSaved={() => { setPanelTarget(null); onDataChanged(); }}
      />

      {deleteTarget && (
        <div className={s.modalOverlay} onClick={() => setDeleteTarget(null)}>
          <div className={s.modal} onClick={e => e.stopPropagation()}>
            <p className={s.modalTitle}>{t('bankSettings.confirmDeleteAccountNameTitle')}</p>
            <p className={s.modalDesc}>{t('bankSettings.confirmDeleteAccountNameDesc', { name: deleteTarget.name })}</p>
            {deleteError && <div className={s.modalError}>{deleteError}</div>}
            <div className={s.modalActions}>
              <button className={s.btnSecondary} onClick={() => { setDeleteTarget(null); setDeleteError(null); }} disabled={deleting}>
                {t('common.cancel')}
              </button>
              <button className={s.btnDanger} onClick={handleDeleteConfirmed} disabled={deleting}>
                {deleting ? t('common.deleting') : t('common.delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab: Google Sheets ───────────────────────────────────────────────────────

function GsheetsTab({
  settings, gsheets, accountNames, canConfig, onSaved, toast,
}: {
  settings: BankJobSettings;
  gsheets: BankGsheetConfig[];
  accountNames: BankAccountNameItem[];
  canConfig: boolean;
  onSaved: (s?: BankJobSettings) => void;
  toast: ReturnType<typeof useToast>;
}) {
  const { t } = useT();
  const configMap = Object.fromEntries(gsheets.map(g => [g.accountCode, g]));

  return (
    <div className={s.section}>
      <div>
        <p className={s.sectionTitle}>{t('bankSettings.spreadsheetByAccount')}</p>
        <p className={s.sectionDesc}>{t('bankSettings.spreadsheetByAccountDesc')}</p>
      </div>

      {accountNames.length === 0 && (
        <div className={s.empty}>{t('bankSettings.noAccountsYet')}</div>
      )}

      <div className={s.countryCardList}>
        {accountNames.map(an => (
          <GsheetCountryCard
            key={an.accountCode}
            accountCode={an.accountCode}
            countryName={an.name}
            existing={configMap[an.accountCode] ?? null}
            canConfig={canConfig}
            toast={toast}
          />
        ))}
      </div>

      <div className={s.globalConfigSection}>
        <div className={s.globalConfigDivider} />
        <GlobalGsheetConfig settings={settings} canConfig={canConfig} onSaved={onSaved} toast={toast} />
      </div>
    </div>
  );
}

function GlobalGsheetConfig({
  settings, canConfig, onSaved, toast,
}: {
  settings: BankJobSettings;
  canConfig: boolean;
  onSaved: (s: BankJobSettings) => void;
  toast: ReturnType<typeof useToast>;
}) {
  const { t } = useT();
  const [editing, setEditing] = useState(false);
  const [templateSpreadsheetId, setTemplateSpreadsheetId] = useState(settings.googleTemplateSpreadsheetId ?? '');
  const [templateSheet, setTemplateSheet] = useState(settings.googleTemplateSheet ?? '');
  const [idError, setIdError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function startEdit() {
    setTemplateSpreadsheetId(settings.googleTemplateSpreadsheetId ?? '');
    setTemplateSheet(settings.googleTemplateSheet ?? '');
    setIdError(null);
    setEditing(true);
  }

  function cancelEdit() {
    setTemplateSpreadsheetId(settings.googleTemplateSpreadsheetId ?? '');
    setTemplateSheet(settings.googleTemplateSheet ?? '');
    setIdError(null);
    setEditing(false);
  }

  async function save() {
    const rawId = templateSpreadsheetId.trim();
    const cleanId = rawId ? extractSpreadsheetId(rawId) : '';
    if (cleanId && !isValidSpreadsheetId(cleanId)) {
      setIdError(t('bankSettings.spreadsheetIdInvalid'));
      return;
    }
    setIdError(null);
    setTemplateSpreadsheetId(cleanId);

    setSaving(true);
    try {
      const result = await updateBankSettings({
        scheduleCron: settings.scheduleCron,
        isScheduled: settings.isScheduled,
        hsbcnetUsername: settings.hsbcnetUsername,
        googleTemplateSpreadsheetId: cleanId || null,
        googleTemplateSheet: templateSheet.trim() || null,
        syncDateMode: settings.syncDateMode ?? 'yesterday',
        syncCustomDays: settings.syncCustomDays ?? 1,
      });
      onSaved(result);
      toast.success(t('bankSettings.gsheetsSaved'));
      setEditing(false);
    } catch {
      toast.error(t('bankSettings.saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  const savedId = settings.googleTemplateSpreadsheetId ?? '';
  const savedSheet = settings.googleTemplateSheet ?? '';

  return (
    <div className={s.card} style={{ padding: 0 }}>
      <div className={s.cardHead}>
        <span className={s.cardTitle}>{t('bankSettings.globalConfig')}</span>
        {!editing ? (
          canConfig && (
            <button className={s.btnEdit} onClick={startEdit}>
              <EditIcon /> {t('common.edit')}
            </button>
          )
        ) : (
          <div className={s.editActions}>
            <button className={s.btnCancel} type="button" onClick={cancelEdit} disabled={saving}>{t('common.cancel')}</button>
            <button className={s.btnSave} type="button" onClick={save} disabled={saving}>
              {saving ? t('bankSettings.saving') : t('common.save')}
            </button>
          </div>
        )}
      </div>

      <div className={s.infoRow}>
        <span className={s.infoLabel}>
          {t('bankSettings.templateIdLabel')}
          <Tooltip wide>
            {t('bankSettings.templateIdTooltip')}{'\n\n'}
            {t('bankSettings.templateIdTooltipUrl')}{'\n'}
            docs.google.com/spreadsheets/d/<strong>ID</strong>/edit
          </Tooltip>
        </span>
        {editing ? (
          <div className={s.infoInputWide}>
            <input
              className={`${s.input} ${s.inputFull} ${idError ? s.inputError : ''}`}
              value={templateSpreadsheetId}
              onChange={e => { setTemplateSpreadsheetId(e.target.value); setIdError(null); }}
              onBlur={e => setTemplateSpreadsheetId(extractSpreadsheetId(e.target.value))}
              placeholder={t('bankSettings.spreadsheetIdPlaceholder')}
              autoFocus
            />
            {idError && <span className={s.fieldError}>{idError}</span>}
          </div>
        ) : (
          <span className={s.infoValue}>
            {savedId
              ? <a href={`https://docs.google.com/spreadsheets/d/${savedId}/edit`} target="_blank" rel="noopener noreferrer">{savedId}</a>
              : <span className={s.infoEmpty}>{t('bankSettings.spreadsheetNotConfigured')}</span>}
          </span>
        )}
      </div>

      <div className={`${s.infoRow} ${s.infoRowLast}`}>
        <span className={s.infoLabel}>
          {t('bankSettings.templateSheetLabel')}
          <Tooltip>{t('bankSettings.sheetNameTooltip')} <code>template</code></Tooltip>
        </span>
        {editing ? (
          <div className={s.infoInput}>
            <input
              className={`${s.input} ${s.inputFull}`}
              value={templateSheet}
              onChange={e => setTemplateSheet(e.target.value)}
              placeholder="template"
            />
          </div>
        ) : (
          <span className={s.infoValue}>
            {savedSheet || <span className={s.infoEmpty}>—</span>}
          </span>
        )}
      </div>

      <div style={{ padding: '14px 20px' }}>
        <ServiceAccountShareInfo accessLevel="editor" />
      </div>
    </div>
  );
}

function GsheetCountryCard({
  accountCode, countryName, existing, canConfig, toast,
}: {
  accountCode: string;
  countryName: string;
  existing: BankGsheetConfig | null;
  canConfig: boolean;
  onSaved?: () => void;
  toast: ReturnType<typeof useToast>;
}) {
  const { t } = useT();
  const [spreadsheetId, setSpreadsheetId] = useState(existing?.spreadsheetId ?? '');
  const [isActive, setIsActive] = useState(existing?.isActive ?? false);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(!!(existing?.spreadsheetId));
  const [editing, setEditing] = useState(false);
  const [savedId, setSavedId] = useState(existing?.spreadsheetId ?? '');
  const [idError, setIdError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function save(overrides?: { isActive?: boolean; id?: string }) {
    const activeVal = overrides?.isActive ?? isActive;
    const rawId = (overrides?.id ?? spreadsheetId).trim();
    if (!rawId) return;
    const idVal = extractSpreadsheetId(rawId);
    if (!isValidSpreadsheetId(idVal)) {
      setIdError(t('bankSettings.spreadsheetIdInvalid'));
      return;
    }
    setIdError(null);
    setSpreadsheetId(idVal);
    setSaving(true);
    try {
      await upsertBankGsheet(accountCode, { spreadsheetId: idVal, isActive: activeVal });
      setSavedId(idVal);
      setEditing(false);
      toast.success(t('bankSettings.configSaved', { code: accountCode }));
    } catch {
      toast.error(t('bankSettings.configSaveFailed', { code: accountCode }));
    } finally { setSaving(false); }
  }

  async function toggleActive() {
    if (!canConfig) return;
    // Enable/disable works independently — card just opens/closes to match.
    const next = !isActive;
    setIsActive(next);
    setExpanded(next);
    if (savedId) {
      await save({ isActive: next });
    } else if (next) {
      setEditing(true);
      setTimeout(() => inputRef.current?.focus(), 0);
    } else {
      setEditing(false);
    }
  }

  function startEdit() {
    if (!canConfig) return;
    setExpanded(true); setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function cancelEdit() {
    setSpreadsheetId(savedId);
    setIdError(null);
    setEditing(false);
  }

  function handleBlur() {
    const trimmed = spreadsheetId.trim();
    if (trimmed && trimmed !== savedId) { void save({ id: trimmed }); }
    else if (savedId) { setEditing(false); }
  }

  function handleKeyDown(e: { key: string; preventDefault(): void }) {
    if (e.key === 'Enter') { e.preventDefault(); void save(); }
    if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
  }

  const displayId = savedId || spreadsheetId;

  return (
    <div className={`${s.countryCard} ${isActive ? s.countryCardActive : ''}`}>
      <div className={s.countryCardHeader}>
        <button className={s.countryCardExpand} onClick={() => setExpanded(v => !v)}>
          <svg className={`${s.chevron} ${expanded ? s.chevronOpen : ''}`} width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <CountryBadge code={accountCode} />
          <span className={s.countryCardName}>{countryName}</span>
          {displayId && <span className={s.countryCardSpreadsheetHint}>{displayId.slice(0, 20)}…</span>}
        </button>
        <div className={s.countryCardActions}>
          <button
            className={`${s.toggle} ${isActive ? s.toggleOn : ''}`}
            onClick={e => { e.stopPropagation(); void toggleActive(); }}
            title={isActive ? t('bankSettings.syncActiveTitle') : t('bankSettings.syncInactiveTitle')}
            disabled={!canConfig}
          />
        </div>
      </div>
      {expanded && (
        <div className={s.countryCardBody}>
          <div className={s.field}>
            <label className={s.label}>
              {t('bankSettings.spreadsheetIdLabel')}
              <Tooltip>{t('bankSettings.spreadsheetIdTooltip')}</Tooltip>
            </label>
            {editing ? (
              <>
                <input
                  ref={inputRef}
                  className={`${s.input} ${s.inputFull} ${idError ? s.inputError : ''}`}
                  value={spreadsheetId}
                  onChange={e => { setSpreadsheetId(e.target.value); setIdError(null); }}
                  onBlur={handleBlur}
                  onKeyDown={handleKeyDown}
                  placeholder={t('bankSettings.spreadsheetIdPlaceholder')}
                  disabled={saving}
                />
                {idError && <span className={s.fieldError}>{idError}</span>}
                {saving && <span className={s.fieldHint}>{t('bankSettings.saving')}</span>}
              </>
            ) : (
              <div className={s.spreadsheetDisplay} onClick={canConfig ? startEdit : undefined} style={!canConfig ? { cursor: 'default' } : undefined}>
                <span className={s.spreadsheetText}>
                  {displayId || <span className={s.spreadsheetPlaceholder}>{t('bankSettings.spreadsheetNotConfigured')}</span>}
                </span>
                {canConfig && (
                  <svg className={s.spreadsheetEditIcon} width="12" height="12" viewBox="0 0 13 13" fill="none">
                    <path d="M9.2 1.8l2 2L4 11H2v-2L9.2 1.8z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab: PDF Export (Google Drive) ────────────────────────────────────────────
// Copies GsheetsTab/GsheetCountryCard's shape almost verbatim — same per-country
// (accountCode) config, same toggle to enable/disable, just pointing at a Drive
// root folder instead of a spreadsheet. See drive.service.ts (worker) for the
// accountName/accountNumber/year/month/day sub-folders created under this root.

function PdfExportTab({
  driveConfigs, accountNames, canConfig, toast, onConfigSaved,
}: {
  driveConfigs: BankDriveExportConfig[];
  accountNames: BankAccountNameItem[];
  canConfig: boolean;
  toast: ReturnType<typeof useToast>;
  onConfigSaved: (config: BankDriveExportConfig) => void;
}) {
  const { t } = useT();
  const configMap = Object.fromEntries(driveConfigs.map(c => [c.accountCode, c]));

  return (
    <div className={s.section}>
      <div>
        <p className={s.sectionTitle}>{t('bankSettings.pdfExportByAccount')}</p>
        <p className={s.sectionDesc}>{t('bankSettings.pdfExportByAccountDesc')}</p>
      </div>

      {accountNames.length === 0 && (
        <div className={s.empty}>{t('bankSettings.noAccountsYet')}</div>
      )}

      <div className={s.countryCardList}>
        {accountNames.map(an => (
          <DriveCountryCard
            key={an.accountCode}
            accountCode={an.accountCode}
            countryName={an.name}
            existing={configMap[an.accountCode] ?? null}
            canConfig={canConfig}
            toast={toast}
            onSaved={onConfigSaved}
          />
        ))}
      </div>
    </div>
  );
}

function DriveCountryCard({
  accountCode, countryName, existing, canConfig, toast, onSaved,
}: {
  accountCode: string;
  countryName: string;
  existing: BankDriveExportConfig | null;
  canConfig: boolean;
  toast: ReturnType<typeof useToast>;
  onSaved: (config: BankDriveExportConfig) => void;
}) {
  const { t } = useT();
  const [folderId, setFolderId] = useState(existing?.rootFolderId ?? '');
  const [isActive, setIsActive] = useState(existing?.isActive ?? false);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(!!(existing?.rootFolderId));
  const [editing, setEditing] = useState(false);
  const [savedId, setSavedId] = useState(existing?.rootFolderId ?? '');
  const [idError, setIdError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function save(overrides?: { isActive?: boolean; id?: string }) {
    const activeVal = overrides?.isActive ?? isActive;
    const rawId = (overrides?.id ?? folderId).trim();
    if (!rawId) return;
    const idVal = extractFolderId(rawId);
    if (!isValidFolderId(idVal)) {
      setIdError(t('bankSettings.folderIdInvalid'));
      return;
    }
    setIdError(null);
    setFolderId(idVal);
    setSaving(true);
    try {
      const updated = await upsertBankDriveExportConfig(accountCode, { rootFolderId: idVal, isActive: activeVal });
      setSavedId(idVal);
      setEditing(false);
      // Bubble up to the page's own driveConfigs state — this card's local state
      // (savedId/isActive) only lives as long as it's mounted, and switching tabs
      // unmounts it; without this, switching away and back re-initializes from the
      // stale `existing` prop (whatever driveConfigs held at page load) and the just-
      // saved folder ID appears to have vanished, even though it's safely in the DB.
      onSaved(updated);
      toast.success(t('bankSettings.configSaved', { code: accountCode }));
    } catch {
      toast.error(t('bankSettings.configSaveFailed', { code: accountCode }));
    } finally { setSaving(false); }
  }

  async function toggleActive() {
    if (!canConfig) return;
    const next = !isActive;
    setIsActive(next);
    setExpanded(next);
    if (savedId) {
      await save({ isActive: next });
    } else if (next) {
      setEditing(true);
      setTimeout(() => inputRef.current?.focus(), 0);
    } else {
      setEditing(false);
    }
  }

  function startEdit() {
    if (!canConfig) return;
    setExpanded(true); setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function cancelEdit() {
    setFolderId(savedId);
    setIdError(null);
    setEditing(false);
  }

  function handleBlur() {
    const trimmed = folderId.trim();
    if (trimmed && trimmed !== savedId) { void save({ id: trimmed }); }
    else if (savedId) { setEditing(false); }
  }

  function handleKeyDown(e: { key: string; preventDefault(): void }) {
    if (e.key === 'Enter') { e.preventDefault(); void save(); }
    if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
  }

  const displayId = savedId || folderId;

  return (
    <div className={`${s.countryCard} ${isActive ? s.countryCardActive : ''}`}>
      <div className={s.countryCardHeader}>
        <button className={s.countryCardExpand} onClick={() => setExpanded(v => !v)}>
          <svg className={`${s.chevron} ${expanded ? s.chevronOpen : ''}`} width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <CountryBadge code={accountCode} />
          <span className={s.countryCardName}>{countryName}</span>
          {displayId && <span className={s.countryCardSpreadsheetHint}>{displayId.slice(0, 20)}…</span>}
        </button>
        <div className={s.countryCardActions}>
          <button
            className={`${s.toggle} ${isActive ? s.toggleOn : ''}`}
            onClick={e => { e.stopPropagation(); void toggleActive(); }}
            title={isActive ? t('bankSettings.pdfExportActiveTitle') : t('bankSettings.pdfExportInactiveTitle')}
            disabled={!canConfig}
          />
        </div>
      </div>
      {expanded && (
        <div className={s.countryCardBody}>
          <div className={s.field}>
            <label className={s.label}>
              {t('bankSettings.folderIdLabel')}
              <Tooltip>{t('bankSettings.folderIdTooltip')}</Tooltip>
            </label>
            {editing ? (
              <>
                <input
                  ref={inputRef}
                  className={`${s.input} ${s.inputFull} ${idError ? s.inputError : ''}`}
                  value={folderId}
                  onChange={e => { setFolderId(e.target.value); setIdError(null); }}
                  onBlur={handleBlur}
                  onKeyDown={handleKeyDown}
                  placeholder={t('bankSettings.folderIdPlaceholder')}
                  disabled={saving}
                />
                {idError && <span className={s.fieldError}>{idError}</span>}
                {saving && <span className={s.fieldHint}>{t('bankSettings.saving')}</span>}
              </>
            ) : (
              <div className={s.spreadsheetDisplay} onClick={canConfig ? startEdit : undefined} style={!canConfig ? { cursor: 'default' } : undefined}>
                <span className={s.spreadsheetText}>
                  {displayId || <span className={s.spreadsheetPlaceholder}>{t('bankSettings.folderNotConfigured')}</span>}
                </span>
                {canConfig && (
                  <svg className={s.spreadsheetEditIcon} width="12" height="12" viewBox="0 0 13 13" fill="none">
                    <path d="M9.2 1.8l2 2L4 11H2v-2L9.2 1.8z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function EditIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M8.5 1.5a1.414 1.414 0 012 2L3.5 10.5l-3 .5.5-3L8.5 1.5z"
        stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

const COUNTRY_COLORS: Record<string, { bg: string; color: string }> = {
  VN:    { bg: '#dbeafe', color: '#1e40af' },
  MY:    { bg: '#d1fae5', color: '#065f46' },
  ID:    { bg: '#fef3c7', color: '#92400e' },
  PH:    { bg: '#ede9fe', color: '#5b21b6' },
  SG:     { bg: '#fee2e2', color: '#991b1b' },
  TH:     { bg: '#fce7f3', color: '#9d174d' },
  DMX_VN: { bg: '#f0f4f8', color: '#3c4257' },
};

function CountryBadge({ code }: { code: string }) {
  const c = COUNTRY_COLORS[code] ?? { bg: '#f0f4f8', color: '#3c4257' };
  return (
    <span style={{ background: c.bg, color: c.color, fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10, whiteSpace: 'nowrap' }}>
      {code}
    </span>
  );
}
