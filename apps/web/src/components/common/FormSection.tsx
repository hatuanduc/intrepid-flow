"use client";
import React, { ReactNode } from 'react';

export default function FormSection({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      {title && <h4 style={{ margin: '0 0 8px 0', fontSize: 14, color: '#0f172a' }}>{title}</h4>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>{children}</div>
    </div>
  );
}
