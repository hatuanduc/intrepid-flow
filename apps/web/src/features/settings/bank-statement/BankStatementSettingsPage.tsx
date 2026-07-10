'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  getBankSettings, updateBankSettings,
  listBankGsheets, upsertBankGsheet,
  listBankAccounts,
  type BankJobSettings, type SyncDateMode,
  type BankGsheetConfig, type BankAccount,
} from '../../../lib/api';
import { useHasPermission } from '../../../hooks/useHasPermission';
import AccessDenied from '../../../components/common/AccessDenied';
import PageLoader from '../../../components/common/PageLoader';
import { useToast } from '../../../components/common/Toast';
import { useT } from '../../../lib/i18n';
import RightPanel from '../../../components/common/RightPanel';
import s from './BankStatementSettingsPage.module.css';

type Tab = 'schedule' | 'connect' | 'accounts' | 'gsheets';

export default function BankStatementSettingsPage() {
  const canConfig = useHasPermission('bank_statement:config');
  const router = useRouter();
  const toast = useToast();
  const { t } = useT();
  const [tab, setTab] = useState<Tab>('schedule');
  const [loading, setLoading] = useState(true);

  const [settings, setSettings] = useState<BankJobSettings | null>(null);
  const [gsheets, setGsheets] = useState<BankGsheetConfig[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);

  async function load() {
    setLoading(true);
    try {
      const [s, g, ba] = await Promise.all([
        getBankSettings(),
        listBankGsheets(),
        listBankAccounts().catch(() => [] as BankAccount[]),
      ]);
      setSettings(s);
      setGsheets(g);
      setBankAccounts(ba);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (canConfig) load(); }, [canConfig]);

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
        <button className={s.backBtn} onClick={() => router.push('/settings')}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M10 13L5 8l5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
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
        <AccountsTab bankAccounts={bankAccounts} />
      )}
      {tab === 'gsheets' && settings && (
        <GsheetsTab
          settings={settings}
          gsheets={gsheets}
          bankAccounts={bankAccounts}
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
  const [isScheduled, setIsScheduled] = useState(settings.isScheduled);
  const [hour, setHour] = useState(() => parseInt(settings.scheduleCron.split(' ')[1]));
  const [minute, setMinute] = useState(() => parseInt(settings.scheduleCron.split(' ')[0]));
  const [syncDateMode, setSyncDateMode] = useState<SyncDateMode>(settings.syncDateMode ?? 'yesterday');
  const [syncCustomDays, setSyncCustomDays] = useState(settings.syncCustomDays ?? 1);
  const [saving, setSaving] = useState(false);

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
  const [username, setUsername] = useState(settings.hsbcnetUsername ?? '');
  const [saving, setSaving] = useState(false);

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
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={s.section}>
      <div className={s.card}>
        <div className={s.field}>
          <label className={s.label}>HSBCnet Username</label>
          <input
            className={s.input}
            value={username}
            onChange={e => setUsername(e.target.value)}
            placeholder="INTREPID1"
            style={{ maxWidth: 320 }}
          />
          <span className={s.fieldHint}>{t('bankSettings.hsbcnetHint')}</span>
        </div>
      </div>
      <div>
        <button className={s.btnPrimary} onClick={save} disabled={saving}>
          {saving ? t('bankSettings.saving') : t('bankSettings.saveSettings')}
        </button>
      </div>
    </div>
  );
}

// ─── Tab: Account names ───────────────────────────────────────────────────────

