'use client';

import { useEffect, useRef, useState } from 'react';
import {
  runReconcileFilterMerge, getMasterCustomerInfo, replaceMasterCustomerFile, type MasterCustomerInfo,
} from '../../lib/api';
import { useHasPermission } from '../../hooks/useHasPermission';
import AccessDenied from '../../components/common/AccessDenied';
import { useToast } from '../../components/common/Toast';
import { Spinner } from '../../components/common/PageLoader';
import { useT } from '../../lib/i18n';
import s from './ReconcilePage.module.css';

const MAX_FILE_SIZE = 60 * 1024 * 1024; // 60MB — must match apps/api FileFieldsInterceptor limit
const MAX_INVOICE_FILES = 5;

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const FileIcon = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M4 1.5h5l3 3v10a.5.5 0 01-.5.5h-8a.5.5 0 01-.5-.5v-12a.5.5 0 01.5-.5z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
    <path d="M9 1.5V4.5h3" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
  </svg>
);

const UploadIcon = (
  <svg width="22" height="22" viewBox="0 0 16 16" fill="none">
    <path d="M8 11V2M8 2L5 5M8 2l3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M2.5 11v2a1 1 0 001 1h9a1 1 0 001-1v-2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

function Dropzone({
  hint, sub, onFiles, active, setActive,
}: {
  hint: string;
  sub: string;
  onFiles: (files: FileList) => void;
  active: boolean;
  setActive: (v: boolean) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div
      className={[s.dropzone, active ? s.dropzoneActive : ''].join(' ')}
      onClick={() => inputRef.current?.click()}
      onDragOver={e => { e.preventDefault(); setActive(true); }}
      onDragLeave={() => setActive(false)}
      onDrop={e => {
        e.preventDefault();
        setActive(false);
        if (e.dataTransfer.files.length > 0) onFiles(e.dataTransfer.files);
      }}
    >
      <div className={s.dropzoneIcon}>{UploadIcon}</div>
      <p className={s.dropzoneHint}>{hint}</p>
      <p className={s.dropzoneSub}>{sub}</p>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".xlsx,.xls"
        className={s.hiddenInput}
        onChange={e => { if (e.target.files) onFiles(e.target.files); e.target.value = ''; }}
      />
    </div>
  );
}

function FileListRow({ file, onRemove }: { file: File; onRemove: () => void }) {
  return (
    <div className={s.fileRow}>
      <span className={s.fileIcon}>{FileIcon}</span>
      <span className={s.fileInfo}>
        <span className={s.fileName}>{file.name}</span>
        <span className={s.fileSize}>{formatFileSize(file.size)}</span>
      </span>
      <button type="button" className={s.fileRemoveBtn} onClick={onRemove} aria-label="Remove">✕</button>
    </div>
  );
}

export default function ReconcilePage() {
  const canView = useHasPermission('reconcile:view');
  const canRun = useHasPermission('reconcile:run');
  const toast = useToast();
  const { t, lang } = useT();

  const [invoiceFiles, setInvoiceFiles] = useState<File[]>([]);
  const [invoiceDropActive, setInvoiceDropActive] = useState(false);

  const [masterInfo, setMasterInfo] = useState<MasterCustomerInfo | null>(null);
  const [masterInfoLoading, setMasterInfoLoading] = useState(true);
  const [masterEditing, setMasterEditing] = useState(false);
  const [masterReplacing, setMasterReplacing] = useState(false);
  const [masterDropActive, setMasterDropActive] = useState(false);

  const [headerRow, setHeaderRow] = useState('1');
  const [salesColumn, setSalesColumn] = useState('Doanh số bán chưa thuế VNĐ');
  const [taxColumn, setTaxColumn] = useState('Thuế GTGT đầu ra VNĐ');
  const [noteColumn, setNoteColumn] = useState('Ghi chú');
  const [customerColumn, setCustomerColumn] = useState('Tên khách hàng');
  const [outputFileName, setOutputFileName] = useState('service_invoices_merged.xlsx');

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [processing, setProcessing] = useState(false);

  async function loadMasterInfo() {
    setMasterInfoLoading(true);
    try {
      setMasterInfo(await getMasterCustomerInfo());
    } catch {
      // leave masterInfo as null — card shows the empty state
    } finally {
      setMasterInfoLoading(false);
    }
  }

  useEffect(() => { Promise.resolve().then(() => loadMasterInfo()); }, []);

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

  async function handleReplaceMasterFile(fileList: FileList) {
    const file = fileList[0];
    if (!file) return;
    if (file.size > MAX_FILE_SIZE) {
      toast.error(t('reconcile.errorFileTooLarge', { name: file.name }));
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    setMasterReplacing(true);
    try {
      const info = await replaceMasterCustomerFile(formData);
      setMasterInfo(info);
      setMasterEditing(false);
      toast.success(t('reconcile.masterReplaceSuccess'));
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      toast.error(message || t('reconcile.masterReplaceError'));
    } finally {
      setMasterReplacing(false);
    }
  }

  function validate(): Record<string, string> {
    const errs: Record<string, string> = {};
    if (invoiceFiles.length === 0) errs.invoiceFiles = t('reconcile.errorNoFiles');
    if (!headerRow.trim() || !Number.isInteger(Number(headerRow)) || Number(headerRow) < 1) {
      errs.headerRow = t('reconcile.errorHeaderRow');
    }
    if (!salesColumn.trim()) errs.salesColumn = t('reconcile.errorColumnRequired');
    if (!taxColumn.trim()) errs.taxColumn = t('reconcile.errorColumnRequired');
    if (!noteColumn.trim()) errs.noteColumn = t('reconcile.errorColumnRequired');
    if (!outputFileName.trim()) errs.outputFileName = t('reconcile.errorOutputFileName');
    return errs;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) { setFieldErrors(errs); return; }
    setFieldErrors({});

    const formData = new FormData();
    invoiceFiles.forEach(f => formData.append('files', f));
    formData.append('headerRow', headerRow);
    formData.append('salesColumn', salesColumn);
    formData.append('taxColumn', taxColumn);
    formData.append('noteColumn', noteColumn);
    formData.append('customerColumn', customerColumn);
    formData.append('outputFileName', outputFileName);

    setProcessing(true);
    try {
      const { blob, filename } = await runReconcileFilterMerge(formData);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(t('reconcile.successToast'));
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      toast.error(message || t('reconcile.genericError'));
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

      <form id="reconcile-form" onSubmit={handleSubmit}>
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

        <div className={s.card}>
          <div className={s.cardHead}>
            <p className={s.cardTitle}>{t('reconcile.masterFileLabel')}</p>
            {!masterEditing && canRun && (
              <button
                type="button"
                className={s.btnSecondary}
                onClick={() => setMasterEditing(true)}
                disabled={masterInfoLoading}
              >
                {t('reconcile.masterReplaceButton')}
              </button>
            )}
          </div>

          {masterInfoLoading ? (
            <span className={s.processingHint}><Spinner size={16} /></span>
          ) : masterEditing ? (
            <>
              <Dropzone
                hint={t('reconcile.masterDropzoneHint')}
                sub={t('reconcile.masterDropzoneSub')}
                onFiles={handleReplaceMasterFile}
                active={masterDropActive}
                setActive={setMasterDropActive}
              />
              {masterReplacing && (
                <span className={s.processingHint}>
                  <Spinner size={16} />
                  {t('reconcile.processing')}
                </span>
              )}
              {!masterReplacing && (
                <button type="button" className={s.btnSecondary} onClick={() => setMasterEditing(false)}>
                  {t('common.cancel')}
                </button>
              )}
            </>
          ) : (
            <p className={s.masterInfoText}>
              {masterInfo && masterInfo.count > 0
                ? t('reconcile.masterInfoCount', {
                    count: masterInfo.count,
                    date: masterInfo.updatedAt
                      ? new Date(masterInfo.updatedAt).toLocaleString(lang === 'vi' ? 'vi-VN' : 'en-US')
                      : '—',
                  })
                : t('reconcile.masterInfoEmpty')}
            </p>
          )}
        </div>

        <div className={s.card}>
          <p className={s.cardTitle}>{t('reconcile.columnMappingLabel')}</p>
          <div className={s.formGrid}>
            <div className={s.field}>
              <label className={s.label}>{t('reconcile.headerRowLabel')}</label>
              <input
                type="number"
                min={1}
                className={`${s.input} ${fieldErrors.headerRow ? s.inputError : ''}`}
                value={headerRow}
                onChange={e => { setHeaderRow(e.target.value); clearField('headerRow'); }}
              />
              {fieldErrors.headerRow && <span className={s.fieldError}>{fieldErrors.headerRow}</span>}
            </div>
            <div className={s.field}>
              <label className={s.label}>{t('reconcile.customerColumnLabel')}</label>
              <input
                className={s.input}
                value={customerColumn}
                onChange={e => setCustomerColumn(e.target.value)}
              />
            </div>
            <div className={s.field}>
              <label className={s.label}>{t('reconcile.salesColumnLabel')}</label>
              <input
                className={`${s.input} ${fieldErrors.salesColumn ? s.inputError : ''}`}
                value={salesColumn}
                onChange={e => { setSalesColumn(e.target.value); clearField('salesColumn'); }}
              />
              {fieldErrors.salesColumn && <span className={s.fieldError}>{fieldErrors.salesColumn}</span>}
            </div>
            <div className={s.field}>
              <label className={s.label}>{t('reconcile.taxColumnLabel')}</label>
              <input
                className={`${s.input} ${fieldErrors.taxColumn ? s.inputError : ''}`}
                value={taxColumn}
                onChange={e => { setTaxColumn(e.target.value); clearField('taxColumn'); }}
              />
              {fieldErrors.taxColumn && <span className={s.fieldError}>{fieldErrors.taxColumn}</span>}
            </div>
            <div className={s.field}>
              <label className={s.label}>{t('reconcile.noteColumnLabel')}</label>
              <input
                className={`${s.input} ${fieldErrors.noteColumn ? s.inputError : ''}`}
                value={noteColumn}
                onChange={e => { setNoteColumn(e.target.value); clearField('noteColumn'); }}
              />
              {fieldErrors.noteColumn && <span className={s.fieldError}>{fieldErrors.noteColumn}</span>}
            </div>
            <div className={s.field}>
              <label className={s.label}>{t('reconcile.outputFileNameLabel')}</label>
              <input
                className={`${s.input} ${fieldErrors.outputFileName ? s.inputError : ''}`}
                value={outputFileName}
                onChange={e => { setOutputFileName(e.target.value); clearField('outputFileName'); }}
              />
              {fieldErrors.outputFileName && <span className={s.fieldError}>{fieldErrors.outputFileName}</span>}
            </div>
          </div>
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
    </div>
  );
}
