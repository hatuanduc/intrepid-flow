'use client';

import { createContext, useCallback, useContext, useState } from 'react';
import s from './Toast.module.css';

type ToastType = 'success' | 'error' | 'info';
type ToastItem = { id: string; type: ToastType; message: string };

const ToastContext = createContext<((type: ToastType, message: string) => void) | null>(null);

let _id = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const add = useCallback((type: ToastType, message: string) => {
    const id = String(++_id);
    setToasts(prev => [...prev, { id, type, message }]);
    setTimeout(() => dismiss(id), 4000);
  }, [dismiss]);

  return (
    <ToastContext.Provider value={add}>
      {children}
      <div className={s.container}>
        {toasts.map(t => (
          <div key={t.id} className={`${s.toast} ${s[t.type]}`}>
            <span className={s.icon}>{ICONS[t.type]}</span>
            <span className={s.message}>{t.message}</span>
            <button className={s.close} onClick={() => dismiss(t.id)} aria-label="Đóng">
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

const ICONS: Record<ToastType, React.ReactNode> = {
  success: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="7" stroke="#059669" strokeWidth="1.3"/>
      <path d="M5 8l2.5 2.5L11 5.5" stroke="#059669" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  error: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="7" stroke="#df1b41" strokeWidth="1.3"/>
      <path d="M8 5v3.5M8 10.5v.5" stroke="#df1b41" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  ),
  info: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="7" stroke="#635bff" strokeWidth="1.3"/>
      <path d="M8 7v4.5M8 5v.5" stroke="#635bff" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  ),
};

export function useToast() {
  const add = useContext(ToastContext);
  if (!add) throw new Error('useToast must be used inside ToastProvider');
  return {
    success: (message: string) => add('success', message),
    error:   (message: string) => add('error',   message),
    info:    (message: string) => add('info',     message),
  };
}
