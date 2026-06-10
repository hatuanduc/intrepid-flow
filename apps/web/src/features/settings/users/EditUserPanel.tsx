'use client';

import { useEffect, useState } from 'react';
import { updateUser, listRoles, type UserItem, type RoleItem } from '../../../lib/api';
import RightPanel from '../../../components/common/RightPanel';
import s from './AddUserPanel.module.css';

type Props = {
  user: UserItem | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
};

export default function EditUserPanel({ user, open, onClose, onSaved }: Props) {
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && user) {
      setName(user.name ?? '');
      setPassword('');
      setIsActive(user.isActive);
      setSelectedRoleIds(user.roles.map(r => r.id));
      setError(null);
      setSearch('');
      listRoles().then(r => setRoles(r.items ?? []));
    }
  }, [open, user?.id]);

  function toggleRole(id: string) {
    setSelectedRoleIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setError(null);
    setSaving(true);
    try {
      await updateUser(user.id, {
        name: name.trim() || undefined,
        password: password || undefined,
        isActive,
        roleIds: selectedRoleIds,
      });
      onSaved();
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      const MSG: Record<string, string> = {
        USER_NOT_FOUND: 'Tài khoản không tồn tại.',
        ROLE_NOT_FOUND: 'Vai trò không hợp lệ.',
      };
      setError(MSG[code] ?? 'Cập nhật thất bại. Vui lòng thử lại.');
    } finally {
      setSaving(false);
    }
  }

  const systemRoles = roles.filter(r => r.isSystem);
  const customRoles = roles.filter(r => !r.isSystem);
  const filteredSystem = search
    ? systemRoles.filter(r => r.name.toLowerCase().includes(search.toLowerCase()))
    : systemRoles;
  const filteredCustom = search
    ? customRoles.filter(r => r.name.toLowerCase().includes(search.toLowerCase()))
    : customRoles;

  const footer = (
    <>
      <button type="button" className={s.btnSecondary} onClick={onClose}>Hủy</button>
      <button type="submit" form="edit-user-form" className={s.btnPrimary} disabled={saving}>
        {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
      </button>
    </>
  );

  return (
    <RightPanel title="Chỉnh sửa tài khoản" open={open} onClose={onClose} footer={footer}>
      <form id="edit-user-form" onSubmit={submit} className={s.form}>
        <div className={s.field}>
          <label className={s.label}>Email</label>
          <input className={`${s.input} ${s.inputDisabled}`} value={user?.email ?? ''} disabled />
        </div>

        <div className={s.field}>
          <label className={s.label}>Tên hiển thị</label>
          <input
            className={s.input}
            value={name}
            onChange={e => setName(e.target.value)}
            autoFocus
          />
        </div>

        <div className={s.field}>
          <label className={s.label}>Mật khẩu mới</label>
          <input
            className={s.input}
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Để trống nếu không đổi"
          />
        </div>

        <div className={s.field}>
          <label className={s.label}>Trạng thái</label>
          <label className={s.checkRow}>
            <input
              type="checkbox"
              checked={isActive}
              onChange={e => setIsActive(e.target.checked)}
            />
            Đang hoạt động
          </label>
        </div>

        <div className={s.divider} />

        <div className={s.field}>
          <label className={s.label}>Vai trò</label>
          <input
            className={s.input}
            placeholder="Tìm kiếm vai trò..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {filteredSystem.length > 0 && (
          <div className={s.roleGroup}>
            <span className={s.roleGroupLabel}>Vai trò hệ thống</span>
            {filteredSystem.map(r => (
              <RoleOption key={r.id} role={r} selected={selectedRoleIds.includes(r.id)} onToggle={toggleRole} />
            ))}
          </div>
        )}

        {filteredCustom.length > 0 && (
          <div className={s.roleGroup}>
            <span className={s.roleGroupLabel}>Vai trò tùy chỉnh</span>
            {filteredCustom.map(r => (
              <RoleOption key={r.id} role={r} selected={selectedRoleIds.includes(r.id)} onToggle={toggleRole} />
            ))}
          </div>
        )}

        {filteredSystem.length === 0 && filteredCustom.length === 0 && (
          <p className={s.noResult}>Không tìm thấy vai trò.</p>
        )}

        {error && <div className={s.error}>{error}</div>}
      </form>
    </RightPanel>
  );
}

function RoleOption({
  role,
  selected,
  onToggle,
}: {
  role: RoleItem;
  selected: boolean;
  onToggle: (id: string) => void;
}) {
  return (
    <label className={[s.roleOption, selected ? s.roleOptionSelected : ''].filter(Boolean).join(' ')}>
      <input
        type="checkbox"
        checked={selected}
        onChange={() => onToggle(role.id)}
        className={s.roleCheckbox}
      />
      <span className={s.roleInfo}>
        <span className={s.roleName}>{role.name}</span>
        {role.description && <span className={s.roleDesc}>{role.description}</span>}
      </span>
    </label>
  );
}
