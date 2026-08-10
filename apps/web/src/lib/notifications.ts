const PREF_KEY = 'notif-hsbc-v1';

export function isHsbcNotifEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  const stored = localStorage.getItem(PREF_KEY);
  // No explicit choice saved yet → default to on. Once the user (or setHsbcNotifEnabled)
  // has written an explicit 'true'/'false', that always wins.
  if (stored === null) return true;
  return stored === 'true';
}

export function setHsbcNotifEnabled(value: boolean) {
  localStorage.setItem(PREF_KEY, String(value));
}

export function getPermission(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

export async function requestPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) return 'denied';
  return Notification.requestPermission();
}

export function showHsbcAuthNotification(jobId: string) {
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  if (!isHsbcNotifEnabled()) return;

  const time = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  const n = new Notification('HSBC Net — Xác nhận đăng nhập', {
    body: `Mở app HSBCnet trên điện thoại và xác nhận đăng nhập • ${time}`,
    icon: '/favicon.ico',
    tag: 'hsbc-auth',
  });
  n.onclick = () => {
    window.focus();
    window.location.href = `/bank-statement/jobs/${jobId}`;
  };
}
