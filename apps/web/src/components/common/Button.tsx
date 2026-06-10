"use client";
import React from 'react';

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'link';
};

export default function Button({ variant = 'primary', children, style, ...rest }: ButtonProps) {
  const base: React.CSSProperties = {
    padding: '8px 12px',
    borderRadius: 6,
    border: 'none',
    cursor: 'pointer',
    fontSize: 14,
  };

  const variants: Record<string, React.CSSProperties> = {
    primary: { background: '#4f46e5', color: '#fff' },
    secondary: { background: '#f3f4f6', color: '#111', border: '1px solid #e5e7eb' },
    link: { background: 'transparent', color: '#4f46e5', padding: 0 },
  };

  return (
    <button {...rest} style={{ ...base, ...(variants[variant] ?? {}), ...style }}>
      {children}
    </button>
  );
}
