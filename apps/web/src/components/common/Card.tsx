"use client";
import React, { ReactNode } from 'react';

export default function Card({ children, style }: { children: ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        background: '#fff',
        borderRadius: 10,
        padding: 18,
        boxShadow: '0 6px 20px rgba(16,24,40,0.06)',
        border: '1px solid #eef2ff',
        ...style,
      }}
    >
      {children}
    </div>
  );
}
