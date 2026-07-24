'use client';

import { useEffect, useRef, useState } from 'react';
import s from './Select.module.css';

export type SelectOption<T extends string | number> = { value: T; label: string };

type Props<T extends string | number> = {
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  width?: number | string;
  align?: 'left' | 'right';
};

export default function Select<T extends string | number>({
  value, options, onChange, disabled, width, align = 'left',
}: Props<T>) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const current = options.find(o => o.value === value);

  return (
    <div className={s.wrap} style={width !== undefined ? { width } : undefined} ref={ref}>
      <button
        type="button"
        className={`${s.trigger} ${open ? s.triggerOpen : ''}`}
        onClick={() => !disabled && setOpen(v => !v)}
        disabled={disabled}
      >
        <span className={s.triggerLabel}>{current?.label ?? ''}</span>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className={s.chevron}>
          <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      {open && (
        <div className={`${s.dropdown} ${align === 'right' ? s.dropdownRight : ''}`}>
          {options.map(o => (
            <button
              key={o.value}
              type="button"
              className={`${s.option} ${o.value === value ? s.optionSelected : ''}`}
              onClick={() => { onChange(o.value); setOpen(false); }}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
