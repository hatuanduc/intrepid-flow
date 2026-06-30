'use client';

export default function MockAuthPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', padding: '40px 48px', borderRadius: 4, width: 480, boxShadow: '0 2px 8px rgba(0,0,0,.12)' }}>
        <h2 style={{ fontSize: 22, fontWeight: 400, marginBottom: 8, color: '#1a1a1a' }}>Log on to HSBCnet</h2>
        <p style={{ fontSize: 14, color: '#555', marginBottom: 32 }}>
          We will send an approval request to your registered device.
        </p>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button
            style={{ padding: '10px 24px', background: '#fff', border: '1px solid #ccc', borderRadius: 3, fontSize: 14, cursor: 'pointer', color: '#333' }}
            onClick={() => { window.location.href = '/mock-hsbc'; }}
          >
            Cancel
          </button>
          <button
            data-test-id="autoTestCDLButton"
            onClick={() => { window.location.href = '/mock-hsbc/2fa'; }}
            style={{ padding: '10px 28px', background: '#cc0000', color: '#fff', border: 'none', borderRadius: 3, fontSize: 14, cursor: 'pointer', fontWeight: 600 }}
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
