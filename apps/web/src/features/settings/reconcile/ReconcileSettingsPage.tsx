'use client';

import { useEffect, useState } from 'react';
import {
  getReconcileSettings, updateReconcileSettings,
  getMasterCustomerInfo, replaceMasterCustomerFile,
  type ReconcileSettings, type MasterCustomerInfo,
} from '../../../lib/api';
import { useHasPermission } from '../../../hooks/useHasPermission';
import AccessDenied from '../../../components/common/AccessDenied';
import BackButton from '../../../components/common/BackButton';
import PageLoader, { Spinner } from '../../../components/common/PageLoader';
import { useToast } from '../../../components/common/Toast';
import { Dropzone } from '../../../components/common/FileDropzone';
import RightPanel from '../../../components/common/RightPanel';
import Pagination from '../../../components/common/Pagination';
import { useT } from '../../../lib/i18n';
import s from './ReconcileSettingsPage.module.css';

const MAX_FILE_SIZE = 60 * 1024 * 1024; // 60MB — must match apps/api multer limit

const SearchIcon = (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
    <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.4"/>
    <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
  </svg>
);

export default function ReconcileSettingsPage() {
  const canConfig = useHasPermission('reconcile:config');
  const toast = useToast();
  const { t, lang } = useT();

  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<ReconcileSettings | null>(null);
  const [masterInfo, setMasterInfo] = useState<MasterCustomerInfo | null>(null);

  const [panelOpen, setPanelOpen] = useState(false);
  const [headerRow, setHeaderRow] = useState('1');
  const [salesColumn, setSalesColumn] = useState('');
  const [taxColumn, setTaxColumn] = useState('');
  const [noteColumn, setNoteColumn] = useState('');
  const [customerColumn, setCustomerColumn] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const [masterEditing, setMasterEditing] = useState(false);
  const [masterReplacing, setMasterReplacing] = useState(false);
  const [masterDropActive, setMasterDropActive] = useState(false);
  const [masterSearch, setMasterSearch] = useState('');
  const [masterPage, setMasterPage] = useState(1);
  const [masterPageSize, setMasterPageSize] = useState(20);

  const [prevMasterSearch, setPrevMasterSearch] = useState(masterSearch);
  if (masterSearch !== prevMasterSearch) {
    setPrevMasterSearch(masterSearch);
    setMasterPage(1);
  }

  async function load() {
    setLoading(true);
    try {
      const [settingsRes, masterRes] = await Promise.all([
        getReconcileSettings(),
        getMasterCustomerInfo(),
      ]);
      setSettings(settingsRes);
      setMasterInfo(masterRes);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (canConfig) Promise.resolve().then(() => load()); }, [canConfig]);

  if (!canConfig) return <AccessDenied />;
  if (loading) return <PageLoader />;

  const masterFilteredItems = masterSearch
    ? (masterInfo?.items ?? []).filter(i =>
        i.brandName.toLowerCase().includes(masterSearch.toLowerCase()) ||
        i.customerName.toLowerCase().includes(masterSearch.toLowerCase()))
    : (masterInfo?.items ?? []);

  function openPanel() {
    setHeaderRow(String(settings?.headerRow ?? 1));
    setSalesColumn(settings?.salesColumn ?? '');
    setTaxColumn(settings?.taxColumn ?? '');
    setNoteColumn(settings?.noteColumn ?? '');
    setCustomerColumn(settings?.customerColumn ?? '');
    setFieldErrors({});
    setPanelOpen(true);
  }

  function clearField(field: string) {
    setFieldErrors(prev => { const next = { ...prev }; delete next[field]; return next; });
  }

  function validate(): Record<string, string> {
    const errs: Record<string, string> = {};
    if (!headerRow.trim() || !Number.isInteger(Number(headerRow)) || Number(headerRow) < 1) {
      errs.headerRow = t('reconcile.errorHeaderRow');
    }
    if (!salesColumn.trim()) errs.salesColumn = t('reconcile.errorColumnRequired');
    if (!taxColumn.trim()) errs.taxColumn = t('reconcile.errorColumnRequired');
    if (!noteColumn.trim()) errs.noteColumn = t('reconcile.errorColumnRequired');
    if (!customerColumn.trim()) errs.customerColumn = t('reconcile.errorColumnRequired');
    return errs;
  }

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) { setFieldErrors(errs); return; }
    setFieldErrors({});
    setSaving(true);
    try {
      const updated = await updateReconcileSettings({
        headerRow: Number(headerRow),
        salesColumn, taxColumn, noteColumn, customerColumn,
      });
      setSettings(updated);
      setPanelOpen(false);
      toast.success(t('reconcileSettings.saveSuccess'));
    } catch {
      toast.error(t('reconcileSettings.saveError'));
    } finally {
      setSaving(false);
    }
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

  const panelFooter = (
    <>
      <button type="button" className={s.btnSecondary} onClick={() => setPanelOpen(false)}>{t('common.cancel')}</button>
      <button type="submit" form="reconcile-settings-form" className={s.btnPrimary} disabled={saving}>
        {saving ? t('common.saving') : t('common.save')}
      </button>
    </>
  );

  return (
    <div className={s.page}>
      <div className={s.pageHeader}>
        <BackButton href="/settings" />
        <h1 className={s.pageTitle}>{t('reconcileSettings.title')}</h1>
      </div>

      <div className={s.card}>
        <div className={s.cardHead}>
          <p className={s.cardTitle}>{t('reconcile.columnMappingLabel')}</p>
          <button type="button" className={s.btnSecondary} onClick={openPanel}>{t('reconcileSettings.editButton')}</button>
        </div>
        <div className={s.infoRow}>
          <span className={s.infoLabel}>{t('reconcile.headerRowLabel')}</span>
          <span className={s.infoValue}>{settings?.headerRow}</span>
        </div>
        <div className={s.infoRow}>
          <span className={s.infoLabel}>{t('reconcile.salesColumnLabel')}</span>
          <span className={s.infoValue}>{settings?.salesColumn}</span>
        </div>
        <div className={s.infoRow}>
          <span className={s.infoLabel}>{t('reconcile.taxColumnLabel')}</span>
          <span className={s.infoValue}>{settings?.taxColumn}</span>
        </div>
        <div className={s.infoRow}>
          <span className={s.infoLabel}>{t('reconcile.noteColumnLabel')}</span>
          <span className={s.infoValue}>{settings?.noteColumn}</span>
        </div>
        <div className={s.infoRow}>
          <span className={s.infoLabel}>{t('reconcile.customerColumnLabel')}</span>
          <span className={s.infoValue}>{settings?.customerColumn}</span>
        </div>
      </div>

      <div className={s.card}>
        <div className={s.cardHead}>
          <p className={s.cardTitle}>{t('reconcile.masterFileLabel')}</p>
          {!masterEditing && (masterInfo?.count ?? 0) > 0 && (
            <button type="button" className={s.btnPrimary} onClick={() => setMasterEditing(true)}>
              {t('reconcile.masterImportButton')}
            </button>
          )}
        </div>

        {masterInfo && masterInfo.count > 0 && (
          <p className={s.masterInfoText}>
            {t('reconcile.masterInfoCount', {
              count: masterInfo.count,
              date: masterInfo.updatedAt
                ? new Date(masterInfo.updatedAt).toLocaleString(lang === 'vi' ? 'vi-VN' : 'en-US')
                : '—',
            })}
          </p>
        )}

        {(masterEditing || (masterInfo?.count ?? 0) === 0) ? (
          <div className={s.masterUploadArea}>
            <Dropzone
              hint={t('reconcile.masterDropzoneHint')}
              sub={t('reconcile.masterDropzoneSub')}
              onFiles={handleReplaceMasterFile}
              active={masterDropActive}
              setActive={setMasterDropActive}
              multiple={false}
            />
            {masterReplacing ? (
              <span className={s.processingHint}>
                <Spinner size={16} />
                {t('reconcile.processing')}
              </span>
            ) : masterEditing && (masterInfo?.count ?? 0) > 0 ? (
              <button type="button" className={s.btnSecondary} onClick={() => setMasterEditing(false)}>
                {t('common.cancel')}
              </button>
            ) : null}
          </div>
        ) : (
          <>
            <div className={s.filterBar}>
              <div className={s.searchWrap}>
                <span className={s.searchIcon}>{SearchIcon}</span>
                <input
                  className={s.searchInput}
                  placeholder={t('reconcile.masterSearchPlaceholder')}
                  value={masterSearch}
                  onChange={e => setMasterSearch(e.target.value)}
                />
              </div>
            </div>
            <div className={s.tableWrap}>
              <table className={s.table}>
                <thead>
                  <tr>
                    <th className={s.th}>{t('reconcile.masterTableBrand')}</th>
                    <th className={s.th}>{t('reconcile.masterTableCustomer')}</th>
                  </tr>
                </thead>
                <tbody>
                  {masterFilteredItems.slice((masterPage - 1) * masterPageSize, masterPage * masterPageSize).map(item => (
                    <tr key={item.brandName}>
                      <td className={s.td}>{item.brandName}</td>
                      <td className={s.td}>{item.customerName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pagination
                page={masterPage}
                pageSize={masterPageSize}
                total={masterFilteredItems.length}
                onPageChange={setMasterPage}
                onPageSizeChange={size => { setMasterPageSize(size); setMasterPage(1); }}
              />
            </div>
          </>
        )}
      </div>

      <RightPanel
        title={t('reconcileSettings.editButton')}
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        footer={panelFooter}
      >
        <form id="reconcile-settings-form" className={s.form} onSubmit={handleSaveSettings}>
          <div className={s.field}>
            <label className={s.label}>{t('reconcile.headerRowLabel')}</label>
            <input
              type="number"
              min={1}
              className={`${s.input} ${fieldErrors.headerRow ? s.inputError : ''}`}
              value={headerRow}
              onChange={e => { setHeaderRow(e.target.value); clearField('headerRow'); }}
              autoFocus
            />
            {fieldErrors.headerRow && <span className={s.fieldError}>{fieldErrors.headerRow}</span>}
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
            <label className={s.label}>{t('reconcile.customerColumnLabel')}</label>
            <input
              className={`${s.input} ${fieldErrors.customerColumn ? s.inputError : ''}`}
              value={customerColumn}
              onChange={e => { setCustomerColumn(e.target.value); clearField('customerColumn'); }}
            />
            {fieldErrors.customerColumn && <span className={s.fieldError}>{fieldErrors.customerColumn}</span>}
          </div>
        </form>
      </RightPanel>
    </div>
  );
}
