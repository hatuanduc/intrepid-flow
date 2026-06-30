'use client';

import { useEffect, useState } from 'react';
import {
  getPermission,
  isHsbcNotifEnabled,
  requestPermission,
  setHsbcNotifEnabled,
} from '../../../lib/notifications';
import s from './NotificationsSettingsPage.module.css';

export default function NotificationsSettingsPage() {
  const [enabled, setEnabled]       = useState(false);
  const [permission, setPermission] = useState<ReturnType<typeof getPermission>>('default');

  useEffect(() => {
    setEnabled(isHsbcNotifEnabled());
    setPermission(getPermission());
  }, []);

  async function handleToggle(checked: boolean) {
    if (checked) {
      const perm = getPermission();
      if (perm === 'denied') {
        setPermission('denied');
        return;
      }
      if (perm === 'default') {
        const result = await requestPermission();
        setPermission(result);
        if (result !== 'granted') return;
      }
    }
    setEnabled(checked);
    setHsbcNotifEnabled(checked);
  }

  const permLabel =
    permission === 'unsupported' ? 'Trình duyệt không hỗ trợ thông báo' :
    permission === 'granted'     ? 'Trình duyệt đã cho phép hiển thị thông báo' :
    permission === 'denied'      ? 'Trình duyệt đang chặn thông báo — vào cài đặt trình duyệt để mở lại' :
                                   'Chưa cấp quyền — bật toggle để yêu cầu';

  const permClass =
    permission === 'granted' ? s.permGranted :
    permission === 'denied'  ? s.permDenied  : s.permDefault;

  return (
    <div className={s.page}>
      <div className={s.pageHeader}>
        <h1 className={s.pageTitle}>Thông báo</h1>
      </div>

      <div className={s.section}>
        <div className={s.sectionTitle}>Thông báo trên màn hình</div>

        <div className={s.row}>
          <div className={s.rowInfo}>
            <span className={s.rowLabel}>Xác thực HSBC Net</span>
            <span className={s.rowDesc}>
              Hiện thông báo trên màn hình khi hệ thống xác thực đăng nhập vào HSBC Net để tải sao kê.
            </span>
          </div>
          <label className={s.toggle}>
            <input
              type="checkbox"
              className={s.toggleInput}
              checked={enabled}
              disabled={permission === 'unsupported'}
              onChange={e => handleToggle(e.target.checked)}
            />
            <span className={s.toggleTrack} />
          </label>
        </div>

        {permission !== 'unsupported' && (
          <div className={s.permStatus}>
            <span className={`${s.permDot} ${permClass}`} />
            {permLabel}
          </div>
        )}
      </div>
    </div>
  );
}
