'use client';

import { useEffect, useRef, useState } from 'react';
import {
  listUsers, type UserItem,
  listRoles, type RoleItem,
  deleteUser as apiDeleteUser,
  deleteRole as apiDeleteRole,
} from '../../../lib/api';
import AddUserPanel from './AddUserPanel';
import EditUserPanel from './EditUserPanel';
import RolePanel from '../roles/RolePanel';
import { Spinner } from '../../../components/common/PageLoader';
import s from './UsersPage.module.css';

type StatusFilter = 'all' | 'active' | 'inactive';
type MainTab = 'users' | 'roles';
type ActiveFilters = {
  name?: string;
  email?: string;
  roleIds?: string[];
};
type DeleteTarget =
  | { type: 'user'; item: UserItem }
  | { type: 'role'; item: RoleItem };

/* ── Avatar ── */
const AVATAR_COLORS = [
  '#635bff', '#09825d', '#1a56db', '#7c3aed',
  '#c44c0a', '#0e7490', '#92400e', '#be185d',
];
function avatarColor(name: string) {
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
}

/* ── Role badge ── */
function RoleBadge({ name }: { name: string }) {
  const lower = name.toLowerCase();
  const cls = lower.includes('admin') || lower.includes('quản trị') ? s.roleAdmin
    : lower.includes('owner') || lower.includes('chủ') ? s.roleOwner
    : lower.includes('editor') || lower.includes('biên') ? s.roleEditor
    : s.roleViewer;
  return <span className={`${s.roleBadge} ${cls}`}>{name}</span>;
}

