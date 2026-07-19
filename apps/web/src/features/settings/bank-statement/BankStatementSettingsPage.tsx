'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  getBankSettings, updateBankSettings, triggerBankSync,
  listBankGsheets, upsertBankGsheet,
  listBankAccounts, listBankAccountNames,
  type BankJobSettings, type SyncDateMode,
  type BankGsheetConfig, type BankAccount, type BankAccountNameItem,
} from '../../../lib/api';
import { useHasPermission } from '../../../hooks/useHasPermission';
import AccessDenied from '../../../components/common/AccessDenied';
import BackButton from '../../../components/common/BackButton';
import PageLoader from '../../../components/common/PageLoader';
import { useToast } from '../../../components/common/Toast';
import { useT } from '../../../lib/i18n';
import RightPanel from '../../../components/common/RightPanel';
import ServiceAccountShareInfo from '../../../components/common/ServiceAccountShareInfo';
import Tooltip from '../../../components/common/Tooltip';
import { extractSpreadsheetId, isValidSpreadsheetId } from '../../../lib/googleSheets';
import s from './BankStatementSettingsPage.module.css';

type Tab = 'schedule' | 'connect' | 'accounts' | 'gsheets';

export default function BankStatementSettingsPage() {
  const canConfig = useHasPermission('bank_statement:config');
  const toast = useToast();
  const { t } = useT();
  const [tab, setTab] = useState<Tab>('schedule');
  const [loading, setLoading] = useState(true);

  const [settings, setSettings] = useState<BankJobSettings | null>(null);
  const [gsheets, setGsheets] = useState<BankGsheetConfig[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [accountNames, setAccountNames] = useState<BankAccountNameItem[]>([]);

  async function load() {
    setLoading(true);
    try {
      const [s, g, ba, an] = await Promise.all([
        getBankSettings(),
        listBankGsheets(),
        listBankAccounts().catch(() => [] as BankAccount[]),
        listBankAccountNames().catch(() => [] as BankAccountNameItem[]),
      ]);
      setSettings(s);
      setGsheets(g);
      setBankAccounts(ba);
      setAccountNames(an);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Deferred a tick so load()'s internal setState isn't synchronous with the effect itself.
    if (canConfig) Promise.resolve().then(() => load());
  }, [canConfig]);

  if (!canConfig) return <AccessDenied />;

  if (loading) return <PageLoader />;

  const tabs: [Tab, string][] = [
    ['schedule', t('bankSettings.tabSchedule')],
    ['connect',  t('bankSettings.tabConnect')],
    ['accounts', t('bankSettings.tabAccounts')],
    ['gsheets',  'Google Sheets'],
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
        <ScheduleTab settings={settings} onSaved={(s) => { setSettings(s); toast.success(t('bankSettings.scheduleSaved')); }} />
      )}
      {tab === 'connect' && settings && (
        <ConnectTab settings={settings} onSaved={(s) => { setSettings(s); toast.success(t('bankSettings.connectSaved')); }} />
      )}
      {tab === 'accounts' && (
        <AccountsTab accountNames={accountNames} bankAccounts={bankAccounts} />
      )}
      {tab === 'gsheets' && settings && (
        <GsheetsTab
          settings={settings}
          gsheets={gsheets}
          accountNames={accountNames}
          onSaved={(s) => { if (s) setSettings(s); else load(); }}
          toast={toast}
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

function formatRunDate(d: Date, lang: string) {
  const locale = lang === 'vi' ? 'vi-VN' : 'en-US';
  const dayName = d.toLocaleDateString(locale, { weekday: 'long' });
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${dayName}, ${day}/${month}/${d.getFullYear()}`;
}

function ScheduleTab({ settings, onSaved }: { settings: BankJobSettings; onSaved: (s: BankJobSettings) => void }) {
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
            onClick={() => setIsScheduled(v => !v)}
          />
        </div>

        {isScheduled && (
          <>
            <div className={s.scheduleDivider} />

            <div className={s.timePicker}>
              <span className={s.timeLabel}>{t('bankSettings.runAt')}</span>
              <div className={s.timeSelects}>
                <select className={s.timeSelect} value={hour} onChange={e => setHour(parseInt(e.target.value))}>
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={i}>{String(i).padStart(2, '0')}</option>
                  ))}
                </select>
                <span className={s.timeSep}>:</span>
                <select className={s.timeSelect} value={minute} onChange={e => setMinute(parseInt(e.target.value))}>
                  {MINUTE_OPTIONS.map(m => (
                    <option key={m} value={m}>{String(m).padStart(2, '0')}</option>
                  ))}
                </select>
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
          <select
            className={s.timeSelect}
            value={syncDateMode}
            onChange={e => setSyncDateMode(e.target.value as SyncDateMode)}
          >
            {(Object.entries(syncDateModeLabels) as [SyncDateMode, string][]).map(([v, label]) => (
              <option key={v} value={v}>{label}</option>
            ))}
          </select>
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
              />
              <span className={s.scheduleDesc}>{t('bankSettings.days')}</span>
            </>
          )}
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

      <div>
        <button className={s.btnPrimary} onClick={save} disabled={saving}>
          {saving ? t('bankSettings.saving') : t('bankSettings.saveSettings')}
        </button>
      </div>
    </div>
  );
}

// ─── Tab: Connection ──────────────────────────────────────────────────────────

function ConnectTab({ settings, onSaved }: { settings: BankJobSettings; onSaved: (s: BankJobSettings) => void }) {
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
            <button className={s.btnEdit} onClick={startEdit}>
              <EditIcon /> {t('common.edit')}
            </button>
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

function AccountsTab({ accountNames, bankAccounts }: { accountNames: BankAccountNameItem[]; bankAccounts: BankAccount[] }) {
  const { t } = useT();
  const [detailName, setDetailName] = useState<string | null>(null);

  const detailAccounts = detailName ? bankAccounts.filter(a => a.accountName === detailName) : [];

  return (
    <div className={s.section}>
      <div>
        <p className={s.sectionTitle}>Account names</p>
        <p className={s.sectionDesc}>{t('bankSettings.accountNamesDesc')}</p>
      </div>

      <div className={s.tableWrap}>
        <table className={s.table}>
          <thead>
            <tr>
              <th className={s.th}>{t('bankSettings.colAccountName')}</th>
              <th className={s.th} style={{ width: 130 }}>{t('bankSettings.colAccountCode')}</th>
              <th className={s.th} style={{ width: 110 }}>{t('bankSettings.colAccounts')}</th>
            </tr>
          </thead>
          <tbody>
            {accountNames.length === 0 && (
              <tr><td className={s.td} colSpan={3}><span className={s.empty}>{t('bankSettings.noData')}</span></td></tr>
            )}
            {accountNames.map(c => {
              const count = bankAccounts.filter(a => a.accountName === c.name).length;
              return (
                <tr key={c.name} style={{ cursor: 'pointer' }} onClick={() => setDetailName(c.name)}>
                  <td className={s.td}>{c.name}</td>
                  <td className={s.td}><CountryBadge code={c.accountCode} /></td>
                  <td className={s.td}>
                    <span className={s.accountCountBadge}>{t('bankSettings.accountsCount', { n: count })}</span>
                  </td>
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
                </tr>
              </thead>
              <tbody>
                {detailAccounts.length === 0 && (
                  <tr>
                    <td className={s.td} colSpan={3} style={{ textAlign: 'center' }}>
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </RightPanel>
    </div>
  );
}

// ─── Tab: Google Sheets ───────────────────────────────────────────────────────

function GsheetsTab({
  settings, gsheets, accountNames, onSaved, toast,
}: {
  settings: BankJobSettings;
  gsheets: BankGsheetConfig[];
  accountNames: BankAccountNameItem[];
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
            toast={toast}
          />
        ))}
      </div>

      <div className={s.globalConfigSection}>
        <div className={s.globalConfigDivider} />
        <GlobalGsheetConfig settings={settings} onSaved={onSaved} toast={toast} />
      </div>
    </div>
  );
}

function GlobalGsheetConfig({
  settings, onSaved, toast,
}: {
  settings: BankJobSettings;
  onSaved: (s: BankJobSettings) => void;
  toast: ReturnType<typeof useToast>;
}) {
  const { t } = useT();
  const [templateSpreadsheetId, setTemplateSpreadsheetId] = useState(settings.googleTemplateSpreadsheetId ?? '');
  const [templateSheet, setTemplateSheet] = useState(settings.googleTemplateSheet ?? '');
  const [idError, setIdError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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
    } catch {
      toast.error(t('bankSettings.saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={s.card}>
      <p className={s.sectionTitle} style={{ marginBottom: 16 }}>{t('bankSettings.globalConfig')}</p>

      <div className={s.globalRow}>
        <div className={s.field} style={{ flex: 3 }}>
          <label className={s.label}>
            {t('bankSettings.templateIdLabel')}
            <Tooltip wide>
              {t('bankSettings.templateIdTooltip')}{'\n\n'}
              {t('bankSettings.templateIdTooltipUrl')}{'\n'}
              docs.google.com/spreadsheets/d/<strong>ID</strong>/edit
            </Tooltip>
          </label>
          <input
            className={`${s.input} ${s.inputFull} ${idError ? s.inputError : ''}`}
            value={templateSpreadsheetId}
            onChange={e => { setTemplateSpreadsheetId(e.target.value); setIdError(null); }}
            onBlur={e => setTemplateSpreadsheetId(extractSpreadsheetId(e.target.value))}
            placeholder={t('bankSettings.spreadsheetIdPlaceholder')}
          />
          {idError && <span className={s.fieldError}>{idError}</span>}
        </div>
        <div className={s.field} style={{ flex: 1 }}>
          <label className={s.label}>
            Sheet name
            <Tooltip>{t('bankSettings.sheetNameTooltip')} <code>template</code></Tooltip>
          </label>
          <input
            className={`${s.input} ${s.inputFull}`}
            value={templateSheet}
            onChange={e => setTemplateSheet(e.target.value)}
            placeholder="template"
          />
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        <ServiceAccountShareInfo accessLevel="editor" />
      </div>

      <div className={s.actionRow} style={{ marginTop: 12 }}>
        <button className={s.btnPrimary} onClick={save} disabled={saving}>
          {saving ? t('bankSettings.saving') : t('bankSettings.saveGlobalConfig')}
        </button>
      </div>
    </div>
  );
}

function GsheetCountryCard({
  accountCode, countryName, existing, toast,
}: {
  accountCode: string;
  countryName: string;
  existing: BankGsheetConfig | null;
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
              <div className={s.spreadsheetDisplay} onClick={startEdit}>
                <span className={s.spreadsheetText}>
                  {displayId || <span className={s.spreadsheetPlaceholder}>{t('bankSettings.spreadsheetNotConfigured')}</span>}
                </span>
                <svg className={s.spreadsheetEditIcon} width="12" height="12" viewBox="0 0 13 13" fill="none">
                  <path d="M9.2 1.8l2 2L4 11H2v-2L9.2 1.8z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
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
