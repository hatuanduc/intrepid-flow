'use client';

import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  getBankJob, retryBankJob, deleteBankJob, getApiBaseUrl, getBankJobSummary,
  type BankSyncJob, type JobAccountSummary,
} from '../../lib/api';
import { getToken } from '../../lib/auth';
import { showHsbcAuthNotification } from '../../lib/notifications';
import { useHasPermission } from '../../hooks/useHasPermission';
import AccessDenied from '../../components/common/AccessDenied';
import { Spinner } from '../../components/common/PageLoader';
import { useToast } from '../../components/common/Toast';
import s from './BankJobDetailPage.module.css';

// ─── Constants ───────────────────────────────────────────────────────────────

const ACCOUNT_COLORS: Record<string, string> = {
  HK: '#635bff', VN: '#0e7490', ID: '#059669', MY: '#c44c0a',
  PH: '#7c3aed', SG: '#1a56db', TH: '#be185d',
};

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

function formatLogTime(iso: string): string {
  const d = new Date(iso);
  const hh  = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  const ss  = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${min}:${ss}`;
}

// ─── Friendly error mapping ───────────────────────────────────────────────────

const FRIENDLY_ERRORS: Array<[RegExp, string]> = [
  [/INVALID_USERNAME/i,                 'Tên đăng nhập HSBCnet không đúng. Vui lòng kiểm tra lại trong Cài đặt → Kết nối.'],
  [/HSBCNET_USERNAME.*not configured/i, 'Chưa cấu hình tên đăng nhập HSBCnet. Vào Cài đặt → Kết nối để cập nhật.'],
  [/TIMEOUT_2FA/i,                      'Hết thời gian chờ xác thực — không nhận được phê duyệt từ ứng dụng di động HSBCnet.'],
  [/Timeout.*exceeded/i,                'Hết thời gian chờ — trang web ngân hàng phản hồi quá chậm hoặc không tải được đúng hạn.'],
  [/page\.(fill|click|goto)/i,          'Không tương tác được với trang web ngân hàng — giao diện có thể đã thay đổi.'],
  [/locator\(/i,                        'Không tìm thấy phần tử trên trang — giao diện ngân hàng có thể đã cập nhật.'],
  [/net::ERR_/i,                        'Lỗi kết nối mạng — không thể truy cập trang web ngân hàng.'],
  [/2fa|mobile.*app|approval/i,         'Xác thực 2 bước thất bại hoặc hết thời gian chờ phê duyệt trên ứng dụng di động.'],
  [/download|csv|xlsx/i,                'Lỗi tải xuống file sao kê — trang web ngân hàng không trả về đúng định dạng.'],
];

function friendlyError(raw: string | null): string {
  if (!raw) return 'Đồng bộ thất bại. Vui lòng kiểm tra cài đặt và thử lại.';
  for (const [pattern, msg] of FRIENDLY_ERRORS) {
    if (pattern.test(raw)) return msg;
  }
  return 'Đồng bộ thất bại. Vui lòng kiểm tra log chi tiết và thử lại.';
}

// ─── Log types ───────────────────────────────────────────────────────────────

const LOG_LIMIT = 8;
type LogLevel = 'info' | 'success' | 'warn' | 'error';
type LogItem = { time: string; message: string; level: LogLevel };

const LOG_LEVEL_DOT: Record<LogLevel, string> = {
  info:    '',
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

// ─── Main component ───────────────────────────────────────────────────────────

export default function BankJobDetailPage() {
  const canView   = useHasPermission('bank_statement:view');
  const canRun    = useHasPermission('bank_statement:run');
  const toast     = useToast();
  const router    = useRouter();
  const params    = useParams();
  const id        = params?.id as string;

  const [job, setJob]           = useState<BankSyncJob | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showRaw, setShowRaw]   = useState(false);
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());
  const [summary, setSummary]   = useState<JobAccountSummary[]>([]);

  const esRef             = useRef<EventSource | null>(null);
  const notifiedJobsRef   = useRef<Set<string>>(new Set());

  const newAccountNumbers = useMemo(() => new Set(
    (job?.logs ?? [])
      .filter(l => l.message.startsWith('[NEW_ACCOUNT]'))
      .map(l => l.message.replace('[NEW_ACCOUNT]', '').trim())
  ), [job?.logs]);

  useEffect(() => {
    if (!canView || !id) return;
    let mounted = true;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await getBankJob(id);
        if (!mounted) return;
        setJob(data);
        startSse(data);
        if (['completed', 'failed'].includes(data.status)) {
          getBankJobSummary(id).then(setSummary).catch(() => {});
        }
      } catch {
        if (mounted) setError('Không tải được thông tin job.');
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    return () => {
      mounted = false;
      esRef.current?.close();
      esRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, canView]);

  if (!canView) return <AccessDenied />;

  function startSse(data: BankSyncJob) {
    esRef.current?.close();
    if (!isActive(data.status)) return;

    const base  = getApiBaseUrl();
    const token = getToken();
    const es = new EventSource(`${base}/management/bank-statement/jobs/${data.id}/stream?token=${token}`);

    es.onmessage = (e) => {
      const updated: BankSyncJob = JSON.parse(e.data);
      setJob(updated);

      // Notify when HSBC pushes mobile auth request (waiting_2fa screen)
      if (updated.status === 'waiting_2fa' && !notifiedJobsRef.current.has(updated.id)) {
        notifiedJobsRef.current.add(updated.id);
        showHsbcAuthNotification(updated.id);
      }

      if (!isActive(updated.status)) {
        es.close();
        getBankJobSummary(updated.id).then(setSummary).catch(() => {});
      }
    };
    es.onerror = () => es.close();
    esRef.current = es;
  }

  async function handleRetry(stepKey?: 'bank_sync' | 'sheets_sync') {
    if (!job) return;
    setRetrying(true);
    try {
      const updated = await retryBankJob(job.id, stepKey);
      setJob(updated);
      setShowRaw(false);
      setExpandedSteps(new Set());
      startSse(updated);
    } catch {
      toast.error('Chạy lại thất bại. Vui lòng thử lại.');
    } finally {
      setRetrying(false);
    }
  }

  async function handleDelete() {
    if (!job) return;
    setDeleting(true);
    try {
      await deleteBankJob(job.id);
      toast.success('Đã xóa job thành công.');
      router.push('/bank-statement');
    } catch {
      toast.error('Xóa thất bại. Vui lòng thử lại.');
      setDeleting(false);
    }
  }

  function expand(key: string) {
    setExpandedSteps(prev => new Set([...prev, key]));
  }

  function renderLogNodes(logs: LogItem[], stepKey: string) {
    const reversed = [...logs].reverse();
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
    <div className={s.page}>
      {/* Back link */}
      <Link href="/bank-statement" className={s.backBtn}>
        ← Sao kê ngân hàng
      </Link>

      {loading ? (
        <div className={s.loadingWrap}><Spinner size={24} /></div>
      ) : error ? (
        <div className={s.error}>{error}</div>
      ) : !job ? (
        <div className={s.empty}>Không tìm thấy job.</div>
      ) : (
        <>
          {/* Page header */}
          <div className={s.pageHeader}>
            <div>
              <h1 className={s.pageTitle}>Chi tiết job</h1>
              <p className={s.pageMeta}>{formatDateTime(job.createdAt)} · {job.triggeredBy ? 'Thủ công' : 'Tự động'}</p>
            </div>
            <div className={s.headerActions}>
              {['failed', 'completed'].includes(job.status) && canRun && (
                <button
                  className={s.btnPrimary}
                  disabled={retrying}
                  onClick={() => handleRetry()}
                >
                  {retrying ? 'Đang chạy...' : '↺ Chạy lại toàn bộ'}
                </button>
              )}
              {['completed', 'failed'].includes(job.status) && canRun && (
                <button
                  className={s.btnDanger}
                  disabled={deleting}
                  onClick={handleDelete}
                >
                  {deleting ? 'Đang xóa...' : 'Xóa'}
                </button>
              )}
            </div>
          </div>

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

          {/* Account summary table */}
          {summary.length > 0 && (
            <div className={s.summarySection}>
              <div className={s.summaryHeader}>
                <span className={s.summaryTitle}>Giao dịch lấy về</span>
                <Link href="/bank-metrics" className={s.summaryMetricsLink}>
                  Xem trong Metrics →
                </Link>
              </div>
              <div className={s.summaryTableWrap}>
                {summary.map(acc => (
                  <Link
                    key={acc.accountId}
                    href={`/bank-metrics?accountId=${acc.accountId}`}
                    className={s.summaryRow}
                  >
                    <div className={s.summaryRowAccount}>
                      <span className={s.summaryAvatar} style={{ background: ACCOUNT_COLORS[acc.countryCode] ?? '#697386' }}>
                        {acc.accountNumber.slice(-2)}
                      </span>
                      <div className={s.summaryRowInfo}>
                        <div className={s.summaryAccNameRow}>
                          <span className={s.summaryAccName}>{acc.accountName}</span>
                          {newAccountNumbers.has(acc.accountNumber) && (
                            <span className={s.newBadge}>Mới</span>
                          )}
                        </div>
                        <span className={s.summaryAccNum}>{acc.accountNumber}</span>
                      </div>
                    </div>
                    <span className={s.summaryCurrency}>{acc.currency}</span>
                    <span className={s.summaryTxCount}>{acc.txCount} GD</span>
                    <span className={s.summaryCredit}>+{acc.totalCredit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    <span className={s.summaryDebit}>{acc.totalDebit > 0 ? `-${acc.totalDebit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}</span>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className={s.summaryArrow}>
                      <path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Timeline */}
          <JobTimeline
            job={job}
            canRun={canRun}
            retrying={retrying}
            showRaw={showRaw}
            setShowRaw={setShowRaw}
            expandedSteps={expandedSteps}
            onRetryStep={handleRetry}
            renderLogNodes={renderLogNodes}
          />
        </>
      )}
    </div>
  );
}