/* ── Filter pill ── */
type PillProps = {
  label: string;
  active?: boolean;
  activeLabel?: string;
  onClear?: () => void;
  children: (close: () => void) => React.ReactNode;
};
function FilterPill({ label, active, activeLabel, onClear, children }: PillProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className={s.pillWrap} ref={ref}>
      <button
        className={`${s.pill} ${active ? s.pillActive : ''}`}
        onClick={() => setOpen(v => !v)}
      >
        {active ? (
          <>
            <span className={s.pillCheck}>✓</span>
            <span>{activeLabel ?? label}</span>
            <span
              className={s.pillClear}
              role="button"
              onClick={e => { e.stopPropagation(); onClear?.(); setOpen(false); }}
            >×</span>
          </>
        ) : (
          <>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className={s.pillPlus}>
              <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.2"/>
              <path d="M6 4v4M4 6h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
            {label}
          </>
        )}
      </button>
      {open && (
        <div className={s.pillDropdown}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

/* ── Text filter popup ── */
function TextFilter({ label, value, onApply }: {
  label: string; value?: string; onApply: (v: string) => void;
}) {
  const [val, setVal] = useState(value ?? '');
  return (
    <div className={s.filterPopup}>
      <p className={s.filterPopupTitle}>Lọc theo {label.toLowerCase()}</p>
      <p className={s.filterPopupSub}>Chứa</p>
      <input
        className={s.filterPopupInput}
        value={val}
        onChange={e => setVal(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && onApply(val)}
        placeholder={`Nhập ${label.toLowerCase()}...`}
        autoFocus
      />
      <button className={s.filterPopupApply} onClick={() => onApply(val)}>Áp dụng</button>
    </div>
  );
}

/* ── Role filter popup ── */
function RoleFilter({ roles, selected, onApply }: {
  roles: { id: string; name: string }[];
  selected: string[];
  onApply: (ids: string[]) => void;
}) {
  const [checked, setChecked] = useState<string[]>(selected);
  function toggle(id: string) {
    setChecked(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }
  return (
    <div className={s.filterPopup}>
      <p className={s.filterPopupTitle}>Lọc theo vai trò</p>
      <div className={s.filterRoleList}>
        {roles.map(r => (
          <label key={r.id} className={s.filterRoleRow}>
            <input
              type="checkbox"
              checked={checked.includes(r.id)}
              onChange={() => toggle(r.id)}
              className={s.filterCheckbox}
            />
            {r.name}
          </label>
        ))}
        {roles.length === 0 && <p className={s.filterEmpty}>Chưa có vai trò nào.</p>}
      </div>
      <button className={s.filterPopupApply} onClick={() => onApply(checked)}>Áp dụng</button>
    </div>
  );
}

/* ── More menu ── */
function MoreMenu({
  onEdit,
  onDelete,
}: {
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);
  return (
    <div className={s.moreWrap} ref={ref} onClick={e => e.stopPropagation()}>
      <button
        className={`${s.moreBtn} ${open ? s.moreBtnOpen : ''}`}
        onClick={() => setOpen(v => !v)}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <circle cx="2" cy="7" r="1.2" fill="currentColor"/>
          <circle cx="7" cy="7" r="1.2" fill="currentColor"/>
          <circle cx="12" cy="7" r="1.2" fill="currentColor"/>
        </svg>
      </button>
      {open && (
        <div className={s.moreDropdown}>
          <button className={s.moreItem} onClick={() => { setOpen(false); onEdit(); }}>Chỉnh sửa</button>
          <button className={`${s.moreItem} ${s.moreItemDanger}`} onClick={() => { setOpen(false); onDelete(); }}>Xóa</button>
        </div>
      )}
    </div>
  );
}

/* ── Role group (roles tab) ── */
function RoleGroup({ label, roles, onSelect, onDelete }: {
  label: string;
  roles: RoleItem[];
  onSelect: (r: RoleItem) => void;
  onDelete: (r: RoleItem) => void;
}) {
  return (
    <div className={s.group}>
      <div className={s.groupHeader}>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className={s.groupIcon}>
          <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <span className={s.groupLabel}>{label}</span>
        <span className={s.groupCount}>{roles.length}</span>
      </div>
      <div className={s.groupBody}>
        {roles.map(role => (
          <div
            key={role.id}
            className={s.roleRow}
            role="button"
            tabIndex={0}
            onClick={() => onSelect(role)}
            onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && onSelect(role)}
          >
            <div className={s.roleMain}>
              <span className={s.roleName}>{role.name}</span>
              {role.description && <span className={s.roleDesc}>{role.description}</span>}
            </div>
            <div className={s.roleMeta}>
              <span className={s.roleMetaItem}>
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="5" r="3" stroke="currentColor" strokeWidth="1.2"/>
                  <path d="M2 14c0-3.314 2.686-5 6-5s6 1.686 6 5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                </svg>
                {role.userCount ?? 0}
              </span>
              <span className={s.roleMetaItem}>
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                  <rect x="3" y="7" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
                  <path d="M5.5 7V5a2.5 2.5 0 015 0v2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                </svg>
                {role.permissions?.length ?? 0} quyền
              </span>
            </div>
            <div className={s.moreWrap} onClick={e => e.stopPropagation()}>
              <RoleMoreMenu
                onEdit={() => onSelect(role)}
                onDelete={role.isSystem ? undefined : () => onDelete(role)}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Role more menu (no delete for system) ── */
function RoleMoreMenu({ onEdit, onDelete }: { onEdit: () => void; onDelete?: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);
  return (
    <div className={s.moreWrap} ref={ref}>
      <button
        className={`${s.moreBtn} ${open ? s.moreBtnOpen : ''}`}
        onClick={e => { e.stopPropagation(); setOpen(v => !v); }}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <circle cx="2" cy="7" r="1.2" fill="currentColor"/>
          <circle cx="7" cy="7" r="1.2" fill="currentColor"/>
          <circle cx="12" cy="7" r="1.2" fill="currentColor"/>
        </svg>
      </button>
      {open && (
        <div className={s.moreDropdown}>
          <button className={s.moreItem} onClick={() => { setOpen(false); onEdit(); }}>Chỉnh sửa</button>
          {onDelete && (
            <button className={`${s.moreItem} ${s.moreItemDanger}`} onClick={() => { setOpen(false); onDelete(); }}>Xóa</button>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Confirm delete modal ── */
function ConfirmModal({
  target,
  deleting,
  error,
  onConfirm,
  onCancel,
}: {
  target: DeleteTarget;
  deleting: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const name = target.type === 'user'
    ? (target.item.name ?? target.item.email)
    : target.item.name;
  const typeLabel = target.type === 'user' ? 'tài khoản' : 'vai trò';

  return (
    <div className={s.modalOverlay} onClick={onCancel}>
      <div className={s.modal} onClick={e => e.stopPropagation()}>
        <p className={s.modalTitle}>Xóa {typeLabel}?</p>
        <p className={s.modalDesc}>
          Bạn có chắc muốn xóa {typeLabel} <strong>{name}</strong>?
        </p>
        {error && <div className={s.modalError}>{error}</div>}
        <div className={s.modalActions}>
          <button className={s.btnSecondary} onClick={onCancel} disabled={deleting}>Hủy</button>
          <button className={s.btnDanger} onClick={onConfirm} disabled={deleting}>
            {deleting ? 'Đang xóa...' : 'Xóa'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════ */
export default function UsersPage() {
  const [mainTab, setMainTab] = useState<MainTab>('users');

  /* Users */
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [activeFilters, setActiveFilters] = useState<ActiveFilters>({});
  const [showAdd, setShowAdd] = useState(false);
  const [editUser, setEditUser] = useState<UserItem | null>(null);

  /* Roles */
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [loadingRoles, setLoadingRoles] = useState(false);
  const [panelRole, setPanelRole] = useState<RoleItem | null | 'new'>(null);

  /* Delete */
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function loadUsers() {
    setLoadingUsers(true);
    try { const r = await listUsers(); setUsers(r.items ?? []); }
    finally { setLoadingUsers(false); }
  }
  async function loadRoles() {
    setLoadingRoles(true);
    try { const r = await listRoles(); setRoles(r.items ?? []); }
    finally { setLoadingRoles(false); }
  }

  useEffect(() => { loadUsers(); loadRoles(); }, []);

  useEffect(() => {
    if (mainTab === 'roles' && roles.length === 0) loadRoles();
  }, [mainTab]);

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleting(true);
    setDeleteError(null);
    try {
      if (target.type === 'user') await apiDeleteUser(target.item.id);
      else await apiDeleteRole(target.item.id);
      setDeleteTarget(null);
      if (target.type === 'user') loadUsers();
      else loadRoles();
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      const MSG: Record<string, string> = {
        USER_NOT_FOUND: 'Tài khoản không tồn tại.',
        ROLE_NOT_FOUND: 'Vai trò không tồn tại.',
        CANNOT_DELETE_SYSTEM_ROLE: 'Không thể xóa vai trò hệ thống.',
      };
      setDeleteError(MSG[code] ?? 'Xóa thất bại. Vui lòng thử lại.');
    } finally {
      setDeleting(false);
    }
  }

  /* Derived */
  const active   = users.filter(u => u.isActive);
  const inactive = users.filter(u => !u.isActive);

  const filtered = (() => {
    let r = statusFilter === 'active' ? active : statusFilter === 'inactive' ? inactive : users;
    if (activeFilters.name)
      r = r.filter(u => (u.name ?? '').toLowerCase().includes(activeFilters.name!.toLowerCase()));
    if (activeFilters.email)
      r = r.filter(u => u.email.toLowerCase().includes(activeFilters.email!.toLowerCase()));
    if (activeFilters.roleIds?.length)
      r = r.filter(u => u.roles.some(role => activeFilters.roleIds!.includes(role.id)));
    return r;
  })();

  const hasAnyFilter = !!(activeFilters.name || activeFilters.email || activeFilters.roleIds?.length);

  const chips: { key: StatusFilter; label: string; count: number }[] = [
    { key: 'all',      label: 'Tất cả',         count: users.length },
    { key: 'active',   label: 'Đang hoạt động', count: active.length },
    { key: 'inactive', label: 'Đã khóa',        count: inactive.length },
  ];

  const roleOptions = roles.map(r => ({ id: r.id, name: r.name }));
  const systemRoles = roles.filter(r => r.isSystem);
  const customRoles = roles.filter(r => !r.isSystem);

  function emptyMessage() {
    if (hasAnyFilter || statusFilter !== 'all') return 'Không tìm thấy kết quả phù hợp.';
    return 'Không có tài khoản nào.';
  }

  return (
    <div className={s.page}>
      <div className={s.pageHeader}>
        <h1 className={s.pageTitle}>Người dùng & Vai trò</h1>
        {mainTab === 'users' && (
          <button className={s.btnPrimary} onClick={() => setShowAdd(true)}>+ Thêm tài khoản</button>
        )}
        {mainTab === 'roles' && (
          <button className={s.btnPrimary} onClick={() => setPanelRole('new')}>+ Tạo vai trò</button>
        )}
      </div>

      {/* Main tabs */}
      <div className={s.tabs}>
        <button
          className={`${s.tab} ${mainTab === 'users' ? s.tabActive : ''}`}
          onClick={() => setMainTab('users')}
        >
          Tài khoản
          <span className={`${s.tabCount} ${mainTab === 'users' ? s.tabCountActive : ''}`}>{users.length}</span>
        </button>
        <button
          className={`${s.tab} ${mainTab === 'roles' ? s.tabActive : ''}`}
          onClick={() => setMainTab('roles')}
        >
          Vai trò
          <span className={`${s.tabCount} ${mainTab === 'roles' ? s.tabCountActive : ''}`}>{roles.length}</span>
        </button>
      </div>

      {/* ── Users tab ── */}
      {mainTab === 'users' && (
        <>
          {/* Status chips */}
          <div className={s.chips}>
            {chips.map(c => (
              <button
                key={c.key}
                className={`${s.chip} ${statusFilter === c.key ? s.chipSelected : ''}`}
                onClick={() => setStatusFilter(c.key)}
              >
                <span className={s.chipLabel}>{c.label}</span>
                <span className={s.chipCount}>{c.count}</span>
              </button>
            ))}
          </div>

          {/* Filter pills */}
          <div className={s.filterPills}>
            <FilterPill
              label="Vai trò"
              active={!!activeFilters.roleIds?.length}
              activeLabel={activeFilters.roleIds?.length === 1
                ? roleOptions.find(r => r.id === activeFilters.roleIds![0])?.name ?? 'Vai trò'
                : `${activeFilters.roleIds?.length} vai trò`}
              onClear={() => setActiveFilters(f => ({ ...f, roleIds: undefined }))}
            >
              {close => (
                <RoleFilter
                  roles={roleOptions}
                  selected={activeFilters.roleIds ?? []}
                  onApply={ids => {
                    setActiveFilters(f => ({ ...f, roleIds: ids.length ? ids : undefined }));
                    close();
                  }}
                />
              )}
            </FilterPill>

            <FilterPill
              label="Tên"
              active={!!activeFilters.name}
              activeLabel={`Tên: ${activeFilters.name}`}
              onClear={() => setActiveFilters(f => ({ ...f, name: undefined }))}
            >
              {close => (
                <TextFilter
                  label="Tên"
                  value={activeFilters.name}
                  onApply={v => {
                    setActiveFilters(f => ({ ...f, name: v.trim() || undefined }));
                    close();
                  }}
                />
              )}
            </FilterPill>

            <FilterPill
              label="Email"
              active={!!activeFilters.email}
              activeLabel={`Email: ${activeFilters.email}`}
              onClear={() => setActiveFilters(f => ({ ...f, email: undefined }))}
            >
              {close => (
                <TextFilter
                  label="Email"
                  value={activeFilters.email}
                  onApply={v => {
                    setActiveFilters(f => ({ ...f, email: v.trim() || undefined }));
                    close();
                  }}
                />
              )}
            </FilterPill>

            {hasAnyFilter && (
              <button
                className={s.clearAll}
                onClick={() => setActiveFilters({})}
              >
                Xóa bộ lọc
              </button>
            )}
          </div>

          {/* Table */}
          <div className={s.tableWrap}>
            {loadingUsers ? (
              <div className={s.empty}><Spinner size={20} /></div>
            ) : filtered.length === 0 ? (
              <div className={s.empty}>{emptyMessage()}</div>
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
                    <tr key={u.id} onClick={() => setEditUser(u)}>
                      <td>
                        <div className={s.nameCell}>
                          <span className={s.avatar} style={{ background: avatarColor(u.name ?? u.email) }}>
                            {(u.name ?? u.email)[0].toUpperCase()}
                          </span>
                          <span className={s.userName}>{u.name ?? '—'}</span>
                        </div>
                      </td>
                      <td className={s.emailCell}>{u.email}</td>
                      <td>
                        {u.roles.length > 0 ? (
                          <div className={s.roleList}>
                            <RoleBadge name={u.roles[0].name} />
                            {u.roles.length > 1 && <span className={s.roleMore}>+{u.roles.length - 1}</span>}
                          </div>
                        ) : (
                          <span className={s.noRole}>—</span>
                        )}
                      </td>
                      <td>
                        <span className={u.isActive ? s.badgeActive : s.badgeInactive}>
                          {u.isActive ? 'Hoạt động' : 'Đã khóa'}
                        </span>
                      </td>
                      <td>
                        <MoreMenu
                          onEdit={() => setEditUser(u)}
                          onDelete={() => setDeleteTarget({ type: 'user', item: u })}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* ── Roles tab ── */}
      {mainTab === 'roles' && (
        <div className={s.rolesWrap}>
          {loadingRoles ? (
            <div className={s.empty}><Spinner size={20} /></div>
          ) : (
            <>
              {systemRoles.length > 0 && (
                <RoleGroup
                  label="Vai trò hệ thống"
                  roles={systemRoles}
                  onSelect={setPanelRole}
                  onDelete={r => setDeleteTarget({ type: 'role', item: r })}
                />
              )}
              {customRoles.length > 0 && (
                <RoleGroup
                  label="Vai trò tùy chỉnh"
                  roles={customRoles}
                  onSelect={setPanelRole}
                  onDelete={r => setDeleteTarget({ type: 'role', item: r })}
                />
              )}
              {roles.length === 0 && <div className={s.empty}>Chưa có vai trò nào.</div>}
            </>
          )}
        </div>
      )}

      {/* Delete confirmation */}
      {deleteTarget && (
        <ConfirmModal
          target={deleteTarget}
          deleting={deleting}
          error={deleteError}
          onConfirm={handleConfirmDelete}
          onCancel={() => { setDeleteTarget(null); setDeleteError(null); }}
        />
      )}

      <AddUserPanel open={showAdd} onClose={() => { setShowAdd(false); loadUsers(); }} />
      <EditUserPanel
        user={editUser}
        open={editUser !== null}
        onClose={() => setEditUser(null)}
        onSaved={() => { setEditUser(null); loadUsers(); }}
      />
      <RolePanel
        role={panelRole === 'new' ? null : panelRole}
        open={panelRole !== null}
        onClose={() => setPanelRole(null)}
        onSaved={() => { setPanelRole(null); loadRoles(); }}
      />
    </div>
  );
}
