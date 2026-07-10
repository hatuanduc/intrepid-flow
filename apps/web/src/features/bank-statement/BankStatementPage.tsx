'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  listBankJobs, triggerBankSync, retryBankJob, deleteBankJob, getBankSettings,
  type BankSyncJob,
} from '../../lib/api';
import { useHasPermission } from '../../hooks/useHasPermission';
import AccessDenied from '../../components/common/AccessDenied';
import PageLoader from '../../components/common/PageLoader';
import { useToast } from '../../components/common/Toast';
import { useT } from '../../lib/i18n';
import s from './BankStatementPage.module.css';

// ─── Status helpers ───────────────────────────────────────────────────────────

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

function isActive(status: string) {
  return !['completed', 'failed'].includes(status);
}

function formatDuration(ms: number | null): string {
  if (ms == null) return '—';
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
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
  const [openMenu, setOpenMenu] = useState<string | null>(null);
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

  useEffect(() => { if (canView) load(); }, [canView, load]);

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
    } finally {
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

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await deleteBankJob(id);
      setJobs(prev => prev.filter(j => j.id !== id));
    } catch {
      toast.error(t('bankStatement.deleteFailed'));
    } finally {
      setDeletingId(null);
      setOpenMenu(null);
    }
  }

  return (
    <div className={s.page}>
      {loading ? <PageLoader /> : (
        <>
          <div className={s.pageHeader}>
            <div>
              <h1 className={s.pageTitle}>{t('bankStatement.title')}</h1>
              {jobs[0] && (
                <p className={s.pageSubtitle}>
                  {t('bankStatement.lastRun')}: {formatDateTime(jobs[0].createdAt)} · <StatusBadge status={jobs[0].status} />
                </p>
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
              <Link href="/bank-statement/settings" className={s.setupBannerLink}>{t('bankStatement.goToSettings')}</Link>
            </div>
          )}

          {jobs.length === 0 ? (
            <div className={s.empty}>{t('bankStatement.noJobs')}</div>
          ) : (
            <div className={s.tableWrap}>
              <table className={s.table}>
                <thead>
                  <tr>
                    <th className={s.th}>{t('bankStatement.time')}</th>
                    <th className={s.th}>{t('bankStatement.triggeredBy')}</th>
                    <th className={s.th}>{t('bankStatement.status')}</th>
                    <th className={s.th}>{t('bankStatement.duration')}</th>
                    <th className={s.th} style={{ width: 40 }} />
                  </tr>
                </thead>
                <tbody>
                  {jobs.map(job => {
                    const isDone = ['completed', 'failed'].includes(job.status);
                    return (
                    <tr key={job.id} onClick={() => router.push('/bank-statement/jobs/' + job.id)}>
                      <td className={s.td}>{formatDateTime(job.createdAt)}</td>
                      <td className={s.td}>
                        <span className={s.triggerLabel}>
                          {job.triggeredBy ? t('bankStatement.manual') : t('bankStatement.automatic')}
                        </span>
                      </td>
                      <td className={s.td}><StatusBadge status={job.status} /></td>
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
                                  disabled={deletingId === job.id}
                                  onClick={() => handleDelete(job.id)}
                                >
                                  {deletingId === job.id ? t('bankStatement.deleting') : t('common.delete')}
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
    </div>
  );
}
