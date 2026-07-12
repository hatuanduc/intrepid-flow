'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ALL_SEARCH_ITEMS, type SearchEntry } from './nav-items';
import s from './CommandPalette.module.css';

const SearchIcon = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.4"/>
    <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
  </svg>
);

const ArrowIcon = (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
    <path d="M2 6h8M7 3l3 3-3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

function normalize(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function highlight(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const idx = normalize(text).indexOf(normalize(query));
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark>{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}

export default function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router  = useRouter();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [prevQuery, setPrevQuery] = useState(query);
  const [prevOpen, setPrevOpen] = useState(open);
  const inputRef   = useRef<HTMLInputElement>(null);
  const listRef    = useRef<HTMLDivElement>(null);
  const activeRef  = useRef<HTMLButtonElement>(null);

  const filtered: SearchEntry[] = query.trim()
    ? ALL_SEARCH_ITEMS.filter(item =>
        normalize(item.label).includes(normalize(query)) ||
        (item.breadcrumb && normalize(item.breadcrumb).includes(normalize(query)))
      )
    : ALL_SEARCH_ITEMS;

  // Reset state when opened
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) { setQuery(''); setActive(0); }
  }

  // Focus the input when opened — imperative DOM side effect, not a state sync
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 10);
  }, [open]);

  // Reset active index when query changes
  if (query !== prevQuery) {
    setPrevQuery(query);
    setActive(0);
  }

  // Scroll active item into view
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!open) return;
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, filtered.length - 1)); }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
      if (e.key === 'Enter' && filtered[active]) {
        navigate(filtered[active].href);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, active, filtered]);

  function navigate(href: string) {
    onClose();
    router.push(href);
  }

  if (!open) return null;

  return (
    <div className={s.overlay} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={s.palette}>
        {/* Search input */}
        <div className={s.searchRow}>
          <span className={s.searchIcon}>{SearchIcon}</span>
          <input
            ref={inputRef}
            className={s.searchInput}
            placeholder="Tìm trang, tính năng..."
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          {query && (
            <button className={s.clearBtn} onClick={() => setQuery('')}>✕</button>
          )}
          <kbd className={s.escHint}>Esc</kbd>
        </div>

        {/* Results */}
        <div className={s.results} ref={listRef}>
          {filtered.length === 0 ? (
            <div className={s.empty}>Không tìm thấy kết quả cho &ldquo;{query}&rdquo;</div>
          ) : (
            <>
              <div className={s.section}>
                <span className={s.sectionLabel}>{query ? 'Kết quả' : 'Điều hướng'}</span>
              </div>
              {filtered.map((item, i) => (
                <button
                  key={item.href}
                  ref={i === active ? activeRef : null}
                  className={`${s.resultItem} ${i === active ? s.resultItemActive : ''}`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => navigate(item.href)}
                >
                  <span className={s.resultIcon}>{item.icon}</span>
                  <span className={s.resultLabel}>
                    {highlight(item.label, query)}
                  </span>
                  {item.breadcrumb && (
                    <span className={s.resultBreadcrumb}>
                      {item.breadcrumb}
                      <span className={s.breadcrumbSep}>›</span>
                    </span>
                  )}
                  <span className={s.resultArrow}>{ArrowIcon}</span>
                </button>
              ))}
            </>
          )}
        </div>

        {/* Footer hint */}
        <div className={s.footer}>
          <span><kbd>↑</kbd><kbd>↓</kbd> di chuyển</span>
          <span><kbd>Enter</kbd> chọn</span>
          <span><kbd>Esc</kbd> đóng</span>
        </div>
      </div>
    </div>
  );
}
