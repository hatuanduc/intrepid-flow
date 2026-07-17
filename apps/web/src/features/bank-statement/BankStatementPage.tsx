'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  listBankJobs, triggerBankSync, retryBankJob, deleteBankJob, getBankSettings,
  type BankSyncJob, type JobStats,
} from '../../lib/api';
import { useHasPermission } from '../../hooks/useHasPermission';
import AccessDenied from '../../components/common/AccessDenied';
import PageLoader from '../../components/common/PageLoader';
import { useToast } from '../../components/common/Toast';
import { useT } from '../../lib/i18n';
import s from './BankStatementPage.module.css';

// ─── Status helpers ───────────────────────────────────────────────────────────

type StatusFilter = 'all' | 'completed' | 'failed' | 'running' | 'cancelled';

function statusGroup(status: string): Exclude<StatusFilter, 'all'> {
  if (status === 'completed') return 'completed';
  if (status === 'failed') return 'failed';
  if (status === 'cancelled') return 'cancelled';
  return 'running'; // pending, waiting_2fa, checking_session, logging_in, authenticated, discovering_accounts, downloading, storing, syncing_sheets
}

function StatusBadge({ status }: { status: string }) {
  const { t } = useT();
  const cls = status === 'completed' ? s.badgeSuccess
    : status === 'failed'           ? s.badgeError
    : status === 'waiting_2fa'      ? s.badgeWarn
    : status === 'pending'          ? s.badgeDefault
    : ['checking_session', 'logging_in', 'authenticated',
       'downloading', 'storing', 'syncing_sheets'].includes(status) ? s.badgeRunning
    : s.badgeDefault;
  const label = t(`bankStatement.status_${status}`);
  return <span className={`${s.badge} ${cls}`}>{label !== `bankStatement.status_${status}` ? label : status}</span>;
}

function formatDuration(ms: number | null): string {
  if (ms == null) return '—';
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const totalMin = Math.floor(totalSec / 60);
  if (totalMin < 60) return `${totalMin}m ${totalSec % 60}s`;
  const totalHour = Math.floor(totalMin / 60);
  if (totalHour < 24) return `${totalHour}h ${totalMin % 60}m`;
  const days = Math.floor(totalHour / 24);
  return `${days}d ${totalHour % 24}h`;
}

