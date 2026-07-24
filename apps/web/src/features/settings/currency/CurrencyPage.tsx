'use client';

import { useEffect, useRef, useState } from 'react';
import {
  getCurrencyData, refreshCurrencyRates, updateCurrencySettings, type CurrencyData,
  addCurrencyRate, deleteCurrencyRate,
} from '../../../lib/api';
import { useHasPermission } from '../../../hooks/useHasPermission';
import { useToast } from '../../../components/common/Toast';
import { useT } from '../../../lib/i18n';
import AccessDenied from '../../../components/common/AccessDenied';
import BackButton from '../../../components/common/BackButton';
import PageLoader from '../../../components/common/PageLoader';
import Select from '../../../components/common/Select';
import s from './CurrencyPage.module.css';

const CURRENCY_CODES = [
  'AUD', 'BGN', 'BRL', 'CAD', 'CHF', 'CNY', 'CZK', 'DKK', 'EUR', 'GBP',
  'HKD', 'HUF', 'IDR', 'ILS', 'INR', 'ISK', 'JPY', 'KRW', 'MXN', 'MYR',
  'NOK', 'NZD', 'PHP', 'PLN', 'RON', 'SEK', 'SGD', 'THB', 'TRY', 'USD',
  'VND', 'ZAR',
];
const CURRENCY_CODE_SET = new Set(CURRENCY_CODES);

function MoreMenu({ onDelete }: { onDelete?: () => void }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);
  if (!onDelete) return null;
  return (
    <div className={s.moreWrap} ref={ref} onClick={e => e.stopPropagation()}>
      <button
        className={`${s.moreBtn} ${open ? s.moreBtnOpen : ''}`}
        onClick={() => setOpen(v => !v)}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <circle cx="2" cy="7" r="1.2" fill="currentColor"/>
          <circle cx="7" cy="7" r="1.2" fill="currentColor"/>
          <circle cx="12" cy="7" r="1.2" fill="currentColor"/>
        </svg>
      </button>
      {open && (
        <div className={s.moreDropdown}>
          <button
            className={`${s.moreItem} ${s.moreItemDanger}`}
            onClick={() => { setOpen(false); onDelete(); }}
          >
            {t('currencySettings.delete')}
          </button>
        </div>
      )}
    </div>
  );
}

