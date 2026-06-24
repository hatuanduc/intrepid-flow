'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import {
  listBankJobs, triggerBankSync, deleteBankJob, getApiBaseUrl,
  type BankSyncJob,
} from '../../lib/api';
import { getToken } from '../../lib/auth';
import { useHasPermission } from '../../hooks/useHasPermission';
import AccessDenied from '../../components/common/AccessDenied';
import PageLoader from '../../components/common/PageLoader';
import RightPanel from '../../components/common/RightPanel';
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
  // SSE stays open while job isn't finished (including pending — watches for worker pickup)
  return !['completed', 'failed'].includes(status);
}

function isRunning(status: string) {
  // Actually executing (not just queued)
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

  const [jobs, setJobs] = useState<BankSyncJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<BankSyncJob | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const esRef = useRef<EventSource | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setJobs(await listBankJobs()); }
    finally { setLoading(false); }
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
      setJobs(prev => [job, ...prev]);
      openDetail(job);
    } catch {
      toast.error('Kích hoạt thất bại. Kiểm tra lại cấu hình.');
    } finally {
      setTriggering(false);
    }
  }

  function openDetail(job: BankSyncJob) {
    setSelectedJob(job);
    setPanelOpen(true);

    // Start SSE stream while job isn't finished (pending → watches for worker pickup)
    esRef.current?.close();
    if (isActive(job.status)) {
      const base  = getApiBaseUrl();
      const token = getToken();
      const es = new EventSource(`${base}/management/bank-statement/jobs/${job.id}/stream?token=${token}`);
      es.onmessage = (e) => {
        const data: BankSyncJob = JSON.parse(e.data);
        setSelectedJob(data);
        setJobs(prev => prev.map(j => j.id === data.id ? data : j));
        if (!isActive(data.status)) es.close();
      };
      es.onerror = () => es.close();
      esRef.current = es;
    }
  }

  function closePanel() {
    esRef.current?.close();
    esRef.current = null;
    setPanelOpen(false);
    setSelectedJob(null);
    load();
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await deleteBankJob(id);
      setJobs(prev => prev.filter(j => j.id !== id));
      if (selectedJob?.id === id) closePanel();
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
              <button className={s.btnPrimary} onClick={trigger} disabled={triggering}>
                {triggering ? 'Đang kích hoạt...' : '▶ Chạy đồng bộ'}
              </button>
            )}
          </div>

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
                    <tr key={job.id} onClick={() => openDetail(job)}>
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

      <JobDetailPanel
        job={selectedJob}
        open={panelOpen}
        onClose={closePanel}
        onRetry={canRun ? trigger : undefined}
        retrying={triggering}
      />
    </div>
  );
}

// ─── Job detail panel ─────────────────────────────────────────────────────────