// Compact linear meter for the table column — a single ratio against a limit,
// not part-to-whole, so one accent hue on a lighter same-ramp track (not the
// multi-status stacked bar used on the job detail page).
function SyncMeter({ stats }: { stats: JobStats | null }) {
  if (!stats || stats.totalAccounts === 0) return <span className={s.meterEmpty}>—</span>;
  const pct = Math.round((stats.synced / stats.totalAccounts) * 100);
  return (
    <div className={s.meterWrap} title={`${stats.synced}/${stats.totalAccounts} synced to Sheets`}>
      <div className={s.meterTrack}>
        <div className={s.meterFill} style={{ width: `${pct}%` }} />
      </div>
      <span className={s.meterLabel}>{stats.synced}/{stats.totalAccounts}</span>
    </div>
  );
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const dd   = String(d.getDate()).padStart(2, '0');
  const mm   = String(d.getMonth() + 1).padStart(2, '0');
  const hh   = String(d.getHours()).padStart(2, '0');
  const min  = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()} ${hh}:${min}`;
}

/* ── Confirm delete modal ── */
function ConfirmDeleteModal({
  job, deleting, error, onConfirm, onCancel,
}: {
  job: BankSyncJob;
  deleting: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useT();
  return (
    <div className={s.modalOverlay} onClick={onCancel}>
      <div className={s.modal} onClick={e => e.stopPropagation()}>
        <p className={s.modalTitle}>{t('bankStatement.confirmDeleteTitle')}</p>
        <p className={s.modalDesc}>
          {t('bankStatement.confirmDeleteDesc', { time: formatDateTime(job.createdAt) })}
        </p>
        {error && <div className={s.modalError}>{error}</div>}
        <div className={s.modalActions}>
          <button className={s.btnSecondary} onClick={onCancel} disabled={deleting}>{t('common.cancel')}</button>
          <button className={s.btnDanger} onClick={onConfirm} disabled={deleting}>
            {deleting ? t('bankStatement.deleting') : t('common.delete')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function BankStatementPage() {
  const canView    = useHasPermission('bank_statement:view');
  const canRun     = useHasPermission('bank_statement:run');
  const toast      = useToast();
  const router     = useRouter();
  const { t }      = useT();

  const [jobs, setJobs] = useState<BankSyncJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [missingConfig, setMissingConfig] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BankSyncJob | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const menuRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [fetched, settings] = await Promise.all([listBankJobs(), getBankSettings()]);
      setJobs(fetched);
      setMissingConfig(!settings.hsbcnetUsername);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Deferred a tick so load()'s internal setState isn't synchronous with the effect itself.
    if (canView) Promise.resolve().then(() => load());
  }, [canView, load]);

  // Close more-menu on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpenMenu(null);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (!canView) return <AccessDenied />;

  async function trigger() {
    setTriggering(true);
    try {
      const job = await triggerBankSync();
      router.push('/bank-statement/jobs/' + job.id);
    } catch {
      toast.error(t('bankStatement.triggerFailed'));
      setTriggering(false);
    }
  }

  async function handleRetry(id: string, stepKey?: 'bank_sync' | 'sheets_sync') {
    setRetryingId(id);
    setOpenMenu(null);
    try {
      const updated = await retryBankJob(id, stepKey);
      router.push('/bank-statement/jobs/' + updated.id);
    } catch {
      toast.error(t('bankStatement.retryFailed'));
    } finally {
      setRetryingId(null);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    setDeletingId(id);
    setDeleteError(null);
    try {
      await deleteBankJob(id);
      setJobs(prev => prev.filter(j => j.id !== id));
      setDeleteTarget(null);
      toast.success(t('bankStatement.deleteSuccess'));
    } catch {
      setDeleteError(t('bankStatement.deleteFailed'));
    } finally {
      setDeletingId(null);
    }
  }

  const chips: Array<{ key: StatusFilter; label: string; count: number }> = [
    { key: 'all',       label: t('bankStatement.filterAll'),       count: jobs.length },
    { key: 'completed', label: t('bankStatement.filterCompleted'), count: jobs.filter(j => statusGroup(j.status) === 'completed').length },
    { key: 'failed',    label: t('bankStatement.filterFailed'),    count: jobs.filter(j => statusGroup(j.status) === 'failed').length },
    { key: 'running',   label: t('bankStatement.filterRunning'),   count: jobs.filter(j => statusGroup(j.status) === 'running').length },
    { key: 'cancelled', label: t('bankStatement.filterCancelled'), count: jobs.filter(j => statusGroup(j.status) === 'cancelled').length },
  ];
  const filteredJobs = filter === 'all' ? jobs : jobs.filter(j => statusGroup(j.status) === filter);

  return (
    <div className={s.page}>
      {loading ? <PageLoader /> : (
        <>
          <div className={s.pageHeader}>
            <div>
              <h1 className={s.pageTitle}>{t('bankStatement.title')}</h1>
              {jobs[0] && (
                <div className={s.pageSubtitle}>
                  {t('bankStatement.lastRun')}: {formatDateTime(jobs[0].createdAt)} · <StatusBadge status={jobs[0].status} />
                  <SyncMeter stats={jobs[0].stats} />
                </div>
              )}
            </div>
            {canRun && (
              <button className={s.btnPrimary} onClick={trigger} disabled={triggering || missingConfig} title={missingConfig ? t('bankStatement.missingConfig') : undefined}>
                {triggering ? t('bankStatement.triggering') : t('bankStatement.runSync')}
              </button>
            )}
          </div>

          {missingConfig && (
            <div className={s.setupBanner}>
              <span className={s.setupBannerIcon}>⚠</span>
              <span>{t('bankStatement.missingConfig')}</span>
              <Link href="/settings/job/bank-statement" className={s.setupBannerLink}>{t('bankStatement.goToSettings')}</Link>
            </div>
          )}

          {jobs.length === 0 ? (
            <div className={s.empty}>{t('bankStatement.noJobs')}</div>
          ) : (
            <>
            <div className={s.chips}>
              {chips.map(c => (
                <button
                  key={c.key}
                  className={`${s.chip} ${filter === c.key ? s.chipSelected : ''}`}
                  onClick={() => setFilter(c.key)}
                >
                  <span className={s.chipLabel}>{c.label}</span>
                  <span className={s.chipCount}>{c.count}</span>
                </button>
              ))}
            </div>
            {filteredJobs.length === 0 ? (
              <div className={s.empty}>{t('bankStatement.noJobsFiltered')}</div>
            ) : (
            <div className={s.tableWrap}>
              <table className={s.table}>
                <thead>
                  <tr>
                    <th className={s.th}>{t('bankStatement.time')}</th>
                    <th className={s.th}>{t('bankStatement.triggeredBy')}</th>
                    <th className={s.th}>{t('bankStatement.status')}</th>
                    <th className={s.th}>{t('bankStatement.syncProgress')}</th>
                    <th className={s.th}>{t('bankStatement.duration')}</th>
                    <th className={s.th} style={{ width: 40 }} />
                  </tr>
                </thead>
                <tbody>
                  {filteredJobs.map(job => {
                    const isDone = ['completed', 'failed'].includes(job.status);
                    return (
                    <tr key={job.id} onClick={() => router.push('/bank-statement/jobs/' + job.id)}>
                      <td className={s.td}>{formatDateTime(job.createdAt)}</td>
                      <td className={s.td}>
                        <span className={s.triggerLabel}>
                          {job.triggeredBy === 'cron' ? t('bankStatement.schedule') : job.triggeredByName ?? t('bankStatement.manual')}
                        </span>
                      </td>
                      <td className={s.td}>
                        <StatusBadge status={job.status} />
                      </td>
                      <td className={s.td}><SyncMeter stats={job.stats} /></td>
                      <td className={s.td}>{formatDuration(job.durationMs)}</td>
                      <td className={s.td} onClick={e => e.stopPropagation()}>
                        {isDone && canRun && (
                          <div className={s.moreWrap} ref={openMenu === job.id ? menuRef : null}>
                            <button
                              className={`${s.moreBtn} ${openMenu === job.id ? s.moreBtnOpen : ''}`}
                              onClick={e => { e.stopPropagation(); setOpenMenu(openMenu === job.id ? null : job.id); }}
                            >⋯</button>
                            {openMenu === job.id && (
                              <div className={s.moreDropdown}>
                                {['failed', 'completed'].includes(job.status) && (
                                  <button
                                    className={s.moreItem}
                                    disabled={retryingId === job.id}
                                    onClick={() => handleRetry(job.id)}
                                  >
                                    {retryingId === job.id ? t('bankStatement.retrying') : t('bankStatement.retry')}
                                  </button>
                                )}
                                <button
                                  className={`${s.moreItem} ${s.moreItemDanger}`}
                                  onClick={() => { setOpenMenu(null); setDeleteError(null); setDeleteTarget(job); }}
                                >
                                  {t('common.delete')}
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
            )}
            </>
          )}
        </>
      )}

      {deleteTarget && (
        <ConfirmDeleteModal
          job={deleteTarget}
          deleting={deletingId === deleteTarget.id}
          error={deleteError}
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
