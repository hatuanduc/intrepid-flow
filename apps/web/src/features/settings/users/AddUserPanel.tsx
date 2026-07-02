'use client';

import { useEffect, useRef, useState } from 'react';
import { createUser, listRoles, type RoleItem } from '../../../lib/api';
import RightPanel from '../../../components/common/RightPanel';
import { useToast } from '../../../components/common/Toast';
import s from './AddUserPanel.module.css';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Props = { open: boolean; onClose: () => void };

export default function AddUserPanel({ open, onClose }: Props) {
  const toast = useToast();
  const [emailInput, setEmailInput] = useState('');
  const [emailChip, setEmailChip] = useState('');
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) listRoles().then(r => setRoles(r.items ?? []));
  }, [open]);

  function reset() {
    setEmailInput(''); setEmailChip('');
    setSelectedRoleIds([]); setSearch(''); setError(null); setFieldErrors({});
  }

  function confirmEmail(val: string) {
    const trimmed = val.trim();
    if (!trimmed) return;
    if (!EMAIL_RE.test(trimmed)) {
      setFieldErrors(p => ({ ...p, email: 'Email không hợp lệ.' }));
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
      if (!emailInput.trim()) errs.email = 'Vui lòng nhập email.';
      else errs.email = 'Nhấn Enter để xác nhận email.';
    }
    return errs;
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
    const errs = validate();
    if (Object.keys(errs).length > 0) { setFieldErrors(errs); return; }
    setFieldErrors({});
    setSaving(true);
    try {
      await createUser({ email: emailChip, roleIds: selectedRoleIds });
      toast.success('Đã gửi lời mời thành công.');
      handleClose();
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      if (code === 'MAIL_ERROR') {
        // User was created in DB, only email delivery failed
        toast.error('Tài khoản đã tạo nhưng gửi email thất bại. Kiểm tra cấu hình SMTP rồi dùng "Gửi lại lời mời".');
        handleClose();
      } else {
        const MSG: Record<string, string> = {
          EMAIL_EXISTS:   'Email này đã được sử dụng.',
          ROLE_NOT_FOUND: 'Vai trò không hợp lệ.',
        };
        setError(MSG[code] ?? 'Tạo tài khoản thất bại. Vui lòng thử lại.');
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
      <button type="button" className={s.btnSecondary} onClick={handleClose}>Hủy</button>
      <button type="submit" form="add-user-form" className={s.btnPrimary} disabled={saving || !canSubmit}>
        {saving ? 'Đang gửi...' : 'Gửi lời mời'}
      </button>
    </>
  );

  return (
    <RightPanel title="Mời thành viên" open={open} onClose={handleClose} footer={footer}>
      <form id="add-user-form" onSubmit={submit} className={s.form}>
        <div className={s.inviteNote}>
          Hệ thống sẽ gửi email kèm link thiết lập mật khẩu. Người được mời tự đặt tên và mật khẩu khi kích hoạt tài khoản.
        </div>

        <div className={s.field}>
          <label className={s.label}>Địa chỉ email</label>
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
                placeholder={emailChip ? '' : 'nhập email và nhấn Enter'}
                autoFocus
              />
            )}
          </div>
          {fieldErrors.email && <span className={s.fieldError}>{fieldErrors.email}</span>}
        </div>

        <div className={s.divider} />

        <div className={s.roleSection}>
          <div className={s.roleSectionHead}>
            <label className={s.label}>Chọn vai trò</label>
            {selectedRoleIds.length > 0 && (
              <span className={s.roleTotalCount}>{selectedRoleIds.length} đã chọn</span>
            )}
          </div>
          <div className={s.roleSearchWrap}>
            <svg className={s.roleSearchIcon} width="13" height="13" viewBox="0 0 13 13" fill="none">
              <circle cx="5.5" cy="5.5" r="4" stroke="currentColor" strokeWidth="1.3"/>
              <path d="M9 9l2.5 2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
            <input
              className={s.roleSearchInput}
              placeholder="Tìm kiếm vai trò..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        {filteredSystem.length > 0 && (
          <CollapsibleRoleGroup
            label="Vai trò hệ thống"
            roles={filteredSystem}
            selectedIds={selectedRoleIds}
            onToggle={toggleRole}
          />
        )}

        {filteredCustom.length > 0 && (
          <CollapsibleRoleGroup
            label="Vai trò tùy chỉnh"
            roles={filteredCustom}
            selectedIds={selectedRoleIds}
            onToggle={toggleRole}
          />
        )}

        {filteredSystem.length === 0 && filteredCustom.length === 0 && (
          <p className={s.noResult}>Không tìm thấy vai trò.</p>
        )}

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
}: { label: string; roles: RoleItem[]; selectedIds: string[]; onToggle: (id: string) => void }) {
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
          {selectedCount > 0 ? `${selectedCount} đã chọn` : '0 đã chọn'}
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

function RoleOption({ role, selected, onToggle }: { role: RoleItem; selected: boolean; onToggle: (id: string) => void }) {
  return (
    <label className={[s.roleOption, selected ? s.roleOptionSelected : ''].filter(Boolean).join(' ')}>
      <input type="checkbox" checked={selected} onChange={() => onToggle(role.id)} className={s.roleCheckbox} />
      <span className={s.roleInfo}>
        <span className={s.roleName}>{role.name}</span>
        {role.description && <span className={s.roleDesc}>{role.description}</span>}
      </span>
    </label>
  );
}