export default function CurrencyPage() {
  const canConfig = useHasPermission('system:config');
  const toast = useToast();
  const { t, lang } = useT();
  const locale = lang === 'vi' ? 'vi-VN' : 'en-US';

  const [loading, setLoading] = useState(true);
  const [currencyData, setCurrencyData] = useState<CurrencyData | null>(null);
  const [currencyRefreshing, setCurrencyRefreshing] = useState(false);
  const [autoUpdateDay, setAutoUpdateDay] = useState(1);
  const [dayEditing, setDayEditing] = useState(false);
  const [addingCurrency, setAddingCurrency] = useState(false);
  const [currencySearch, setCurrencySearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deletingRate, setDeletingRate] = useState<string | null>(null);

  useEffect(() => {
    if (!canConfig) return;
    getCurrencyData()
      .then(curr => {
        setCurrencyData(curr);
        setAutoUpdateDay(curr.settings?.autoUpdateDay ?? 1);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [canConfig]);

  if (!canConfig) return <AccessDenied />;

  function fmtDateTime(iso: string) {
    const d = new Date(iso);
    return d.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' })
      + ' ' + d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  }
  function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
  function currencyName(code: string) {
    return t(`currencySettings.currencyNames.${code}`);
  }

  const existingCodes = new Set(currencyData?.rates.map(r => r.currency) ?? []);
  const pickerOptions = CURRENCY_CODES
    .filter(code => !existingCodes.has(code))
    .map(code => ({ code, name: currencyName(code) }))
    .filter(c =>
      currencySearch === '' ||
      c.code.toLowerCase().includes(currencySearch.toLowerCase()) ||
      c.name.toLowerCase().includes(currencySearch.toLowerCase())
    );

  async function handleRefreshRates() {
    setCurrencyRefreshing(true);
    try {
      setCurrencyData(await refreshCurrencyRates());
      toast.success(t('currencySettings.refreshSuccess'));
    } catch { toast.error(t('currencySettings.refreshFailed')); }
    finally { setCurrencyRefreshing(false); }
  }

  async function handleAddCurrency(code: string) {
    setAddingCurrency(false);
    try {
      setCurrencyData(await addCurrencyRate(code));
      toast.success(t('currencySettings.addSuccess', { code }));
    } catch { toast.error(t('currencySettings.addFailed', { code })); }
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    const currency = deleteTarget;
    setDeletingRate(currency);
    try {
      setCurrencyData(await deleteCurrencyRate(currency));
      toast.success(t('currencySettings.deleteSuccess', { code: currency }));
      setDeleteTarget(null);
    } catch { toast.error(t('currencySettings.deleteFailed', { code: currency })); }
    finally { setDeletingRate(null); }
  }

  async function handleSaveDay() {
    try {
      const settings = await updateCurrencySettings({ autoUpdateDay });
      setCurrencyData(prev => prev ? { ...prev, settings } : prev);
      setDayEditing(false);
      toast.success(t('currencySettings.daySaved'));
    } catch { toast.error(t('currencySettings.daySaveFailed')); }
  }

  return (
    <div className={s.page}>
      <div className={s.pageHeader}>
        <BackButton href="/settings" />
        <h1 className={s.pageTitle}>{t('currencySettings.title')}</h1>
      </div>

      {loading ? <PageLoader /> : (
        <div className={s.section}>
          <div className={s.sectionHead}>
            <div>
              <p className={s.sectionTitle}>{t('currencySettings.sectionTitle')}</p>
              <p className={s.sectionDesc}>
                {t('currencySettings.sectionDesc')}
                {currencyData?.settings?.lastUpdatedAt && (
                  <> {t('currencySettings.lastUpdated', { date: fmtDateTime(currencyData.settings.lastUpdatedAt) })}</>
                )}
              </p>
            </div>
            <div className={s.ratesActions}>
              <button className={s.btnSecondary} onClick={handleRefreshRates} disabled={currencyRefreshing}>
                {currencyRefreshing ? t('currencySettings.refreshing') : t('currencySettings.refresh')}
              </button>
              <div className={s.addCurrencyWrap}>
                <button
                  className={s.btnSecondary}
                  onClick={() => { setAddingCurrency(v => !v); setCurrencySearch(''); }}
                >
                  {t('currencySettings.addCurrency')}
                </button>
                {addingCurrency && (
                  <>
                    <div className={s.pickerBackdrop} onClick={() => setAddingCurrency(false)} />
                    <div className={s.currencyPickerDropdown}>
                      <div className={s.pickerSearch}>
                        <input
                          className={s.pickerSearchInput}
                          placeholder={t('currencySettings.searchPlaceholder')}
                          value={currencySearch}
                          onChange={e => setCurrencySearch(e.target.value)}
                          autoFocus
                        />
                      </div>
                      <div className={s.pickerList}>
                        {pickerOptions.length === 0 ? (
                          <div className={s.pickerEmpty}>{t('currencySettings.noResults')}</div>
                        ) : pickerOptions.map(c => (
                          <button
                            key={c.code}
                            className={s.pickerOption}
                            onClick={() => handleAddCurrency(c.code)}
                          >
                            <img src={`https://wise.com/web-art/assets/flags/${c.code.toLowerCase()}.svg`} className={s.flagImg} alt="" />
                            <span className={s.pickerCode}>{c.code}</span>
                            <span className={s.pickerName}>{c.name}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className={s.autoUpdateRow}>
            <span className={s.autoUpdateLabel}>{t('currencySettings.autoUpdateLabel')}</span>
            {dayEditing ? (
              <>
                <Select
                  width={64}
                  value={autoUpdateDay}
                  onChange={setAutoUpdateDay}
                  options={Array.from({ length: 28 }, (_, i) => i + 1).map(d => ({ value: d, label: String(d) }))}
                />
                <span className={s.autoUpdateLabel}>{t('currencySettings.perMonth')}</span>
                <button className={s.btnTiny} onClick={handleSaveDay}>{t('currencySettings.save')}</button>
                <button className={s.btnTinyGhost} onClick={() => {
                  setAutoUpdateDay(currencyData?.settings?.autoUpdateDay ?? 1);
                  setDayEditing(false);
                }}>{t('currencySettings.cancel')}</button>
              </>
            ) : (
              <>
                <strong className={s.dayValue}>{autoUpdateDay}</strong>
                <span className={s.autoUpdateLabel}>{t('currencySettings.perMonth')}</span>
                <button className={s.btnTinyGhost} onClick={() => setDayEditing(true)}>{t('currencySettings.change')}</button>
                {currencyData?.settings?.nextUpdateAt && (
                  <span className={s.nextUpdate}>{t('currencySettings.nextUpdate', { date: fmtDate(currencyData.settings.nextUpdateAt) })}</span>
                )}
              </>
            )}
          </div>

          {!currencyData || currencyData.rates.length === 0 ? (
            <div className={s.empty}>{t('currencySettings.empty')}</div>
          ) : (
            <div className={s.tableWrap}>
              <table className={s.table}>
                <thead>
                  <tr>
                    <th className={s.th}>{t('currencySettings.tableCurrency')}</th>
                    <th className={s.th}>{t('currencySettings.tableRate')}</th>
                    <th className={s.th}>{t('currencySettings.tableUpdatedAt')}</th>
                    <th className={s.th} />
                  </tr>
                </thead>
                <tbody>
                  {currencyData.rates.map(r => {
                    const known = CURRENCY_CODE_SET.has(r.currency);
                    return (
                    <tr key={r.currency} className={s.trStatic}>
                      <td className={s.td}>
                        <div className={s.currencyCell}>
                          {known && <img src={`https://wise.com/web-art/assets/flags/${r.currency.toLowerCase()}.svg`} className={s.flagImg} alt="" />}
                          <span className={s.currencyTag}>{r.currency}</span>
                          {known && <span className={s.currencyName}>{currencyName(r.currency)}</span>}
                        </div>
                      </td>
                      <td className={s.td}>
                        <span className={s.rateValue}>
                          1 {r.currency} = {Number(r.rateToUsd).toFixed(['IDR', 'VND'].includes(r.currency) ? 6 : 4)} USD
                        </span>
                      </td>
                      <td className={s.td}><span className={s.metaText}>{fmtDateTime(r.updatedAt)}</span></td>
                      <td className={s.td}>
                        <MoreMenu onDelete={() => setDeleteTarget(r.currency)} />
                      </td>
                    </tr>
                  );})}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {deleteTarget && (
        <div className={s.overlay} onClick={() => setDeleteTarget(null)}>
          <div className={s.confirmModal} onClick={e => e.stopPropagation()}>
            <p className={s.confirmTitle}>{t('currencySettings.confirmDeleteTitle')}</p>
            <p className={s.confirmDesc}>{t('currencySettings.confirmDeleteDesc', { code: deleteTarget })}</p>
            <div className={s.confirmActions}>
              <button className={s.btnSecondary} onClick={() => setDeleteTarget(null)} disabled={deletingRate === deleteTarget}>
                {t('currencySettings.cancel')}
              </button>
              <button className={s.btnDanger} onClick={handleConfirmDelete} disabled={deletingRate === deleteTarget}>
                {deletingRate === deleteTarget ? t('common.deleting') : t('currencySettings.delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
