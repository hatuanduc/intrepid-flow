'use client';

import { createContext, useCallback, useContext, useState } from 'react';
import s from './Toast.module.css';

type ToastType = 'success' | 'error' | 'info';
type ToastItem = { id: string; type: ToastType; message: string; leaving: boolean };

const ToastContext = createContext<((type: ToastType, message: string) => void) | null>(null);

let _id = 0;
const DURATION   = 4000;
const EXIT_DELAY = 280;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    // Mark as leaving → plays exit animation
    setToasts(prev => prev.map(t => t.id === id ? { ...t, leaving: true } : t));
    // Remove from DOM after animation finishes
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), EXIT_DELAY);
  }, []);

  const add = useCallback((type: ToastType, message: string) => {
    const id = String(++_id);
    setToasts(prev => [...prev, { id, type, message, leaving: false }]);
    setTimeout(() => dismiss(id), DURATION);
  }, [dismiss]);

  return (
    <ToastContext.Provider value={add}>
      {children}
      <div className={s.container}>
        {toasts.map(t => (
          <div
            key={t.id}
            className={`${s.toast} ${s[t.type]} ${t.leaving ? s.leaving : ''}`}
          >
            <span className={s.icon}>{ICONS[t.type]}</span>
            <span className={s.message}>{t.message}</span>
            <button className={s.close} onClick={() => dismiss(t.id)} aria-label="Đóng">
              <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                <path d="M1 1l7 7M8 1L1 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
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
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <circle cx="9" cy="9" r="8.5" fill="#10b981"/>
      <path d="M5.5 9l2.5 2.5L12.5 6" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  error: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <circle cx="9" cy="9" r="8.5" fill="#ef4444"/>
      <path d="M6.5 6.5l5 5M11.5 6.5l-5 5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  ),
  info: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <circle cx="9" cy="9" r="8.5" fill="#635bff"/>
      <path d="M9 8.5v4" stroke="#fff" strokeWidth="1.8" strokeLinecap="round"/>
      <circle cx="9" cy="5.5" r="1.1" fill="#fff"/>
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
