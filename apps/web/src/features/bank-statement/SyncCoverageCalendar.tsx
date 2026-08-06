'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getBankCoverage, triggerBankSync, type BankSyncCoverageDay, type BankSyncCoverageStatus } from '../../lib/api';
import { useHasPermission } from '../../hooks/useHasPermission';
import RightPanel from '../../components/common/RightPanel';
import { useToast } from '../../components/common/Toast';
import { useT } from '../../lib/i18n';
import s from './SyncCoverageCalendar.module.css';

const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']; // Monday-first

function pad(n: number) { return String(n).padStart(2, '0'); }
function toDateStr(d: Date) { return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; }

function dotClass(s2: typeof s, status: BankSyncCoverageStatus | undefined) {
  switch (status) {
    case 'synced': return s2.dotSynced;
    case 'fetched_not_synced': return s2.dotFetchedNotSynced;
    case 'partial': return s2.dotPartial;
    case 'not_fetched': return s2.dotNotFetched;
    case 'in_progress': return s2.dotInProgress;
    default: return '';
  }
}

export default function SyncCoverageCalendar() {
  const { t, lang } = useT();
  const toast = useToast();
  const router = useRouter();
  const canRun = useHasPermission('bank_statement:run');

  const [monthDate, setMonthDate] = useState(() => new Date());
  const [days, setDays] = useState<Map<string, BankSyncCoverageDay>>(new Map());
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<BankSyncCoverageDay | null>(null);
  const [triggering, setTriggering] = useState(false);

  const load = useCallback(async (base: Date) => {
    setLoading(true);
    try {
      const firstDay = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), 1));
      const lastDay = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0));
      const res = await getBankCoverage(toDateStr(firstDay), toDateStr(lastDay));
      setDays(new Map(res.days.map(d => [d.date, d])));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    Promise.resolve().then(() => load(monthDate));
  }, [monthDate, load]);

  const year = monthDate.getUTCFullYear();
  const month = monthDate.getUTCMonth();
  const firstOfMonth = new Date(Date.UTC(year, month, 1));
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const leadingBlank = (firstOfMonth.getUTCDay() + 6) % 7; // Sun=0 → Monday-first index

  const cells: Array<{ date: string; day: number } | null> = [];
  for (let i = 0; i < leadingBlank; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) cells.push({ date: `${year}-${pad(month + 1)}-${pad(day)}`, day });

  const todayStr = toDateStr(new Date());

  function prevMonth() { setMonthDate(new Date(Date.UTC(year, month - 1, 1))); }
  function nextMonth() { setMonthDate(new Date(Date.UTC(year, month + 1, 1))); }

  function openDay(dateStr: string) {
    const info = days.get(dateStr);
    if (!info || info.status === 'future') return;
    setSelected(info);
  }

  async function runForSelectedDay() {
    if (!selected) return;
    setTriggering(true);
    try {
      const job = await triggerBankSync({ dateFrom: selected.date, dateTo: selected.date });
      router.push('/bank-statement/jobs/' + job.id);
    } catch {
      toast.error(t('bankStatement.triggerFailed'));
      setTriggering(false);
    }
  }

  const monthLabel = new Intl.DateTimeFormat(lang === 'vi' ? 'vi-VN' : 'en-US', {
    month: 'long', year: 'numeric', timeZone: 'UTC',
  }).format(monthDate);

  return (
    <div className={s.wrap}>
      <div className={s.header}>
        <div className={s.headerLeft}>
          <span className={s.title}>{t('bankStatement.coverageTitle')}</span>
          <div className={s.legend}>
            <span className={s.legendItem}><span className={`${s.dot} ${s.dotSynced}`} />{t('bankStatement.coverageSynced')}</span>
            <span className={s.legendItem}><span className={`${s.dot} ${s.dotFetchedNotSynced}`} />{t('bankStatement.coverageFetchedNotSynced')}</span>
            <span className={s.legendItem}><span className={`${s.dot} ${s.dotPartial}`} />{t('bankStatement.coveragePartial')}</span>
            <span className={s.legendItem}><span className={`${s.dot} ${s.dotNotFetched}`} />{t('bankStatement.coverageNotFetched')}</span>
            <span className={s.legendItem}><span className={`${s.dot} ${s.dotInProgress}`} />{t('bankStatement.coverageInProgress')}</span>
          </div>
        </div>
        <div className={s.nav}>
          <button className={s.navBtn} onClick={prevMonth} aria-label="Previous month">‹</button>
          <span className={s.monthLabel}>{monthLabel}</span>
          <button className={s.navBtn} onClick={nextMonth} aria-label="Next month">›</button>
        </div>
      </div>

      <div className={s.grid}>
        {WEEKDAY_KEYS.map(k => <div key={k} className={s.weekday}>{t(`bankStatement.weekday_${k}`)}</div>)}
        {cells.map((cell, i) => {
          if (!cell) return <div key={`b${i}`} className={s.cellBlank} />;
          const info = days.get(cell.date);
          const isToday = cell.date === todayStr;
          const isFuture = info?.status === 'future';
          return (
            <button
              key={cell.date}
              className={`${s.cell} ${isFuture ? s.cellFutureCell : ''} ${isToday ? s.cellToday : ''}`}
              onClick={() => openDay(cell.date)}
              disabled={loading || !info || isFuture}
            >
              <span className={s.cellNum}>{cell.day}</span>
              {info && !isFuture && <span className={`${s.dot} ${dotClass(s, info.status)}`} />}
            </button>
          );
        })}
      </div>

      <RightPanel
        title={selected?.date ?? ''}
        open={!!selected}
        onClose={() => setSelected(null)}
        width={420}
        footer={selected && canRun ? (
          <button className={s.btnPrimary} onClick={runForSelectedDay} disabled={triggering}>
            {triggering ? t('bankStatement.triggering') : t('bankStatement.coverageRunForDay')}
          </button>
        ) : undefined}
      >
        {selected && (
          <div className={s.detail}>
            <div className={s.detailStatus}>{t(`bankStatement.coverageStatus_${selected.status}`)}</div>
            {selected.accounts.length === 0 ? (
              <div className={s.detailEmpty}>{t('bankStatement.coverageNoAccounts')}</div>
            ) : (
              <div className={s.accountList}>
                {selected.accounts.map(a => (
                  <div key={a.id} className={s.accountRow}>
                    <div className={s.accountInfo}>
                      <span className={s.accountNumber}>{a.accountNumber}</span>
                      <span className={s.accountName}>{a.accountName}</span>
                    </div>
                    <div className={s.accountFlags}>
                      <span className={a.downloaded ? s.flagOk : s.flagMissing}>
                        {a.downloaded ? '✓' : '✕'} {t('bankStatement.coverageFetched')}
                      </span>
                      <span className={a.synced ? s.flagOk : s.flagMissing}>
                        {a.synced ? '✓' : '✕'} {t('bankStatement.coverageSyncedLabel')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </RightPanel>
    </div>
  );
}
