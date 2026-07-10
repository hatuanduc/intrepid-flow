'use client';

import { useEffect, useState } from 'react';
import {
  getCurrencyData, refreshCurrencyRates, updateCurrencySettings, type CurrencyData,
  addCurrencyRate, deleteCurrencyRate,
} from '../../../lib/api';
import { useHasPermission } from '../../../hooks/useHasPermission';
import { useToast } from '../../../components/common/Toast';
import AccessDenied from '../../../components/common/AccessDenied';
import PageLoader from '../../../components/common/PageLoader';
import s from './GeographyPage.module.css';

const AVAILABLE_CURRENCIES = [
  { code: 'AUD', name: 'Đô-la Úc' },
  { code: 'BGN', name: 'Lev Bulgaria' },
  { code: 'BRL', name: 'Real Brazil' },
  { code: 'CAD', name: 'Đô-la Canada' },
  { code: 'CHF', name: 'Franc Thụy Sĩ' },
  { code: 'CNY', name: 'Nhân dân tệ' },
  { code: 'CZK', name: 'Koruna Czech' },
  { code: 'DKK', name: 'Krone Đan Mạch' },
  { code: 'EUR', name: 'Euro' },
  { code: 'GBP', name: 'Bảng Anh' },
  { code: 'HKD', name: 'Đô-la Hong Kong' },
  { code: 'HUF', name: 'Forint Hungary' },
  { code: 'IDR', name: 'Rupiah Indonesia' },
  { code: 'ILS', name: 'Shekel Israel' },
  { code: 'INR', name: 'Rupee Ấn Độ' },
  { code: 'ISK', name: 'Króna Iceland' },
  { code: 'JPY', name: 'Yên Nhật' },
  { code: 'KRW', name: 'Won Hàn Quốc' },
  { code: 'MXN', name: 'Peso Mexico' },
  { code: 'MYR', name: 'Ringgit Malaysia' },
  { code: 'NOK', name: 'Krone Na Uy' },
  { code: 'NZD', name: 'Đô-la New Zealand' },
  { code: 'PHP', name: 'Peso Philippines' },
  { code: 'PLN', name: 'Zloty Ba Lan' },
  { code: 'RON', name: 'Leu Romania' },
  { code: 'SEK', name: 'Krona Thụy Điển' },
  { code: 'SGD', name: 'Đô-la Singapore' },
  { code: 'THB', name: 'Baht Thái Lan' },
  { code: 'TRY', name: 'Lira Thổ Nhĩ Kỳ' },
  { code: 'USD', name: 'Đô-la Mỹ' },
  { code: 'ZAR', name: 'Rand Nam Phi' },
];

function fmtDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

const CURRENCY_MAP = Object.fromEntries(AVAILABLE_CURRENCIES.map(c => [c.code, c]));

