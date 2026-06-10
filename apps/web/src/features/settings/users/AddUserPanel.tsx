'use client';

import { useEffect, useState } from 'react';
import { createUser, listRoles, type RoleItem } from '../../../lib/api';
import RightPanel from '../../../components/common/RightPanel';
import s from './AddUserPanel.module.css';

type Props = { open: boolean; onClose: () => void };

export default function AddUserPanel({ open, onClose }: Props) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) listRoles().then(r => setRoles(r.items ?? []));
  }, [open]);

  function reset() {
    setName(''); setEmail(''); setPassword('');
    setSelectedRoleIds([]); setSearch(''); setError(null);
  }

  function handleClose() { reset(); onClose(); }

  function toggleRole(id: string) {
    setSelectedRoleIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await createUser({ email: email.trim(), name: name.trim(), password, roleIds: selectedRoleIds });
      handleClose();
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      const MSG: Record<string, string> = {
        EMAIL_EXISTS:   'Email này đã được sử dụng.',
        ROLE_NOT_FOUND: 'Vai trò không hợp lệ.',
      };
      setError(MSG[code] ?? 'Tạo tài khoản thất bại. Vui lòng thử lại.');
    } finally {
      setSaving(false);
    }
  }

  const systemRoles = roles.filter(r => r.isSystem);
  const customRoles = roles.filter(r => !r.isSystem);

  const filteredSystem = search ? systemRoles.filter(r => r.name.toLowerCase().includes(search.toLowerCase())) : systemRoles;
  const filteredCustom = search ? customRoles.filter(r => r.name.toLowerCase().includes(search.toLowerCase())) : customRoles;

  const footer = (
    <>
      <button type="button" className={s.btnSecondary} onClick={handleClose}>Hủy</button>
      <button type="submit" form="add-user-form" className={s.btnPrimary} disabled={saving}>
        {saving ? 'Đang tạo...' : 'Tạo tài khoản'}
      </button>
    </>
  );

  return (
    <RightPanel title="Thêm tài khoản" open={open} onClose={handleClose} footer={footer}>
      <form id="add-user-form" onSubmit={submit} className={s.form}>
        <div className={s.field}>
          <label className={s.label}>Tên hiển thị</label>
          <input className={s.input} value={name} onChange={e => setName(e.target.value)} required autoFocus />
        </div>

        <div className={s.field}>
          <label className={s.label}>Email</label>
          <input className={s.input} type="email" value={email} onChange={e => setEmail(e.target.value)} required />
        </div>

        <div className={s.field}>
          <label className={s.label}>Mật khẩu</label>
          <input className={s.input} type="password" value={password} onChange={e => setPassword(e.target.value)} required />
        </div>

        <div className={s.divider} />

        <div className={s.field}>
          <label className={s.label}>Chọn vai trò</label>
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

function RoleOption({ role, selected, onToggle }: { role: RoleItem; selected: boolean; onToggle: (id: string) => void }) {
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
