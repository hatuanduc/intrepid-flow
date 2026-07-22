'use client';

import { useEffect, useState } from 'react';
import { getArData, type ArData, type ArDetailRow } from '../../lib/api';
import { useHasPermission } from '../../hooks/useHasPermission';
import AccessDenied from '../../components/common/AccessDenied';
import { Spinner } from '../../components/common/PageLoader';
import { useT } from '../../lib/i18n';
import s from './ReportArPage.module.css';

type Tab = 'summary' | 'unbilled' | 'overdue';
type T = ReturnType<typeof useT>['t'];

function formatUSD(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}K`;
  return `$${Math.round(n).toLocaleString()}`;
}

export default function ReportArPage() {
  const { t } = useT();
  const canView   = useHasPermission('report_ar:view');
  const [tab, setTab] = useState<Tab>('summary');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ArData | null>(null);
  const [country] = useState('TH');
  const [bizClass, setBizClass] = useState<string | undefined>(undefined);
  const [allBizClasses, setAllBizClasses] = useState<string[]>([]);

  async function load(bc?: string) {
    setLoading(true);
    setError(null);
    try {
      const d = await getArData(country, bc);
      setData(d);
      if (!bc) setAllBizClasses(d.bizClasses); // only update full list when unfiltered
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      if (code === 'GSHEET_CONFIG_NOT_FOUND') {
        setError(t('reportAr.errConfigNotFound'));
      } else if (code === 'SERVICE_KEY_NOT_CONFIGURED') {
        setError(t('reportAr.errServiceKeyNotConfigured'));
      } else if (code === 'SHEETS_READ_FAILED') {
        setError(t('reportAr.errSheetsReadFailed'));
      } else {
        setError(t('reportAr.errDefault'));
      }
    } finally {
      setLoading(false);
    }
  }

  function selectBizClass(bc: string | undefined) {
    setBizClass(bc);
    load(bc);
  }

  useEffect(() => {
    // Deferred a tick so load()'s internal setState isn't synchronous with the effect itself.
    if (canView) Promise.resolve().then(() => load());
  }, [canView]);

  if (!canView) return <AccessDenied />;

  return (
    <div className={s.page}>
      <div className={s.pageHeader}>
        <div className={s.pageTitleRow}>
          <h1 className={s.pageTitle}>{t('reportAr.title')}</h1>
          <span className={s.countryChip}>{country}</span>
        </div>
        <div className={s.headerActions}>
          <button className={s.refreshBtn} onClick={() => load(bizClass)} disabled={loading}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{flexShrink: 0}}>
              <path d="M1 4v6h6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M3.51 15a9 9 0 1 0 .49-5.5L1 10" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            {loading ? t('reportAr.refreshing') : t('reportAr.refresh')}
          </button>
          {canView && (
            <a href="/settings/job/report-ar" className={s.settingsLink}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M5.8 1.5h2.4l.4 1.6a5 5 0 011.1.65l1.55-.55 1.2 2.08-1.2 1.06a5 5 0 010 1.28l1.2 1.06-1.2 2.08-1.55-.55a5 5 0 01-1.1.65l-.4 1.62H5.8l-.4-1.62a5 5 0 01-1.1-.65l-1.55.55L1.55 8.7l1.2-1.06a5 5 0 010-1.28L1.55 5.3l1.2-2.08 1.55.55a5 5 0 011.1-.65L5.8 1.5z" stroke="currentColor" strokeWidth="1.2"/>
                <circle cx="7" cy="7" r="1.5" stroke="currentColor" strokeWidth="1.2"/>
              </svg>
              {t('reportAr.settings')}
            </a>
          )}
        </div>
      </div>

      {error && (
        <div className={s.errorBox}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="7" stroke="#df1b41" strokeWidth="1.3"/>
            <path d="M8 5v3.5M8 10.5v.5" stroke="#df1b41" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          {error}
        </div>
      )}

      {loading && !data && (
        <div className={s.loadingCenter}><Spinner size={28} /></div>
      )}

      {data && (
        <>
          {/* BizClass filter */}
          {allBizClasses.length > 0 && (
            <div className={s.bizFilter}>
              <span className={s.bizFilterLabel}>{t('reportAr.bizClassLabel')}</span>
              <div className={s.bizChips}>
                <button
                  className={`${s.bizChip} ${!bizClass ? s.bizChipActive : ''}`}
                  onClick={() => selectBizClass(undefined)}
                >{t('reportAr.bizClassAll')}</button>
                {allBizClasses.map(bc => (
                  <button
                    key={bc}
                    className={`${s.bizChip} ${bizClass === bc ? s.bizChipActive : ''}`}
                    onClick={() => selectBizClass(bc)}
                  >{bc}</button>
                ))}
              </div>
            </div>
          )}

          {/* Summary Cards */}
          <div className={s.summaryCards}>
            <SummaryCard label={t('reportAr.totalAr')} value={formatUSD(data.summary.totalAR)} accent t={t} />
            <SummaryCard label={t('reportAr.unbilled')} value={formatUSD(data.summary.unbilled)} pct={data.summary.totalAR > 0 ? (data.summary.unbilled / data.summary.totalAR * 100) : 0} color="orange" onClick={() => setTab('unbilled')} t={t} />
            <SummaryCard label={t('reportAr.overdue')} value={formatUSD(data.summary.overdue)} pct={data.summary.totalAR > 0 ? (data.summary.overdue / data.summary.totalAR * 100) : 0} color="red" onClick={() => setTab('overdue')} t={t} />
            <SummaryCard label={t('reportAr.underTerm')} value={formatUSD(data.summary.underTerm)} pct={data.summary.totalAR > 0 ? (data.summary.underTerm / data.summary.totalAR * 100) : 0} color="blue" t={t} />
          </div>

          {/* Tabs */}
          <div className={s.tabs}>
            <button className={`${s.tab} ${tab === 'summary' ? s.tabActive : ''}`} onClick={() => setTab('summary')}>
              {t('reportAr.tabByBrand')}
            </button>
            <button className={`${s.tab} ${tab === 'unbilled' ? s.tabActive : ''}`} onClick={() => setTab('unbilled')}>
              {t('reportAr.tabUnbilled')}
              {data.unbilledRows.length > 0 && <span className={s.tabCount}>{data.unbilledRows.length}</span>}
            </button>
            <button className={`${s.tab} ${tab === 'overdue' ? s.tabActive : ''}`} onClick={() => setTab('overdue')}>
              {t('reportAr.tabOverdue')}
              {data.overdueRows.length > 0 && <span className={`${s.tabCount} ${s.tabCountRed}`}>{data.overdueRows.length}</span>}
            </button>
          </div>

          {tab === 'summary' && <BrandTab rows={data.byBrand} t={t} />}
          {tab === 'unbilled' && <DetailTab rows={data.unbilledRows} emptyMsg={t('reportAr.emptyUnbilled')} t={t} />}
          {tab === 'overdue' && <DetailTab rows={data.overdueRows} emptyMsg={t('reportAr.emptyOverdue')} t={t} />}
        </>
      )}
    </div>
  );
}

// ─── Summary Card ─────────────────────────────────────────────────────────────

function SummaryCard({ label, value, pct, accent, color, onClick, t }: {
  label: string;
  value: string;
  pct?: number;
  accent?: boolean;
  color?: 'orange' | 'red' | 'blue';
  onClick?: () => void;
  t: T;
}) {
  return (
    <div className={`${s.summaryCard} ${accent ? s.summaryCardAccent : ''} ${onClick ? s.summaryCardClickable : ''}`} onClick={onClick}>
      <div className={s.summaryLabelRow}>
        <div className={s.summaryLabel}>{label}</div>
        {onClick && (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className={s.summaryArrow}>
            <path d="M2 10L10 2M10 2H4M10 2v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </div>
      <div className={`${s.summaryValue} ${color === 'red' ? s.summaryValueRed : color === 'orange' ? s.summaryValueOrange : color === 'blue' ? s.summaryValueBlue : ''}`}>
        {value}
      </div>
      {pct !== undefined && (
        <div className={s.summaryPct}>{t('reportAr.pctOfAr', { pct: pct.toFixed(1) })}</div>
      )}
    </div>
  );
}

// ─── Brand Tab ────────────────────────────────────────────────────────────────

const SHOW_LIMIT = 15;

function BrandTab({ rows, t }: { rows: ArData['byBrand']; t: T }) {
  const [showAll, setShowAll] = useState(false);

  if (rows.length === 0) {
    return <div className={s.empty}>{t('reportAr.emptyByBrand')}</div>;
  }

  const maxLeadtime = Math.max(...rows.map(r => r.totalLeadtime), 1);
  const displayed = showAll ? rows : rows.slice(0, SHOW_LIMIT);

  return (
    <div className={s.brandTable}>
      <div className={s.brandHeader}>
        <span className={s.brandHeaderName}>{t('reportAr.brandHeaderName')}</span>
        <span className={s.brandHeaderBar}>{t('reportAr.brandHeaderBar')}</span>
        <span className={s.brandHeaderTotal}>{t('reportAr.brandHeaderTotal')}</span>
      </div>

      <div className={s.brandScroll}>
        {displayed.map(row => (
          <div key={row.brand} className={s.brandRow}>
            <span className={s.brandName}>{row.brand}</span>
            <div className={s.brandBarWrap}>
              <div className={s.brandBar}>
                {row.unbilledDays > 0 && (
                  <div
                    className={s.barSegment}
                    style={{ width: `${(row.unbilledDays / maxLeadtime) * 100}%`, background: '#ffc000' }}
                    title={t('reportAr.tooltipUnbilled', { n: Math.round(row.unbilledDays) })}
                  >
                    {row.unbilledDays >= maxLeadtime * 0.1 && <span className={s.barLabel}>{Math.round(row.unbilledDays)}</span>}
                  </div>
                )}
                {row.overdueDays > 0 && (
                  <div
                    className={s.barSegment}
                    style={{ width: `${(row.overdueDays / maxLeadtime) * 100}%`, background: '#e05252' }}
                    title={t('reportAr.tooltipOverdue', { n: Math.round(row.overdueDays) })}
                  >
                    {row.overdueDays >= maxLeadtime * 0.1 && <span className={s.barLabel}>{Math.round(row.overdueDays)}</span>}
                  </div>
                )}
                {row.underTermDays > 0 && (
                  <div
                    className={s.barSegment}
                    style={{ width: `${(row.underTermDays / maxLeadtime) * 100}%`, background: '#4472c4' }}
                    title={t('reportAr.tooltipUnderTerm', { n: Math.round(row.underTermDays) })}
                  >
                    {row.underTermDays >= maxLeadtime * 0.1 && <span className={s.barLabel}>{Math.round(row.underTermDays)}</span>}
                  </div>
                )}
              </div>
            </div>
            <span className={s.brandTotal}>{Math.round(row.totalLeadtime)}</span>
          </div>
        ))}
      </div>

      {rows.length > SHOW_LIMIT && (
        <button className={s.showMoreBtn} onClick={() => setShowAll(v => !v)}>
          {showAll ? t('reportAr.showLess') : t('reportAr.showMore', { n: rows.length - SHOW_LIMIT })}
        </button>
      )}

      <div className={s.legendBar}>
        <span className={s.legendItem}><span className={s.legendDot} style={{ background: '#ffc000' }} />{t('reportAr.legendUnbilled')}</span>
        <span className={s.legendItem}><span className={s.legendDot} style={{ background: '#e05252' }} />{t('reportAr.legendOverdue')}</span>
        <span className={s.legendItem}><span className={s.legendDot} style={{ background: '#4472c4' }} />{t('reportAr.legendUnderTerm')}</span>
      </div>
    </div>
  );
}

// ─── Detail Tab ───────────────────────────────────────────────────────────────

function DetailTab({ rows, emptyMsg, t }: { rows: ArDetailRow[]; emptyMsg: string; t: T }) {
  const [search, setSearch] = useState('');

  const filtered = search.trim()
    ? rows.filter(r =>
        r.brand.toLowerCase().includes(search.toLowerCase()) ||
        r.period.toLowerCase().includes(search.toLowerCase()) ||
        r.bizClass.toLowerCase().includes(search.toLowerCase())
      )
    : rows;

  if (rows.length === 0) {
    return <div className={s.empty}>{emptyMsg}</div>;
  }

  return (
    <div className={s.detailWrap}>
      <div className={s.filterBar}>
        <div className={s.searchWrap}>
          <svg className={s.searchIcon} width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.2"/>
            <path d="M9.5 9.5l2.5 2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
          </svg>
          <input
            className={s.searchInput}
            placeholder={t('reportAr.searchPlaceholder')}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button className={s.searchClear} onClick={() => setSearch('')}>✕</button>
          )}
        </div>
      </div>

      <div className={s.tableWrap}>
        <table className={s.table}>
          <thead>
            <tr>
              <th className={s.th}>{t('reportAr.colPeriod')}</th>
              <th className={s.th}>{t('reportAr.colBrand')}</th>
              <th className={s.th}>{t('reportAr.colBizClass')}</th>
              <th className={s.th} style={{ textAlign: 'right' }}>{t('reportAr.colAmount')}</th>
              <th className={s.th}>{t('reportAr.colStatus')}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td className={s.td} colSpan={5} style={{ textAlign: 'center', color: 'var(--color-subtle)' }}>
                  {t('reportAr.noResults')}
                </td>
              </tr>
            ) : filtered.map((row, i) => (
              <tr key={i}>
                <td className={s.td}><span className={s.periodCell}>{row.period}</span></td>
                <td className={s.td}><span className={s.brandCell}>{row.brand}</span></td>
                <td className={s.td}><span className={s.bizClass}>{row.bizClass}</span></td>
                <td className={s.td} style={{ textAlign: 'right' }}>
                  <span className={s.amountCell}>{formatUSD(row.amount)}</span>
                </td>
                <td className={s.td}><StatusBadge status={row.status} t={t} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatusBadge({ status, t }: { status: string; t: T }) {
  if (status.includes('over due')) return <span className={s.statusOverdue}>{t('reportAr.statusOverdue')}</span>;
  if (status.includes('credit term')) return <span className={s.statusUnderTerm}>{t('reportAr.statusUnderTerm')}</span>;
  if (status.includes('confirmation')) return <span className={s.statusPending}>{t('reportAr.statusPending')}</span>;
  return <span className={s.statusDefault}>{status}</span>;
}