export default function GeographyPage() {
  const canConfig = useHasPermission('system:config');
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [currencyData, setCurrencyData] = useState<CurrencyData | null>(null);
  const [currencyRefreshing, setCurrencyRefreshing] = useState(false);
  const [autoUpdateDay, setAutoUpdateDay] = useState(1);
  const [dayEditing, setDayEditing] = useState(false);
  const [addingCurrency, setAddingCurrency] = useState(false);
  const [currencySearch, setCurrencySearch] = useState('');
  const [deletingRate, setDeletingRate] = useState<string | null>(null);

  useEffect(() => {
    if (!canConfig) { setLoading(false); return; }
    getCurrencyData()
      .then(curr => {
        setCurrencyData(curr);
        setAutoUpdateDay(curr.settings?.autoUpdateDay ?? 1);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [canConfig]);

  if (!canConfig) return <AccessDenied />;

  const existingCodes = new Set(currencyData?.rates.map(r => r.currency) ?? []);
  const pickerOptions = AVAILABLE_CURRENCIES
    .filter(c => !existingCodes.has(c.code))
    .filter(c =>
      currencySearch === '' ||
      c.code.toLowerCase().includes(currencySearch.toLowerCase()) ||
      c.name.toLowerCase().includes(currencySearch.toLowerCase())
    );

  async function handleRefreshRates() {
    setCurrencyRefreshing(true);
    try {
      setCurrencyData(await refreshCurrencyRates());
      toast.success('Tỉ giá đã được cập nhật.');
    } catch { toast.error('Cập nhật thất bại. Vui lòng thử lại.'); }
    finally { setCurrencyRefreshing(false); }
  }

  async function handleAddCurrency(code: string) {
    setAddingCurrency(false);
    try {
      setCurrencyData(await addCurrencyRate(code));
      toast.success(`Đã thêm tỉ giá ${code}.`);
    } catch { toast.error(`Thêm ${code} thất bại. Vui lòng thử lại.`); }
  }

  async function handleDeleteRate(currency: string) {
    setDeletingRate(currency);
    try {
      setCurrencyData(await deleteCurrencyRate(currency));
      toast.success(`Đã xóa tỉ giá ${currency}.`);
    } catch { toast.error(`Xóa ${currency} thất bại.`); }
    finally { setDeletingRate(null); }
  }

  async function handleSaveDay() {
    try {
      const settings = await updateCurrencySettings({ autoUpdateDay });
      setCurrencyData(prev => prev ? { ...prev, settings } : prev);
      setDayEditing(false);
      toast.success('Đã lưu ngày cập nhật.');
    } catch { toast.error('Lưu thất bại.'); }
  }

  return (
    <div className={s.page}>
      <div className={s.pageHeader}>
        <h1 className={s.pageTitle}>Tỉ giá</h1>
      </div>

      {loading ? <PageLoader /> : (
        <div className={s.section}>
          <div className={s.sectionHead}>
            <div>
              <p className={s.sectionTitle}>Tỉ giá hối đoái → USD</p>
              <p className={s.sectionDesc}>
                Tỉ giá lấy từ frankfurter.app (ECB). Tự động làm mới cho các đơn vị đang dùng trong hệ thống.
                {currencyData?.settings?.lastUpdatedAt && (
                  <> Cập nhật lần cuối: <strong>{fmtDateTime(currencyData.settings.lastUpdatedAt)}</strong>.</>
                )}
              </p>
            </div>
            <div className={s.ratesActions}>
              <button className={s.btnSecondary} onClick={handleRefreshRates} disabled={currencyRefreshing}>
                {currencyRefreshing ? 'Đang cập nhật...' : 'Cập nhật'}
              </button>
              <div className={s.addCurrencyWrap}>
                <button
                  className={s.btnSecondary}
                  onClick={() => { setAddingCurrency(v => !v); setCurrencySearch(''); }}
                >
                  + Thêm
                </button>
                {addingCurrency && (
                  <>
                    <div className={s.pickerBackdrop} onClick={() => setAddingCurrency(false)} />
                    <div className={s.currencyPickerDropdown}>
                      <div className={s.pickerSearch}>
                        <input
                          className={s.pickerSearchInput}
                          placeholder="Tìm kiếm tiền tệ..."
                          value={currencySearch}
                          onChange={e => setCurrencySearch(e.target.value)}
                          autoFocus
                        />
                      </div>
                      <div className={s.pickerList}>
                        {pickerOptions.length === 0 ? (
                          <div className={s.pickerEmpty}>Không có kết quả.</div>
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
            <span className={s.autoUpdateLabel}>Tự động cập nhật vào ngày</span>
            {dayEditing ? (
              <>
                <select
                  className={s.daySelect}
                  value={autoUpdateDay}
                  onChange={e => setAutoUpdateDay(Number(e.target.value))}
                >
                  {Array.from({ length: 28 }, (_, i) => i + 1).map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
                <span className={s.autoUpdateLabel}>mỗi tháng</span>
                <button className={s.btnTiny} onClick={handleSaveDay}>Lưu</button>
                <button className={s.btnTinyGhost} onClick={() => {
                  setAutoUpdateDay(currencyData?.settings?.autoUpdateDay ?? 1);
                  setDayEditing(false);
                }}>Hủy</button>
              </>
            ) : (
              <>
                <strong className={s.dayValue}>{autoUpdateDay}</strong>
                <span className={s.autoUpdateLabel}>mỗi tháng</span>
                <button className={s.btnTinyGhost} onClick={() => setDayEditing(true)}>Thay đổi</button>
                {currencyData?.settings?.nextUpdateAt && (
                  <span className={s.nextUpdate}>· Tiếp theo: {fmtDate(currencyData.settings.nextUpdateAt)}</span>
                )}
              </>
            )}
          </div>

          {!currencyData || currencyData.rates.length === 0 ? (
            <div className={s.empty}>
              Chưa có tỉ giá. Nhấn &ldquo;Cập nhật&rdquo; hoặc &ldquo;+ Thêm&rdquo; để thêm đơn vị tiền tệ.
            </div>
          ) : (
            <div className={s.tableWrap}>
              <table className={s.table}>
                <thead>
                  <tr>
                    <th className={s.th}>Tiền tệ</th>
                    <th className={s.th}>Tỉ giá</th>
                    <th className={s.th}>Cập nhật lúc</th>
                    <th className={s.th} />
                  </tr>
                </thead>
                <tbody>
                  {currencyData.rates.map(r => {
                    const meta = CURRENCY_MAP[r.currency];
                    return (
                    <tr key={r.currency} className={s.trStatic}>
                      <td className={s.td}>
                        <div className={s.currencyCell}>
                          {meta && <img src={`https://wise.com/web-art/assets/flags/${r.currency.toLowerCase()}.svg`} className={s.flagImg} alt="" />}
                          <span className={s.currencyTag}>{r.currency}</span>
                          {meta && <span className={s.currencyName}>{meta.name}</span>}
                        </div>
                      </td>
                      <td className={s.td}>
                        <span className={s.rateValue}>
                          1 {r.currency} = {Number(r.rateToUsd).toFixed(r.currency === 'IDR' ? 6 : 4)} USD
                        </span>
                      </td>
                      <td className={s.td}><span className={s.metaText}>{fmtDateTime(r.updatedAt)}</span></td>
                      <td className={s.td}>
                        <button
                          className={s.btnDangerSm}
                          onClick={() => handleDeleteRate(r.currency)}
                          disabled={deletingRate === r.currency}
                        >
                          {deletingRate === r.currency ? '...' : 'Xóa'}
                        </button>
                      </td>
                    </tr>
                  );})}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
