'use client';

import { useEffect, useState, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import {
  listBankAccounts, getBankMetrics, getBankCurrencyRates, refreshCurrencyRates,
  type BankAccount, type MetricsResponse, type DailyMetricsRow, type CurrencyRate,
} from '../../lib/api';
import { useHasPermission } from '../../hooks/useHasPermission';
import { useToast } from '../../components/common/Toast';
import AccessDenied from '../../components/common/AccessDenied';
import PageLoader from '../../components/common/PageLoader';
import Pagination from '../../components/common/Pagination';
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
  accountId: string; accountNumber: string; accountName: string;
  accountCode: string; currency: string;
  totalCredit: number; totalDebit: number; txCount: number;
  creditUsd: number | null; debitUsd: number | null;
};

type CountryGroup = {
  accountCode: string; accounts: AccountRow[];
  totalCreditUsd: number; totalDebitUsd: number; hasRates: boolean;
};

function buildCountryGroups(daily: DailyMetricsRow[], rateMap: Record<string, number>): CountryGroup[] {
  const accountMap: Record<string, AccountRow> = {};
  for (const row of daily) {
    const key = `${row.accountId}__${row.currency}`;
    if (!accountMap[key]) {
      accountMap[key] = {
        accountId: row.accountId, accountNumber: row.accountNumber,
        accountName: row.accountName, accountCode: row.accountCode,
        currency: row.currency, totalCredit: 0, totalDebit: 0, txCount: 0,
        creditUsd: null, debitUsd: null,
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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BankMetricsPage() {
  const canView   = useHasPermission('bank_statement:view');
  const canConfig = useHasPermission('system:config');
  const toast = useToast();
  const searchParams = useSearchParams();

  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [fromDate, setFromDate] = useState(iso30DaysAgo());
  const [toDate, setToDate] = useState(isoToday());
  const [codeFilter, setCodeFilter] = useState('');
  const [accountFilter, setAccountFilter] = useState(searchParams.get('accountId') ?? '');
  const [currencyRates, setCurrencyRates] = useState<CurrencyRate[]>([]);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const [metrics, setMetrics] = useState<MetricsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [ratesRefreshing, setRatesRefreshing] = useState(false);

  useEffect(() => {
    getBankCurrencyRates().then(setCurrencyRates).catch(() => {});
  }, []);

  useEffect(() => {
    listBankAccounts().then(setAccounts).catch(() => {}).finally(() => setAccountsLoading(false));
  }, []);

  useEffect(() => {
    if (!fromDate || !toDate) return;
    setLoading(true); setError(null); setPage(1);
    getBankMetrics(fromDate, toDate, codeFilter || undefined, accountFilter || undefined)
      .then(data => setMetrics(data))
      .catch(() => setError('Không tải được dữ liệu. Vui lòng thử lại.'))
      .finally(() => setLoading(false));
  }, [fromDate, toDate, codeFilter, accountFilter]);

  async function handleRefreshRates() {
    setRatesRefreshing(true);
    try {
      const data = await refreshCurrencyRates();
      setCurrencyRates(data.rates);
      toast.success('Tỉ giá đã được cập nhật.');
    } catch { toast.error('Cập nhật tỉ giá thất bại.'); }
    finally { setRatesRefreshing(false); }
  }

  if (!canView) return <AccessDenied />;

  const accountCodes = useMemo(() => [...new Set(accounts.map(a => a.accountCode))].sort(), [accounts]);
  const filteredAccounts = useMemo(
    () => codeFilter ? accounts.filter(a => a.accountCode === codeFilter) : accounts,
    [accounts, codeFilter],
  );

  const rateMap        = useMemo(() => Object.fromEntries(currencyRates.map(r => [r.currency, Number(r.rateToUsd)])), [currencyRates]);
  const accountGroups  = useMemo(() => metrics ? buildCountryGroups(metrics.daily, rateMap) : [], [metrics, rateMap]);
  const flatAccounts   = useMemo(() => accountGroups.flatMap(g => g.accounts), [accountGroups]);
  const paginated      = useMemo(() => flatAccounts.slice((page - 1) * pageSize, page * pageSize), [flatAccounts, page]);
  const ratesUpdatedAt = useMemo(() => currencyRates.length > 0 ? currencyRates.reduce((m, r) => r.updatedAt > m ? r.updatedAt : m, currencyRates[0].updatedAt) : null, [currencyRates]);

  const usdTotal = useMemo(() => {
    let credit = 0, debit = 0;
    const missing = new Set<string>();
    for (const g of accountGroups) {
      for (const a of g.accounts) {
        if (a.creditUsd === null) { missing.add(a.currency); }
        else { credit += a.creditUsd; debit += a.debitUsd ?? 0; }
      }
    }
    return { credit, debit, net: credit - debit, missing: [...missing] };
  }, [accountGroups]);

  const hasRates = currencyRates.length > 0;

  const chartData = useMemo(() => {
    if (!metrics || !hasRates) return [];
    if (accountFilter) return buildDailyChart(metrics.daily, rateMap);
    if (codeFilter) return buildAccountChart(accountGroups, codeFilter);
    return buildCountryChart(accountGroups);
  }, [metrics, hasRates, accountFilter, codeFilter, accountGroups, rateMap]);

  const chartLabel = accountFilter ? 'Theo ngày (USD)' : codeFilter ? `${codeFilter} — theo tài khoản (USD)` : 'Theo account code (USD)';

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
          <label className={s.filterLabel}>Account code</label>
          <select className={s.select} value={codeFilter} onChange={e => { setCodeFilter(e.target.value); setAccountFilter(''); }}>
            <option value="">Tất cả</option>
            {accountCodes.map(c => <option key={c} value={c}>{c}</option>)}
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
      ) : !metrics || flatAccounts.length === 0 ? (
        !loading && <div className={s.empty}>Không có dữ liệu trong khoảng thời gian này.</div>
      ) : (
        <>
          {/* ── USD Total ── */}
          <div className={s.usdBlock}>
            {!hasRates ? (
              <div className={s.usdNoRates}>
                <span className={s.usdNoRatesText}>Chưa có tỉ giá — không thể quy đổi về USD.</span>
                {canConfig ? (
                  <button className={s.usdRefreshBtn} onClick={handleRefreshRates} disabled={ratesRefreshing}>
                    {ratesRefreshing ? 'Đang lấy...' : 'Cập nhật tỉ giá'}
                  </button>
                ) : (
                  <span className={s.usdNoRatesMeta}>Liên hệ admin để cập nhật trong Cài đặt.</span>
                )}
              </div>
            ) : (
              <>
                <div className={s.usdTitle}>
                  Tổng quy đổi (USD)
                  {ratesUpdatedAt && (
                    <span className={s.usdMeta}>· tỉ giá {new Date(ratesUpdatedAt).toLocaleDateString('vi-VN')}</span>
                  )}
                  {usdTotal.missing.length > 0 && (
                    <span className={s.usdWarn}>· {usdTotal.missing.join(', ')} chưa có tỉ giá</span>
                  )}
                </div>
                <div className={s.usdStats}>
                  <div className={s.usdStat}>
                    <span className={s.usdLabel}>Tiền vào</span>
                    <span className={`${s.usdValue} ${s.credit}`}>${fmtAmount(usdTotal.credit)}</span>
                  </div>
                  <div className={s.usdDivider} />
                  <div className={s.usdStat}>
                    <span className={s.usdLabel}>Tiền ra</span>
                    <span className={`${s.usdValue} ${s.debit}`}>${fmtAmount(usdTotal.debit)}</span>
                  </div>
                  <div className={s.usdDivider} />
                  <div className={s.usdStat}>
                    <span className={s.usdLabel}>Net</span>
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
                  <Bar dataKey="credit" name="Tiền vào" fill="#059669" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="debit"  name="Tiền ra"  fill="#f59e0b" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* ── Flat account table ── */}
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th className={s.th}>Tài khoản</th>
                  <th className={s.th}>Code</th>
                  <th className={s.th}>Tiền tệ</th>
                  <th className={`${s.th} ${s.thRight}`}>Giao dịch</th>
                  <th className={`${s.th} ${s.thRight}`}>Tiền vào</th>
                  <th className={`${s.th} ${s.thRight}`}>Tiền ra</th>
                  <th className={`${s.th} ${s.thRight}`}>Net</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map(row => {
                  const net    = row.totalCredit - row.totalDebit;
                  const netUsd = row.creditUsd !== null ? row.creditUsd - (row.debitUsd ?? 0) : null;
                  const showUsd = row.creditUsd !== null && row.currency !== 'USD';
                  return (
                    <tr key={`${row.accountId}__${row.currency}`} className={s.tr}>
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
                        <span className={s.credit}>{fmtAmount(row.totalCredit)}</span>
                        {showUsd && <div className={s.usdHint}>≈ ${fmtAmount(row.creditUsd!)}</div>}
                      </td>
                      <td className={`${s.td} ${s.tdRight}`}>
                        <span>{fmtAmount(row.totalDebit)}</span>
                        {showUsd && <div className={s.usdHint}>≈ ${fmtAmount(row.debitUsd!)}</div>}
                      </td>
                      <td className={`${s.td} ${s.tdRight}`}>
                        <span style={{ color: net >= 0 ? '#059669' : '#df1b41' }}>
                          {net >= 0 ? '+' : ''}{fmtAmount(net)}
                        </span>
                        {showUsd && netUsd !== null && (
                          <div className={s.usdHint} style={{ color: netUsd >= 0 ? '#059669' : '#df1b41' }}>
                            {netUsd >= 0 ? '+' : ''}${fmtAmount(Math.abs(netUsd))}
                          </div>
                        )}
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
    </div>
  );
}
