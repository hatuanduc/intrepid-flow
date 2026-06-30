'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import {
  listBankJobs, triggerBankSync, retryBankJob, deleteBankJob, getApiBaseUrl,
  type BankSyncJob, type JobStep,
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
  const [retryingId, setRetryingId] = useState<string | null>(null);
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

  async function handleRetry(id: string, stepKey?: 'bank_sync' | 'sheets_sync') {
    setRetryingId(id);
    setOpenMenu(null);
    try {
      const updated = await retryBankJob(id, stepKey);
      setJobs(prev => prev.map(j => j.id === id ? updated : j));
      openDetail(updated);
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
                                {job.status === 'failed' && (
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

      <JobDetailPanel
        job={selectedJob}
        open={panelOpen}
        onClose={closePanel}
        onRetry={canRun ? handleRetry : undefined}
        retryingId={retryingId ?? undefined}
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

const LOG_LIMIT = 8;
type LogLevel = 'info' | 'success' | 'warn' | 'error';
type LogItem = { time: string; message: string; level: LogLevel };

const LOG_LEVEL_DOT: Record<LogLevel, string> = {
  info:    '',           // default gray from CSS
  success: 'logNodeDotOk',
  warn:    'logNodeDotWarn',
  error:   'logNodeDotErr',
};
const LOG_LEVEL_MSG: Record<LogLevel, string> = {
  info:    '',
  success: '',
  warn:    'logNodeMsgWarn',
  error:   'logNodeMsgErr',
};

function JobDetailPanel({
  job, open, onClose, onRetry, retryingId,
}: {
  job: BankSyncJob | null;
  open: boolean;
  onClose: () => void;
  onRetry?: (id: string, stepKey?: 'bank_sync' | 'sheets_sync') => void;
  retryingId?: string;
}) {
  const [showRaw, setShowRaw] = useState(false);
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());

  useEffect(() => { setShowRaw(false); setExpandedSteps(new Set()); }, [job?.id]);

  if (!job) return null;

  const isRetrying = retryingId === job.id;
  const isDone = ['completed', 'failed'].includes(job.status);
  const hasSteps = (job.steps?.length ?? 0) > 0;

  // Group logs by step key; read level from DB entry (backward-compat default: 'info')
  const logsByStep: Record<string, LogItem[]> = { bank_sync: [], sheets_sync: [], _general: [] };
  for (const entry of job.logs) {
    const bucket = entry.step && entry.step in logsByStep ? entry.step : '_general';
    const level: LogLevel = (entry.level != null && ['info', 'success', 'warn', 'error'].includes(entry.level) ? entry.level : 'info') as LogLevel;
    logsByStep[bucket].push({ time: entry.time, message: entry.message, level });
  }

  // Append friendly error entry at end of failed step's list (shows at top when reversed)
  const failedStep = job.steps?.find(st => st.status === 'failed');
  if (failedStep?.errorMessage) {
    logsByStep[failedStep.key].push({
      time: failedStep.completedAt ?? '',
      message: friendlyError(failedStep.errorMessage),
      level: 'error',
    });
  }

  function expand(key: string) {
    setExpandedSteps(prev => new Set([...prev, key]));
  }

  function renderLogNodes(logs: LogItem[], stepKey: string) {
    const reversed = [...logs].reverse(); // newest first
    const isExpanded = expandedSteps.has(stepKey);
    const visible = isExpanded ? reversed : reversed.slice(0, LOG_LIMIT);
    const hiddenCount = reversed.length - LOG_LIMIT;

    return (
      <>
        {visible.map((item, i) => {
          if (item.message === '__RETRY__') {
            return (
              <div key={i} className={s.timelineRetryDivider}>
                <span className={s.timelineRetryDividerLine} />
                <span className={s.timelineRetryDividerLabel}>↺ Chạy lại · {item.time ? formatLogTime(item.time) : ''}</span>
                <span className={s.timelineRetryDividerLine} />
              </div>
            );
          }
          return (
            <div key={i} className={s.logNode}>
              <span className={`${s.logNodeDot} ${s[LOG_LEVEL_DOT[item.level]] ?? ''}`} />
              <div className={s.logNodeBody}>
                <span className={`${s.logNodeMsg} ${s[LOG_LEVEL_MSG[item.level]] ?? ''}`}>{item.message}</span>
                <span className={s.logNodeTime}>{item.time ? formatLogTime(item.time) : '—'}</span>
              </div>
            </div>
          );
        })}
        {!isExpanded && hiddenCount > 0 && (
          <button className={s.showMoreBtn} onClick={() => expand(stepKey)}>
            ↑ Xem thêm {hiddenCount} mục cũ hơn
          </button>
        )}
      </>
    );
  }

  return (
    <RightPanel title="Chi tiết job" open={open} onClose={onClose} width={540}>
      <div className={s.detailContent}>
        {/* Status + duration */}
        <div className={s.detailMeta}>
          <StatusBadge status={job.status} />
          {job.durationMs != null && <span className={s.detailDuration}>{formatDuration(job.durationMs)}</span>}
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

        {/* ── Unified vertical timeline ── */}
        <div className={s.jobTimeline}>
          {hasSteps ? (
            // New-format job: step nodes (large) + log sub-nodes (small)
            job.steps.map((step, si) => {
              const stepLogs = logsByStep[step.key] ?? [];
              const isLast = si === job.steps.length - 1;
              const canRetryStep = isDone && onRetry && step.status === 'failed';
              const stepDotCls = step.status === 'completed' ? s.stepDotOk
                : step.status === 'failed'    ? s.stepDotErr
                : step.status === 'running'   ? s.stepDotRunning
                : s.stepDotPending;

              return (
                <div key={step.key} className={s.stepRow}>
                  {/* Left track: dot + line */}
                  <div className={s.stepTrack}>
                    <span className={`${s.stepDot} ${stepDotCls}`} />
                    {!isLast && <span className={s.stepLine} />}
                  </div>

                  {/* Right content */}
                  <div className={s.stepContent}>
                    {/* Step header */}
                    <div className={s.stepHeader}>
                      <span className={s.stepLabel}>{step.label}</span>
                      {step.completedAt && step.startedAt && (
                        <span className={s.stepDuration}>
                          {formatDuration(new Date(step.completedAt).getTime() - new Date(step.startedAt).getTime())}
                        </span>
                      )}
                      {canRetryStep && (
                        <button className={s.stepRetryBtn} disabled={isRetrying} onClick={() => onRetry!(job.id, step.key)}>
                          {isRetrying ? '...' : '↺ Chạy lại'}
                        </button>
                      )}
                    </div>

                    {/* Log sub-nodes */}
                    {stepLogs.length > 0 && (
                      <div className={s.stepLogs}>
                        {renderLogNodes(stepLogs, step.key)}
                      </div>
                    )}

                    {/* Raw error toggle */}
                    {step.status === 'failed' && step.errorMessage && (
                      <div className={s.stepErrorToggle}>
                        <button className={s.rawErrorToggle} onClick={() => setShowRaw(v => !v)}>
                          {showRaw ? '▴ Ẩn chi tiết kỹ thuật' : '▾ Xem chi tiết kỹ thuật'}
                        </button>
                        {showRaw && <pre className={s.rawErrorCode}>{step.errorMessage}</pre>}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            // Old-format job: flat log timeline (newest first, limited)
            <div className={s.stepRow}>
              <div className={s.stepTrack}>
                <span className={`${s.stepDot} ${job.status === 'failed' ? s.stepDotErr : job.status === 'completed' ? s.stepDotOk : s.stepDotRunning}`} />
                <span className={s.stepLine} />
              </div>
              <div className={s.stepContent}>
                <div className={s.stepHeader}>
                  <span className={s.stepLabel}>Nhật ký hoạt động</span>
                </div>
                <div className={s.stepLogs}>
                  {renderLogNodes([
                    ...logsByStep._general,
                    ...(job.errorMessage ? [{ time: job.completedAt ?? '', message: friendlyError(job.errorMessage), level: 'error' as LogLevel }] : []),
                  ], '_general')}
                </div>
                {job.errorMessage && (
                  <div className={s.stepErrorToggle}>
                    <button className={s.rawErrorToggle} onClick={() => setShowRaw(v => !v)}>
                      {showRaw ? '▴ Ẩn chi tiết kỹ thuật' : '▾ Xem chi tiết kỹ thuật'}
                    </button>
                    {showRaw && <pre className={s.rawErrorCode}>{job.errorMessage}</pre>}
                  </div>
                )}
              </div>
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
