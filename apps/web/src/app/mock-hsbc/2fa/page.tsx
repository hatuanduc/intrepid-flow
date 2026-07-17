'use client';
import { useEffect, useState } from 'react';

export default function Mock2faPage() {
  const [showResend, setShowResend] = useState(false);

  useEffect(() => {
    // "Resend" only shows after 3s — mimics real behavior (only when waiting long)
    const t1 = setTimeout(() => setShowResend(true), 3000);
    // Auto-redirect after 6s — simulate mobile approval
    const t2 = setTimeout(() => { window.location.href = '/mock-hsbc/dashboard'; }, 6000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: '#f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', padding: '40px 48px', borderRadius: 4, width: 480, boxShadow: '0 2px 8px rgba(0,0,0,.12)', textAlign: 'center' }}>
        <div style={{ width: 64, height: 64, background: '#f5f5f5', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: 28 }}>
          📱
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 400, marginBottom: 12, color: '#1a1a1a' }}>
          Approve your log on
        </h2>
        <p style={{ fontSize: 14, color: '#555', marginBottom: 28, lineHeight: 1.5 }}>
          We&apos;ve sent a notification to your registered device.<br />
          Please open the HSBC Authenticator app to approve.
        </p>

        {/* Resend chỉ xuất hiện sau 3s — Playwright dùng selector này để log "2FA screen detected" */}
        {showResend && (
          <button
            data-test-id="autoTestCDLButton"
            style={{ padding: '8px 20px', border: '1px solid #ccc', borderRadius: 3, background: '#f9f9f9', cursor: 'pointer', fontSize: 13, color: '#333' }}
          >
            Resend notification
          </button>
        )}

        <p style={{ fontSize: 11, color: '#bbb', marginTop: 28 }}>
          [MOCK — auto-approving in ~6s]
        </p>
      </div>
    </div>
  );
}
