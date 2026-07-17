'use client';
import { useEffect, useState } from 'react';
import AccountsView from '../_accounts-view';

// The real HSBCnet is a hash-routed SPA — discoverAccounts() sets
// window.location.hash = '/accounts' on the CURRENT page rather than doing a full
// navigation, then waits for the URL to match /#\/accounts/. This page mirrors that:
// it stays on /mock-hsbc/dashboard and swaps its own content based on the hash,
// instead of being a plain Next.js route that a hash change can't actually navigate.
export default function MockDashboardPage() {
  const [hash, setHash] = useState('');

  useEffect(() => {
    function syncHash() { setHash(window.location.hash); }
    Promise.resolve().then(syncHash);
    window.addEventListener('hashchange', syncHash);
    return () => window.removeEventListener('hashchange', syncHash);
  }, []);

  const showAccounts = hash === '#/accounts';

  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f5' }}>
      <header style={{ background: '#cc0000', color: '#fff', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 50 }}>
        <nav style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
          <span style={{ fontWeight: 700, fontSize: 16 }}>HSBCnet</span>
          <a
            href="#/accounts"
            onClick={(e) => { e.preventDefault(); window.location.hash = '/accounts'; }}
            style={{ color: '#fff', textDecoration: 'none', fontSize: 13 }}
          >
            Account information
          </a>
          <span style={{ color: '#ffcccc', fontSize: 13 }}>Track payments</span>
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

      {showAccounts ? (
        <AccountsView />
      ) : (
        <main style={{ padding: 32 }}>
          <h1 style={{ fontSize: 20, color: '#333', marginBottom: 8 }}>Welcome to HSBCnet</h1>
          <p style={{ color: '#666', fontSize: 14 }}>
            [MOCK] Logged in successfully. Navigate to{' '}
            <a href="#/accounts" onClick={(e) => { e.preventDefault(); window.location.hash = '/accounts'; }}>Account information</a> to view accounts.
          </p>
        </main>
      )}
    </div>
  );
}