function fmtSyncDate(iso: string) {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function AccountsTab({ bankAccounts }: { bankAccounts: BankAccount[] }) {
  const { t } = useT();
  const [detailName, setDetailName] = useState<string | null>(null);

  // Derive distinct (accountName, accountCode) pairs from synced accounts
  const companies = Array.from(
    new Map(bankAccounts.map(a => [a.accountName, a.accountCode])).entries(),
  ).map(([name, code]) => ({ name, code })).sort((a, b) => a.name.localeCompare(b.name));

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
            {companies.length === 0 && (
              <tr><td className={s.td} colSpan={3}><span className={s.empty}>{t('bankSettings.noData')}</span></td></tr>
            )}
            {companies.map(c => {
              const count = bankAccounts.filter(a => a.accountName === c.name).length;
              return (
                <tr key={c.name} style={{ cursor: 'pointer' }} onClick={() => setDetailName(c.name)}>
                  <td className={s.td}>{c.name}</td>
                  <td className={s.td}><CountryBadge code={c.code} /></td>
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
  settings, gsheets, bankAccounts, onSaved, toast,
}: {
  settings: BankJobSettings;
  gsheets: BankGsheetConfig[];
  bankAccounts: BankAccount[];
  onSaved: (s?: BankJobSettings) => void;
  toast: ReturnType<typeof useToast>;
}) {
  const { t } = useT();
  const countryCodes = [...new Set(bankAccounts.map(a => a.accountCode))].sort();
  const configMap = Object.fromEntries(gsheets.map(g => [g.accountCode, g]));

  return (
    <div className={s.section}>
      <div>
        <p className={s.sectionTitle}>{t('bankSettings.spreadsheetByAccount')}</p>
        <p className={s.sectionDesc}>{t('bankSettings.spreadsheetByAccountDesc')}</p>
      </div>

      {countryCodes.length === 0 && (
        <div className={s.empty}>{t('bankSettings.noAccountsYet')}</div>
      )}

      <div className={s.countryCardList}>
        {countryCodes.map(code => (
          <GsheetCountryCard
            key={code}
            accountCode={code}
            countryName={bankAccounts.find(a => a.accountCode === code)?.accountName ?? code}
            existing={configMap[code] ?? null}
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
  const [serviceKeyJson, setServiceKeyJson] = useState('');
  const [saving, setSaving] = useState(false);

  const hasKey = !!settings.googleServiceKeyJson;

  async function save() {
    setSaving(true);
    try {
      const result = await updateBankSettings({
        scheduleCron: settings.scheduleCron,
        isScheduled: settings.isScheduled,
        hsbcnetUsername: settings.hsbcnetUsername,
        googleTemplateSpreadsheetId: templateSpreadsheetId.trim() || null,
        googleTemplateSheet: templateSheet.trim() || null,
        googleServiceKeyJson: serviceKeyJson.trim() || settings.googleServiceKeyJson || null,
        syncDateMode: settings.syncDateMode ?? 'yesterday',
        syncCustomDays: settings.syncCustomDays ?? 1,
      });
      setServiceKeyJson('');
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
            <Tooltip>
              {t('bankSettings.templateIdTooltip')}{'\n\n'}
              {t('bankSettings.templateIdTooltipUrl')}{'\n'}
              docs.google.com/spreadsheets/d/<strong>ID</strong>/edit
            </Tooltip>
          </label>
          <input
            className={`${s.input} ${s.inputFull}`}
            value={templateSpreadsheetId}
            onChange={e => setTemplateSpreadsheetId(e.target.value)}
            placeholder="1h5gC1vqRfPvZ7DANAnAog-u5bDNNbpZRCaVuxAfzyQ0"
          />
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

      <div className={s.field} style={{ marginTop: 14 }}>
        <label className={s.label}>
          Service Account JSON
          {hasKey
            ? <span className={s.hasKeyBadge}>{t('bankSettings.configured')}</span>
            : <span className={s.noKeyBadge}>{t('bankSettings.noKey')}</span>}
          <Tooltip wide>
            <strong>{t('bankSettings.serviceKeySetupTitle')}</strong>{'\n\n'}
            {t('bankSettings.serviceKeyStep1')}{'\n'}
            {t('bankSettings.serviceKeyStep2')}{'\n'}
            {t('bankSettings.serviceKeyStep3')}{'\n\n'}
            <strong>{t('bankSettings.serviceKeyShareTitle')}</strong>{'\n'}
            {t('bankSettings.serviceKeyShareDesc')} <strong>Editor</strong>.{'\n\n'}
            {t('bankSettings.serviceKeyEmailFormat')}{'\n'}
            <code>name@project-id.iam.gserviceaccount.com</code>
          </Tooltip>
        </label>
        <textarea
          className={s.textareaInput}
          value={serviceKeyJson}
          onChange={e => setServiceKeyJson(e.target.value)}
          placeholder={hasKey ? t('bankSettings.keepExistingKey') : '{\n  "type": "service_account",\n  ...\n}'}
          style={{ minHeight: 72 }}
        />
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
  const [editing, setEditing] = useState(!existing?.spreadsheetId);
  const savedIdRef = useRef(existing?.spreadsheetId ?? '');
  const inputRef = useRef<HTMLInputElement>(null);

  async function save(overrides?: { isActive?: boolean; id?: string }) {
    const activeVal = overrides?.isActive ?? isActive;
    const idVal = (overrides?.id ?? spreadsheetId).trim();
    if (!idVal) return;
    setSaving(true);
    try {
      await upsertBankGsheet(accountCode, { spreadsheetId: idVal, isActive: activeVal });
      savedIdRef.current = idVal;
      setEditing(false);
      toast.success(t('bankSettings.configSaved', { code: accountCode }));
    } catch {
      toast.error(t('bankSettings.configSaveFailed', { code: accountCode }));
    } finally { setSaving(false); }
  }

  async function toggleActive() {
    const next = !isActive;
    setIsActive(next); setExpanded(next);
    if (spreadsheetId.trim()) await save({ isActive: next });
  }

  function startEdit() {
    setExpanded(true); setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function handleBlur() {
    const trimmed = spreadsheetId.trim();
    if (trimmed && trimmed !== savedIdRef.current) { void save({ id: trimmed }); }
    else { if (savedIdRef.current) setEditing(false); }
  }

  function handleKeyDown(e: { key: string; preventDefault(): void }) {
    if (e.key === 'Enter') { e.preventDefault(); void save(); }
    if (e.key === 'Escape') { setSpreadsheetId(savedIdRef.current); if (savedIdRef.current) setEditing(false); }
  }

  const displayId = savedIdRef.current || spreadsheetId;

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
            <label className={s.label}>Spreadsheet ID</label>
            {editing ? (
              <input
                ref={inputRef}
                className={`${s.input} ${s.inputFull}`}
                value={spreadsheetId}
                onChange={e => setSpreadsheetId(e.target.value)}
                onBlur={handleBlur}
                onKeyDown={handleKeyDown}
                placeholder="1h5gC1vqRfPvZ7DANAnAog-u5bDNNbpZRCaVuxAfzyQ0"
                disabled={saving}
              />
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

function Tooltip({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  const [visible, setVisible] = useState(false);
  return (
    <span className={s.tooltipWrap}>
      <button
        type="button"
        className={s.tooltipTrigger}
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onFocus={() => setVisible(true)}
        onBlur={() => setVisible(false)}
      >
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
          <circle cx="6.5" cy="6.5" r="5.75" stroke="currentColor" strokeWidth="1.25"/>
          <text x="6.5" y="10" textAnchor="middle" fontSize="8" fontWeight="600" fill="currentColor">i</text>
        </svg>
      </button>
      {visible && (
        <div className={`${s.tooltipBox} ${wide ? s.tooltipBoxWide : ''}`}>
          {children}
        </div>
      )}
    </span>
  );
}

const COUNTRY_COLORS: Record<string, { bg: string; color: string }> = {
  VN:    { bg: '#dbeafe', color: '#1e40af' },
  MY:    { bg: '#d1fae5', color: '#065f46' },
  ID:    { bg: '#fef3c7', color: '#92400e' },
  PH:    { bg: '#ede9fe', color: '#5b21b6' },
  SG:    { bg: '#fee2e2', color: '#991b1b' },
  TH:    { bg: '#fce7f3', color: '#9d174d' },
  DM_VN: { bg: '#f0f4f8', color: '#3c4257' },
};

function CountryBadge({ code }: { code: string }) {
  const c = COUNTRY_COLORS[code] ?? { bg: '#f0f4f8', color: '#3c4257' };
  return (
    <span style={{ background: c.bg, color: c.color, fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10, whiteSpace: 'nowrap' }}>
      {code}
    </span>
  );
}