// ─── Timeline sub-component ───────────────────────────────────────────────────

function JobTimeline({
  job, canRun, retrying, showRaw, setShowRaw,
  expandedSteps, onRetryStep, renderLogNodes,
}: {
  job: BankSyncJob;
  canRun: boolean;
  retrying: boolean;
  showRaw: boolean;
  setShowRaw: (v: boolean | ((prev: boolean) => boolean)) => void;
  expandedSteps: Set<string>;
  onRetryStep: (stepKey?: 'bank_sync' | 'sheets_sync') => void;
  renderLogNodes: (logs: LogItem[], stepKey: string) => React.ReactNode;
}) {
  const isDone = ['completed', 'failed'].includes(job.status);
  const hasSteps = (job.steps?.length ?? 0) > 0;

  // Group logs by step
  const logsByStep: Record<string, LogItem[]> = { bank_sync: [], sheets_sync: [], _general: [] };
  for (const entry of job.logs) {
    const bucket = entry.step && entry.step in logsByStep ? entry.step : '_general';
    const level: LogLevel = (['info', 'success', 'warn', 'error'].includes(entry.level ?? '') ? entry.level : 'info') as LogLevel;
    logsByStep[bucket].push({ time: entry.time, message: entry.message, level });
  }

  // Append friendly error at end of failed step's list
  const failedStep = job.steps?.find(st => st.status === 'failed');
  if (failedStep?.errorMessage) {
    logsByStep[failedStep.key].push({
      time: failedStep.completedAt ?? '',
      message: friendlyError(failedStep.errorMessage),
      level: 'error',
    });
  }

  return (
    <div className={s.jobTimeline}>
      {hasSteps ? (
        job.steps.map((step, si) => {
          const stepLogs = logsByStep[step.key] ?? [];
          const isLast = si === job.steps.length - 1;
          const canRetryStep = isDone && canRun && ['failed', 'completed'].includes(step.status);
          const stepDotCls = step.status === 'completed' ? s.stepDotOk
            : step.status === 'failed'   ? s.stepDotErr
            : step.status === 'running'  ? s.stepDotRunning
            : s.stepDotPending;

          return (
            <div key={step.key} className={s.stepRow}>
              <div className={s.stepTrack}>
                <span className={`${s.stepDot} ${stepDotCls}`} />
                {!isLast && <span className={s.stepLine} />}
              </div>
              <div className={s.stepContent}>
                <div className={s.stepHeader}>
                  <span className={s.stepLabel}>{step.label}</span>
                  {step.completedAt && step.startedAt && (
                    <span className={s.stepDuration}>
                      {formatDuration(new Date(step.completedAt).getTime() - new Date(step.startedAt).getTime())}
                    </span>
                  )}
                  {canRetryStep && (
                    <button
                      className={s.stepRetryBtn}
                      disabled={retrying}
                      onClick={() => onRetryStep(step.key as 'bank_sync' | 'sheets_sync')}
                    >
                      {retrying ? '...' : '↺ Chạy lại'}
                    </button>
                  )}
                </div>
                {stepLogs.length > 0 && (
                  <div className={s.stepLogs}>
                    {renderLogNodes(stepLogs, step.key)}
                  </div>
                )}
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
        // Old-format job: flat log timeline
        <div className={s.stepRow}>
          <div className={s.stepTrack}>
            <span className={`${s.stepDot} ${
              job.status === 'failed'    ? s.stepDotErr :
              job.status === 'completed' ? s.stepDotOk  : s.stepDotRunning
            }`} />
            <span className={s.stepLine} />
          </div>
          <div className={s.stepContent}>
            <div className={s.stepHeader}>
              <span className={s.stepLabel}>Nhật ký hoạt động</span>
            </div>
            <div className={s.stepLogs}>
              {renderLogNodes([
                ...logsByStep._general,
                ...(job.errorMessage ? [{
                  time: job.completedAt ?? '',
                  message: friendlyError(job.errorMessage),
                  level: 'error' as LogLevel,
                }] : []),
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
  );
}
