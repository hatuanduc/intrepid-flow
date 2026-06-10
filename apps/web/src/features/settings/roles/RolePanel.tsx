'use client';

import { useEffect, useState } from 'react';
import { createRole, updateRole, listPermissions, type RoleItem, type PermissionItem } from '../../../lib/api';
import RightPanel from '../../../components/common/RightPanel';
import { Spinner } from '../../../components/common/PageLoader';
import s from './RolePanel.module.css';

type Props = {
  role: RoleItem | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
};

const MODULE_LABELS: Record<string, string> = {
  dashboard: 'Tổng quan',
  users:     'Người dùng',
  roles:     'Vai trò',
  branches:  'Chi nhánh',
  modules:   'Trang quy trình',
};

function moduleLabel(mod: string) {
  return MODULE_LABELS[mod] ?? mod.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export default function RolePanel({ role, open, onClose, onSaved }: Props) {
  const isNew = role === null;
  const isSystem = role?.isSystem ?? false;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [permissions, setPermissions] = useState<PermissionItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingPerms, setLoadingPerms] = useState(false);
  const [permsError, setPermsError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoadingPerms(true);
    setPermsError(null);
    listPermissions()
      .then(r => setPermissions(r.items ?? []))
      .catch(() => setPermsError('Không thể tải danh sách quyền hạn.'))
      .finally(() => setLoadingPerms(false));
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
    if (isSystem) return;
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  function toggleModule(ids: string[]) {
    if (isSystem) return;
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

  const footer = (
    <>
      <button type="button" className={s.btnSecondary} onClick={onClose}>Hủy</button>
      {!isSystem && (
        <button type="submit" form="role-panel-form" className={s.btnPrimary} disabled={saving}>
          {saving ? 'Đang lưu...' : isNew ? 'Tạo vai trò' : 'Lưu thay đổi'}
        </button>
      )}
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

        {isSystem && (
          <div className={s.systemNotice}>
            Vai trò hệ thống — không thể chỉnh sửa quyền hạn.
          </div>
        )}

        <div className={s.field}>
          <label className={s.label}>Tên vai trò</label>
          <input
            className={s.input}
            value={name}
            onChange={e => setName(e.target.value)}
            required
            autoFocus
            disabled={isSystem}
          />
        </div>

        <div className={s.field}>
          <label className={s.label}>Mô tả <span className={s.optional}>(tuỳ chọn)</span></label>
          <input
            className={s.input}
            value={description}
            onChange={e => setDescription(e.target.value)}
            disabled={isSystem}
          />
        </div>

        <div className={s.divider} />

        <div className={s.permSection}>
          <div className={s.permHeader}>
            <span className={s.permTitle}>Quyền hạn</span>
            <span className={s.permCount}>{selectedIds.length} được chọn</span>
          </div>

          {loadingPerms && <div className={s.permsLoading}><Spinner size={18} /></div>}
          {permsError && <div className={s.error}>{permsError}</div>}
          {!loadingPerms && !permsError && permissions.length === 0 && (
            <div className={s.permsEmpty}>Chưa có quyền hạn nào.</div>
          )}

          {Object.entries(byModule).map(([mod, perms]) => {
            const permIds = perms.map(p => p.id);
            const allChecked = permIds.every(id => selectedIds.includes(id));
            const someChecked = permIds.some(id => selectedIds.includes(id));

            return (
              <div key={mod} className={s.moduleBlock}>
                <label className={`${s.moduleHeader} ${isSystem ? s.moduleHeaderReadonly : ''}`}>
                  {!isSystem && (
                    <input
                      type="checkbox"
                      checked={allChecked}
                      ref={el => { if (el) el.indeterminate = someChecked && !allChecked; }}
                      onChange={() => toggleModule(permIds)}
                      className={s.checkbox}
                    />
                  )}
                  <span className={s.moduleName}>{moduleLabel(mod)}</span>
                  {isSystem && (
                    <span className={s.moduleCount}>
                      {permIds.filter(id => selectedIds.includes(id)).length}/{permIds.length}
                    </span>
                  )}
                </label>
                <div className={s.permList}>
                  {perms.map(p => {
                    const checked = selectedIds.includes(p.id);
                    return (
                      <label key={p.id} className={`${s.permRow} ${isSystem ? s.permRowReadonly : ''}`}>
                        {isSystem ? (
                          <span className={checked ? s.permDotOn : s.permDotOff} />
                        ) : (
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => togglePerm(p.id)}
                            className={s.checkbox}
                          />
                        )}
                        <span className={s.permLabel}>{p.label}</span>
                      </label>
                    );
                  })}
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
