'use client';

import { useEffect, useState } from 'react';
import {
  listCountries, createCountry, updateCountry, deleteCountry, type Country,
  getCurrencyData, refreshCurrencyRates, updateCurrencySettings, type CurrencyData,
} from '../../../lib/api';
import { useHasPermission } from '../../../hooks/useHasPermission';
import { useToast } from '../../../components/common/Toast';
import AccessDenied from '../../../components/common/AccessDenied';
import RightPanel from '../../../components/common/RightPanel';
import PageLoader from '../../../components/common/PageLoader';
import s from './GeographyPage.module.css';

function fmtDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function GeographyPage() {
  const canConfig = useHasPermission('system:config');
  const toast = useToast();

  const [loading, setLoading] = useState(true);

  // Countries
  const [countries, setCountries] = useState<Country[]>([]);
  const [countryPanelOpen, setCountryPanelOpen] = useState(false);
  const [editingCountry, setEditingCountry] = useState<Country | null>(null);
  const [deletingCountry, setDeletingCountry] = useState<Country | null>(null);
  const [countryForm, setCountryForm] = useState({ code: '', name: '', currency: '' });
  const [countryErrors, setCountryErrors] = useState<Record<string, string>>({});
  const [countrySaving, setCountrySaving] = useState(false);
  const [countryDeleting, setCountryDeleting] = useState(false);

  // Currency
  const [currencyData, setCurrencyData] = useState<CurrencyData | null>(null);
  const [currencyRefreshing, setCurrencyRefreshing] = useState(false);
  const [autoUpdateDay, setAutoUpdateDay] = useState(1);
  const [dayEditing, setDayEditing] = useState(false);

  useEffect(() => {
    if (!canConfig) { setLoading(false); return; }
    Promise.all([listCountries(), getCurrencyData()])
      .then(([ctrs, curr]) => {
        setCountries(ctrs);
        setCurrencyData(curr);
        setAutoUpdateDay(curr.settings?.autoUpdateDay ?? 1);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [canConfig]);

  if (!canConfig) return <AccessDenied />;

  // ── Country handlers ───────────────────────────────────────────────────────────

  function openAddCountry() {
    setEditingCountry(null);
    setCountryForm({ code: '', name: '', currency: '' });
    setCountryErrors({});
    setCountryPanelOpen(true);
  }

  function openEditCountry(c: Country) {
    setEditingCountry(c);
    setCountryForm({ code: c.code, name: c.name, currency: c.currency });
    setCountryErrors({});
    setCountryPanelOpen(true);
  }

  function clearField(field: string) {
    setCountryErrors(p => { const n = { ...p }; delete n[field]; return n; });
  }

  function validateCountryForm() {
    const errs: Record<string, string> = {};
    if (!editingCountry && !countryForm.code.trim()) errs.code = 'Vui lòng nhập mã quốc gia.';
    else if (!editingCountry && !/^[A-Za-z]{2}$/.test(countryForm.code.trim())) errs.code = 'Mã phải là 2 chữ cái (ISO 3166).';
    if (!countryForm.name.trim()) errs.name = 'Vui lòng nhập tên.';
    if (!countryForm.currency.trim()) errs.currency = 'Vui lòng nhập mã tiền tệ.';
    else if (!/^[A-Za-z]{3}$/.test(countryForm.currency.trim())) errs.currency = 'Mã phải là 3 chữ cái (ISO 4217).';
    return errs;
  }

  async function handleSaveCountry(e: React.FormEvent) {
    e.preventDefault();
    const errs = validateCountryForm();
    if (Object.keys(errs).length > 0) { setCountryErrors(errs); return; }
    setCountrySaving(true);
    try {
      if (editingCountry) {
        const updated = await updateCountry(editingCountry.code, {
          name: countryForm.name.trim(),
          currency: countryForm.currency.trim().toUpperCase(),
        });
        setCountries(prev => prev.map(c => c.code === updated.code ? updated : c));
        toast.success('Đã cập nhật quốc gia.');
      } else {
        const created = await createCountry({
          code: countryForm.code.trim().toUpperCase(),
          name: countryForm.name.trim(),
          currency: countryForm.currency.trim().toUpperCase(),
        });
        setCountries(prev => [...prev, created].sort((a, b) => a.code.localeCompare(b.code)));
        toast.success('Đã thêm quốc gia. Đang lấy tỉ giá...');
        getCurrencyData().then(setCurrencyData).catch(() => {});
      }
      setCountryPanelOpen(false);
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      if (code === 'COUNTRY_EXISTS') setCountryErrors({ code: 'Mã quốc gia này đã tồn tại.' });
      else toast.error('Lưu thất bại. Vui lòng thử lại.');
    } finally { setCountrySaving(false); }
  }

  async function handleDeleteCountry() {
    if (!deletingCountry) return;
    setCountryDeleting(true);
    try {
      await deleteCountry(deletingCountry.code);
      setCountries(prev => prev.filter(c => c.code !== deletingCountry.code));
      setDeletingCountry(null);
      toast.success(`Đã xóa ${deletingCountry.code}.`);
    } catch { toast.error('Xóa thất bại. Vui lòng thử lại.'); }
    finally { setCountryDeleting(false); }
  }

  // ── Currency handlers ──────────────────────────────────────────────────────────

  async function handleRefreshRates() {
    setCurrencyRefreshing(true);
    try {
      setCurrencyData(await refreshCurrencyRates());
      toast.success('Tỉ giá đã được cập nhật.');
    } catch { toast.error('Cập nhật thất bại. Vui lòng thử lại.'); }
    finally { setCurrencyRefreshing(false); }
  }

  async function handleSaveDay() {
    try {
      const settings = await updateCurrencySettings({ autoUpdateDay });
      setCurrencyData(prev => prev ? { ...prev, settings } : prev);
      setDayEditing(false);
      toast.success('Đã lưu ngày cập nhật.');
    } catch { toast.error('Lưu thất bại.'); }
  }

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className={s.page}>
      <div className={s.pageHeader}>
        <h1 className={s.pageTitle}>Quốc gia & Tỉ giá</h1>
      </div>

      {loading ? <PageLoader /> : (
        <>
          {/* ── Countries ── */}
          <div className={s.section}>
            <div className={s.sectionHead}>
              <div>
                <p className={s.sectionTitle}>Quốc gia</p>
                <p className={s.sectionDesc}>Danh sách quốc gia và tiền tệ dùng chung toàn hệ thống.</p>
              </div>
              <button className={s.btnPrimary} onClick={openAddCountry}>+ Thêm quốc gia</button>
            </div>

            {countries.length === 0 ? (
              <div className={s.empty}>Chưa có quốc gia nào.</div>
            ) : (
              <div className={s.tableWrap}>
                <table className={s.table}>
                  <thead>
                    <tr>
                      <th className={s.th}>Mã QG</th>
                      <th className={s.th}>Tên quốc gia</th>
                      <th className={s.th}>Tiền tệ</th>
                      <th className={s.th}>Trạng thái</th>
                      <th className={s.th} />
                    </tr>
                  </thead>
                  <tbody>
                    {countries.map(c => (
                      <tr key={c.code} className={s.tr} onClick={() => openEditCountry(c)}>
                        <td className={s.td}><span className={s.codeTag}>{c.code}</span></td>
                        <td className={s.td}>{c.name}</td>
                        <td className={s.td}><span className={s.currencyTag}>{c.currency}</span></td>
                        <td className={s.td}>
                          {c.isActive
                            ? <span className={s.badgeActive}>Hoạt động</span>
                            : <span className={s.badgeInactive}>Tắt</span>}
                        </td>
                        <td className={s.td} onClick={e => e.stopPropagation()}>
                          <button className={s.btnDangerSm} onClick={() => setDeletingCountry(c)}>Xóa</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── Currency Rates ── */}
          <div className={s.section}>
            <div className={s.sectionHead}>
              <div>
                <p className={s.sectionTitle}>Tỉ giá hối đoái → USD</p>
                <p className={s.sectionDesc}>
                  Tỉ giá được lấy từ frankfurter.app (dữ liệu ECB).
                  {currencyData?.settings?.lastUpdatedAt && (
                    <> Cập nhật lần cuối: <strong>{fmtDateTime(currencyData.settings.lastUpdatedAt)}</strong>.</>
                  )}
                </p>
              </div>
              <button className={s.btnSecondary} onClick={handleRefreshRates} disabled={currencyRefreshing}>
                {currencyRefreshing ? 'Đang cập nhật...' : 'Cập nhật ngay'}
              </button>
            </div>

            {/* Auto-update setting */}
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
                Chưa có tỉ giá. Nhấn &ldquo;Cập nhật ngay&rdquo; để lấy dữ liệu.
              </div>
            ) : (
              <div className={s.tableWrap}>
                <table className={s.table}>
                  <thead>
                    <tr>
                      <th className={s.th}>Tiền tệ</th>
                      <th className={s.th}>Tỉ giá</th>
                      <th className={s.th}>Cập nhật lúc</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currencyData.rates.map(r => (
                      <tr key={r.currency} className={s.trStatic}>
                        <td className={s.td}><span className={s.currencyTag}>{r.currency}</span></td>
                        <td className={s.td}>
                          <span className={s.rateValue}>
                            1 {r.currency} = {Number(r.rateToUsd).toFixed(r.currency === 'IDR' ? 6 : 4)} USD
                          </span>
                        </td>
                        <td className={s.td}><span className={s.metaText}>{fmtDateTime(r.updatedAt)}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Add/Edit Country Panel ── */}
      <RightPanel
        title={editingCountry ? `Chỉnh sửa: ${editingCountry.code}` : 'Thêm quốc gia'}
        open={countryPanelOpen}
        onClose={() => setCountryPanelOpen(false)}
        width={420}
        footer={
          <>
            <button className={s.btnSecondary} onClick={() => setCountryPanelOpen(false)}>Hủy</button>
            <button className={s.btnPrimary} form="country-form" type="submit" disabled={countrySaving}>
              {countrySaving ? 'Đang lưu...' : 'Lưu'}
            </button>
          </>
        }
      >
        <form id="country-form" className={s.form} onSubmit={handleSaveCountry}>
          <div className={s.field}>
            <label className={s.label}>Mã quốc gia (ISO 3166)</label>
            <input
              className={`${s.input} ${countryErrors.code ? s.inputError : ''}`}
              placeholder="VD: HK, MY, PH"
              value={countryForm.code}
              onChange={e => { setCountryForm(f => ({ ...f, code: e.target.value.toUpperCase() })); clearField('code'); }}
              disabled={!!editingCountry}
              maxLength={2}
            />
            {countryErrors.code && <span className={s.fieldError}>{countryErrors.code}</span>}
          </div>
          <div className={s.field}>
            <label className={s.label}>Tên quốc gia</label>
            <input
              className={`${s.input} ${countryErrors.name ? s.inputError : ''}`}
              placeholder="VD: Hong Kong"
              value={countryForm.name}
              onChange={e => { setCountryForm(f => ({ ...f, name: e.target.value })); clearField('name'); }}
            />
            {countryErrors.name && <span className={s.fieldError}>{countryErrors.name}</span>}
          </div>
          <div className={s.field}>
            <label className={s.label}>Mã tiền tệ (ISO 4217)</label>
            <input
              className={`${s.input} ${countryErrors.currency ? s.inputError : ''}`}
              placeholder="VD: HKD, MYR, PHP"
              value={countryForm.currency}
              onChange={e => { setCountryForm(f => ({ ...f, currency: e.target.value.toUpperCase() })); clearField('currency'); }}
              maxLength={3}
            />
            {countryErrors.currency && <span className={s.fieldError}>{countryErrors.currency}</span>}
            <span className={s.hint}>Tỉ giá sẽ tự động được lấy từ frankfurter.app sau khi thêm.</span>
          </div>
        </form>
      </RightPanel>

      {/* ── Delete Confirm ── */}
      {deletingCountry && (
        <div className={s.overlay} onClick={() => setDeletingCountry(null)}>
          <div className={s.confirmModal} onClick={e => e.stopPropagation()}>
            <p className={s.confirmTitle}>Xóa quốc gia <strong>{deletingCountry.code} — {deletingCountry.name}</strong>?</p>
            <p className={s.confirmDesc}>Hành động này không thể hoàn tác.</p>
            <div className={s.confirmActions}>
              <button className={s.btnSecondary} onClick={() => setDeletingCountry(null)}>Hủy</button>
              <button className={s.btnDanger} onClick={handleDeleteCountry} disabled={countryDeleting}>
                {countryDeleting ? 'Đang xóa...' : 'Xóa'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
