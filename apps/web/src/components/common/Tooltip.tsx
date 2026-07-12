'use client';

import { useState } from 'react';
import s from './Tooltip.module.css';

export default function Tooltip({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  const [visible, setVisible] = useState(false);
  return (
    <span className={s.tooltipWrap}>
      <button
        type="button"
        className={s.tooltipTrigger}
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onFocus={() => setVisible(true)}
        onBlur={() => setVisible(false)}
      >
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
          <circle cx="6.5" cy="6.5" r="5.75" stroke="currentColor" strokeWidth="1.25"/>
          <text x="6.5" y="10" textAnchor="middle" fontSize="8" fontWeight="600" fill="currentColor">i</text>
        </svg>
      </button>
      {visible && (
        <div className={`${s.tooltipBox} ${wide ? s.tooltipBoxWide : ''}`}>
          {children}
        </div>
      )}
    </span>
  );
}
