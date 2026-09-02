'use client';
import { useEffect, useState } from 'react';
import { MOCK_ACCOUNTS, getAccountTransactions, parseDMY, formatAriaDate, timeForRow, rowReference, type TxRow } from '../_data';

// Rows per page — small on purpose so most mock accounts' fixture data (4-6 rows)
// spans ≥2 pages, letting the worker's pagination-walking logic actually be
// exercised end-to-end against this mock instead of only ever seeing page 1.
const MOCK_PAGE_SIZE = 3;

export default function MockAccountDetailPage() {
  const [selectedId, setSelectedId] = useState(MOCK_ACCOUNTS[0].id);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [switcherSearch, setSwitcherSearch] = useState('');
  // "Filter / search" top-level toggle, and "Date range" nested inside it — mirrors
  // the real HSBCnet page's #transactions-filters-panel-trigger / chevron structure
  // (verified against the live site; the worker's Playwright automation drives this
  // exact two-level flow, not a single combined widget).
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [dateRangeOpen, setDateRangeOpen] = useState(false);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [appliedFrom, setAppliedFrom] = useState('');
  const [appliedTo, setAppliedTo] = useState('');
  const [exportOpen, setExportOpen] = useState(false);
  const [tablePage, setTablePage] = useState(1);
  // Row action "..." menu + "Chi tiết giao dịch" popup — mirrors the real
  // button#transaction_action_button_N / ul#transaction-more-dropdown-N /
  // .dialogue-window__TXNDetail structure the worker's automation targets.
  const [openActionRef, setOpenActionRef] = useState<string | null>(null);
  const [detailRef, setDetailRef] = useState<string | null>(null);

  const selected = MOCK_ACCOUNTS.find((a) => a.id === selectedId) ?? MOCK_ACCOUNTS[0];

  const filteredAccounts = switcherSearch.trim()
    ? MOCK_ACCOUNTS.filter(
        (a) =>
          a.number.toLowerCase().includes(switcherSearch.toLowerCase()) ||
          a.company.toLowerCase().includes(switcherSearch.toLowerCase()),
      )
    : MOCK_ACCOUNTS;

  // Derived from selectedId + applied filter — no fetch involved, so no effect needed.
  const shownTxns: TxRow[] = (() => {
    const all = getAccountTransactions()[selected.number] ?? [];
    if (!appliedFrom || !appliedTo) return all;
    const from = parseDMY(appliedFrom);
    const to   = parseDMY(appliedTo);
    return all.filter((t) => {
      const d = parseDMY(t.postDate);
      return d >= from && d <= to;
    });
  })();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { setSwitcherOpen(false); setExportOpen(false); setOpenActionRef(null); setDetailRef(null); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function selectAccount(id: string) {
    // Reset all state synchronously so no race between useEffect and worker actions
    setSelectedId(id);
    setSwitcherOpen(false);
    setSwitcherSearch('');
    setFromDate('');
    setToDate('');
    setAppliedFrom('');
    setAppliedTo('');
    setFiltersOpen(false);
    setDateRangeOpen(false);
    setExportOpen(false);
    setTablePage(1);
    setOpenActionRef(null);
    setDetailRef(null);
  }

  // Real HSBCnet applies the date filter automatically once both fields hold a value
  // (confirmed live — typing "to" fires the search, no separate Apply click) — no
  // Apply button exists in the actual Date range widget, so the mock doesn't render one.
  function handleToDateChange(value: string) {
    setToDate(value);
    if (fromDate && value) {
      setAppliedFrom(fromDate);
      setAppliedTo(value);
      setTablePage(1);
    }
  }

  const showingLabel = appliedFrom && appliedTo
    ? `${appliedFrom} – ${appliedTo}`
    : 'All available dates';

  const exportParams = new URLSearchParams({
    acc:  selected.number,
    cur:  selected.currency,
    co:   selected.countryCode,
    name: selected.company,
    bank: selected.bankName,
    from: appliedFrom,
    to:   appliedTo,
  });

  const totalPages = Math.max(1, Math.ceil(shownTxns.length / MOCK_PAGE_SIZE));
  const pagedTxns = shownTxns.slice((tablePage - 1) * MOCK_PAGE_SIZE, tablePage * MOCK_PAGE_SIZE);
  const detailTxn = detailRef ? shownTxns.find((t) => t.bankRef === detailRef) ?? null : null;

  function pdfExportHref(t: TxRow): string {
    const params = new URLSearchParams({
      acc: selected.number,
      name: selected.company,
      bank: selected.bankName,
      cur: selected.currency,
      ref: t.bankRef,
      cref: t.customerRef ?? '',
      narrative: t.narrative,
      date: t.postDate,
      amount: String(t.credit ?? t.debit ?? ''),
    });
    return `/api/mock-hsbc/export-transaction-pdf?${params.toString()}`;
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f5' }}>
      {/* ── Header ── */}
      <header style={{ background: '#cc0000', color: '#fff', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 50 }}>
        <nav style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
          <span style={{ fontWeight: 700, fontSize: 16 }}>HSBCnet</span>
          <a href="/mock-hsbc/accounts" style={{ color: '#fff', textDecoration: 'none', fontSize: 13 }}>Account information</a>
        </nav>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div className="user-profile-container" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 13 }}>MOCK USER</span>
            <span style={{ fontSize: 13 }}>Intrepid HK</span>
          </div>
          <button
            className="page-header__log-off"
            onClick={() => { window.location.href = '/mock-hsbc'; }}
            style={{ padding: '4px 12px', background: 'transparent', color: '#fff', border: '1px solid rgba(255,255,255,0.5)', borderRadius: 3, cursor: 'pointer', fontSize: 12 }}
          >
            Log off
          </button>
        </div>
      </header>

      {/* ── Account detail header with switcher ── */}
      <div style={{ background: '#1a1a2e', color: '#fff', padding: '16px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
          <div>
            <div style={{ fontSize: 12, color: '#aaa', marginBottom: 4 }}>
              {selected.number} · {selected.countryCode} · Current account
            </div>
            <h1 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 700 }}>{selected.company}</h1>
            <div style={{ fontSize: 14, color: '#ccc' }}>{selected.currency}</div>
          </div>

          {/* ── Change account switcher ── */}
          <div className="switcher-container" style={{ position: 'relative', minWidth: 240 }}>
            <div className="switcher-container--wrap">
              <input
                aria-label="Search by account number or title, select result to change account"
                aria-expanded={switcherOpen}
                className="form__control form__control--search form__control-small"
                type="text"
                placeholder="Change account"
                value={switcherSearch}
                onClick={() => setSwitcherOpen(true)}
                onChange={(e) => { setSwitcherSearch(e.target.value); setSwitcherOpen(true); }}
                style={{ padding: '6px 10px', border: '1px solid #555', borderRadius: 3, background: '#2a2a3e', color: '#fff', fontSize: 13, width: '100%', boxSizing: 'border-box' }}
              />
            </div>

            {switcherOpen && (
              <ul
                className="switcher-option"
                role="listbox"
                style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4, background: '#fff', border: '1px solid #ddd', borderRadius: 4, listStyle: 'none', padding: '4px 0', minWidth: 360, maxHeight: 320, overflowY: 'auto', zIndex: 100, boxShadow: '0 4px 12px rgba(0,0,0,.15)' }}
              >
                {filteredAccounts.map((acc) => (
                  <li
                    key={acc.id}
                    className="switcher-option--item"
                    role="option"
                    onClick={() => selectAccount(acc.id)}
                    style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f0f0f0' }}
                  >
                    <p className="switcher-option--number" style={{ margin: '0 0 2px', fontSize: 11, color: '#888' }}>
                      {acc.company}
                    </p>
                    <p className="switcher-option--account" style={{ margin: 0, fontSize: 13, color: '#333', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                      {acc.number}<i style={{ fontStyle: 'normal', color: '#aaa', fontSize: 11 }}>{acc.countryCode}</i><span style={{ color: '#aaa', fontSize: 11 }}>{acc.currency}</span>
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* ── Main content ── */}
      <main style={{ padding: 24 }}>
        <div style={{ background: '#fff', border: '1px solid #ddd', borderRadius: 4, padding: 20 }}>

          {/* Showing summary — informational only, no longer a functional trigger
              (real HSBCnet uses "Filter / search" below, not this line, to open the panel) */}
          <div style={{ marginBottom: 12, fontSize: 13, color: '#555' }}>
            Showing: <strong>{showingLabel}</strong>
          </div>

          {/* "Filter / search" toggle — id + aria-expanded verified against the real page */}
          <button
            id="transactions-filters-panel-trigger"
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((v) => !v)}
            style={{ padding: '6px 12px', background: '#fff', border: '1px solid #ccc', borderRadius: 3, fontSize: 13, cursor: 'pointer', marginBottom: 16 }}
          >
            Filter / search {filtersOpen ? '▲' : '▼'}
          </button>

          {filtersOpen && (
            <div id="transactions-filters-panel" style={{ background: '#f9f9f9', border: '1px solid #ddd', borderRadius: 4, padding: 16, marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>Date range</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13 }}>
                  {appliedFrom && appliedTo ? `${appliedFrom} - ${appliedTo}` : 'dd/mm/yyyy - dd/mm/yyyy'}
                </span>
                {/* Chevron scoped inside #transactions-filters-panel — real automation
                    picks the first one, since "Date range" is the first field in the row. */}
                <span
                  data-testid="ChevronDownIcon"
                  onClick={() => setDateRangeOpen((v) => !v)}
                  style={{ cursor: 'pointer', color: '#555' }}
                >
                  {dateRangeOpen ? '▲' : '▼'}
                </span>
              </div>

              {dateRangeOpen && (
                <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
                  <div>
                    <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>Date from</div>
                    <input
                      id="dateFieldFrom-field"
                      type="text"
                      placeholder="dd/mm/yyyy"
                      value={fromDate}
                      onChange={(e) => setFromDate(e.target.value)}
                      style={{ padding: '6px 10px', border: '1px solid #ccc', borderRadius: 3, fontSize: 13, width: 120 }}
                    />
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>Date to</div>
                    <input
                      id="dateFieldTo-field"
                      type="text"
                      placeholder="dd/mm/yyyy"
                      value={toDate}
                      onChange={(e) => handleToDateChange(e.target.value)}
                      style={{ padding: '6px 10px', border: '1px solid #ccc', borderRadius: 3, fontSize: 13, width: 120 }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Transactions table */}
          {shownTxns.length === 0 ? (
            <p className="table__error-message" style={{ color: '#888', fontSize: 13 }}>
              No transactions found for the selected date range.
            </p>
          ) : (
            <>
              {/* Wrapper class matches the real HSBC site (confirmed via DevTools — see
                  the CSS rule ".account-transactions-table .table-wrapper .table__body
                  tr td.showLastCellBorder button") — the worker's row-action-button scan
                  is scoped to this class specifically to avoid matching stale elements
                  left over from a previous account's table, so the mock needs it too. */}
              <div className="account-transactions-table">
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16, fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #ddd' }}>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, fontSize: 12, color: '#555' }}>Post date</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, fontSize: 12, color: '#555' }}>Narrative</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, fontSize: 12, color: '#555' }}>Credit</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, fontSize: 12, color: '#555' }}>Debit</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, fontSize: 12, color: '#555' }}>Balance</th>
                    <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600, fontSize: 12, color: '#555' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {pagedTxns.map((t) => {
                    // Global index (across all pages, not just the current slice) — real
                    // HSBC's button ids appear to number rows stably regardless of which
                    // page is showing, so the mock mirrors that instead of resetting per page.
                    const idx = shownTxns.indexOf(t);
                    const ref = rowReference(t);
                    const ariaLabel = `Menu Thao tác, nhấn Enter để chọn một thao tác cho giao dịchof the `
                      + `Mã tham chiếu khách hàng:${ref}, at ${formatAriaDate(t.postDate)} ${timeForRow(t.bankRef)}`;
                    return (
                      <tr key={t.bankRef} style={{ borderBottom: '1px solid #eee' }}>
                        <td style={{ padding: '8px 12px' }}>{t.postDate}</td>
                        <td style={{ padding: '8px 12px' }}>{t.narrative}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: t.credit ? '#059669' : undefined }}>
                          {t.credit != null ? t.credit.toLocaleString('en-US', { minimumFractionDigits: 2 }) : ''}
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: t.debit ? '#dc2626' : undefined }}>
                          {t.debit != null ? t.debit.toLocaleString('en-US', { minimumFractionDigits: 2 }) : ''}
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                          {t.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'center', position: 'relative' }}>
                          <span className="table__restricted-width table__row--clickable">
                            <div className="table__restricted-width">
                              <button
                                id={`transaction_action_button_${idx}`}
                                aria-expanded={openActionRef === t.bankRef}
                                aria-label={ariaLabel}
                                onClick={() => setOpenActionRef((cur) => (cur === t.bankRef ? null : t.bankRef))}
                                style={{ width: 26, height: 26, border: 'none', background: 'none', cursor: 'pointer', fontSize: 16, color: '#555' }}
                              >
                                ···
                              </button>
                              {openActionRef === t.bankRef && (
                                <ul
                                  id={`transaction-more-dropdown-${idx}`}
                                  className="user-action__toggle-drop transaction-actions__dropdown"
                                  style={{ position: 'absolute', right: 8, top: '100%', margin: 0, background: '#fff', border: '1px solid #ddd', borderRadius: 4, listStyle: 'none', padding: '4px 0', minWidth: 180, boxShadow: '0 4px 12px rgba(0,0,0,.12)', zIndex: 60, textAlign: 'left' }}
                                >
                                  <li>
                                    <button
                                      onClick={() => { setOpenActionRef(null); setDetailRef(t.bankRef); }}
                                      style={{ display: 'block', width: '100%', padding: '8px 14px', fontSize: 13, background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', color: '#333' }}
                                    >
                                      Xem chi tiết giao dịch
                                    </button>
                                  </li>
                                </ul>
                              )}
                            </div>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>

              {/* Pagination — mirrors real HSBC's nav[aria-label="Pagination Navigation"]
                  structure the worker's automation walks page-by-page to find every
                  "..." action button, not just the ones on the first page. */}
              {totalPages > 1 && (
                <div className="pagination-container" style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
                  <nav role="navigation" aria-label="Pagination Navigation">
                    <ul className="pagination" style={{ display: 'flex', gap: 4, listStyle: 'none', margin: 0, padding: 0, alignItems: 'center' }}>
                      <li className="pagination__item pagination__item">
                        <a
                          role="button"
                          aria-disabled={tablePage === 1}
                          aria-label="previous page"
                          className="pagination__link pagination__link--arrow p-1"
                          onClick={() => tablePage > 1 && setTablePage((p) => p - 1)}
                          style={{ cursor: tablePage === 1 ? 'default' : 'pointer', padding: '4px 8px', opacity: tablePage === 1 ? 0.4 : 1 }}
                        >
                          ‹
                        </a>
                      </li>
                      <li style={{ fontSize: 13, padding: '0 8px' }}>Trang {tablePage} của {totalPages}</li>
                      <li className="pagination__item pagination__item">
                        <a
                          role="button"
                          aria-disabled={tablePage === totalPages}
                          aria-label="next page"
                          className="pagination__link pagination__link--arrow p-3"
                          onClick={() => tablePage < totalPages && setTablePage((p) => p + 1)}
                          style={{ cursor: tablePage === totalPages ? 'default' : 'pointer', padding: '4px 8px', opacity: tablePage === totalPages ? 0.4 : 1 }}
                        >
                          ›
                        </a>
                      </li>
                    </ul>
                  </nav>
                </div>
              )}

              {/* "Chi tiết giao dịch" popup — mirrors real HSBC's .dialogue-window__TXNDetail,
                  with an "Export PDF" button that opens the PDF inline in a new tab. */}
              {detailTxn && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
                  <div className="dialogue-window__TXNDetail" style={{ background: '#fff', borderRadius: 4, width: 560, maxWidth: '90vw', maxHeight: '80vh', overflow: 'auto', padding: 24 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                      <h2 style={{ margin: 0, fontSize: 18 }}>Chi tiết giao dịch - {detailTxn.bankRef}</h2>
                      <div className="dialogue-window__button-group" style={{ display: 'flex', gap: 8 }}>
                        <a
                          role="button"
                          aria-label="Export PDF"
                          href={pdfExportHref(detailTxn)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="dialogue-window__button-group__action-btn"
                          style={{ cursor: 'pointer', fontSize: 18, textDecoration: 'none' }}
                        >
                          <span className="dtc-pdf">📄</span>
                        </a>
                        <button
                          role="button"
                          aria-label="In"
                          className="dialogue-window__button-group__action-btn"
                          style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 16 }}
                        >
                          🖨
                        </button>
                        <button
                          role="button"
                          aria-label="Đóng"
                          className="dialogue-window__button-group__action-btn dialogue-window__button-group__action-btn--close"
                          onClick={() => setDetailRef(null)}
                          style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 16 }}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                    <hr style={{ border: 'none', borderTop: '1px solid #ddd', marginBottom: 16 }} />
                    <div style={{ fontSize: 13, display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <Field label="Mã tham chiếu khách hàng" value={rowReference(detailTxn)} />
                      <Field label="Mã tham chiếu ngân hàng" value={detailTxn.bankRef} />
                      <Field label="Mã tham chiếu liên quan" value={detailTxn.bankRef} />
                      <Field label="Chú giải bổ sung" value={detailTxn.narrative} />
                      <Field label="Ngày hiệu lực" value={detailTxn.postDate} />
                    </div>
                  </div>
                </div>
              )}

              {/* Export */}
              <div style={{ position: 'relative', display: 'inline-block' }}>
                <button
                  id="export-dropdown-trigger"
                  onClick={() => setExportOpen(!exportOpen)}
                  style={{ padding: '7px 16px', background: '#fff', border: '1px solid #ccc', borderRadius: 3, fontSize: 13, cursor: 'pointer' }}
                >
                  Export ▾
                </button>
                {exportOpen && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, background: '#fff', border: '1px solid #ddd', borderRadius: 4, boxShadow: '0 4px 12px rgba(0,0,0,.1)', zIndex: 50, minWidth: 140 }}>
                    <div className="user-action__drop-option--clickable" style={{ padding: '8px 16px', fontSize: 13, cursor: 'pointer', color: '#333' }}>PDF</div>
                    <a
                      className="user-action__drop-option--clickable"
                      href={`/mock-hsbc/download-ready?${exportParams.toString()}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ display: 'block', padding: '8px 16px', fontSize: 13, color: '#333', textDecoration: 'none' }}
                    >
                      Excel
                    </a>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', gap: 12 }}>
      <span style={{ fontWeight: 700, minWidth: 220 }}>{label}</span>
      <span>{value || 'Không có sẵn'}</span>
    </div>
  );
}
