'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import {
  listBankAccounts, listBankAccountNames, getBankMetrics, getBankCurrencyRates, refreshCurrencyRates,
  getAccountTransactions,
  type BankAccount, type BankAccountNameItem, type MetricsResponse, type DailyMetricsRow, type CurrencyRate, type JobTransaction,
} from '../../lib/api';
import { useHasPermission } from '../../hooks/useHasPermission';
import { useToast } from '../../components/common/Toast';
import { useT } from '../../lib/i18n';
import AccessDenied from '../../components/common/AccessDenied';
import PageLoader, { Spinner } from '../../components/common/PageLoader';
import Pagination from '../../components/common/Pagination';
import RightPanel from '../../components/common/RightPanel';
import s from './BankMetricsPage.module.css';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isoToday() { return new Date().toISOString().split('T')[0]; }
function iso30DaysAgo() {
  const d = new Date(); d.setDate(d.getDate() - 29);
  return d.toISOString().split('T')[0];
}
function fmtDate(iso: string) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y.slice(2)}`;
}
function fmtNumber(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
function fmtAmount(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const CODE_COLORS: Record<string, string> = {
  HK: '#635bff', VN: '#0e7490', ID: '#059669', MY: '#c44c0a',
  PH: '#7c3aed', SG: '#1a56db', TH: '#be185d',
};
function codeColor(code: string) { return CODE_COLORS[code] ?? '#697386'; }

// ─── Data types & builders ────────────────────────────────────────────────────

type AccountRow = {
  accountId: number; accountNumber: string; accountName: string;
  accountCode: string; currency: string;
  totalCredit: number; totalDebit: number; txCount: number;
  creditUsd: number | null; debitUsd: number | null;
  balance: number | null; balanceUsd: number | null;
};

type CountryGroup = {
  accountCode: string; accounts: AccountRow[];
  totalCreditUsd: number; totalDebitUsd: number; hasRates: boolean;
};

function buildCountryGroups(daily: DailyMetricsRow[], rateMap: Record<string, number>, balanceMap: Record<number, number | null>): CountryGroup[] {
  const accountMap: Record<string, AccountRow> = {};
  for (const row of daily) {
    const key = `${row.accountId}__${row.currency}`;
    if (!accountMap[key]) {
      accountMap[key] = {
        accountId: row.accountId, accountNumber: row.accountNumber,
        accountName: row.accountName, accountCode: row.accountCode,
        currency: row.currency, totalCredit: 0, totalDebit: 0, txCount: 0,
        creditUsd: null, debitUsd: null,
        balance: balanceMap[row.accountId] ?? null, balanceUsd: null,
      };
    }
    accountMap[key].totalCredit += row.totalCredit;
    accountMap[key].totalDebit  += row.totalDebit;
    accountMap[key].txCount     += row.txCount;
  }

  for (const row of Object.values(accountMap)) {
    const rate = row.currency === 'USD' ? 1 : (rateMap[row.currency] ?? null);
    if (rate !== null) {
      row.creditUsd = row.totalCredit * rate;
      row.debitUsd  = row.totalDebit  * rate;
      if (row.balance !== null) row.balanceUsd = row.balance * rate;
    }
  }

  const codeMap: Record<string, CountryGroup> = {};
  for (const row of Object.values(accountMap)) {
    if (!codeMap[row.accountCode]) {
      codeMap[row.accountCode] = {
        accountCode: row.accountCode, accounts: [],
        totalCreditUsd: 0, totalDebitUsd: 0, hasRates: true,
      };
    }
    codeMap[row.accountCode].accounts.push(row);
    if (row.creditUsd === null) {
      codeMap[row.accountCode].hasRates = false;
    } else {
      codeMap[row.accountCode].totalCreditUsd += row.creditUsd;
      codeMap[row.accountCode].totalDebitUsd  += row.debitUsd ?? 0;
    }
  }

  return Object.values(codeMap)
    .map(g => ({ ...g, accounts: g.accounts.sort((a, b) => a.accountNumber.localeCompare(b.accountNumber)) }))
    .sort((a, b) => a.accountCode.localeCompare(b.accountCode));
}

// ─── Chart builders ───────────────────────────────────────────────────────────

type BarRow = { label: string; credit: number; debit: number };

function buildCountryChart(groups: CountryGroup[]): BarRow[] {
  return groups
    .filter(g => g.hasRates)
    .map(g => ({ label: g.accountCode, credit: g.totalCreditUsd, debit: g.totalDebitUsd }));
}

function buildAccountChart(groups: CountryGroup[], accountCode: string): BarRow[] {
  const group = groups.find(g => g.accountCode === accountCode);
  if (!group) return [];
  return group.accounts
    .filter(a => a.creditUsd !== null)
    .map(a => ({ label: a.accountNumber.slice(-8), credit: a.creditUsd!, debit: a.debitUsd! }));
}

function buildDailyChart(daily: DailyMetricsRow[], rateMap: Record<string, number>): BarRow[] {
  const map: Record<string, BarRow> = {};
  for (const row of daily) {
    const rate = row.currency === 'USD' ? 1 : (rateMap[row.currency] ?? null);
    if (rate === null) continue;
    if (!map[row.date]) map[row.date] = { label: fmtDate(row.date), credit: 0, debit: 0 };
    map[row.date].credit += row.totalCredit * rate;
    map[row.date].debit  += row.totalDebit  * rate;
  }
  return Object.entries(map).sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v);
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className={s.chartTooltip}>
      <div className={s.chartTooltipDate}>{label}</div>
      {payload.map(p => (
        <div key={p.name} className={s.chartTooltipRow}>
          <span style={{ color: p.color }}>{p.name}</span>
          <span>${fmtAmount(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Filter pill (account number) ──────────────────────────────────────────────

type PillProps = {
  label: string;
  active?: boolean;
  activeLabel?: string;
  disabled?: boolean;
  onClear?: () => void;
  children: (close: () => void) => React.ReactNode;
};
function FilterPill({ label, active, activeLabel, disabled, onClear, children }: PillProps) {
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
    <div className={s.pillWrap} ref={ref}>
      <button
        type="button"
        className={`${s.pill} ${active ? s.pillActive : ''}`}
        onClick={() => setOpen(v => !v)}
        disabled={disabled}
      >
        {active ? (
          <>
            <span className={s.pillCheck}>✓</span>
            <span>{activeLabel ?? label}</span>
            <span
              className={s.pillClear}
              role="button"
              onClick={e => { e.stopPropagation(); onClear?.(); setOpen(false); }}
            >×</span>
          </>
        ) : (
          <>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className={s.pillPlus}>
              <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.2"/>
              <path d="M6 4v4M4 6h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
            {label}
          </>
        )}
      </button>
      {open && (
        <div className={s.pillDropdown}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

function AccountNumberFilter({ accounts, onSelect, t }: {
  accounts: BankAccount[];
  onSelect: (id: string) => void;
  t: ReturnType<typeof useT>['t'];
}) {
  return (
    <div className={s.filterPopup}>
      <p className={s.filterPopupTitle}>{t('bankMetrics.accountCode')}</p>
      <div className={s.filterRoleList}>
        {accounts.map(a => (
          <div key={a.id} className={s.filterRoleRow} onClick={() => onSelect(String(a.id))}>
            {a.accountNumber}
          </div>
        ))}
        {accounts.length === 0 && <p className={s.filterEmpty}>{t('bankMetrics.noData')}</p>}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BankMetricsPage() {
  const canView   = useHasPermission('bank_statement:view');
  const canConfig = useHasPermission('system:config');
  const toast = useToast();
  const { t } = useT();
  const searchParams = useSearchParams();

  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [accountNameItems, setAccountNameItems] = useState<BankAccountNameItem[]>([]);
  const [fromDate, setFromDate] = useState(iso30DaysAgo());
  const [toDate, setToDate] = useState(isoToday());
  const [nameFilter, setNameFilter] = useState('');
  const [accountFilter, setAccountFilter] = useState(searchParams.get('accountId') ?? '');
  const [currencyRates, setCurrencyRates] = useState<CurrencyRate[]>([]);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const [metrics, setMetrics] = useState<MetricsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [accountNamesLoading, setAccountNamesLoading] = useState(true);
  const [ratesRefreshing, setRatesRefreshing] = useState(false);
  const [txPanel, setTxPanel] = useState<{ row: AccountRow; txRows: JobTransaction[] } | null>(null);
  const [txLoading, setTxLoading] = useState(false);

  useEffect(() => {
    getBankCurrencyRates().then(setCurrencyRates).catch(() => {});
  }, []);

  useEffect(() => {
    listBankAccounts().then(setAccounts).catch(() => {}).finally(() => setAccountsLoading(false));
    listBankAccountNames().then(setAccountNameItems).catch(() => {}).finally(() => setAccountNamesLoading(false));
  }, []);

  useEffect(() => {
    if (!fromDate || !toDate) return;
    // Deferred a tick so these resets aren't synchronous with the effect itself.
    Promise.resolve().then(() => { setLoading(true); setError(null); setPage(1); });
    getBankMetrics(fromDate, toDate, undefined, accountFilter ? Number(accountFilter) : undefined)
      .then(data => setMetrics(data))
      .catch(() => setError(t('bankMetrics.loadFailed')))
      .finally(() => setLoading(false));
  }, [fromDate, toDate, accountFilter]);

  async function handleRefreshRates() {
    setRatesRefreshing(true);
    try {
      const data = await refreshCurrencyRates();
      setCurrencyRates(data.rates);
      toast.success(t('bankMetrics.rateRefreshed'));
    } catch { toast.error(t('bankMetrics.rateRefreshFailed')); }
    finally { setRatesRefreshing(false); }
  }

  async function openTxPanel(row: AccountRow) {
    setTxPanel({ row, txRows: [] });
    setTxLoading(true);
    try {
      const txRows = await getAccountTransactions(row.accountId, fromDate, toDate);
      setTxPanel({ row, txRows });
    } catch {
      toast.error(t('bankMetrics.txLoadFailed'));
      setTxPanel(null);
    } finally {
      setTxLoading(false);
    }
  }

  const accountNames = useMemo(
    () => [...accountNameItems].sort((a, b) => a.name.localeCompare(b.name)),
    [accountNameItems],
  );
  const filteredAccounts = useMemo(
    () => nameFilter ? accounts.filter(a => a.accountName === nameFilter) : accounts,
    [accounts, nameFilter],
  );

  const rateMap        = useMemo(() => Object.fromEntries(currencyRates.map(r => [r.currency, Number(r.rateToUsd)])), [currencyRates]);
  const balanceMap     = useMemo(() => metrics ? Object.fromEntries(metrics.balances.map(b => [b.accountId, b.balance])) : {}, [metrics]);
  const accountGroups  = useMemo(() => metrics ? buildCountryGroups(metrics.daily, rateMap, balanceMap) : [], [metrics, rateMap, balanceMap]);
  const ratesUpdatedAt = useMemo(() => currencyRates.length > 0 ? currencyRates.reduce((m, r) => r.updatedAt > m ? r.updatedAt : m, currencyRates[0].updatedAt) : null, [currencyRates]);
  const hasRates = currencyRates.length > 0;

  // When nameFilter is set, derive accountCode for chart from the declared account name (master data)
  const nameFilterCode = useMemo(
    () => nameFilter ? (accountNameItems.find(n => n.name === nameFilter)?.accountCode ?? '') : '',
    [accountNameItems, nameFilter],
  );

  // Narrow to the selected company chip so totals/table stay in sync with the chart.
  const filteredGroups = useMemo(
    () => nameFilter ? accountGroups.filter(g => g.accountCode === nameFilterCode) : accountGroups,
    [accountGroups, nameFilter, nameFilterCode],
  );
  const flatAccounts   = useMemo(() => filteredGroups.flatMap(g => g.accounts), [filteredGroups]);
  const paginated      = useMemo(() => flatAccounts.slice((page - 1) * pageSize, page * pageSize), [flatAccounts, page]);

  const usdTotal = useMemo(() => {
    let credit = 0, debit = 0;
    const missing = new Set<string>();
    for (const g of filteredGroups) {
      for (const a of g.accounts) {
        if (a.creditUsd === null) { missing.add(a.currency); }
        else { credit += a.creditUsd; debit += a.debitUsd ?? 0; }
      }
    }
    return { credit, debit, net: credit + debit, missing: [...missing] };
  }, [filteredGroups]);

  const chartData = useMemo(() => {
    if (!metrics || !hasRates) return [];
    if (accountFilter) return buildDailyChart(metrics.daily, rateMap);
    if (nameFilter) return buildAccountChart(accountGroups, nameFilterCode);
    return buildCountryChart(accountGroups);
  }, [metrics, hasRates, accountFilter, nameFilter, nameFilterCode, accountGroups, rateMap]);

  const chartLabel = accountFilter
    ? t('bankMetrics.chartByDay')
    : nameFilter
      ? t('bankMetrics.chartByAccount', { code: nameFilterCode })
      : t('bankMetrics.chartByCode');

  if (!canView) return <AccessDenied />;

  return (
    <div className={s.page}>
      <div className={s.pageHeader}>
        <h1 className={s.pageTitle}>{t('bankMetrics.title')}</h1>
      </div>

      {/* ── Filters ── */}
      <div className={s.filterBar}>
        <div className={s.filterGroup}>
          <label className={s.filterLabel}>{t('bankMetrics.fromDate')}</label>
          <input type="date" className={s.dateInput} value={fromDate} onChange={e => setFromDate(e.target.value)} />
        </div>
        <div className={s.filterGroup}>
          <label className={s.filterLabel}>{t('bankMetrics.toDate')}</label>
          <input type="date" className={s.dateInput} value={toDate} onChange={e => setToDate(e.target.value)} />
        </div>
      </div>

      {/* Account name chips */}
      <div className={s.chips}>
        <button
          type="button"
          className={`${s.chip} ${!nameFilter ? s.chipSelected : ''}`}
          onClick={() => { setNameFilter(''); setAccountFilter(''); }}
          disabled={accountNamesLoading}
        >
          <span className={s.chipLabel}>{t('bankMetrics.all')}</span>
          <span className={s.chipCount}>{accounts.length}</span>
        </button>
        {accountNames.map(n => (
          <button
            key={n.id}
            type="button"
            className={`${s.chip} ${nameFilter === n.name ? s.chipSelected : ''}`}
            onClick={() => { setNameFilter(n.name); setAccountFilter(''); }}
            disabled={accountNamesLoading}
            title={n.name}
          >
            <span className={s.chipLabel}>{n.accountCode}</span>
            <span className={s.chipCount}>{accounts.filter(a => a.accountName === n.name).length}</span>
          </button>
        ))}
      </div>

      {/* Account number filter pill */}
      <div className={s.filterPills}>
        <FilterPill
          label={t('bankMetrics.accountCode')}
          active={!!accountFilter}
          activeLabel={filteredAccounts.find(a => String(a.id) === accountFilter)?.accountNumber}
          disabled={accountsLoading}
          onClear={() => setAccountFilter('')}
        >
          {close => (
            <AccountNumberFilter
              accounts={filteredAccounts}
              onSelect={id => { setAccountFilter(id); close(); }}
              t={t}
            />
          )}
        </FilterPill>
      </div>

      {error && <div className={s.error}>{error}</div>}

      {loading ? (
        <div className={s.loadingWrap}><PageLoader /></div>
      ) : !metrics || flatAccounts.length === 0 ? (
        !loading && <div className={s.empty}>{t('bankMetrics.noData')}</div>
      ) : (
        <>
          {/* ── USD Total ── */}
          <div className={s.usdBlock}>
            {!hasRates ? (
              <div className={s.usdNoRates}>
                <span className={s.usdNoRatesText}>{t('bankMetrics.noRatesAvailable')}</span>
                {canConfig ? (
                  <button className={s.usdRefreshBtn} onClick={handleRefreshRates} disabled={ratesRefreshing}>
                    {ratesRefreshing ? t('bankMetrics.fetchingRates') : t('bankMetrics.fetchRates')}
                  </button>
                ) : (
                  <span className={s.usdNoRatesMeta}>{t('bankMetrics.contactAdmin')}</span>
                )}
              </div>
            ) : (
              <>
                <div className={s.usdTitle}>
                  {t('bankMetrics.usdTotal')}
                  {ratesUpdatedAt && (
                    <span className={s.usdMeta}>· {t('bankMetrics.exchangeRate')} {new Date(ratesUpdatedAt).toLocaleDateString('vi-VN')}</span>
                  )}
                  {usdTotal.missing.length > 0 && (
                    <span className={s.usdWarn}>· {usdTotal.missing.join(', ')} {t('bankMetrics.noRate')}</span>
                  )}
                </div>
                <div className={s.usdStats}>
                  <div className={s.usdStat}>
                    <span className={s.usdLabel}>{t('bankMetrics.creditIn')}</span>
                    <span className={`${s.usdValue} ${s.credit}`}>${fmtAmount(usdTotal.credit)}</span>
                  </div>
                  <div className={s.usdDivider} />
                  <div className={s.usdStat}>
                    <span className={s.usdLabel}>{t('bankMetrics.debitOut')}</span>
                    <span className={`${s.usdValue} ${s.debit}`}>${fmtAmount(usdTotal.debit)}</span>
                  </div>
                  <div className={s.usdDivider} />
                  <div className={s.usdStat}>
                    <span className={s.usdLabel}>{t('bankMetrics.net')}</span>
                    <span className={`${s.usdValue} ${usdTotal.net >= 0 ? s.credit : s.debit}`}>
                      {usdTotal.net >= 0 ? '+' : ''}${fmtAmount(usdTotal.net)}
                    </span>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* ── Adaptive chart ── */}
          {chartData.length > 0 && (
            <div className={s.chartWrap}>
              <div className={s.chartTitle}>
                {chartLabel}
              </div>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={chartData} barCategoryGap="30%" barGap={3}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e3e8ee" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#697386' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#697386' }} axisLine={false} tickLine={false} tickFormatter={v => '$' + fmtNumber(v as number)} width={84} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="credit" name={t('bankMetrics.tableCredit')} fill="#059669" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="debit"  name={t('bankMetrics.tableDebit')}  fill="#f59e0b" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* ── Flat account table ── */}
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th className={s.th}>{t('bankMetrics.tableAccount')}</th>
                  <th className={s.th}>{t('bankMetrics.tableCode')}</th>
                  <th className={s.th}>{t('bankMetrics.tableCurrency')}</th>
                  <th className={`${s.th} ${s.thRight}`}>{t('bankMetrics.tableTransactions')}</th>
                  <th className={`${s.th} ${s.thRight}`}>{t('bankMetrics.tableCredit')}</th>
                  <th className={`${s.th} ${s.thRight}`}>{t('bankMetrics.tableDebit')}</th>
                  <th className={`${s.th} ${s.thRight}`}>{t('bankMetrics.tableBalance')}</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map(row => {
                  const showUsd = row.creditUsd !== null && row.currency !== 'USD';
                  return (
                    <tr key={`${row.accountId}__${row.currency}`} className={s.tr} onClick={() => openTxPanel(row)} style={{ cursor: 'pointer' }}>
                      <td className={s.td}>
                        <div className={s.nameCell}>
                          <span className={s.avatar} style={{ background: codeColor(row.accountCode) }}>
                            {row.accountNumber.slice(-2)}
                          </span>
                          <div>
                            <div className={s.accountName}>{row.accountName}</div>
                            <div className={s.accountNumber}>{row.accountNumber}</div>
                          </div>
                        </div>
                      </td>
                      <td className={s.td}>
                        <span className={s.countryBadge} style={{ background: codeColor(row.accountCode) + '20', color: codeColor(row.accountCode) }}>
                          {row.accountCode}
                        </span>
                      </td>
                      <td className={s.td}>
                        <span className={s.currencyTag}>{row.currency}</span>
                      </td>
                      <td className={`${s.td} ${s.tdRight}`}>{fmtNumber(row.txCount)}</td>
                      <td className={`${s.td} ${s.tdRight}`}>
                        <span className={s.credit}>{row.totalCredit !== 0 ? fmtAmount(row.totalCredit) : '—'}</span>
                        {showUsd && row.totalCredit !== 0 && <div className={s.usdHint}>≈ ${fmtAmount(row.creditUsd!)}</div>}
                      </td>
                      <td className={`${s.td} ${s.tdRight}`}>
                        <span>{row.totalDebit !== 0 ? fmtAmount(row.totalDebit) : '—'}</span>
                        {showUsd && row.totalDebit !== 0 && <div className={s.usdHint}>≈ ${fmtAmount(row.debitUsd!)}</div>}
                      </td>
                      <td className={`${s.td} ${s.tdRight}`}>
                        {row.balance !== null ? (
                          <>
                            <span style={{ color: row.balance >= 0 ? '#059669' : '#df1b41' }}>
                              {fmtAmount(row.balance)}
                            </span>
                            {showUsd && row.balanceUsd !== null && (
                              <div className={s.usdHint} style={{ color: row.balanceUsd >= 0 ? '#059669' : '#df1b41' }}>
                                ≈ ${fmtAmount(row.balanceUsd)}
                              </div>
                            )}
                          </>
                        ) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <Pagination
              page={page}
              pageSize={pageSize}
              total={flatAccounts.length}
              onPageChange={setPage}
              onPageSizeChange={() => {}}
            />
          </div>
        </>
      )}

      <RightPanel
        title={txPanel?.row.accountName ?? ''}
        open={txPanel !== null}
        onClose={() => setTxPanel(null)}
        width={1200}
      >
        {txPanel && (
          <MetricsTxPanel
            row={txPanel.row}
            txRows={txPanel.txRows}
            loading={txLoading}
            fromDate={fromDate}
            toDate={toDate}
          />
        )}
      </RightPanel>
    </div>
  );
}

// ─── Transaction detail panel ─────────────────────────────────────────────────

function txFmtDate(iso: string) {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function MetricsTxPanel({ row, txRows, loading, fromDate, toDate }: {
  row: AccountRow;
  txRows: JobTransaction[];
  loading: boolean;
  fromDate: string;
  toDate: string;
}) {
  const { t } = useT();
  return (
    <div className={s.txPanel}>
      <div className={s.txPanelMeta}>
        <span className={s.txPanelAccNum}>{row.accountNumber}</span>
        <span className={s.currencyTag}>{row.currency}</span>
        <span className={s.txPanelRange}>{fromDate} → {toDate}</span>
      </div>

      {loading ? (
        <div className={s.txPanelLoading}><Spinner size={20} /></div>
      ) : txRows.length === 0 ? (
        <div className={s.empty}>{t('bankMetrics.txNoData')}</div>
      ) : (
        <div className={s.txTableWrap}>
          <table className={s.txTable}>
            <colgroup>
              <col style={{ width: '90px' }} />
              {/* Narrative — không set width: table-layout fixed tự cho nó phần còn lại */}
              <col />
              <col style={{ width: '150px' }} />
              <col style={{ width: '130px' }} />
              <col style={{ width: '130px' }} />
              <col style={{ width: '130px' }} />
            </colgroup>
            <thead>
              <tr>
                <th className={s.txTh}>Post date</th>
                <th className={s.txTh}>Narrative</th>
                <th className={s.txTh}>Bank reference</th>
                <th className={s.txTh} style={{ textAlign: 'right' }}>{t('bankMetrics.txCredit')}</th>
                <th className={s.txTh} style={{ textAlign: 'right' }}>{t('bankMetrics.txDebit')}</th>
                <th className={s.txTh} style={{ textAlign: 'right' }}>{t('bankMetrics.txBalance')}</th>
              </tr>
            </thead>
            <tbody>
              {txRows.map(tx => (
                <tr key={tx.id} className={s.txRow}>
                  <td className={s.txTd}>{txFmtDate(tx.postDate)}</td>
                  <td className={s.txTdNarrative}>{tx.narrative ?? '—'}</td>
                  <td className={s.txTdMono}>{tx.bankReference ?? '—'}</td>
                  <td className={s.txTdCredit}>
                    {tx.creditAmount ? fmtAmount(tx.creditAmount) : '—'}
                  </td>
                  <td className={s.txTdDebit}>
                    {tx.debitAmount ? fmtAmount(tx.debitAmount) : '—'}
                  </td>
                  <td className={s.txTdBalance}>
                    {tx.balance != null ? fmtAmount(tx.balance) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
