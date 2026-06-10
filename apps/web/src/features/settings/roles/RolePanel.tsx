'use client';

import { useEffect, useState } from 'react';
import { createRole, updateRole, listPermissions, type RoleItem, type PermissionItem } from '../../../lib/api';
import RightPanel from '../../../components/common/RightPanel';
import s from './RolePanel.module.css';

type Props = {
  role: RoleItem | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
};

export default function RolePanel({ role, open, onClose, onSaved }: Props) {
  const isNew = role === null;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [permissions, setPermissions] = useState<PermissionItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    listPermissions().then(r => setPermissions(r.items ?? []));
    if (role) {
      setName(role.name);
      setDescription(role.description ?? '');
      setSelectedIds(role.permissions?.map(p => p.id) ?? []);
    } else {
      setName(''); setDescription(''); setSelectedIds([]);
    }
    setError(null);
  }, [open, role]);

  function togglePerm(id: string) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  function toggleModule(ids: string[]) {
    const allSelected = ids.every(id => selectedIds.includes(id));
    setSelectedIds(prev =>
      allSelected ? prev.filter(x => !ids.includes(x)) : [...new Set([...prev, ...ids])]
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      if (isNew) {
        await createRole({ name: name.trim(), description: description.trim(), permissionIds: selectedIds });
      } else {
        await updateRole(role.id, { name: name.trim(), description: description.trim(), permissionIds: selectedIds });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lưu thất bại');
    } finally {
      setSaving(false);
    }
  }

  // Group permissions by module
  const byModule = permissions.reduce<Record<string, PermissionItem[]>>((acc, p) => {
    (acc[p.module] ??= []).push(p);
    return acc;
  }, {});

  const MODULE_LABELS: Record<string, string> = {
    dashboard: 'Tổng quan',
    users: 'Người dùng',
    roles: 'Vai trò',
    modules: 'Quy trình tự động',
  };

  const footer = (
    <>
      <button type="button" className={s.btnSecondary} onClick={onClose}>Hủy</button>
      <button type="submit" form="role-panel-form" className={s.btnPrimary} disabled={saving}>
        {saving ? 'Đang lưu...' : isNew ? 'Tạo vai trò' : 'Lưu thay đổi'}
      </button>
    </>
  );

  return (
    <RightPanel
      title={isNew ? 'Tạo vai trò mới' : role?.name ?? ''}
      open={open}
      onClose={onClose}
      footer={footer}
    >
      <form id="role-panel-form" onSubmit={submit} className={s.form}>
        <div className={s.field}>
          <label className={s.label}>Tên vai trò</label>
          <input className={s.input} value={name} onChange={e => setName(e.target.value)} required autoFocus />
        </div>

        <div className={s.field}>
          <label className={s.label}>Mô tả <span className={s.optional}>(tuỳ chọn)</span></label>
          <input className={s.input} value={description} onChange={e => setDescription(e.target.value)} />
        </div>

        <div className={s.divider} />

        <div className={s.permSection}>
          <div className={s.permHeader}>
            <span className={s.permTitle}>Quyền hạn</span>
            <span className={s.permCount}>{selectedIds.length} được chọn</span>
          </div>

          {Object.entries(byModule).map(([mod, perms]) => {
            const permIds = perms.map(p => p.id);
            const allChecked = permIds.every(id => selectedIds.includes(id));
            const someChecked = permIds.some(id => selectedIds.includes(id));

            return (
              <div key={mod} className={s.moduleBlock}>
                <label className={s.moduleHeader}>
                  <input
                    type="checkbox"
                    checked={allChecked}
                    ref={el => { if (el) el.indeterminate = someChecked && !allChecked; }}
                    onChange={() => toggleModule(permIds)}
                    className={s.checkbox}
                  />
                  <span className={s.moduleName}>{MODULE_LABELS[mod] ?? mod}</span>
                </label>
                <div className={s.permList}>
                  {perms.map(p => (
                    <label key={p.id} className={s.permRow}>
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(p.id)}
                        onChange={() => togglePerm(p.id)}
                        className={s.checkbox}
                      />
                      <span className={s.permLabel}>{p.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {error && <div className={s.error}>{error}</div>}
      </form>
    </RightPanel>
  );
}
