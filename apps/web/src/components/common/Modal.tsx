"use client";
import React, { ReactNode } from 'react';

export default function Modal({ children, onClose }: { children: ReactNode; onClose?: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60 }}>
      <div style={{ width: 'min(900px, 95%)', background: '#fff', borderRadius: 8, padding: 20, boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>✕</button>
        </div>
        <div>{children}</div>
      </div>
    </div>
  );
}