const FRIENDLY_ERRORS: Array<[RegExp, string]> = [
  [/INVALID_USERNAME/i,           'Tên đăng nhập HSBCnet không đúng. Vui lòng kiểm tra lại trong Cài đặt → Kết nối.'],
  [/HSBCNET_USERNAME.*not configured/i, 'Chưa cấu hình tên đăng nhập HSBCnet. Vào Cài đặt → Kết nối để cập nhật.'],
  [/TIMEOUT_2FA/i,                'Hết thời gian chờ xác thực — không nhận được phê duyệt từ ứng dụng di động HSBCnet.'],
  [/Timeout.*exceeded/i,          'Hết thời gian chờ — trang web ngân hàng phản hồi quá chậm hoặc không tải được đúng hạn.'],
  [/page\.(fill|click|goto)/i,    'Không tương tác được với trang web ngân hàng — giao diện có thể đã thay đổi.'],
  [/locator\(/i,                  'Không tìm thấy phần tử trên trang — giao diện ngân hàng có thể đã cập nhật.'],
  [/net::ERR_/i,                  'Lỗi kết nối mạng — không thể truy cập trang web ngân hàng.'],
  [/2fa|mobile.*app|approval/i,   'Xác thực 2 bước thất bại hoặc hết thời gian chờ phê duyệt trên ứng dụng di động.'],
  [/download|csv|xlsx/i,          'Lỗi tải xuống file sao kê — trang web ngân hàng không trả về đúng định dạng.'],
];

function friendlyError(raw: string | null): string {
  if (!raw) return 'Đồng bộ thất bại. Vui lòng kiểm tra cài đặt và thử lại.';
  for (const [pattern, msg] of FRIENDLY_ERRORS) {
    if (pattern.test(raw)) return msg;
  }
  return 'Đồng bộ thất bại. Vui lòng kiểm tra log chi tiết và thử lại.';
}

function TimelineIcon({ msg, isError }: { msg: string; isError?: boolean }) {
  if (isError) {
    return (
      <span className={`${s.timelineIcon} ${s.timelineIconError}`}>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
        </svg>
      </span>
    );
  }
  const lower = msg.toLowerCase();
  if (/hoàn thành|thành công|completed/.test(lower)) {
    return (
      <span className={`${s.timelineIcon} ${s.timelineIconOk}`}>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </span>
    );
  }
  if (/chờ|pending|waiting/.test(lower)) {
    return (
      <span className={`${s.timelineIcon} ${s.timelineIconPending}`}>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <circle cx="6" cy="6" r="4" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M6 4v2.5l1.5 1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
        </svg>
      </span>
    );
  }
  return (
    <span className={`${s.timelineIcon} ${s.timelineIconStep}`}>
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <circle cx="6" cy="6" r="2.5" fill="currentColor"/>
      </svg>
    </span>
  );
}

function JobDetailPanel({
  job, open, onClose, onRetry, retrying,
}: {
  job: BankSyncJob | null;
  open: boolean;
  onClose: () => void;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  const [showRaw, setShowRaw] = useState(false);
  const timelineEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    timelineEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [job?.logs?.length]);

  // Reset raw toggle when a new job opens
  useEffect(() => { setShowRaw(false); }, [job?.id]);

  if (!job) return null;

  const footer = job.status === 'failed' && onRetry ? (
    <div className={s.retryFooter}>
      <span className={s.retryHint}>Job thất bại — tạo lần chạy mới để thử lại.</span>
      <button className={s.btnPrimary} onClick={onRetry} disabled={retrying}>
        {retrying ? 'Đang kích hoạt...' : '↺ Chạy lại'}
      </button>
    </div>
  ) : undefined;

  // Build timeline: log entries + optional error entry at end
  const timelineItems = [
    ...job.logs.map(entry => ({ time: entry.time, message: entry.message, isError: false })),
    ...(job.errorMessage ? [{ time: job.completedAt ?? job.startedAt ?? '', message: friendlyError(job.errorMessage), isError: true }] : []),
  ];

  return (
    <RightPanel
      title="Chi tiết job"
      open={open}
      onClose={onClose}
      width={520}
      footer={footer}
    >
      <div className={s.detailContent}>
        {/* Status + duration row */}
        <div className={s.detailMeta}>
          <StatusBadge status={job.status} />
          {job.durationMs != null && (
            <span className={s.detailDuration}>{formatDuration(job.durationMs)}</span>
          )}
          {isRunning(job.status) && <span className={s.liveIndicator}>● LIVE</span>}
          {job.status === 'pending' && <span className={s.queueIndicator}>● Đang chờ worker</span>}
        </div>

        {/* Timestamps */}
        <div className={s.detailTimes}>
          <span className={s.detailTimeItem}>
            <span className={s.detailTimeLabel}>Bắt đầu</span>
            <span>{formatDateTime(job.startedAt)}</span>
          </span>
          <span className={s.detailTimeItem}>
            <span className={s.detailTimeLabel}>Kết thúc</span>
            <span>{formatDateTime(job.completedAt)}</span>
          </span>
        </div>

        {/* Friendly error with raw toggle */}
        {job.errorMessage && (
          <div className={s.errorFriendly}>
            <span className={s.errorFriendlyMsg}>{friendlyError(job.errorMessage)}</span>
            <button className={s.rawErrorToggle} onClick={() => setShowRaw(v => !v)}>
              {showRaw ? '▴ Ẩn chi tiết kỹ thuật' : '▾ Xem chi tiết kỹ thuật'}
            </button>
            {showRaw && <pre className={s.rawErrorCode}>{job.errorMessage}</pre>}
          </div>
        )}

        {/* Activity timeline */}
        <div className={s.logsSection}>
          <span className={s.logsLabel}>Nhật ký hoạt động</span>
          {timelineItems.length === 0 ? (
            <span className={s.timelineEmpty}>Chưa có hoạt động nào...</span>
          ) : (
            <div className={s.timeline}>
              {timelineItems.map((item, i) => (
                <div key={i} className={s.timelineItem}>
                  <TimelineIcon msg={item.message} isError={item.isError} />
                  <div className={s.timelineBody}>
                    <span className={`${s.timelineMsg} ${item.isError ? s.timelineMsgError : ''}`}>
                      {item.message}
                    </span>
                    <span className={s.timelineTime}>{item.time ? formatLogTime(item.time) : '—'}</span>
                  </div>
                </div>
              ))}
              <div ref={timelineEndRef} />
            </div>
          )}
        </div>
      </div>
    </RightPanel>
  );
}

function formatLogTime(iso: string): string {
  const d = new Date(iso);
  const hh  = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  const ss  = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${min}:${ss}`;
}
