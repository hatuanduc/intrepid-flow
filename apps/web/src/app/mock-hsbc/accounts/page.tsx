'use client';
import { groupAccounts } from '../_data';

const GROUPS = groupAccounts();

function MockHeader() {
  return (
    <header style={{ background: '#cc0000', color: '#fff', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 50 }}>
      <nav style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
        <span style={{ fontWeight: 700, fontSize: 16 }}>HSBCnet</span>
        <a href="/mock-hsbc/accounts" style={{ color: '#fff', textDecoration: 'none', fontSize: 13, borderBottom: '2px solid #fff', paddingBottom: 2 }}>Account information</a>
      </nav>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div className="user-profile-container" style={{ display: 'flex', gap: 6 }}>
          <span style={{ fontSize: 13 }}>MOCK USER</span>
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
  );
}

export default function MockAccountsPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f5' }}>
      <MockHeader />
      <main style={{ padding: 24 }}>
        <h2 style={{ fontSize: 18, marginBottom: 16, color: '#333' }}>Account information</h2>
        <div style={{ background: '#fff', border: '1px solid #ddd', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#2d3a4a', color: '#fff' }}>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 12, fontWeight: 600, width: 40 }}>★</th>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 12, fontWeight: 600 }}>Account number</th>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 12, fontWeight: 600 }}>Account title</th>
                <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: 12, fontWeight: 600 }}>Current available</th>
                <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: 12, fontWeight: 600 }}>Current ledger</th>
                <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: 12, fontWeight: 600 }}>As at date / time</th>
              </tr>
            </thead>
            <tbody>
              {GROUPS.map((group) => (
                <>
                  {/* Group header row — table__row--title, NOT clickable */}
                  <tr key={group.label} className="table__row--title table__row--no-hover">
                    <td colSpan={6} style={{ padding: '8px 16px', background: '#f0f0f0', fontSize: 12, fontWeight: 600, color: '#555', borderBottom: '1px solid #ddd', borderTop: '1px solid #ddd' }}>
                      {group.label}
                    </td>
                  </tr>
                  {/* Account rows — table__row--clickable */}
                  {group.accounts.map((acc) => (
                    <tr
                      key={acc.id}
                      className="table__row--clickable"
                      tabIndex={0}
                      onClick={() => { window.location.href = `/mock-hsbc/account-detail?acc=${acc.id}`; }}
                      onKeyDown={(e) => { if (e.key === 'Enter') window.location.href = `/mock-hsbc/account-detail?acc=${acc.id}`; }}
                      style={{ cursor: 'pointer', borderBottom: '1px solid #eee' }}
                    >
                      <td style={{ padding: '10px 16px', color: '#aaa', fontSize: 13 }}>☆</td>
                      <td style={{ padding: '10px 16px' }}>
                        <span style={{ color: '#0066cc', fontSize: 13 }}>{acc.number}</span>
                      </td>
                      <td style={{ padding: '10px 16px', fontSize: 13, color: '#333' }}>{acc.company}</td>
                      <td style={{ padding: '10px 16px', textAlign: 'right', fontSize: 13, color: '#333' }}>{acc.balance}</td>
                      <td style={{ padding: '10px 16px', textAlign: 'right', fontSize: 13, color: '#333' }}>{acc.balance}</td>
                      <td style={{ padding: '10px 16px', textAlign: 'right', fontSize: 12, color: '#666' }}>30 Jun 2026 17:26</td>
                    </tr>
                  ))}
                </>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
