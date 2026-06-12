'use client';

export default function AccessDenied() {
  return (
    <div style={{ padding: '80px 32px', textAlign: 'center' }}>
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none" style={{ margin: '0 auto 16px', display: 'block', color: '#a3acb9' }}>
        <rect x="1" y="1" width="38" height="38" rx="10" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M20 13v8M20 25v2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
      </svg>
      <p style={{ fontSize: 15, fontWeight: 600, color: '#1a1f36', margin: '0 0 6px' }}>Không có quyền truy cập</p>
      <p style={{ fontSize: 13, color: '#697386', margin: 0 }}>Bạn không có quyền xem trang này. Liên hệ quản trị viên để được cấp quyền.</p>
    </div>
  );
}
