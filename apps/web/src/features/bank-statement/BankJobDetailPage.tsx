'use client';

import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  getBankJob, retryBankJob, deleteBankJob, getApiBaseUrl, getBankJobSummary,
  getJobAccountTransactions, getBankJobStats,
  type BankSyncJob, type JobAccountSummary, type JobTransaction, type JobStats,
} from '../../lib/api';
import RightPanel from '../../components/common/RightPanel';
import { getToken } from '../../lib/auth';
import { showHsbcAuthNotification } from '../../lib/notifications';
import { useHasPermission } from '../../hooks/useHasPermission';
import AccessDenied from '../../components/common/AccessDenied';
import { Spinner } from '../../components/common/PageLoader';
import { useToast } from '../../components/common/Toast';
import { useT } from '../../lib/i18n';
import s from './BankJobDetailPage.module.css';

// ─── Constants ───────────────────────────────────────────────────────────────

const ACCOUNT_COLORS: Record<string, string> = {
  HK: '#635bff', VN: '#0e7490', ID: '#059669', MY: '#c44c0a',
  PH: '#7c3aed', SG: '#1a56db', TH: '#be185d',
};

// ─── Status helpers ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const { t } = useT();
  const cls = status === 'completed' ? s.badgeSuccess
    : status === 'failed'           ? s.badgeError
    : status === 'waiting_2fa'      ? s.badgeWarn
    : status === 'pending'          ? s.badgeDefault
    : ['checking_session', 'logging_in', 'authenticated', 'discovering_accounts',
       'downloading', 'storing', 'syncing_sheets'].includes(status) ? s.badgeRunning
    : s.badgeDefault;
  const key = `bankStatement.status_${status}`;
  const label = t(key);
  return <span className={`${s.badge} ${cls}`}>{label !== key ? label : status}</span>;
}

