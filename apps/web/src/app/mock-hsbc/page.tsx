'use client';

export default function MockLoginPage() {
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    window.location.href = '/mock-hsbc/auth';
  }

  return (
    <div style={{ minHeight: '100vh', background: '#1b1b1b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', padding: 40, borderRadius: 4, width: 360 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 24, color: '#cc0000' }}>HSBCnet</h1>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>User ID</label>
            <input
              id="userid"
              type="text"
              defaultValue=""
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #ccc', borderRadius: 3, fontSize: 14, boxSizing: 'border-box' }}
            />
            <span id="userid-error" style={{ display: 'none', fontSize: 12, color: 'red' }} />
          </div>
          <button
            id="nextBtn"
            type="submit"
            style={{ padding: '10px 0', background: '#cc0000', color: '#fff', border: 'none', borderRadius: 3, fontSize: 14, cursor: 'pointer', fontWeight: 600 }}
          >
            Continue
          </button>
        </form>
        <p style={{ fontSize: 11, color: '#888', marginTop: 24, textAlign: 'center' }}>
          [MOCK — any username works]
        </p>
      </div>
    </div>
  );
}
