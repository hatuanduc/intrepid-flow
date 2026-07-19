'use client';

import { useEffect, useState } from 'react';
import { updateUser, listRoles, listPermissions, type UserItem, type RoleItem, type PermissionItem } from '../../../lib/api';
import RightPanel from '../../../components/common/RightPanel';
import { useT } from '../../../lib/i18n';
import { useUser } from '../../../app/(dashboard)/user-context';
import { roleName, roleDescription } from '../../../lib/roleDisplay';
import UserPermissionPicker from './UserPermissionPicker';
import s from './AddUserPanel.module.css';

type Props = {
  user: UserItem | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
};

export default function EditUserPanel({ user, open, onClose, onSaved }: Props) {
  const { t } = useT();
  const currentUser = useUser();
  const isSelf = !!user && !!currentUser && user.id === currentUser.id;
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [selectedRoleIds, setSelectedRoleIds] = useState<number[]>([]);
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [selectedPermissionIds, setSelectedPermissionIds] = useState<number[]>([]);
  const [permissions, setPermissions] = useState<PermissionItem[]>([]);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const resetKey = `${open}:${user?.id ?? ''}`;
  const [prevResetKey, setPrevResetKey] = useState(resetKey);
  if (resetKey !== prevResetKey) {
    setPrevResetKey(resetKey);
    if (open && user) {
      setName(user.name ?? '');
      setPassword('');
      setIsActive(user.isActive);
      setSelectedRoleIds(user.roles.map(r => r.id));
      setSelectedPermissionIds(user.permissions.map(p => p.id));
      setError(null);
      setSearch('');
    }
  }

  useEffect(() => {
    if (open) {
      listRoles().then(r => setRoles(r.items ?? []));
      listPermissions().then(r => setPermissions(r.items ?? []));
    }
  }, [open]);

  function clearField(field: string) {
    setFieldErrors(prev => { const next = { ...prev }; delete next[field]; return next; });
  }

  function validate() {
    const errs: Record<string, string> = {};
    if (password && password.length < 6) errs.password = t('users.newPasswordMinLength');
    if (selectedRoleIds.length === 0) errs.roleIds = t('users.atLeastOneRole');
    return errs;
  }

  function toggleRole(id: number) {
    setSelectedRoleIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }

  function togglePermission(id: number) {
    setSelectedPermissionIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }

  function toggleModulePermissions(ids: number[]) {
    setSelectedPermissionIds(prev => {
      const allSelected = ids.every(id => prev.includes(id));
      return allSelected ? prev.filter(x => !ids.includes(x)) : [...new Set([...prev, ...ids])];
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setError(null);
    const errs = validate();
    if (Object.keys(errs).length > 0) { setFieldErrors(errs); return; }
    setFieldErrors({});
    setSaving(true);
    try {
      await updateUser(user.id, {
        name: name.trim() || undefined,
        password: password || undefined,
        isActive,
        roleIds: selectedRoleIds,
        permissionIds: selectedPermissionIds,
      });
      onSaved();
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      const MSG: Record<string, string> = {
        USER_NOT_FOUND: t('users.userNotFound'),
        ROLE_NOT_FOUND: t('users.roleInvalid'),
        CANNOT_DEACTIVATE_SELF: t('users.cannotDeactivateSelf'),
      };
      setError(MSG[code] ?? t('users.updateFailed'));
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
      <button type="button" className={s.btnSecondary} onClick={onClose}>{t('common.cancel')}</button>
      <button type="submit" form="edit-user-form" className={s.btnPrimary} disabled={saving}>
        {saving ? t('common.saving') : t('users.saveChanges')}
      </button>
    </>
  );

  return (
    <RightPanel title={t('users.editPanelTitle')} open={open} onClose={onClose} footer={footer}>
      <form id="edit-user-form" onSubmit={submit} className={s.form}>
        <div className={s.field}>
          <label className={s.label}>{t('users.emailLabel')}</label>
          <input className={`${s.input} ${s.inputDisabled}`} value={user?.email ?? ''} disabled />
        </div>

        <div className={s.field}>
          <label className={s.label}>{t('users.displayNameLabel')}</label>
          <input
            className={s.input}
            value={name}
            onChange={e => setName(e.target.value)}
            autoFocus
          />
        </div>

        <div className={s.field}>
          <label className={s.label}>{t('users.newPasswordLabel')}</label>
          <input
            className={`${s.input} ${fieldErrors.password ? s.inputError : ''}`}
            type="password"
            value={password}
            onChange={e => { setPassword(e.target.value); clearField('password'); }}
            placeholder={t('users.newPasswordPlaceholder')}
          />
          {fieldErrors.password && <span className={s.fieldError}>{fieldErrors.password}</span>}
        </div>

        <div className={s.field}>
          <label className={s.label}>{t('users.statusLabel')}</label>
          <label className={s.checkRow}>
            <input
              type="checkbox"
              checked={isActive}
              disabled={isSelf}
              onChange={e => setIsActive(e.target.checked)}
            />
            {t('users.activeCheckbox')}
          </label>
          {isSelf && <p className={s.noResult}>{t('users.cannotDeactivateSelf')}</p>}
        </div>

        <div className={s.divider} />

        <div className={s.field}>
          <label className={s.label}>{t('users.roleLabel')}</label>
          <input
            className={s.input}
            placeholder={t('users.searchRolePlaceholder')}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {fieldErrors.roleIds && <span className={s.fieldError}>{fieldErrors.roleIds}</span>}
        </div>

        {filteredSystem.length > 0 && (
          <div className={s.roleGroup}>
            <span className={s.roleGroupLabel}>{t('users.systemRoles')}</span>
            {filteredSystem.map(r => (
              <RoleOption key={r.id} role={r} selected={selectedRoleIds.includes(r.id)} onToggle={toggleRole} />
            ))}
          </div>
        )}

        {filteredCustom.length > 0 && (
          <div className={s.roleGroup}>
            <span className={s.roleGroupLabel}>{t('users.customRoles')}</span>
            {filteredCustom.map(r => (
              <RoleOption key={r.id} role={r} selected={selectedRoleIds.includes(r.id)} onToggle={toggleRole} />
            ))}
          </div>
        )}

        {filteredSystem.length === 0 && filteredCustom.length === 0 && (
          <p className={s.noResult}>{t('users.noRoleFound')}</p>
        )}

        <div className={s.divider} />

        <div className={s.permSection}>
          <div className={s.permSectionHead}>
            <label className={s.label}>{t('users.customPermissionsLabel')}</label>
            {selectedPermissionIds.length > 0 && (
              <span className={s.roleTotalCount}>{t('users.selectedCount', { n: selectedPermissionIds.length })}</span>
            )}
          </div>
          <p className={s.permSectionDesc}>{t('users.customPermissionsDesc')}</p>
          <UserPermissionPicker
            permissions={permissions}
            selectedIds={selectedPermissionIds}
            onToggle={togglePermission}
            onToggleModule={toggleModulePermissions}
          />
        </div>

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
  onToggle: (id: number) => void;
}) {
  const { t } = useT();
  // Super Admin (key: superadmin) is only ever assigned via the seed script — never selectable here.
  const disabled = role.key === 'superadmin';
  return (
    <label className={[s.roleOption, selected ? s.roleOptionSelected : '', disabled ? s.roleOptionDisabled : ''].filter(Boolean).join(' ')}>
      <input
        type="checkbox"
        checked={selected}
        disabled={disabled}
        onChange={() => onToggle(role.id)}
        className={s.roleCheckbox}
      />
      <span className={s.roleInfo}>
        <span className={s.roleName}>{roleName(role, t)}</span>
        {role.description && <span className={s.roleDesc}>{roleDescription(role, t)}</span>}
      </span>
    </label>
  );
}
