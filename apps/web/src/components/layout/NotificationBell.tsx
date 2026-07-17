'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  listNotifications, getUnreadNotificationCount, markNotificationRead, markAllNotificationsRead,
  getApiBaseUrl, type AppNotification,
} from '../../lib/api';
import { getToken } from '../../lib/auth';
import { useT } from '../../lib/i18n';
import { Spinner } from '../common/PageLoader';
import { BellIcon } from '../icons';
import s from './NotificationBell.module.css';

const PAGE_SIZE = 15;
const SCROLL_THRESHOLD = 60;

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Vừa xong';
  if (diffMin < 60) return `${diffMin} phút trước`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} giờ trước`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 30) return `${diffDay} ngày trước`;
  return new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function NotificationBell() {
  const router = useRouter();
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const esRef = useRef<EventSource | null>(null);
  // Tracks how many rows we've paginated through in DB order — kept separate from
  // items.length's live SSE prepends so "skip" for the next page stays correct.
  const nextSkipRef = useRef(0);

  async function loadInitial() {
    try {
      const [{ items: list, hasMore: more }, { count }] = await Promise.all([
        listNotifications(0, PAGE_SIZE),
        getUnreadNotificationCount(),
      ]);
      setItems(list);
      setHasMore(more);
      nextSkipRef.current = list.length;
      setUnreadCount(count);
    } catch {
      // ignore — bell just stays empty
    }
  }

  async function loadMore() {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const { items: more, hasMore: hm } = await listNotifications(nextSkipRef.current, PAGE_SIZE);
      setItems(prev => [...prev, ...more]);
      nextSkipRef.current += more.length;
      setHasMore(hm);
    } catch {
      // ignore — user can retry by scrolling again
    } finally {
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    Promise.resolve().then(() => loadInitial());

    const base = getApiBaseUrl();
    const token = getToken();
    const es = new EventSource(`${base}/notifications/stream?token=${token}`);
    es.onmessage = (e) => {
      const notification: AppNotification = JSON.parse(e.data);
      setItems(prev => [notification, ...prev]);
      setUnreadCount(prev => prev + 1);
      nextSkipRef.current += 1;
    };
    esRef.current = es;

    return () => { es.close(); esRef.current = null; };
  }, []);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function handleScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < SCROLL_THRESHOLD) loadMore();
  }

  async function handleClickItem(item: AppNotification) {
    setOpen(false);
    if (!item.isRead) {
      setItems(prev => prev.map(n => (n.id === item.id ? { ...n, isRead: true } : n)));
      setUnreadCount(prev => Math.max(0, prev - 1));
      markNotificationRead(item.id).catch(() => {});
    }
    if (item.jobPublicId) router.push(`/bank-statement/jobs/${item.jobPublicId}`);
  }

  async function handleMarkAllRead() {
    setItems(prev => prev.map(n => ({ ...n, isRead: true })));
    setUnreadCount(0);
    try { await markAllNotificationsRead(); } catch { /* ignore */ }
  }

  return (
    <div className={s.wrap} ref={wrapRef}>
      <button className={s.bellBtn} title={t('notifications.title')} onClick={() => setOpen(v => !v)}>
        <BellIcon />
        {unreadCount > 0 && <span className={s.badge}>{unreadCount > 9 ? '9+' : unreadCount}</span>}
      </button>

      {open && (
        <div className={s.dropdown}>
          <div className={s.dropdownHead}>
            <span className={s.dropdownTitle}>{t('notifications.title')}</span>
            {unreadCount > 0 && (
              <button className={s.markAllBtn} onClick={handleMarkAllRead}>{t('notifications.markAllRead')}</button>
            )}
          </div>
          <div className={s.list} onScroll={handleScroll}>
            {items.length === 0 ? (
              <div className={s.empty}>{t('notifications.empty')}</div>
            ) : (
              <>
                {items.map(item => (
                  <button
                    key={item.id}
                    className={`${s.item} ${!item.isRead ? s.itemUnread : ''}`}
                    onClick={() => handleClickItem(item)}
                  >
                    {!item.isRead && <span className={s.itemDot} />}
                    <span className={s.itemBody}>
                      <span className={s.itemTitle}>{item.title}</span>
                      {item.body && <span className={s.itemDesc}>{item.body}</span>}
                      <span className={s.itemTime}>{formatRelativeTime(item.createdAt)}</span>
                    </span>
                  </button>
                ))}
                {loadingMore && <div className={s.loadingMore}><Spinner size={16} /></div>}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
