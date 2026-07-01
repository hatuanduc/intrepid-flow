'use client';

import { useEffect, useState, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import {
  listBankAccounts, getBankMetrics,
  type BankAccount, type MetricsResponse, type DailyMetricsRow,
} from '../../lib/api';
import { useHasPermission } from '../../hooks/useHasPermission';
import AccessDenied from '../../components/common/AccessDenied';
import PageLoader from '../../components/common/PageLoader';
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

const COUNTRY_COLORS: Record<string, string> = {
  HK: '#635bff', VN: '#0e7490', ID: '#059669', MY: '#c44c0a',
  PH: '#7c3aed', SG: '#1a56db', TH: '#be185d',
};
function countryColor(code: string) { return COUNTRY_COLORS[code] ?? '#697386'; }

// ─── Data helpers ─────────────────────────────────────────────────────────────

type CurrencySummary = {
  currency: string;
  totalCredit: number; totalDebit: number; netFlow: number;
  txCount: number; accountCount: number;
};

function buildCurrencySummaries(daily: DailyMetricsRow[]): CurrencySummary[] {
  const map: Record<string, { totalCredit: number; totalDebit: number; txCount: number; accounts: Set<string> }> = {};
  for (const row of daily) {
    if (!map[row.currency]) map[row.currency] = { totalCredit: 0, totalDebit: 0, txCount: 0, accounts: new Set() };
    map[row.currency].totalCredit += row.totalCredit;
    map[row.currency].totalDebit += row.totalDebit;
    map[row.currency].txCount += row.txCount;
    map[row.currency].accounts.add(row.accountId);
  }
  return Object.entries(map)
    .map(([currency, v]) => ({
      currency,
      totalCredit: v.totalCredit, totalDebit: v.totalDebit,
      netFlow: v.totalCredit - v.totalDebit,
      txCount: v.txCount, accountCount: v.accounts.size,
    }))
    .sort((a, b) => a.currency.localeCompare(b.currency));
}

type ChartRow = { label: string; credit: number; debit: number };
function buildChartData(daily: DailyMetricsRow[], currency: string): ChartRow[] {
  const map: Record<string, ChartRow> = {};
  for (const row of daily.filter(r => r.currency === currency)) {
    if (!map[row.date]) map[row.date] = { label: fmtDate(row.date), credit: 0, debit: 0 };
    map[row.date].credit += row.totalCredit;
    map[row.date].debit += row.totalDebit;
  }
  return Object.entries(map).sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v);
}

