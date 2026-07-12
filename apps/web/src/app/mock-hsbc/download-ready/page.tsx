'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

function DownloadContent() {
  const params = useSearchParams();
  const [started, setStarted] = useState(false);

  useEffect(() => {
    // Trigger download on the same tab — Content-Disposition: attachment keeps page alive
    window.location.href = `/api/mock-hsbc/export?${params.toString()}`;
    // Deferred a tick so the render-triggering setState isn't synchronous with the effect itself.
    Promise.resolve().then(() => setStarted(true));
  }, [params]);

  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', border: '1px solid #ddd', borderRadius: 8, padding: '40px 48px', textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', minWidth: 320 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#cc0000', marginBottom: 20 }}>HSBCnet</div>
        <div style={{ fontSize: 14, color: '#333', marginBottom: 8 }}>
          {started ? 'Your download has started.' : 'Preparing your download…'}
        </div>
        <div style={{ fontSize: 12, color: '#888' }}>You may close this window at any time.</div>
      </div>
    </div>
  );
}

export default function DownloadReadyPage() {
  return (
    <Suspense fallback={null}>
      <DownloadContent />
    </Suspense>
  );
}
