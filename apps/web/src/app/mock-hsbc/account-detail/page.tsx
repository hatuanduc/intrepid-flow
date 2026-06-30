'use client';
import { useEffect, useState } from 'react';
import { MOCK_ACCOUNTS } from '../_data';

export default function MockAccountDetailPage() {
  const [selectedId, setSelectedId] = useState(MOCK_ACCOUNTS[0].id);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [switcherSearch, setSwitcherSearch] = useState('');
  const [dateFilterOpen, setDateFilterOpen] = useState(false);
  const [filtered, setFiltered] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  const selected = MOCK_ACCOUNTS.find((a) => a.id === selectedId) ?? MOCK_ACCOUNTS[0];

  const filteredAccounts = switcherSearch.trim()
    ? MOCK_ACCOUNTS.filter(
        (a) =>
          a.number.toLowerCase().includes(switcherSearch.toLowerCase()) ||
          a.company.toLowerCase().includes(switcherSearch.toLowerCase()),
      )
    : MOCK_ACCOUNTS;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { setSwitcherOpen(false); setExportOpen(false); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function selectAccount(id: string) {
    setSelectedId(id);
    setSwitcherOpen(false);
    setSwitcherSearch('');
    setFiltered(false);
    setDateFilterOpen(false);
    setExportOpen(false);
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
                    {/* Text node = account number | <i> = countryCode | <span> = currency */}
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

          {/* Date range filter trigger */}
          <div style={{ marginBottom: 16, fontSize: 13, color: '#555' }}>
            Showing:{' '}
            <span
              id="showing_actual_range_quick_link"
              onClick={() => setDateFilterOpen(true)}
              style={{ color: '#0066cc', cursor: 'pointer', textDecoration: 'underline' }}
            >
              Specify date range
            </span>
          </div>

          {/* Date filter widget */}
          {dateFilterOpen && (
            <div id="rangeDate" style={{ background: '#f9f9f9', border: '1px solid #ddd', borderRadius: 4, padding: 16, marginBottom: 16 }}>
              <div style={{ marginBottom: 10, fontSize: 13, fontWeight: 600, color: '#333' }}>Date range</div>
              <div className="date-picker" style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
                <input type="text" placeholder="dd/mm/yyyy" style={{ padding: '6px 10px', border: '1px solid #ccc', borderRadius: 3, fontSize: 13, width: 120 }} />
                <span style={{ color: '#888' }}>to</span>
                <input type="text" placeholder="dd/mm/yyyy" style={{ padding: '6px 10px', border: '1px solid #ccc', borderRadius: 3, fontSize: 13, width: 120 }} />
              </div>
              <input
                className="form__control-button"
                type="submit"
                value="Apply"
                onClick={() => { setFiltered(true); setDateFilterOpen(false); }}
                style={{ padding: '7px 20px', background: '#cc0000', color: '#fff', border: 'none', borderRadius: 3, fontSize: 13, cursor: 'pointer' }}
              />
            </div>
          )}

          {/* Transactions + export */}
          {filtered && (
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
                  <tr style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '8px 12px' }}>30/06/2026</td>
                    <td style={{ padding: '8px 12px' }}>MOCK PAYMENT REF TODAY</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', color: '#059669' }}>2,500.00</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right' }}></td>
                    <td style={{ padding: '8px 12px', textAlign: 'right' }}>{selected.balance}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '8px 12px' }}>29/06/2026</td>
                    <td style={{ padding: '8px 12px' }}>MOCK TRANSFER YESTERDAY</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', color: '#059669' }}>1,200.00</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right' }}></td>
                    <td style={{ padding: '8px 12px', textAlign: 'right' }}>—</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '8px 12px' }}>29/06/2026</td>
                    <td style={{ padding: '8px 12px' }}>MOCK SERVICE FEE</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right' }}></td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', color: '#dc2626' }}>45.00</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right' }}>—</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '8px 12px' }}>28/06/2026</td>
                    <td style={{ padding: '8px 12px' }}>MOCK INCOMING TRANSFER</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', color: '#059669' }}>800.00</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right' }}></td>
                    <td style={{ padding: '8px 12px', textAlign: 'right' }}>—</td>
                  </tr>
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
                      href={`/api/mock-hsbc/export?acc=${encodeURIComponent(selected.number)}&cur=${selected.currency}&co=${encodeURIComponent(selected.countryCode)}&name=${encodeURIComponent(selected.company)}&bank=${encodeURIComponent(selected.bankName)}`}
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

          {!filtered && (
            <p style={{ color: '#888', fontSize: 13 }}>Select a date range above and click Apply to view transactions.</p>
          )}
        </div>
      </main>
    </div>
  );
}
