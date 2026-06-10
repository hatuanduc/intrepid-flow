'use client';

import { useEffect, useState } from 'react';
import { listUsers, type UserItem } from '../../../lib/api';
import AddUserPanel from './AddUserPanel';
import s from './UsersPage.module.css';

type Tab = 'all' | 'active' | 'inactive';

function StatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <span className={isActive ? s.badgeActive : s.badgeInactive}>
      {isActive ? 'Hoạt động' : 'Đã khóa'}
    </span>
  );
}

function MoreMenu({ onEdit }: { onEdit: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={s.moreWrap}>
      <button className={s.moreBtn} onClick={() => setOpen(v => !v)}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <circle cx="2" cy="7" r="1.2" fill="currentColor"/>
          <circle cx="7" cy="7" r="1.2" fill="currentColor"/>
          <circle cx="12" cy="7" r="1.2" fill="currentColor"/>
        </svg>
      </button>
      {open && (
        <div className={s.moreDropdown}>
          <button className={s.moreItem} onClick={() => { setOpen(false); onEdit(); }}>Chỉnh sửa</button>
        </div>
      )}
    </div>
  );
}

export default function UsersPage() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('all');
  const [showAdd, setShowAdd] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await listUsers();
      setUsers(res.items ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const active = users.filter(u => u.isActive);
  const inactive = users.filter(u => !u.isActive);
  const filtered = tab === 'active' ? active : tab === 'inactive' ? inactive : users;

  return (
    <div className={s.page}>
      <div className={s.pageHeader}>
        <h1 className={s.pageTitle}>Tài khoản người dùng</h1>
        <button className={s.btnPrimary} onClick={() => setShowAdd(true)}>
          + Thêm tài khoản
        </button>
      </div>

      {/* Tabs */}
      <div className={s.tabs}>
        {([
          { key: 'all',      label: 'Tất cả',         count: users.length },
          { key: 'active',   label: 'Đang hoạt động', count: active.length },
          { key: 'inactive', label: 'Đã khóa',        count: inactive.length },
        ] as { key: Tab; label: string; count: number }[]).map(t => (
          <button
            key={t.key}
            className={[s.tab, tab === t.key ? s.tabActive : ''].filter(Boolean).join(' ')}
            onClick={() => setTab(t.key)}
          >
            {t.label}
            <span className={s.tabCount}>{t.count}</span>
          </button>
        ))}
      </div>

      {/* Table */}
      <div className={s.tableWrap}>
        {loading ? (
          <div className={s.empty}>Đang tải...</div>
        ) : filtered.length === 0 ? (
          <div className={s.empty}>Không có tài khoản nào.</div>
        ) : (
          <table className={s.table}>
            <thead>
              <tr>
                <th>Tên</th>
                <th>Email</th>
                <th>Vai trò</th>
                <th>Trạng thái</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map(u => (
                <tr key={u.id}>
                  <td>
                    <div className={s.nameCell}>
                      <span className={s.avatar}>{(u.name ?? u.email)[0].toUpperCase()}</span>
                      <span className={s.userName}>{u.name ?? '—'}</span>
                    </div>
                  </td>
                  <td className={s.emailCell}>{u.email}</td>
                  <td>
                    {(u.roles ?? []).length > 0 ? (
                      <span className={s.roleList}>
                        {u.roles[0].name}
                        {u.roles.length > 1 && (
                          <span className={s.roleMore}>+{u.roles.length - 1}</span>
                        )}
                      </span>
                    ) : (
                      <span className={s.noRole}>—</span>
                    )}
                  </td>
                  <td><StatusBadge isActive={u.isActive} /></td>
                  <td><MoreMenu onEdit={() => {}} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <AddUserPanel
        open={showAdd}
        onClose={() => { setShowAdd(false); load(); }}
      />
    </div>
  );
}
