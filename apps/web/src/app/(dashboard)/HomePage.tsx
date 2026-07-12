'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { listBankAccounts, listBankJobs, type BankAccount, type BankSyncJob } from '../../lib/api';
import { useHasPermission } from '../../hooks/useHasPermission';
import { useT } from '../../lib/i18n';
import { BankIcon, BankMetricsIcon } from '../../components/layout/nav-items';
import s from './HomePage.module.css';

const COLOR_COMPLETED = '#059669';
const COLOR_FAILED = '#df1b41';

function StatusBadge({ status, t }: { status: string; t: (key: string) => string }) {
  const cls = status === 'completed' ? s.badgeSuccess
    : status === 'failed'           ? s.badgeError
    : status === 'waiting_2fa'      ? s.badgeWarn
    : status === 'pending'          ? s.badgeDefault
    : ['checking_session', 'logging_in', 'authenticated',
       'downloading', 'storing', 'syncing_sheets'].includes(status) ? s.badgeRunning
    : s.badgeDefault;
  const key = `bankStatement.status_${status}`;
  const label = t(key);
  return <span className={`${s.badge} ${cls}`}>{label !== key ? label : status}</span>;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()} ${hh}:${min}`;
}

function dateKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function last7Days(): Array<{ key: string; label: string }> {
  const now = new Date();
  const days: Array<{ key: string; label: string }> = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    days.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
      label: `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`,
    });
  }
  return days;
}

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

function ChartTooltip({ active, payload, label, t }: {
  active?: boolean;
  payload?: Array<{ dataKey: string; value: number; color: string }>;
  label?: string;
  t: (key: string) => string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className={s.chartTooltip}>
      <div className={s.chartTooltipLabel}>{label}</div>
      {payload.map(item => (
        <div key={item.dataKey} className={s.chartTooltipRow}>
          <span className={s.chartTooltipKey} style={{ background: item.color }} />
          <span>{t(`bankStatement.status_${item.dataKey}`)}</span>
          <strong>{item.value}</strong>
        </div>
      ))}
    </div>
  );
}

export default function HomePage() {
  const { t, lang } = useT();
  const canViewBankStatement = useHasPermission('bank_statement:view');

  const now = new Date();
  const dateStr = now.toLocaleDateString(lang === 'vi' ? 'vi-VN' : 'en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const [jobs, setJobs] = useState<BankSyncJob[]>([]);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loadingStats, setLoadingStats] = useState(true);

  const load = useCallback(async () => {
    setLoadingStats(true);
    try {
      const [j, a] = await Promise.all([listBankJobs(), listBankAccounts()]);
      setJobs(j);
      setAccounts(a);
    } finally {
      setLoadingStats(false);
    }
  }, []);

  useEffect(() => {
    if (canViewBankStatement) Promise.resolve().then(() => load());
    else Promise.resolve().then(() => setLoadingStats(false));
  }, [canViewBankStatement, load]);

  const jobsToday = jobs.filter(j => isToday(j.createdAt)).length;
  const failedJobs = jobs.filter(j => j.status === 'failed').length;
  const recentJobs = jobs.slice(0, 5);

  const chartData = useMemo(() => {
    return last7Days().map(({ key, label }) => {
      const dayJobs = jobs.filter(j => dateKey(j.createdAt) === key);
      return {
        label,
        completed: dayJobs.filter(j => j.status === 'completed').length,
        failed: dayJobs.filter(j => j.status === 'failed').length,
      };
    });
  }, [jobs]);

  return (
    <div className={s.page}>
      <div className={s.header}>
        <h1 className={s.greeting}>{t('nav.overview')}</h1>
        <p className={s.date}>{dateStr}</p>
      </div>

      {canViewBankStatement && !loadingStats && (
        <>
          <div className={s.statsGrid}>
            <div className={s.statCard}>
              <span className={s.statValue}>{jobsToday}</span>
              <span className={s.statLabel}>{t('home.statsJobsToday')}</span>
            </div>
            <div className={s.statCard}>
              <span className={s.statValue}>{failedJobs}</span>
              <span className={s.statLabel}>{t('home.statsFailedJobs')}</span>
            </div>
            <div className={s.statCard}>
              <span className={s.statValue}>{accounts.length}</span>
              <span className={s.statLabel}>{t('home.statsAccounts')}</span>
            </div>
          </div>

          <div className={s.section}>
            <div className={s.sectionHead}>
              <span className={s.sectionTitle}>{t('home.jobsChartTitle')}</span>
            </div>
            <div className={s.chartCard}>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={chartData} barGap={4} barCategoryGap="30%">
                  <CartesianGrid vertical={false} stroke="var(--color-border-light)" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: 'var(--color-muted)' }}
                    axisLine={{ stroke: 'var(--color-border)' }}
                    tickLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    width={24}
                    tick={{ fontSize: 11, fill: 'var(--color-muted)' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<ChartTooltip t={t} />} cursor={{ fill: 'var(--bg-hover)' }} />
                  <Legend
                    formatter={value => <span className={s.chartLegendLabel}>{t(`bankStatement.status_${value}`)}</span>}
                    iconType="circle"
                    iconSize={8}
                  />
                  <Bar dataKey="completed" fill={COLOR_COMPLETED} radius={[4, 4, 0, 0]} maxBarSize={14} />
                  <Bar dataKey="failed" fill={COLOR_FAILED} radius={[4, 4, 0, 0]} maxBarSize={14} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className={s.section}>
            <div className={s.sectionHead}>
              <span className={s.sectionTitle}>{t('home.recentActivity')}</span>
              <Link href="/bank-statement" className={s.sectionLink}>{t('home.viewAll')}</Link>
            </div>
            {recentJobs.length === 0 ? (
              <div className={s.empty}>{t('home.noActivity')}</div>
            ) : (
              <div className={s.activityList}>
                {recentJobs.map(job => (
                  <Link key={job.id} href={`/bank-statement/jobs/${job.id}`} className={s.activityRow}>
                    <span className={s.activityTime}>{formatDateTime(job.createdAt)}</span>
                    <StatusBadge status={job.status} t={t} />
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className={s.quickGrid}>
            <Link href="/bank-statement" className={s.quickCard}>
              <span className={s.quickIcon}>{BankIcon}</span>
              <span className={s.quickTitle}>{t('home.featureBankStatementTitle')}</span>
              <span className={s.quickDesc}>{t('home.featureBankStatementDesc')}</span>
            </Link>

            <Link href="/bank-metrics" className={s.quickCard}>
              <span className={s.quickIcon}>{BankMetricsIcon}</span>
              <span className={s.quickTitle}>{t('home.featureBankMetricsTitle')}</span>
              <span className={s.quickDesc}>{t('home.featureBankMetricsDesc')}</span>
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