function SheetsSyncBadge({
  status, error, t,
}: {
  status: 'pending' | 'completed' | 'failed' | 'skipped';
  error: string | null;
  t: ReturnType<typeof useT>['t'];
}) {
  const cls = status === 'completed' ? s.badgeSuccess
    : status === 'failed'  ? s.badgeError
    : status === 'skipped' ? s.badgeWarn
    : s.badgeDefault;
  const label = t(`bankJob.sheetsSync_${status}`);
  return (
    <span
      className={`${s.badge} ${cls} ${s.summarySyncBadge}`}
      title={error ?? undefined}
    >
      {label}
    </span>
  );
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

const FRIENDLY_ERROR_KEYS: Array<[RegExp, string]> = [
  [/INVALID_USERNAME/i,                 'bankJob.err_invalidUsername'],
  [/HSBCNET_USERNAME.*not configured/i, 'bankJob.err_notConfigured'],
  [/TIMEOUT_2FA/i,                      'bankJob.err_timeout2fa'],
  [/Timeout.*exceeded/i,                'bankJob.err_timeout'],
  [/page\.(fill|click|goto)/i,          'bankJob.err_pageInteraction'],
  [/locator\(/i,                        'bankJob.err_locator'],
  [/net::ERR_/i,                        'bankJob.err_network'],
  [/2fa|mobile.*app|approval/i,         'bankJob.err_twoFa'],
  [/download|csv|xlsx/i,                'bankJob.err_download'],
];

function friendlyError(raw: string | null, t: (key: string) => string): string {
  if (!raw) return t('bankJob.err_default');
  for (const [pattern, key] of FRIENDLY_ERROR_KEYS) {
    if (pattern.test(raw)) return t(key);
  }
  return t('bankJob.err_defaultWithLog');
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
  const { t }     = useT();
  const id        = params?.id as string;

  const [job, setJob]           = useState<BankSyncJob | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showRaw, setShowRaw]   = useState(false);
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());
  const [openSteps, setOpenSteps]         = useState<Set<string>>(new Set());
  const [summary, setSummary]   = useState<JobAccountSummary[]>([]);
  const [stats, setStats]       = useState<JobStats | null>(null);
  const [txPanel, setTxPanel]   = useState<{ acc: JobAccountSummary; rows: JobTransaction[] } | null>(null);
  const [txLoading, setTxLoading] = useState(false);

  const esRef             = useRef<EventSource | null>(null);
  const notifiedJobsRef   = useRef<Set<string>>(new Set());
  const openStepsInitRef  = useRef(false);

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
        if (!openStepsInitRef.current) {
          openStepsInitRef.current = true;
          const running = data.steps?.find(s => s.status === 'running');
          if (running) setOpenSteps(new Set([running.key]));
        }
        startSse(data);
        if (['completed', 'failed'].includes(data.status)) {
          getBankJobSummary(id).then(setSummary).catch(() => {});
          getBankJobStats(id).then(setStats).catch(() => {});
        }
      } catch {
        if (mounted) setError(t('bankJob.loadFailed'));
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

      if (updated.status === 'waiting_2fa' && !notifiedJobsRef.current.has(updated.id)) {
        notifiedJobsRef.current.add(updated.id);
        showHsbcAuthNotification(updated.id);
      }

      if (!isActive(updated.status)) {
        es.close();
        getBankJobSummary(updated.id).then(setSummary).catch(() => {});
        getBankJobStats(updated.id).then(setStats).catch(() => {});
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
      openStepsInitRef.current = false;
      const running = updated.steps?.find(s => s.status === 'running');
      setOpenSteps(running ? new Set([running.key]) : new Set());
      startSse(updated);
    } catch {
      toast.error(t('bankJob.retryFailed'));
    } finally {
      setRetrying(false);
    }
  }

  async function handleDelete() {
    if (!job) return;
    setDeleting(true);
    try {
      await deleteBankJob(job.id);
      toast.success(t('bankJob.deleteSuccess'));
      router.push('/bank-statement');
    } catch {
      toast.error(t('bankJob.deleteFailed'));
      setDeleting(false);
    }
  }

  function expand(key: string) {
    setExpandedSteps(prev => new Set([...prev, key]));
  }

  async function openTxPanel(acc: JobAccountSummary) {
    setTxPanel({ acc, rows: [] });
    setTxLoading(true);
    try {
      const rows = await getJobAccountTransactions(id, acc.accountId);
      setTxPanel({ acc, rows });
    } catch {
      toast.error(t('bankJob.txLoadFailed'));
      setTxPanel(null);
    } finally {
      setTxLoading(false);
    }
  }

  function toggleStep(key: string) {
    setOpenSteps(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
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
                <span className={s.timelineRetryDividerLabel}>{t('bankJob.retryDivider', { time: item.time ? formatLogTime(item.time) : '' })}</span>
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
            {t('bankJob.showMore', { n: hiddenCount })}
          </button>
        )}
      </>
    );
  }

  return (
    <div className={s.page}>
      {/* Back link */}
      <Link href="/bank-statement" className={s.backBtn}>
        {t('bankJob.back')}
      </Link>

      {loading ? (
        <div className={s.loadingWrap}><Spinner size={24} /></div>
      ) : error ? (
        <div className={s.error}>{error}</div>
      ) : !job ? (
        <div className={s.empty}>{t('bankJob.notFound')}</div>
      ) : (
        <>
          {/* Page header */}
          <div className={s.pageHeader}>
            <div>
              <h1 className={s.pageTitle}>{t('bankJob.title')}</h1>
              <p className={s.pageMeta}>{formatDateTime(job.createdAt)} · {job.triggeredBy ? t('bankJob.manual') : t('bankJob.automatic')}</p>
            </div>
            <div className={s.headerActions}>
              {['failed', 'completed'].includes(job.status) && canRun && (
                <button
                  className={s.btnPrimary}
                  disabled={retrying}
                  onClick={() => handleRetry()}
                >
                  {retrying ? t('bankJob.retrying') : t('bankJob.retryAll')}
                </button>
              )}
              {['completed', 'failed'].includes(job.status) && canRun && (
                <button
                  className={s.btnDanger}
                  disabled={deleting}
                  onClick={handleDelete}
                >
                  {deleting ? t('bankJob.deleting') : t('bankJob.delete')}
                </button>
              )}
            </div>
          </div>

          {/* Status + duration */}
          <div className={s.detailMeta}>
            <StatusBadge status={job.status} />
            {job.durationMs != null && <span className={s.detailDuration}>{formatDuration(job.durationMs)}</span>}
            {isRunning(job.status) && <span className={s.liveIndicator}>{t('bankJob.live')}</span>}
            {job.status === 'pending' && <span className={s.queueIndicator}>{t('bankJob.queuedWorker')}</span>}
          </div>

          {/* Timestamps */}
          <div className={s.detailTimes}>
            <span className={s.detailTimeItem}>
              <span className={s.detailTimeLabel}>{t('bankJob.startedAt')}</span>
              <span>{formatDateTime(job.startedAt)}</span>
            </span>
            <span className={s.detailTimeItem}>
              <span className={s.detailTimeLabel}>{t('bankJob.completedAt')}</span>
              <span>{formatDateTime(job.completedAt)}</span>
            </span>
          </div>

          {/* Sync stats */}
          {stats && stats.totalAccounts > 0 && (
            <div className={s.statsGrid}>
              <div className={s.statCard}>
                <span className={s.statValue}>{stats.downloaded}</span>
                <span className={s.statLabel}>{t('bankJob.statsFetched')}</span>
              </div>
              <div className={s.statCard}>
                <span className={s.statValue}>{stats.synced}</span>
                <span className={s.statLabel}>{t('bankJob.statsSynced')}</span>
              </div>
              <div className={s.statCard}>
                <span className={`${s.statValue} ${stats.syncFailed + stats.downloadFailed > 0 ? s.statValueErr : ''}`}>
                  {stats.syncFailed + stats.downloadFailed}
                </span>
                <span className={s.statLabel}>{t('bankJob.statsFailed')}</span>
              </div>
              <div className={s.statCard}>
                <span className={s.statValue}>{stats.syncPending + stats.syncSkipped}</span>
                <span className={s.statLabel}>{t('bankJob.statsNotSynced')}</span>
              </div>
            </div>
          )}

          {/* Account summary table */}
          {summary.length > 0 && (
            <div className={s.summarySection}>
              <div className={s.summaryHeader}>
                <span className={s.summaryTitle}>{t('bankJob.transactionsSynced')}</span>
                <Link href="/bank-metrics" className={s.summaryMetricsLink}>
                  {t('bankJob.viewInMetrics')}
                </Link>
              </div>
              <div className={s.summaryTableWrap}>
                {summary.map(acc => (
                  <div
                    key={acc.accountId}
                    role="button"
                    className={s.summaryRow}
                    onClick={() => openTxPanel(acc)}
                  >
                    <div className={s.summaryRowAccount}>
                      <span className={s.summaryAvatar} style={{ background: ACCOUNT_COLORS[acc.accountCode] ?? '#697386' }}>
                        {acc.accountNumber.slice(-2)}
                      </span>
                      <div className={s.summaryRowInfo}>
                        <div className={s.summaryAccNameRow}>
                          <span className={s.summaryAccName}>{acc.accountName}</span>
                          {newAccountNumbers.has(acc.accountNumber) && (
                            <span className={s.newBadge}>{t('bankJob.newBadge')}</span>
                          )}
                        </div>
                        <span className={s.summaryAccNum}>{acc.accountNumber}</span>
                      </div>
                    </div>
                    <span className={s.summaryCurrency}>{acc.currency}</span>
                    <span className={s.summaryTxCount}>{acc.txCount} {t('bankJob.transactions')}</span>
                    <span className={s.summaryCredit}>+{acc.totalCredit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    <span className={s.summaryDebit}>{acc.totalDebit > 0 ? `-${acc.totalDebit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}</span>
                    <SheetsSyncBadge status={acc.sheetsSyncStatus} error={acc.sheetsSyncError} t={t} />
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className={s.summaryArrow}>
                      <path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
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
            openSteps={openSteps}
            onToggleStep={toggleStep}
            onRetryStep={handleRetry}
            renderLogNodes={renderLogNodes}
          />
        </>
      )}

      {/* Transaction detail panel */}
      <RightPanel
        title={txPanel?.acc.accountName ?? ''}
        open={txPanel !== null}
        onClose={() => setTxPanel(null)}
        width={640}
      >
        {txPanel && (
          <TxDetailPanel
            acc={txPanel.acc}
            rows={txPanel.rows}
            loading={txLoading}
          />
        )}
      </RightPanel>
    </div>
  );
}

// ─── Transaction detail panel ────────────────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function TxDetailPanel({ acc, rows, loading }: {
  acc: JobAccountSummary;
  rows: JobTransaction[];
  loading: boolean;
}) {
  const { t } = useT();
  return (
    <div className={s.txPanel}>
      <div className={s.txPanelMeta}>
        <span className={s.txPanelAccNum}>{acc.accountNumber}</span>
        <span className={s.summaryCurrency}>{acc.currency}</span>
        <span className={s.txPanelCount}>{acc.txCount} {t('bankJob.transactions')}</span>
      </div>

      {loading ? (
        <div className={s.txPanelLoading}><Spinner size={20} /></div>
      ) : rows.length === 0 ? (
        <div className={s.empty}>{t('bankJob.noTransactions')}</div>
      ) : (
        <div className={s.txTableWrap}>
          <table className={s.txTable}>
            <thead>
              <tr>
                <th className={s.txTh}>{t('bankJob.postDate')}</th>
                <th className={s.txTh}>{t('bankJob.narrative')}</th>
                <th className={s.txTh}>{t('bankJob.bankReference')}</th>
                <th className={s.txTh} style={{ textAlign: 'right' }}>{t('bankJob.creditAmount')}</th>
                <th className={s.txTh} style={{ textAlign: 'right' }}>{t('bankJob.debitAmount')}</th>
                <th className={s.txTh}>{t('bankJob.fetchedAt')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(tx => (
                <tr key={tx.id}>
                  <td className={s.txTd}>{formatDate(tx.postDate)}</td>
                  <td className={s.txTdNarrative}>{tx.narrative ?? '—'}</td>
                  <td className={s.txTdMono}>{tx.bankReference ?? '—'}</td>
                  <td className={s.txTdCredit}>
                    {tx.creditAmount ? tx.creditAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
                  </td>
                  <td className={s.txTdDebit}>
                    {tx.debitAmount ? tx.debitAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
                  </td>
                  <td className={s.txTdFetched}>{formatDateTime(tx.fetchedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Timeline sub-component ───────────────────────────────────────────────────

function JobTimeline({
  job, canRun, retrying, showRaw, setShowRaw,
  openSteps, onToggleStep, onRetryStep, renderLogNodes,
}: {
  job: BankSyncJob;
  canRun: boolean;
  retrying: boolean;
  showRaw: boolean;
  setShowRaw: (v: boolean | ((prev: boolean) => boolean)) => void;
  openSteps: Set<string>;
  onToggleStep: (key: string) => void;
  onRetryStep: (stepKey?: 'bank_sync' | 'sheets_sync') => void;
  renderLogNodes: (logs: LogItem[], stepKey: string) => React.ReactNode;
}) {
  const { t } = useT();
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
      message: friendlyError(failedStep.errorMessage, t),
      level: 'error',
    });
  }

  return (
    <div className={s.jobTimeline}>
      {hasSteps ? (
        job.steps.map((step, si) => {
          const stepLogs = logsByStep[step.key] ?? [];
          const isLast = si === job.steps.length - 1;
          const canRetryStep = isDone && canRun && ['failed', 'completed', 'skipped'].includes(step.status);
          const stepDotCls = step.status === 'completed' ? s.stepDotOk
            : step.status === 'failed'   ? s.stepDotErr
            : step.status === 'running'  ? s.stepDotRunning
            : s.stepDotPending;
          const isOpen = step.status === 'running' || openSteps.has(step.key);
          const hasLogs = stepLogs.length > 0;

          return (
            <div key={step.key} className={s.stepRow}>
              <div className={s.stepTrack}>
                <span className={`${s.stepDot} ${stepDotCls}`} />
                {!isLast && <span className={s.stepLine} />}
              </div>
              <div className={s.stepContent}>
                <div
                  className={`${s.stepHeader} ${hasLogs ? s.stepHeaderClickable : ''}`}
                  onClick={hasLogs ? () => onToggleStep(step.key) : undefined}
                >
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
                      onClick={(e) => { e.stopPropagation(); onRetryStep(step.key as 'bank_sync' | 'sheets_sync'); }}
                    >
                      {retrying ? '...' : t('bankJob.retryStep')}
                    </button>
                  )}
                  {hasLogs && (
                    <span className={s.stepChevron}>{isOpen ? '▴' : '▾'}</span>
                  )}
                </div>
                {isOpen && hasLogs && (
                  <div className={s.stepLogs}>
                    {renderLogNodes(stepLogs, step.key)}
                  </div>
                )}
                {isOpen && step.status === 'failed' && step.errorMessage && (
                  <div className={s.stepErrorToggle}>
                    <button className={s.rawErrorToggle} onClick={() => setShowRaw(v => !v)}>
                      {showRaw ? t('bankJob.hideRaw') : t('bankJob.showRaw')}
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
              <span className={s.stepLabel}>{t('bankJob.activityLog')}</span>
            </div>
            <div className={s.stepLogs}>
              {renderLogNodes([
                ...logsByStep._general,
                ...(job.errorMessage ? [{
                  time: job.completedAt ?? '',
                  message: friendlyError(job.errorMessage, t),
                  level: 'error' as LogLevel,
                }] : []),
              ], '_general')}
            </div>
            {job.errorMessage && (
              <div className={s.stepErrorToggle}>
                <button className={s.rawErrorToggle} onClick={() => setShowRaw(v => !v)}>
                  {showRaw ? t('bankJob.hideRaw') : t('bankJob.showRaw')}
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
