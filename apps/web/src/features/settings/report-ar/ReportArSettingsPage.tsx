'use client';

import { useEffect, useState } from 'react';
import {
  listArGsheets, createArGsheet, updateArGsheet,
  type ArGsheetConfig,
} from '../../../lib/api';
import { useHasPermission } from '../../../hooks/useHasPermission';
import AccessDenied from '../../../components/common/AccessDenied';
import BackButton from '../../../components/common/BackButton';
import PageLoader from '../../../components/common/PageLoader';
import ServiceAccountShareInfo from '../../../components/common/ServiceAccountShareInfo';
import Tooltip from '../../../components/common/Tooltip';
import { useToast } from '../../../components/common/Toast';
import { useT } from '../../../lib/i18n';
import { extractSpreadsheetId, isValidSpreadsheetId } from '../../../lib/googleSheets';
import s from './ReportArSettingsPage.module.css';

type Tab = 'connect' | 'gsheets';
type T = ReturnType<typeof useT>['t'];

export default function ReportArSettingsPage() {
  const canView = useHasPermission('report_ar:view');
  const canConfig = useHasPermission('report_ar:config');
  const toast = useToast();
  const { t } = useT();
  const [tab, setTab] = useState<Tab>('gsheets');
  const [loading, setLoading] = useState(true);
  const [gsheets, setGsheets] = useState<ArGsheetConfig[]>([]);

  async function load() {
    setLoading(true);
    try {
      const g = await listArGsheets();
      setGsheets(g);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Deferred a tick so load()'s internal setState isn't synchronous with the effect itself.
    if (canView) Promise.resolve().then(() => load());
  }, [canView]);

  if (!canView) return <AccessDenied />;
  if (loading) return <PageLoader />;

  return (
    <div className={s.page}>
      <div className={s.pageHeader}>
        <BackButton href="/settings" />
        <h1 className={s.pageTitle}>{t('reportArSettings.title')}</h1>
      </div>

      <div className={s.tabs}>
        {([
          ['gsheets', t('reportArSettings.tabGsheets')],
          ['connect', t('reportArSettings.tabConnect')],
        ] as [Tab, string][]).map(([key, label]) => (
          <button
            key={key}
            className={`${s.tab} ${tab === key ? s.tabActive : ''}`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'connect' && <ConnectTab />}
      {tab === 'gsheets' && (
        <GsheetsTab
          gsheets={gsheets}
          canConfig={canConfig}
          onSaved={() => load()}
          toast={toast}
          t={t}
        />
      )}
    </div>
  );
}

// ─── Tab: Connection ────────────────────────────────────────────────────────

function ConnectTab() {
  return (
    <div className={s.section}>
      <ServiceAccountShareInfo />
    </div>
  );
}

// ─── Tab: Google Sheets ───────────────────────────────────────────────────────

function GsheetsTab({
  gsheets,
  canConfig,
  onSaved,
  toast,
  t,
}: {
  gsheets: ArGsheetConfig[];
  canConfig: boolean;
  onSaved: () => void;
  toast: ReturnType<typeof useToast>;
  t: T;
}) {
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [addingNew, setAddingNew] = useState(false);

  const openEdit = (code: string) => { setEditingCode(code); setAddingNew(false); };
  const openNew  = () => { setEditingCode(null); setAddingNew(true); };
  const closeForm = () => { setEditingCode(null); setAddingNew(false); };

  const editing = editingCode ? gsheets.find(g => g.countryCode === editingCode) ?? null : null;

  return (
    <div className={s.section}>
      <div className={s.sectionHeader}>
        <div>
          <div className={s.sectionTitle}>{t('reportArSettings.spreadsheetByCountryTitle')}</div>
          <div className={s.sectionDesc}>{t('reportArSettings.spreadsheetByCountryDesc')}</div>
        </div>
        {canConfig && <button className={s.btnPrimary} onClick={openNew}>{t('reportArSettings.addBtn')}</button>}
      </div>

      {gsheets.length === 0 && !addingNew ? (
        <div className={s.empty}>{t('reportArSettings.emptyGsheets')}</div>
      ) : (
        <div className={s.configList}>
          {gsheets.map(g => (
            <div key={g.countryCode} className={s.configRow}>
              <div className={s.configMain}>
                <span className={s.countryBadge}>{g.countryCode}</span>
                <div className={s.configDetails}>
                  <span className={s.configId}>{g.spreadsheetId}</span>
                  <span className={s.configMeta}>{t('reportArSettings.sheetMeta', { name: g.sheetName })}</span>
                </div>
              </div>
              <div className={s.configActions}>
                {g.isActive
                  ? <span className={s.badgeActive}>{t('reportArSettings.active')}</span>
                  : <span className={s.badgeInactive}>{t('reportArSettings.inactive')}</span>
                }
                {canConfig && <button className={s.editBtn} onClick={() => openEdit(g.countryCode)}>{t('reportArSettings.edit')}</button>}
              </div>
            </div>
          ))}
        </div>
      )}

      {canConfig && (addingNew || editingCode) && (
        <GsheetForm
          initial={editing}
          onClose={closeForm}
          onSaved={() => { closeForm(); onSaved(); }}
          toast={toast}
          t={t}
        />
      )}
    </div>
  );
}

function GsheetForm({
  initial,
  onClose,
  onSaved,
  toast,
  t,
}: {
  initial: ArGsheetConfig | null;
  onClose: () => void;
  onSaved: () => void;
  toast: ReturnType<typeof useToast>;
  t: T;
}) {
  const [countryCode, setCountryCode] = useState(initial?.countryCode ?? '');
  const [spreadsheetId, setSpreadsheetId] = useState(initial?.spreadsheetId ?? '');
  const [sheetName, setSheetName] = useState(initial?.sheetName ?? 'TH');
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function validate(cleanId: string) {
    const errs: Record<string, string> = {};
    if (!countryCode.trim()) errs.countryCode = t('reportArSettings.countryCodeRequired');
    if (!cleanId) errs.spreadsheetId = t('reportArSettings.spreadsheetIdRequired');
    else if (!isValidSpreadsheetId(cleanId)) errs.spreadsheetId = t('reportArSettings.spreadsheetIdInvalid');
    if (!sheetName.trim()) errs.sheetName = t('reportArSettings.sheetNameRequired');
    return errs;
  }

  async function save() {
    const cleanId = extractSpreadsheetId(spreadsheetId);
    const errs = validate(cleanId);
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    setSpreadsheetId(cleanId);
    setSaving(true);
    try {
      const body = {
        countryCode: countryCode.trim().toUpperCase(),
        spreadsheetId: cleanId,
        sheetName: sheetName.trim(),
        isActive,
      };
      if (initial) await updateArGsheet(initial.id, body);
      else await createArGsheet(body);
      toast.success(initial ? t('reportArSettings.configUpdated') : t('reportArSettings.configAdded'));
      onSaved();
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      toast.error(code === 'COUNTRY_CODE_EXISTS' ? t('reportArSettings.countryCodeExists') : t('reportArSettings.saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={s.formCard}>
      <div className={s.formTitle}>{initial ? t('reportArSettings.editConfigTitle') : t('reportArSettings.addConfigTitle')}</div>

      <div className={s.formGrid}>
        <div className={s.field}>
          <label className={s.label}>{t('reportArSettings.countryCodeLabel')}</label>
          <input
            className={`${s.input} ${errors.countryCode ? s.inputError : ''}`}
            value={countryCode}
            onChange={e => { setCountryCode(e.target.value.toUpperCase()); setErrors(p => { const n = {...p}; delete n.countryCode; return n; }); }}
            placeholder="TH"
            maxLength={5}
          />
          {errors.countryCode && <span className={s.fieldError}>{errors.countryCode}</span>}
        </div>

        <div className={s.field}>
          <label className={s.label}>{t('reportArSettings.sheetNameLabel')}</label>
          <input
            className={`${s.input} ${errors.sheetName ? s.inputError : ''}`}
            value={sheetName}
            onChange={e => { setSheetName(e.target.value); setErrors(p => { const n = {...p}; delete n.sheetName; return n; }); }}
            placeholder="TH"
          />
          {errors.sheetName && <span className={s.fieldError}>{errors.sheetName}</span>}
        </div>
      </div>

      <div className={s.field}>
        <label className={s.label}>
          {t('reportArSettings.spreadsheetIdLabel')}
          <Tooltip>{t('reportArSettings.spreadsheetIdTooltip')}</Tooltip>
        </label>
        <input
          className={`${s.input} ${errors.spreadsheetId ? s.inputError : ''}`}
          value={spreadsheetId}
          onChange={e => { setSpreadsheetId(e.target.value); setErrors(p => { const n = {...p}; delete n.spreadsheetId; return n; }); }}
          onBlur={e => setSpreadsheetId(extractSpreadsheetId(e.target.value))}
          placeholder={t('reportArSettings.spreadsheetIdPlaceholder')}
        />
        {errors.spreadsheetId && <span className={s.fieldError}>{errors.spreadsheetId}</span>}
      </div>

      <div className={s.toggleRow}>
        <span className={s.toggleLabel}>{t('reportArSettings.activeToggleLabel')}</span>
        <button
          className={`${s.toggle} ${isActive ? s.toggleOn : ''}`}
          onClick={() => setIsActive(v => !v)}
          type="button"
        />
      </div>

      <div className={s.formActions}>
        <button className={s.btnSecondary} onClick={onClose}>{t('reportArSettings.cancel')}</button>
        <button className={s.btnPrimary} onClick={save} disabled={saving}>
          {saving ? t('reportArSettings.saving') : t('reportArSettings.save')}
        </button>
      </div>
    </div>
  );
}
