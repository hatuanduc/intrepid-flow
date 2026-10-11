'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  startReconcileFilterMerge, getReconcileJobStatus, downloadReconcileResult, getMasterCustomerInfo, getReconcileSettings,
  type MasterCustomerInfo, type ReconcileSettings,
} from '../../lib/api';
import { useHasPermission } from '../../hooks/useHasPermission';
import AccessDenied from '../../components/common/AccessDenied';
import { useToast } from '../../components/common/Toast';
import { Spinner } from '../../components/common/PageLoader';
import { Dropzone, FileListRow } from '../../components/common/FileDropzone';
import { useT } from '../../lib/i18n';
import s from './ReconcilePage.module.css';

const MAX_FILE_SIZE = 60 * 1024 * 1024; // 60MB — must match apps/api FileFieldsInterceptor limit
const MAX_INVOICE_FILES = 5;

type LastRunResult =
  | { success: true; at: Date; fileCount: number; filename: string; blob: Blob }
  | { success: false; at: Date; message: string };

const CheckIcon = (
  <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
    <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="1.5"/>
    <path d="M6 10.5l2.5 2.5L14 7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const ErrorIcon = (
  <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
    <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="1.5"/>
    <path d="M10 6v5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    <circle cx="10" cy="14" r="1" fill="currentColor"/>
  </svg>
);

