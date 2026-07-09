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
import s from './BankStatementPage.module.css';

// ─── Status helpers ───────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  pending:           'Chờ xử lý',
  checking_session:  'Kiểm tra phiên',
  logging_in:        'Đang đăng nhập',
  waiting_2fa:       'Chờ 2FA',
  authenticated:     'Đã xác thực',
  downloading:       'Đang tải',
  storing:           'Đang lưu',
  syncing_sheets:    'Sync GSheets',
  completed:         'Hoàn thành',
  failed:            'Thất bại',
};

function StatusBadge({ status }: { status: string }) {
  const cls = status === 'completed' ? s.badgeSuccess
    : status === 'failed'           ? s.badgeError
    : status === 'waiting_2fa'      ? s.badgeWarn
    : status === 'pending'          ? s.badgeDefault
    : ['checking_session', 'logging_in', 'authenticated',
       'downloading', 'storing', 'syncing_sheets'].includes(status) ? s.badgeRunning
    : s.badgeDefault;
  return <span className={`${s.badge} ${cls}`}>{STATUS_LABEL[status] ?? status}</span>;
}

function isActive(status: string) {
  return !['completed', 'failed'].includes(status);
}

function isRunning(status: string) {
  return !['completed', 'failed', 'pending'].includes(status);
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
      toast.error('Kích hoạt thất bại. Kiểm tra lại cấu hình.');
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
      toast.error('Chạy lại thất bại. Vui lòng thử lại.');
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
      toast.error('Xóa thất bại. Vui lòng thử lại.');
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
              <h1 className={s.pageTitle}>Sao kê ngân hàng</h1>
              {jobs[0] && (
                <p className={s.pageSubtitle}>
                  Lần cuối: {formatDateTime(jobs[0].createdAt)} · <StatusBadge status={jobs[0].status} />
                </p>
              )}
            </div>
            {canRun && (
              <button className={s.btnPrimary} onClick={trigger} disabled={triggering || missingConfig} title={missingConfig ? 'Cần cấu hình HSBC trước' : undefined}>
                {triggering ? 'Đang kích hoạt...' : '▶ Chạy đồng bộ'}
              </button>
            )}
          </div>

          {missingConfig && (
            <div className={s.setupBanner}>
              <span className={s.setupBannerIcon}>⚠</span>
              <span>Chưa cấu hình tài khoản HSBC. Vui lòng thiết lập trước khi chạy đồng bộ.</span>
              <Link href="/bank-statement/settings" className={s.setupBannerLink}>Vào Cài đặt →</Link>
            </div>
          )}

          {jobs.length === 0 ? (
            <div className={s.empty}>Chưa có job nào. Nhấn "Chạy đồng bộ" để bắt đầu.</div>
          ) : (
            <div className={s.tableWrap}>
              <table className={s.table}>
                <thead>
                  <tr>
                    <th className={s.th}>Thời gian</th>
                    <th className={s.th}>Kích hoạt bởi</th>
                    <th className={s.th}>Trạng thái</th>
                    <th className={s.th}>Thời lượng</th>
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
                          {job.triggeredBy ? 'Thủ công' : 'Tự động'}
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
                                    {retryingId === job.id ? 'Đang chạy...' : '↺ Chạy lại'}
                                  </button>
                                )}
                                <button
                                  className={`${s.moreItem} ${s.moreItemDanger}`}
                                  disabled={deletingId === job.id}
                                  onClick={() => handleDelete(job.id)}
                                >
                                  {deletingId === job.id ? 'Đang xóa...' : 'Xóa'}
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
