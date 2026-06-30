'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  getBankSettings, updateBankSettings,
  listBankCountries, createBankCountry, updateBankCountry, deleteBankCountry,
  listBankGsheets, upsertBankGsheet,
  type BankJobSettings, type SyncDateMode,
  type BankCountryMapping, type BankGsheetConfig,
} from '../../../lib/api';
import { useHasPermission } from '../../../hooks/useHasPermission';
import AccessDenied from '../../../components/common/AccessDenied';
import PageLoader from '../../../components/common/PageLoader';
import { useToast } from '../../../components/common/Toast';
import s from './BankStatementSettingsPage.module.css';

type Tab = 'schedule' | 'connect' | 'countries' | 'gsheets';

export default function BankStatementSettingsPage() {
  const canConfig = useHasPermission('bank_statement:config');
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('schedule');
  const [loading, setLoading] = useState(true);

  const [settings, setSettings] = useState<BankJobSettings | null>(null);
  const [countries, setCountries] = useState<BankCountryMapping[]>([]);
  const [gsheets, setGsheets] = useState<BankGsheetConfig[]>([]);

  async function load() {
    setLoading(true);
    try {
      const [s, c, g] = await Promise.all([
        getBankSettings(),
        listBankCountries(),
        listBankGsheets(),
      ]);
      setSettings(s);
      setCountries(c);
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
        <h1 className={s.pageTitle}>Sao kê ngân hàng</h1>
      </div>

      <div className={s.tabs}>
        {([
          ['schedule', 'Lịch trình'],
          ['connect', 'Kết nối'],
          ['countries', 'Quốc gia'],
          ['gsheets', 'Google Sheets'],
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

      {tab === 'schedule' && settings && (
        <ScheduleTab settings={settings} onSaved={(s) => { setSettings(s); toast.success('Đã lưu cài đặt lịch trình.'); }} />
      )}
      {tab === 'connect' && settings && (
        <ConnectTab settings={settings} onSaved={(s) => { setSettings(s); toast.success('Đã lưu thông tin kết nối.'); }} />
      )}
      {tab === 'countries' && (
        <CountriesTab countries={countries} onChanged={load} toast={toast} />
      )}
      {tab === 'gsheets' && settings && (
        <GsheetsTab
          settings={settings}
          gsheets={gsheets}
          countries={countries}
          onSaved={(s) => { if (s) setSettings(s); else load(); }}
          toast={toast}
        />
      )}
    </div>
  );
}

// ─── Tab: Lịch trình ──────────────────────────────────────────────────────────

const DAYS_VI = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];
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

const SYNC_DATE_MODE_LABELS: Record<SyncDateMode, string> = {
  today:      'Hôm nay',
  yesterday:  'Hôm qua',
  last_7_days: '7 ngày gần nhất',
  custom:     'Tùy chỉnh (N ngày gần nhất)',
};

function ScheduleTab({ settings, onSaved }: { settings: BankJobSettings; onSaved: (s: BankJobSettings) => void }) {
  const [isScheduled, setIsScheduled] = useState(settings.isScheduled);
  const [hour, setHour] = useState(() => parseInt(settings.scheduleCron.split(' ')[1]));
  const [minute, setMinute] = useState(() => parseInt(settings.scheduleCron.split(' ')[0]));
  const [syncDateMode, setSyncDateMode] = useState<SyncDateMode>(settings.syncDateMode ?? 'yesterday');
  const [syncCustomDays, setSyncCustomDays] = useState(settings.syncCustomDays ?? 1);
  const [saving, setSaving] = useState(false);

  const cron = `${minute} ${hour} * * *`;
  const nextRuns = isScheduled ? getNextRuns(hour, minute, 5) : [];

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
            <span className={s.scheduleName}>Tự động chạy theo lịch</span>
            <span className={s.scheduleDesc}>Bật để hệ thống tự đồng bộ sao kê mỗi ngày</span>
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
              <span className={s.timeLabel}>Chạy lúc</span>
              <div className={s.timeSelects}>
                <select
                  className={s.timeSelect}
                  value={hour}
                  onChange={e => setHour(parseInt(e.target.value))}
                >
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={i}>{String(i).padStart(2, '0')}</option>
                  ))}
                </select>
                <span className={s.timeSep}>:</span>
                <select
                  className={s.timeSelect}
                  value={minute}
                  onChange={e => setMinute(parseInt(e.target.value))}
                >
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
                  <span className={s.nextRunsLabel}>Lịch chạy sắp tới</span>
                  <div className={s.nextRunsList}>
                    {nextRuns.map((d, i) => (
                      <div key={i} className={s.nextRunItem}>
                        <span className={s.nextRunDot} />
                        <span className={s.nextRunDate}>
                          {DAYS_VI[d.getDay()]}, {String(d.getDate()).padStart(2, '0')}/{String(d.getMonth() + 1).padStart(2, '0')}/{d.getFullYear()}
                        </span>
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
            <span className={s.scheduleName}>Khoảng ngày đồng bộ</span>
            <span className={s.scheduleDesc}>Phạm vi ngày HSBCnet sẽ tải sao kê mỗi lần chạy</span>
          </div>
        </div>
        <div className={s.scheduleDivider} />
        <div className={s.dateRangeRow}>
          <select
            className={s.timeSelect}
            value={syncDateMode}
            onChange={e => setSyncDateMode(e.target.value as SyncDateMode)}
          >
            {(Object.entries(SYNC_DATE_MODE_LABELS) as [SyncDateMode, string][]).map(([v, label]) => (
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
              <span className={s.scheduleDesc}>ngày</span>
            </>
          )}
        </div>
      </div>

      <div>
        <button className={s.btnPrimary} onClick={save} disabled={saving}>
          {saving ? 'Đang lưu...' : 'Lưu cài đặt'}
        </button>
      </div>
    </div>
  );
}

// ─── Tab: Kết nối ────────────────────────────────────────────────────────────

function ConnectTab({ settings, onSaved }: { settings: BankJobSettings; onSaved: (s: BankJobSettings) => void }) {
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
          <span className={s.fieldHint}>
            Tên đăng nhập HSBCnet. Xác thực qua mobile app — không cần mật khẩu.
          </span>
        </div>
      </div>
      <div>
        <button className={s.btnPrimary} onClick={save} disabled={saving}>
          {saving ? 'Đang lưu...' : 'Lưu cài đặt'}
        </button>
      </div>
    </div>
  );
}

// ─── Tab: Country mappings ────────────────────────────────────────────────────

function CountriesTab({
  countries, onChanged, toast,
}: {
  countries: BankCountryMapping[];
  onChanged: () => void;
  toast: ReturnType<typeof useToast>;
}) {
  const [company, setCompany] = useState('');
  const [code, setCode] = useState('');
  const [adding, setAdding] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCompany, setEditCompany] = useState('');
  const [editCode, setEditCode] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpenMenu(null);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function startEdit(c: BankCountryMapping) {
    setEditingId(c.id);
    setEditCompany(c.companyName);
    setEditCode(c.countryCode);
    setOpenMenu(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditCompany('');
    setEditCode('');
  }

  async function saveEdit(id: string) {
    if (!editCompany.trim() || !editCode.trim()) return;
    try {
      await updateBankCountry(id, {
        companyName: editCompany.trim(),
        countryCode: editCode,
      });
      setEditingId(null);
      onChanged();
      toast.success('Đã cập nhật mapping.');
    } catch {
      toast.error('Cập nhật thất bại.');
    }
  }

  async function add() {
    if (!company.trim() || !code.trim()) return;
    setAdding(true);
    try {
      await createBankCountry({ companyName: company.trim(), countryCode: code });
      setCompany(''); setCode('');
      onChanged();
      toast.success('Đã thêm mapping.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Thêm thất bại.');
    } finally {
      setAdding(false);
    }
  }

  async function remove(id: string) {
    try {
      await deleteBankCountry(id);
      onChanged();
      toast.success('Đã xóa mapping.');
    } catch {
      toast.error('Xóa thất bại.');
    }
  }

  return (
    <div className={s.section}>
      <div>
        <p className={s.sectionTitle}>Mapping công ty → quốc gia</p>
        <p className={s.sectionDesc}>Xác định tên công ty trong HSBCnet tương ứng với mã quốc gia nào.</p>
      </div>

      <div className={s.tableWrap}>
        <table className={s.table}>
          <thead>
            <tr>
              <th className={s.th}>Tên công ty</th>
              <th className={s.th} style={{ width: 120 }}>Mã quốc gia</th>
              <th className={s.th} style={{ width: 120 }}></th>
            </tr>
          </thead>
          <tbody>
            {countries.length === 0 && (
              <tr><td className={s.td} colSpan={3}><span className={s.empty}>Chưa có dữ liệu.</span></td></tr>
            )}
            {countries.map(c => {
              const isEditing = editingId === c.id;
              return (
                <tr key={c.id}>
                  <td className={s.td}>
                    {isEditing
                      ? <input className={s.editInput} value={editCompany} onChange={e => setEditCompany(e.target.value)} autoFocus />
                      : c.companyName
                    }
                  </td>
                  <td className={s.td}>
                    {isEditing
                      ? <CountrySelect value={editCode} onChange={setEditCode} />
                      : <CountryBadge code={c.countryCode} />
                    }
                  </td>
                  <td className={s.td}>
                    {isEditing ? (
                      <div className={s.editActions}>
                        <button className={s.btnSave} onClick={() => saveEdit(c.id)}>Lưu</button>
                        <button className={s.btnCancel} onClick={cancelEdit}>Hủy</button>
                      </div>
                    ) : (
                      <div className={s.moreWrap} ref={openMenu === c.id ? menuRef : null}>
                        <button
                          className={`${s.moreBtn} ${openMenu === c.id ? s.moreBtnOpen : ''}`}
                          onClick={e => { e.stopPropagation(); setOpenMenu(openMenu === c.id ? null : c.id); }}
                        >⋯</button>
                        {openMenu === c.id && (
                          <div className={s.moreDropdown}>
                            <button className={s.moreItem} onClick={() => startEdit(c)}>Chỉnh sửa</button>
                            <button className={`${s.moreItem} ${s.moreItemDanger}`} onClick={() => { setOpenMenu(null); remove(c.id); }}>
                              Xóa
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className={s.addRow}>
        <div className={s.field}>
          <label className={s.label}>Tên công ty (HSBCnet)</label>
          <input className={s.input} value={company} onChange={e => setCompany(e.target.value)} placeholder="INTREPID VIETNAM LTD" />
        </div>
        <div className={s.field}>
          <label className={s.label}>Mã quốc gia</label>
          <CountrySelect value={code} onChange={setCode} />
        </div>
        <button className={s.btnPrimary} onClick={add} disabled={adding || !company.trim() || !code}>
          {adding ? '...' : '+ Thêm'}
        </button>
      </div>
    </div>
  );
}

// ─── Tab: Google Sheets ───────────────────────────────────────────────────────

function GsheetsTab({
  settings, gsheets, countries, onSaved, toast,
}: {
  settings: BankJobSettings;
  gsheets: BankGsheetConfig[];
  countries: BankCountryMapping[];
  onSaved: (s?: BankJobSettings) => void;
  toast: ReturnType<typeof useToast>;
}) {
  const countryCodes = [...new Set(countries.map(c => c.countryCode))].sort();
  const configMap = Object.fromEntries(gsheets.map(g => [g.countryCode, g]));

  return (
    <div className={s.section}>
      {/* Per-country first */}
      <div>
        <p className={s.sectionTitle}>Spreadsheet theo quốc gia</p>
        <p className={s.sectionDesc}>
          Danh sách lấy từ tab Quốc gia. Bật/tắt để chọn quốc gia nào cần đồng bộ.
        </p>
      </div>

      {countryCodes.length === 0 && (
        <div className={s.empty}>Chưa có quốc gia nào. Thêm ở tab Quốc gia trước.</div>
      )}

      <div className={s.countryCardList}>
        {countryCodes.map(code => (
          <GsheetCountryCard
            key={code}
            countryCode={code}
            existing={configMap[code] ?? null}
            onSaved={() => onSaved()}
            toast={toast}
          />
        ))}
      </div>

      {/* Global config at bottom — changes rarely */}
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
      toast.success('Đã lưu cấu hình Google Sheets.');
    } catch {
      toast.error('Lưu thất bại. Vui lòng thử lại.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={s.card}>
      <p className={s.sectionTitle} style={{ marginBottom: 16 }}>Cấu hình chung</p>

      {/* Row 1: Template source — spreadsheet ID + sheet name are a pair */}
      <div className={s.globalRow}>
        <div className={s.field} style={{ flex: 3 }}>
          <label className={s.label}>
            Template spreadsheet ID
            <Tooltip>
              Sheet mẫu dùng để copy khi tạo tab mới cho tài khoản ngân hàng.{'\n\n'}
              Lấy ID từ URL của Google Sheet:{'\n'}
              docs.google.com/spreadsheets/d/<strong>ID_Ở_ĐÂY</strong>/edit
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
            <Tooltip>Tên tab trong spreadsheet trên dùng làm mẫu, vd: <code>template</code></Tooltip>
          </label>
          <input
            className={`${s.input} ${s.inputFull}`}
            value={templateSheet}
            onChange={e => setTemplateSheet(e.target.value)}
            placeholder="template"
          />
        </div>
      </div>

      {/* Row 2: Service account key — full width */}
      <div className={s.field} style={{ marginTop: 14 }}>
        <label className={s.label}>
          Service Account JSON
          {hasKey
            ? <span className={s.hasKeyBadge}>✓ Đã cấu hình</span>
            : <span className={s.noKeyBadge}>Chưa có key</span>
          }
          <Tooltip wide>
            <strong>Cách thiết lập:</strong>{'\n\n'}
            1. Vào Google Cloud Console → IAM &amp; Admin → Service Accounts{'\n'}
            2. Tạo service account mới, tải JSON key về{'\n'}
            3. Copy toàn bộ nội dung file JSON vào đây{'\n\n'}
            <strong>Share spreadsheet:</strong>{'\n'}
            Mỗi spreadsheet (template + từng quốc gia) phải được share cho email của service account với quyền <strong>Editor</strong>.{'\n\n'}
            Email của account có dạng:{'\n'}
            <code>name@project-id.iam.gserviceaccount.com</code>
          </Tooltip>
        </label>
        <textarea
          className={s.textareaInput}
          value={serviceKeyJson}
          onChange={e => setServiceKeyJson(e.target.value)}
          placeholder={hasKey ? '(Để trống để giữ key hiện tại)' : '{\n  "type": "service_account",\n  ...\n}'}
          style={{ minHeight: 72 }}
        />
      </div>

      <div className={s.actionRow} style={{ marginTop: 12 }}>
        <button className={s.btnPrimary} onClick={save} disabled={saving}>
          {saving ? 'Đang lưu...' : 'Lưu cấu hình chung'}
        </button>
      </div>
    </div>
  );
}

function GsheetCountryCard({
  countryCode, existing, onSaved, toast,
}: {
  countryCode: string;
  existing: BankGsheetConfig | null;
  onSaved: () => void;
  toast: ReturnType<typeof useToast>;
}) {
  const [spreadsheetId, setSpreadsheetId] = useState(existing?.spreadsheetId ?? '');
  const [isActive, setIsActive] = useState(existing?.isActive ?? false);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(!!(existing?.spreadsheetId));

  const countryInfo = COUNTRY_CODES.find(c => c.code === countryCode);

  async function save(overrides?: { isActive?: boolean }) {
    const activeVal = overrides?.isActive ?? isActive;
    if (!spreadsheetId.trim()) return;
    setSaving(true);
    try {
      await upsertBankGsheet(countryCode, {
        spreadsheetId: spreadsheetId.trim(),
        isActive: activeVal,
      });
      onSaved();
    } catch {
      toast.error(`Lưu cấu hình ${countryCode} thất bại.`);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive() {
    const next = !isActive;
    setIsActive(next);
    if (spreadsheetId.trim()) {
      await save({ isActive: next });
    }
  }

  return (
    <div className={`${s.countryCard} ${isActive ? s.countryCardActive : ''}`}>
      <div className={s.countryCardHeader}>
        <button className={s.countryCardExpand} onClick={() => setExpanded(v => !v)}>
          <svg
            className={`${s.chevron} ${expanded ? s.chevronOpen : ''}`}
            width="14" height="14" viewBox="0 0 14 14" fill="none"
          >
            <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <CountryBadge code={countryCode} />
          <span className={s.countryCardName}>{countryInfo?.label ?? countryCode}</span>
          {existing?.spreadsheetId && (
            <span className={s.countryCardSpreadsheetHint}>
              {existing.spreadsheetId.slice(0, 20)}…
            </span>
          )}
        </button>
        <button
          className={`${s.toggle} ${isActive ? s.toggleOn : ''}`}
          onClick={e => { e.stopPropagation(); toggleActive(); }}
          title={isActive ? 'Đang đồng bộ — nhấn để tắt' : 'Đang tắt — nhấn để bật'}
        />
      </div>
      {expanded && (
        <div className={s.countryCardBody}>
          <div className={s.field}>
            <label className={s.label}>Spreadsheet ID</label>
            <div className={s.spreadsheetRow}>
              <input
                className={`${s.input} ${s.inputFull}`}
                value={spreadsheetId}
                onChange={e => setSpreadsheetId(e.target.value)}
                placeholder="1h5gC1vqRfPvZ7DANAnAog-u5bDNNbpZRCaVuxAfzyQ0"
              />
              <button
                className={s.btnSave}
                onClick={() => save()}
                disabled={saving || !spreadsheetId.trim()}
              >
                {saving ? '...' : 'Lưu'}
              </button>
            </div>
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

const COUNTRY_CODES: Array<{ code: string; label: string }> = [
  { code: 'VN', label: 'Việt Nam' },
  { code: 'MY', label: 'Malaysia' },
  { code: 'ID', label: 'Indonesia' },
  { code: 'PH', label: 'Philippines' },
  { code: 'SG', label: 'Singapore' },
  { code: 'TH', label: 'Thái Lan' },
];

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

function CountrySelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const handleOutside = useCallback((e: MouseEvent) => {
    if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
  }, []);

  useEffect(() => {
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [handleOutside]);

  const selected = COUNTRY_CODES.find(c => c.code === value);

  return (
    <div ref={ref} className={s.countrySelect}>
      <button
        type="button"
        className={`${s.countrySelectTrigger} ${open ? s.countrySelectOpen : ''}`}
        onClick={() => setOpen(v => !v)}
      >
        {value ? (
          <>
            <CountryBadge code={value} />
            <span className={s.countrySelectName}>{selected?.label}</span>
          </>
        ) : (
          <span className={s.countrySelectPlaceholder}>Chọn quốc gia</span>
        )}
        <svg className={s.countrySelectChevron} width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      {open && (
        <div className={s.countrySelectDropdown}>
          {COUNTRY_CODES.map(c => (
            <button
              key={c.code}
              type="button"
              className={`${s.countrySelectOption} ${value === c.code ? s.countrySelectOptionActive : ''}`}
              onClick={() => { onChange(c.code); setOpen(false); }}
            >
              <CountryBadge code={c.code} />
              <span>{c.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
