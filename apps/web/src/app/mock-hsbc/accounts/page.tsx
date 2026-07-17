'use client';
import AccountsView from '../_accounts-view';

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

// Reachable directly (manual testing) — the actual Playwright automation drives
// /mock-hsbc/dashboard#/accounts instead (see that page's hash-routing).
export default function MockAccountsPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f5' }}>
      <MockHeader />
      <AccountsView />
    </div>
  );
}