type AccountTotal = {
  accountId: string; accountNumber: string; accountName: string;
  countryCode: string; currency: string;
  totalCredit: number; totalDebit: number; txCount: number;
};
function buildAccountTotals(daily: DailyMetricsRow[], currency: string): AccountTotal[] {
  const map: Record<string, AccountTotal> = {};
  for (const row of daily.filter(r => r.currency === currency)) {
    if (!map[row.accountId]) map[row.accountId] = { ...row, totalCredit: 0, totalDebit: 0, txCount: 0 };
    map[row.accountId].totalCredit += row.totalCredit;
    map[row.accountId].totalDebit += row.totalDebit;
    map[row.accountId].txCount += row.txCount;
  }
  return Object.values(map).sort((a, b) => a.accountNumber.localeCompare(b.accountNumber));
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className={s.chartTooltip}>
      <div className={s.chartTooltipDate}>{label}</div>
      {payload.map(p => (
        <div key={p.name} className={s.chartTooltipRow}>
          <span style={{ color: p.color }}>{p.name}</span>
          <span>{fmtAmount(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BankMetricsPage() {
  const canView = useHasPermission('bank_statement:view');
  const searchParams = useSearchParams();

  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [fromDate, setFromDate] = useState(iso30DaysAgo());
  const [toDate, setToDate] = useState(isoToday());
  const [countryFilter, setCountryFilter] = useState('');
  const [accountFilter, setAccountFilter] = useState(searchParams.get('accountId') ?? '');
  const [selectedCurrency, setSelectedCurrency] = useState('');

  const [metrics, setMetrics] = useState<MetricsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accountsLoading, setAccountsLoading] = useState(true);

  if (!canView) return <AccessDenied />;

  useEffect(() => {
    listBankAccounts().then(setAccounts).catch(() => {}).finally(() => setAccountsLoading(false));
  }, []);

  useEffect(() => {
    if (!fromDate || !toDate) return;
    setLoading(true); setError(null);
    getBankMetrics(fromDate, toDate, countryFilter || undefined, accountFilter || undefined)
      .then(data => {
        setMetrics(data);
        const currencies = [...new Set(data.daily.map(r => r.currency))].sort();
        setSelectedCurrency(prev => currencies.includes(prev) ? prev : (currencies[0] ?? ''));
      })
      .catch(() => setError('Không tải được dữ liệu. Vui lòng thử lại.'))
      .finally(() => setLoading(false));
  }, [fromDate, toDate, countryFilter, accountFilter]);

  const countries = useMemo(() => [...new Set(accounts.map(a => a.countryCode))].sort(), [accounts]);
  const filteredAccounts = useMemo(
    () => countryFilter ? accounts.filter(a => a.countryCode === countryFilter) : accounts,
    [accounts, countryFilter],
  );

  const currencySummaries = useMemo(() => metrics ? buildCurrencySummaries(metrics.daily) : [], [metrics]);
  const activeSummary     = useMemo(() => currencySummaries.find(c => c.currency === selectedCurrency) ?? null, [currencySummaries, selectedCurrency]);
  const chartData         = useMemo(() => metrics && selectedCurrency ? buildChartData(metrics.daily, selectedCurrency) : [], [metrics, selectedCurrency]);
  const accountTotals     = useMemo(() => metrics && selectedCurrency ? buildAccountTotals(metrics.daily, selectedCurrency) : [], [metrics, selectedCurrency]);

  return (
    <div className={s.page}>
      <div className={s.pageHeader}>
        <h1 className={s.pageTitle}>Metrics — Sao kê NH</h1>
      </div>

      {/* ── Filters ── */}
      <div className={s.filterBar}>
        <div className={s.filterGroup}>
          <label className={s.filterLabel}>Từ ngày</label>
          <input type="date" className={s.dateInput} value={fromDate} onChange={e => setFromDate(e.target.value)} />
        </div>
        <div className={s.filterGroup}>
          <label className={s.filterLabel}>Đến ngày</label>
          <input type="date" className={s.dateInput} value={toDate} onChange={e => setToDate(e.target.value)} />
        </div>
        <div className={s.filterGroup}>
          <label className={s.filterLabel}>Quốc gia</label>
          <select className={s.select} value={countryFilter} onChange={e => { setCountryFilter(e.target.value); setAccountFilter(''); }}>
            <option value="">Tất cả</option>
            {countries.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className={s.filterGroup}>
          <label className={s.filterLabel}>Tài khoản</label>
          <select className={s.select} value={accountFilter} onChange={e => setAccountFilter(e.target.value)} disabled={accountsLoading}>
            <option value="">Tất cả</option>
            {filteredAccounts.map(a => <option key={a.id} value={a.id}>{a.accountNumber} — {a.accountName}</option>)}
          </select>
        </div>
      </div>

      {error && <div className={s.error}>{error}</div>}

      {loading ? (
        <div className={s.loadingWrap}><PageLoader /></div>
      ) : !metrics || currencySummaries.length === 0 ? (
        !loading && <div className={s.empty}>Không có dữ liệu trong khoảng thời gian này.</div>
      ) : (
        <>
          {/* ── Currency chips + selected detail ── */}
          <div className={s.currencyBlock}>
            {/* Chips */}
            <div className={s.chips}>
              {currencySummaries.map(c => (
                <button
                  key={c.currency}
                  className={`${s.chip} ${selectedCurrency === c.currency ? s.chipActive : ''}`}
                  onClick={() => setSelectedCurrency(c.currency)}
                >
                  <span className={s.chipCurrency}>{c.currency}</span>
                  <span className={s.chipCount}>{c.txCount} GD</span>
                </button>
              ))}
            </div>

            {/* Stats of selected currency */}
            {activeSummary && (
              <div className={s.currencyDetail}>
                <div className={s.currencyDetailStat}>
                  <span className={s.detailLabel}>Tiền vào</span>
                  <span className={`${s.detailValue} ${s.credit}`}>{fmtAmount(activeSummary.totalCredit)}</span>
                </div>
                <div className={s.currencyDetailDivider} />
                <div className={s.currencyDetailStat}>
                  <span className={s.detailLabel}>Tiền ra</span>
                  <span className={`${s.detailValue} ${s.debit}`}>{fmtAmount(activeSummary.totalDebit)}</span>
                </div>
                <div className={s.currencyDetailDivider} />
                <div className={s.currencyDetailStat}>
                  <span className={s.detailLabel}>Net</span>
                  <span className={`${s.detailValue} ${activeSummary.netFlow >= 0 ? s.credit : s.debit}`}>
                    {activeSummary.netFlow >= 0 ? '+' : ''}{fmtAmount(activeSummary.netFlow)}
                  </span>
                </div>
                <div className={s.currencyDetailDivider} />
                <div className={s.currencyDetailStat}>
                  <span className={s.detailLabel}>Giao dịch</span>
                  <span className={s.detailValue}>{fmtNumber(activeSummary.txCount)}</span>
                </div>
                <div className={s.currencyDetailDivider} />
                <div className={s.currencyDetailStat}>
                  <span className={s.detailLabel}>Tài khoản</span>
                  <span className={s.detailValue}>{activeSummary.accountCount}</span>
                </div>
              </div>
            )}
          </div>

          {/* ── Chart ── */}
          {chartData.length > 0 && (
            <div className={s.chartWrap}>
              <div className={s.chartTitle}>
                Tiền vào / Tiền ra theo ngày
                <span className={s.chartCurrencyTag}>{selectedCurrency}</span>
              </div>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={chartData} barCategoryGap="30%" barGap={3}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e3e8ee" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#697386' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#697386' }} axisLine={false} tickLine={false} tickFormatter={v => fmtNumber(v as number)} width={80} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="credit" name="Tiền vào" fill="#059669" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="debit"  name="Tiền ra"  fill="#f59e0b" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* ── Accounts table ── */}
          {accountTotals.length > 0 && (
            <div className={s.tableWrap}>
              <div className={s.tableTitle}>
                Chi tiết tài khoản
                <span className={s.chartCurrencyTag}>{selectedCurrency}</span>
              </div>
              <table className={s.table}>
                <thead>
                  <tr>
                    <th className={s.th}>Tài khoản</th>
                    <th className={s.th}>QG</th>
                    <th className={`${s.th} ${s.thRight}`}>Giao dịch</th>
                    <th className={`${s.th} ${s.thRight}`}>Tiền vào</th>
                    <th className={`${s.th} ${s.thRight}`}>Tiền ra</th>
                    <th className={`${s.th} ${s.thRight}`}>Net</th>
                  </tr>
                </thead>
                <tbody>
                  {accountTotals.map(row => (
                    <tr key={row.accountId} className={s.tr}>
                      <td className={s.td}>
                        <div className={s.nameCell}>
                          <span className={s.avatar} style={{ background: countryColor(row.countryCode) }}>
                            {row.accountNumber.slice(-2)}
                          </span>
                          <div>
                            <div className={s.accountName}>{row.accountName}</div>
                            <div className={s.accountNumber}>{row.accountNumber}</div>
                          </div>
                        </div>
                      </td>
                      <td className={s.td}>
                        <span className={s.countryBadge} style={{ background: countryColor(row.countryCode) + '20', color: countryColor(row.countryCode) }}>
                          {row.countryCode}
                        </span>
                      </td>
                      <td className={`${s.td} ${s.tdRight}`}>{fmtNumber(row.txCount)}</td>
                      <td className={`${s.td} ${s.tdRight} ${s.creditCell}`}>{fmtAmount(row.totalCredit)}</td>
                      <td className={`${s.td} ${s.tdRight}`}>{fmtAmount(row.totalDebit)}</td>
                      <td className={`${s.td} ${s.tdRight}`} style={{ color: row.totalCredit - row.totalDebit >= 0 ? '#059669' : '#df1b41' }}>
                        {row.totalCredit - row.totalDebit >= 0 ? '+' : ''}{fmtAmount(row.totalCredit - row.totalDebit)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
