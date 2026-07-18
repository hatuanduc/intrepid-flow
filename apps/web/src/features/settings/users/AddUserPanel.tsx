'use client';

import { useEffect, useRef, useState } from 'react';
import { createUser, listRoles, listPermissions, type RoleItem, type PermissionItem } from '../../../lib/api';
import RightPanel from '../../../components/common/RightPanel';
import { useToast } from '../../../components/common/Toast';
import { useT } from '../../../lib/i18n';
import { roleName, roleDescription } from '../../../lib/roleDisplay';
import UserPermissionPicker from './UserPermissionPicker';
import s from './AddUserPanel.module.css';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Props = { open: boolean; onClose: () => void };

export default function AddUserPanel({ open, onClose }: Props) {
  const toast = useToast();
  const { t } = useT();
  const [emailInput, setEmailInput] = useState('');
  const [emailChip, setEmailChip] = useState('');
  const [selectedRoleIds, setSelectedRoleIds] = useState<number[]>([]);
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [selectedPermissionIds, setSelectedPermissionIds] = useState<number[]>([]);
  const [permissions, setPermissions] = useState<PermissionItem[]>([]);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      listRoles().then(r => setRoles(r.items ?? []));
      listPermissions().then(r => setPermissions(r.items ?? []));
    }
  }, [open]);

  function reset() {
    setEmailInput(''); setEmailChip('');
    setSelectedRoleIds([]); setSelectedPermissionIds([]); setSearch(''); setError(null); setFieldErrors({});
  }

  function confirmEmail(val: string) {
    const trimmed = val.trim();
    if (!trimmed) return;
    if (!EMAIL_RE.test(trimmed)) {
      setFieldErrors(p => ({ ...p, email: t('users.emailInvalid') }));
      return;
    }
    setEmailChip(trimmed);
    setEmailInput('');
    setFieldErrors(p => { const n = { ...p }; delete n.email; return n; });
  }

  function handleEmailKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === 'Tab' || e.key === ',') {
      e.preventDefault();
      confirmEmail(emailInput);
    } else if (e.key === 'Backspace' && !emailInput && emailChip) {
      setEmailChip('');
    }
  }

  function handleEmailBlur() {
    if (emailInput.trim()) confirmEmail(emailInput);
  }

  function validate() {
    const errs: Record<string, string> = {};
    if (!emailChip) {
      if (!emailInput.trim()) errs.email = t('users.emailRequired');
      else errs.email = t('users.emailPressEnter');
    }
    return errs;
  }

  function handleClose() { reset(); onClose(); }

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
    setError(null);
    const errs = validate();
    if (Object.keys(errs).length > 0) { setFieldErrors(errs); return; }
    setFieldErrors({});
    setSaving(true);
    try {
      await createUser({ email: emailChip, roleIds: selectedRoleIds, permissionIds: selectedPermissionIds });
      toast.success(t('users.inviteSuccess'));
      handleClose();
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      if (code === 'MAIL_ERROR') {
        // User was created in DB, only email delivery failed
        toast.error(t('users.inviteMailError'));
        handleClose();
      } else {
        const MSG: Record<string, string> = {
          EMAIL_EXISTS:   t('users.emailExists'),
          ROLE_NOT_FOUND: t('users.roleInvalid'),
        };
        setError(MSG[code] ?? t('users.createUserFailed'));
      }
    } finally {
      setSaving(false);
    }
  }

  const systemRoles = roles.filter(r => r.isSystem);
  const customRoles = roles.filter(r => !r.isSystem);
  const filteredSystem = search ? systemRoles.filter(r => r.name.toLowerCase().includes(search.toLowerCase())) : systemRoles;
  const filteredCustom = search ? customRoles.filter(r => r.name.toLowerCase().includes(search.toLowerCase())) : customRoles;

  const canSubmit = !!emailChip && selectedRoleIds.length > 0;

  const footer = (
    <>
      <button type="button" className={s.btnSecondary} onClick={handleClose}>{t('common.cancel')}</button>
      <button type="submit" form="add-user-form" className={s.btnPrimary} disabled={saving || !canSubmit}>
        {saving ? t('users.sending') : t('users.sendInvite')}
      </button>
    </>
  );

  return (
    <RightPanel title={t('users.invitePanelTitle')} open={open} onClose={handleClose} footer={footer}>
      <form id="add-user-form" onSubmit={submit} className={s.form}>
        <div className={s.inviteNote}>
          {t('users.inviteNote')}
        </div>

        <div className={s.field}>
          <label className={s.label}>{t('users.emailAddressLabel')}</label>
          <div
            className={`${s.emailInputWrap} ${fieldErrors.email ? s.emailInputWrapError : ''}`}
            onClick={() => inputRef.current?.focus()}
          >
            {emailChip && (
              <span className={s.emailChip}>
                {emailChip}
                <button
                  type="button"
                  className={s.chipRemove}
                  onClick={e => { e.stopPropagation(); setEmailChip(''); setTimeout(() => inputRef.current?.focus(), 0); }}
                >×</button>
              </span>
            )}
            {!emailChip && (
              <input
                ref={inputRef}
                className={s.emailInput}
                type="email"
                value={emailInput}
                onChange={e => { setEmailInput(e.target.value); setFieldErrors(p => { const n = { ...p }; delete n.email; return n; }); }}
                onKeyDown={handleEmailKeyDown}
                onBlur={handleEmailBlur}
                placeholder={emailChip ? '' : t('users.emailPlaceholder')}
                autoFocus
              />
            )}
          </div>
          {fieldErrors.email && <span className={s.fieldError}>{fieldErrors.email}</span>}
        </div>

        <div className={s.divider} />

        <div className={s.roleSection}>
          <div className={s.roleSectionHead}>
            <label className={s.label}>{t('users.chooseRole')}</label>
            {selectedRoleIds.length > 0 && (
              <span className={s.roleTotalCount}>{t('users.selectedCount', { n: selectedRoleIds.length })}</span>
            )}
          </div>
          <div className={s.roleSearchWrap}>
            <svg className={s.roleSearchIcon} width="13" height="13" viewBox="0 0 13 13" fill="none">
              <circle cx="5.5" cy="5.5" r="4" stroke="currentColor" strokeWidth="1.3"/>
              <path d="M9 9l2.5 2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
            <input
              className={s.roleSearchInput}
              placeholder={t('users.searchRolePlaceholder')}
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        {filteredSystem.length > 0 && (
          <CollapsibleRoleGroup
            label={t('users.systemRoles')}
            roles={filteredSystem}
            selectedIds={selectedRoleIds}
            onToggle={toggleRole}
          />
        )}

        {filteredCustom.length > 0 && (
          <CollapsibleRoleGroup
            label={t('users.customRoles')}
            roles={filteredCustom}
            selectedIds={selectedRoleIds}
            onToggle={toggleRole}
          />
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

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="12" height="12" viewBox="0 0 12 12" fill="none"
      style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}
    >
      <path d="M4.5 2.5L8 6l-3.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function CollapsibleRoleGroup({
  label, roles, selectedIds, onToggle,
}: { label: string; roles: RoleItem[]; selectedIds: number[]; onToggle: (id: number) => void }) {
  const { t } = useT();
  const [open, setOpen] = useState(true);
  const selectedCount = roles.filter(r => selectedIds.includes(r.id)).length;

  return (
    <div className={s.roleGroup}>
      <button type="button" className={s.roleGroupHeader} onClick={() => setOpen(v => !v)}>
        <span className={s.roleGroupHeaderLeft}>
          <span className={s.roleGroupChevron}><ChevronIcon open={open} /></span>
          <span className={s.roleGroupLabel}>{label}</span>
        </span>
        <span className={s.roleGroupCount}>
          {t('users.selectedCount', { n: selectedCount })}
        </span>
      </button>
      {open && (
        <div className={s.roleGroupBody}>
          {roles.map(r => (
            <RoleOption key={r.id} role={r} selected={selectedIds.includes(r.id)} onToggle={onToggle} />
          ))}
        </div>
      )}
    </div>
  );
}

function RoleOption({ role, selected, onToggle }: { role: RoleItem; selected: boolean; onToggle: (id: number) => void }) {
  const { t } = useT();
  // Super Admin (key: superadmin) is only ever assigned via the seed script — never selectable here.
  const disabled = role.key === 'superadmin';
  return (
    <label className={[s.roleOption, selected ? s.roleOptionSelected : '', disabled ? s.roleOptionDisabled : ''].filter(Boolean).join(' ')}>
      <input type="checkbox" checked={selected} disabled={disabled} onChange={() => onToggle(role.id)} className={s.roleCheckbox} />
      <span className={s.roleInfo}>
        <span className={s.roleName}>{roleName(role, t)}</span>
        {role.description && <span className={s.roleDesc}>{roleDescription(role, t)}</span>}
      </span>
    </label>
  );
}
