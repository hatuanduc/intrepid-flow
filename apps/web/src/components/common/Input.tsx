"use client";
import React from 'react';

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & { label?: string };

export default function Input({ label, style, ...rest }: InputProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {label && <label style={{ fontSize: 13, color: '#374151' }}>{label}</label>}
      <input {...rest} style={{ padding: 8, borderRadius: 6, border: '1px solid #e5e7eb', fontSize: 14, ...(style as any) }} />
    </div>
  );
}