export default function ReconcilePage() {
  const canView = useHasPermission('reconcile:view');
  const canRun = useHasPermission('reconcile:run');
  const toast = useToast();
  const { t, lang } = useT();

  const [invoiceFiles, setInvoiceFiles] = useState<File[]>([]);
  const [invoiceDropActive, setInvoiceDropActive] = useState(false);

  const [settings, setSettings] = useState<ReconcileSettings | null>(null);
  const [masterInfo, setMasterInfo] = useState<MasterCustomerInfo | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [processing, setProcessing] = useState(false);
  const [lastRun, setLastRun] = useState<LastRunResult | null>(null);

  async function loadSummary() {
    setSummaryLoading(true);
    try {
      const [settingsRes, masterRes] = await Promise.all([
        getReconcileSettings(),
        getMasterCustomerInfo(),
      ]);
      setSettings(settingsRes);
      setMasterInfo(masterRes);
    } catch {
      // leave as null — summary card shows nothing extra if this fails
    } finally {
      setSummaryLoading(false);
    }
  }

  useEffect(() => { Promise.resolve().then(() => loadSummary()); }, []);

  if (!canView) return <AccessDenied />;

  function clearField(field: string) {
    setFieldErrors(prev => { const next = { ...prev }; delete next[field]; return next; });
  }

  function addInvoiceFiles(fileList: FileList) {
    const incoming = Array.from(fileList);
    const tooLarge = incoming.find(f => f.size > MAX_FILE_SIZE);
    if (tooLarge) {
      toast.error(t('reconcile.errorFileTooLarge', { name: tooLarge.name }));
      return;
    }
    setInvoiceFiles(prev => {
      const merged = [...prev, ...incoming];
      if (merged.length > MAX_INVOICE_FILES) {
        toast.error(t('reconcile.errorTooManyFiles'));
        return merged.slice(0, MAX_INVOICE_FILES);
      }
      return merged;
    });
    clearField('invoiceFiles');
  }

  function validate(): Record<string, string> {
    const errs: Record<string, string> = {};
    if (invoiceFiles.length === 0) errs.invoiceFiles = t('reconcile.errorNoFiles');
    return errs;
  }

  function triggerDownload(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // The merge itself now runs async in a Lambda (apps/reconcile-lambda), so the API returns a
  // jobId immediately instead of the merged file — poll until it's done or errors out. Give up
  // slightly past the Lambda's own 10-minute timeout so this can't hang forever on a stuck job.
  const POLL_INTERVAL_MS = 3000;
  const POLL_TIMEOUT_MS = 11 * 60 * 1000;

  async function pollUntilDone(jobId: string): Promise<void> {
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const result = await getReconcileJobStatus(jobId);
      if (result.status === 'done') return;
      if (result.status === 'error') throw new Error(result.message);
      await sleep(POLL_INTERVAL_MS);
    }
    throw new Error(t('reconcile.jobTimeout'));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) { setFieldErrors(errs); return; }
    setFieldErrors({});

    const formData = new FormData();
    invoiceFiles.forEach(f => formData.append('files', f));

    setProcessing(true);
    try {
      const { jobId } = await startReconcileFilterMerge(formData);
      await pollUntilDone(jobId);
      const { blob, filename } = await downloadReconcileResult(jobId);
      triggerDownload(blob, filename);
      toast.success(t('reconcile.successToast'));
      setLastRun({ success: true, at: new Date(), fileCount: invoiceFiles.length, filename, blob });
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      const message = code === 'RECONCILE_DISABLED' ? t('reconcile.disabled') : code || t('reconcile.genericError');
      toast.error(message);
      setLastRun({ success: false, at: new Date(), message });
    } finally {
      setProcessing(false);
    }
  }

  return (
    <div className={s.page}>
      <div className={s.pageHeader}>
        <h1 className={s.pageTitle}>{t('reconcile.pageTitle')}</h1>
      </div>
      <p className={s.pageDesc}>{t('reconcile.pageDesc')}</p>

      {lastRun && (
        <div className={`${s.resultCard} ${lastRun.success ? s.resultCardSuccess : s.resultCardError}`}>
          <span className={s.resultIcon}>{lastRun.success ? CheckIcon : ErrorIcon}</span>
          <span className={s.resultBody}>
            <span className={s.resultTitle}>
              {t(lastRun.success ? 'reconcile.lastRunSuccessTitle' : 'reconcile.lastRunErrorTitle')}
              {' · '}
              {t('reconcile.lastRunAt', { time: lastRun.at.toLocaleTimeString(lang === 'vi' ? 'vi-VN' : 'en-US') })}
            </span>
            <span className={s.resultDesc}>
              {lastRun.success
                ? t('reconcile.lastRunFileCount', { count: lastRun.fileCount, filename: lastRun.filename })
                : lastRun.message}
            </span>
          </span>
          <span className={s.resultActions}>
            {lastRun.success && (
              <button
                type="button"
                className={s.btnSecondary}
                onClick={() => triggerDownload(lastRun.blob, lastRun.filename)}
              >
                {t('reconcile.lastRunDownloadAgain')}
              </button>
            )}
            <button type="button" className={s.resultDismiss} onClick={() => setLastRun(null)}>✕</button>
          </span>
        </div>
      )}

      <div className={s.layout}>
        <form id="reconcile-form" onSubmit={handleSubmit} className={s.main}>
          <div className={s.card}>
            <p className={s.cardTitle}>{t('reconcile.invoiceFilesLabel')}</p>
            <Dropzone
              hint={t('reconcile.dropzoneHint')}
              sub={t('reconcile.dropzoneSub', { max: MAX_INVOICE_FILES })}
              onFiles={addInvoiceFiles}
              active={invoiceDropActive}
              setActive={setInvoiceDropActive}
            />
            {fieldErrors.invoiceFiles && <span className={s.fieldError}>{fieldErrors.invoiceFiles}</span>}
            {invoiceFiles.length > 0 && (
              <div className={s.fileList}>
                {invoiceFiles.map((f, i) => (
                  <FileListRow
                    key={`${f.name}-${i}`}
                    file={f}
                    onRemove={() => setInvoiceFiles(prev => prev.filter((_, idx) => idx !== i))}
                  />
                ))}
              </div>
            )}
          </div>

          <div className={s.actions}>
            <button
              type="submit"
              className={s.btnPrimary}
              disabled={!canRun || processing}
            >
              {processing ? t('reconcile.processing') : t('reconcile.runButton')}
            </button>
            {processing && (
              <span className={s.processingHint}>
                <Spinner size={16} />
                {t('reconcile.processingHint')}
              </span>
            )}
          </div>
        </form>

        <aside>
          <div className={s.card}>
            <div className={s.cardHead}>
              <p className={s.cardTitle}>{t('reconcile.settingsSummaryLabel')}</p>
              <Link href="/settings/reconcile" className={s.btnSecondary}>{t('reconcile.settingsLink')}</Link>
            </div>
            {summaryLoading ? (
              <span className={s.processingHint}><Spinner size={16} /></span>
            ) : (
              <>
                <div className={s.hintRow}>
                  <span className={s.hintLabel}>{t('reconcile.headerRowLabel')}</span>
                  <span className={s.hintValue}>{settings?.headerRow}</span>
                </div>
                <div className={s.hintRow}>
                  <span className={s.hintLabel}>{t('reconcile.salesColumnLabel')}</span>
                  <span className={s.hintValue}>{settings?.salesColumn}</span>
                </div>
                <div className={s.hintRow}>
                  <span className={s.hintLabel}>{t('reconcile.taxColumnLabel')}</span>
                  <span className={s.hintValue}>{settings?.taxColumn}</span>
                </div>
                <div className={s.hintRow}>
                  <span className={s.hintLabel}>{t('reconcile.noteColumnLabel')}</span>
                  <span className={s.hintValue}>{settings?.noteColumn}</span>
                </div>
                <div className={s.hintRow}>
                  <span className={s.hintLabel}>{t('reconcile.customerColumnLabel')}</span>
                  <span className={s.hintValue}>{settings?.customerColumn}</span>
                </div>
                <div className={`${s.hintRow} ${s.hintRowLast}`}>
                  <span className={s.hintLabel}>{t('reconcile.masterFileLabel')}</span>
                  <span className={s.hintValue}>
                    {masterInfo && masterInfo.count > 0
                      ? t('reconcile.masterInfoCount', {
                          count: masterInfo.count,
                          date: masterInfo.updatedAt
                            ? new Date(masterInfo.updatedAt).toLocaleString(lang === 'vi' ? 'vi-VN' : 'en-US')
                            : '—',
                        })
                      : t('reconcile.masterInfoEmpty')}
                  </span>
                </div>
              </>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
