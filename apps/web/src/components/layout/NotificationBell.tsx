'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  listNotifications, getUnreadNotificationCount, markNotificationRead, markAllNotificationsRead,
  getApiBaseUrl, type AppNotification,
} from '../../lib/api';
import { getToken } from '../../lib/auth';
import { useT } from '../../lib/i18n';
import { BellIcon } from '../icons';
import s from './NotificationBell.module.css';

function formatTime(iso: string): string {
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
}

export default function NotificationBell() {
  const router = useRouter();
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const esRef = useRef<EventSource | null>(null);

  async function load() {
    try {
      const [{ items: list }, { count }] = await Promise.all([
        listNotifications(),
        getUnreadNotificationCount(),
      ]);
      setItems(list);
      setUnreadCount(count);
    } catch {
      // ignore — bell just stays empty
    }
  }

  useEffect(() => {
    Promise.resolve().then(() => load());

    const base = getApiBaseUrl();
    const token = getToken();
    const es = new EventSource(`${base}/notifications/stream?token=${token}`);
    es.onmessage = (e) => {
      const notification: AppNotification = JSON.parse(e.data);
      setItems(prev => [notification, ...prev]);
      setUnreadCount(prev => prev + 1);
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

  async function handleClickItem(item: AppNotification) {
    setOpen(false);
    if (!item.isRead) {
      setItems(prev => prev.map(n => (n.id === item.id ? { ...n, isRead: true } : n)));
      setUnreadCount(prev => Math.max(0, prev - 1));
      markNotificationRead(item.id).catch(() => {});
    }
    if (item.jobId) router.push(`/bank-statement/jobs/${item.jobId}`);
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
          <div className={s.list}>
            {items.length === 0 ? (
              <div className={s.empty}>{t('notifications.empty')}</div>
            ) : (
              items.map(item => (
                <button
                  key={item.id}
                  className={`${s.item} ${!item.isRead ? s.itemUnread : ''}`}
                  onClick={() => handleClickItem(item)}
                >
                  {!item.isRead && <span className={s.itemDot} />}
                  <span className={s.itemBody}>
                    <span className={s.itemTitle}>{item.title}</span>
                    {item.body && <span className={s.itemDesc}>{item.body}</span>}
                    <span className={s.itemTime}>{formatTime(item.createdAt)}</span>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
