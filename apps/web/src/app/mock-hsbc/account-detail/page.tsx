'use client';
import { useEffect, useState } from 'react';
import { MOCK_ACCOUNTS, ACCOUNT_TRANSACTIONS, parseDMY, type TxRow } from '../_data';

export default function MockAccountDetailPage() {
  const [selectedId, setSelectedId] = useState(MOCK_ACCOUNTS[0].id);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [switcherSearch, setSwitcherSearch] = useState('');
  const [dateFilterOpen, setDateFilterOpen] = useState(false);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [appliedFrom, setAppliedFrom] = useState('');
  const [appliedTo, setAppliedTo] = useState('');
  const [exportOpen, setExportOpen] = useState(false);

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
    const all = ACCOUNT_TRANSACTIONS[selected.number] ?? [];
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
      if (e.key === 'Escape') { setSwitcherOpen(false); setExportOpen(false); }
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
    setDateFilterOpen(false);
    setExportOpen(false);
  }

  function applyFilter() {
    setAppliedFrom(fromDate);
    setAppliedTo(toDate);
    setDateFilterOpen(false);
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

          {/* Date range filter trigger — always visible */}
          <div style={{ marginBottom: 16, fontSize: 13, color: '#555' }}>
            Showing:{' '}
            <span
              id="showing_actual_range_quick_link"
              onClick={() => setDateFilterOpen(true)}
              style={{ color: '#0066cc', cursor: 'pointer', textDecoration: 'underline' }}
            >
              {showingLabel}
            </span>
          </div>

          {/* Date filter widget */}
          {dateFilterOpen && (
            <div id="rangeDate" style={{ background: '#f9f9f9', border: '1px solid #ddd', borderRadius: 4, padding: 16, marginBottom: 16 }}>
              <div style={{ marginBottom: 10, fontSize: 13, fontWeight: 600, color: '#333' }}>Date range</div>
              <div className="date-picker" style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
                <input
                  type="text"
                  placeholder="dd/mm/yyyy"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  style={{ padding: '6px 10px', border: '1px solid #ccc', borderRadius: 3, fontSize: 13, width: 120 }}
                />
                <span style={{ color: '#888' }}>to</span>
                <input
                  type="text"
                  placeholder="dd/mm/yyyy"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  style={{ padding: '6px 10px', border: '1px solid #ccc', borderRadius: 3, fontSize: 13, width: 120 }}
                />
              </div>
              <input
                className="form__control-button"
                type="submit"
                value="Apply"
                onClick={applyFilter}
                style={{ padding: '7px 20px', background: '#cc0000', color: '#fff', border: 'none', borderRadius: 3, fontSize: 13, cursor: 'pointer' }}
              />
            </div>
          )}

          {/* Transactions table */}
          {shownTxns.length === 0 ? (
            <p className="table__error-message" style={{ color: '#888', fontSize: 13 }}>
              No transactions found for the selected date range.
            </p>
          ) : (
            <>
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16, fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #ddd' }}>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, fontSize: 12, color: '#555' }}>Post date</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, fontSize: 12, color: '#555' }}>Narrative</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, fontSize: 12, color: '#555' }}>Credit</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, fontSize: 12, color: '#555' }}>Debit</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, fontSize: 12, color: '#555' }}>Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {shownTxns.map((t) => (
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
                    </tr>
                  ))}
                </tbody>
              </table>

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
