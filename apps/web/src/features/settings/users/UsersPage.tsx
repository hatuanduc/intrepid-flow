'use client';

import { useEffect, useRef, useState } from 'react';
import {
  listUsers, type UserItem,
  listRoles, type RoleItem,
  deleteUser as apiDeleteUser,
  deleteRole as apiDeleteRole,
  resendInvite as apiResendInvite,
  impersonateUser as apiImpersonateUser,
} from '../../../lib/api';
import { startImpersonation } from '../../../lib/auth';
import { useToast } from '../../../components/common/Toast';
import { useT } from '../../../lib/i18n';
import { roleName, roleDescription } from '../../../lib/roleDisplay';
import AddUserPanel from './AddUserPanel';
import EditUserPanel from './EditUserPanel';
import RolePanel from '../roles/RolePanel';
import { Spinner } from '../../../components/common/PageLoader';
import Pagination from '../../../components/common/Pagination';
import AccessDenied from '../../../components/common/AccessDenied';
import BackButton from '../../../components/common/BackButton';
import { useUser } from '../../../app/(dashboard)/user-context';
import s from './UsersPage.module.css';

type StatusFilter = 'all' | 'active' | 'inactive';
type MainTab = 'users' | 'roles';
type ActiveFilters = {
  name?: string;
  email?: string;
  roleIds?: number[];
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
  const { t } = useT();
  const [val, setVal] = useState(value ?? '');
  return (
    <div className={s.filterPopup}>
      <p className={s.filterPopupTitle}>{t('users.filterByPrefix', { label: label.toLowerCase() })}</p>
      <p className={s.filterPopupSub}>{t('users.filterContains')}</p>
      <input
        className={s.filterPopupInput}
        value={val}
        onChange={e => setVal(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && onApply(val)}
        placeholder={t('users.filterEnterPlaceholder', { label: label.toLowerCase() })}
        autoFocus
      />
      <button className={s.filterPopupApply} onClick={() => onApply(val)}>{t('users.filterApply')}</button>
    </div>
  );
}

/* ── Role filter popup ── */
function RoleFilter({ roles, selected, onApply }: {
  roles: { id: number; name: string }[];
  selected: number[];
  onApply: (ids: number[]) => void;
}) {
  const { t } = useT();
  const [checked, setChecked] = useState<number[]>(selected);
  function toggle(id: number) {
    setChecked(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }
  return (
    <div className={s.filterPopup}>
      <p className={s.filterPopupTitle}>{t('users.filterByRole')}</p>
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
        {roles.length === 0 && <p className={s.filterEmpty}>{t('users.noRolesShort')}</p>}
      </div>
      <button className={s.filterPopupApply} onClick={() => onApply(checked)}>{t('users.filterApply')}</button>
    </div>
  );
}

/* ── More menu ── */
function MoreMenu({
  onEdit,
  onDelete,
  onResendInvite,
  onImpersonate,
}: {
  onEdit?: () => void;
  onDelete?: () => void;
  onResendInvite?: () => void;
  onImpersonate?: () => void;
}) {
  const { t } = useT();
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
  if (!onEdit && !onDelete && !onResendInvite && !onImpersonate) return null;
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
          {onEdit && <button className={s.moreItem} onClick={() => { setOpen(false); onEdit(); }}>{t('common.edit')}</button>}
          {onResendInvite && <button className={s.moreItem} onClick={() => { setOpen(false); onResendInvite(); }}>{t('users.resendInvite')}</button>}
          {onImpersonate && <button className={s.moreItem} onClick={() => { setOpen(false); onImpersonate(); }}>{t('users.impersonateAction')}</button>}
          {onDelete && <button className={`${s.moreItem} ${s.moreItemDanger}`} onClick={() => { setOpen(false); onDelete(); }}>{t('common.delete')}</button>}
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
  const { t } = useT();
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
              <span className={s.roleName}>{roleName(role, t)}</span>
              {role.description && <span className={s.roleDesc}>{roleDescription(role, t)}</span>}
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
                {t('users.permCount', { n: role.permissions?.length ?? 0 })}
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
  const { t } = useT();
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
          <button className={s.moreItem} onClick={() => { setOpen(false); onEdit(); }}>{t('common.edit')}</button>
          {onDelete && (
            <button className={`${s.moreItem} ${s.moreItemDanger}`} onClick={() => { setOpen(false); onDelete(); }}>{t('common.delete')}</button>
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
  const { t } = useT();
  const name = target.type === 'user'
    ? (target.item.name ?? target.item.email)
    : target.item.name;
  const title = target.type === 'user' ? t('users.deleteAccountTitle') : t('users.deleteRoleTitle');
  const desc = target.type === 'user'
    ? t('users.deleteAccountDesc', { name })
    : t('users.deleteRoleDesc', { name });

  return (
    <div className={s.modalOverlay} onClick={onCancel}>
      <div className={s.modal} onClick={e => e.stopPropagation()}>
        <p className={s.modalTitle}>{title}</p>
        <p className={s.modalDesc}>{desc}</p>
        {error && <div className={s.modalError}>{error}</div>}
        <div className={s.modalActions}>
          <button className={s.btnSecondary} onClick={onCancel} disabled={deleting}>{t('common.cancel')}</button>
          <button className={s.btnDanger} onClick={onConfirm} disabled={deleting}>
            {deleting ? t('common.deleting') : t('common.delete')}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════ */
export default function UsersPage() {
  const currentUser = useUser();
  const toast = useToast();
  const { t } = useT();
  const canViewUsers      = currentUser?.permissions.includes('users:view')        ?? false;
  const canCreateUser     = currentUser?.permissions.includes('users:create')      ?? false;
  const canCreateRole     = currentUser?.permissions.includes('roles:create')      ?? false;
  const canEditUser       = currentUser?.permissions.includes('users:edit')        ?? false;
  const canDeleteUser     = currentUser?.permissions.includes('users:delete')      ?? false;
  const canImpersonateUser = currentUser?.permissions.includes('users:impersonate') ?? false;

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

  /* Pagination */
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  /* Delete */
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleResendInvite(user: UserItem) {
    try {
      await apiResendInvite(user.id);
      toast.success(t('users.resendInviteSuccess', { email: user.email }));
    } catch {
      toast.error(t('users.resendInviteFailed'));
    }
  }

  async function handleImpersonate(user: UserItem) {
    try {
      const res = await apiImpersonateUser(user.id);
      startImpersonation(res.token);
      window.location.replace('/');
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      const MSG: Record<string, string> = {
        USER_NOT_FOUND: t('users.impersonateUserNotFound'),
        USER_INACTIVE: t('users.impersonateUserInactive'),
        USER_PENDING: t('users.impersonateUserPending'),
      };
      toast.error(MSG[code] ?? t('users.impersonateFailed'));
    }
  }

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

  useEffect(() => {
    // Deferred a tick so loadUsers()/loadRoles()'s internal setState isn't synchronous with the effect itself.
    Promise.resolve().then(() => { loadUsers(); loadRoles(); });
  }, []);

  useEffect(() => {
    if (mainTab === 'roles' && roles.length === 0) Promise.resolve().then(() => loadRoles());
  }, [mainTab, roles.length]);

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
        USER_NOT_FOUND: t('users.deleteUserNotFound'),
        ROLE_NOT_FOUND: t('users.deleteRoleNotFound'),
        CANNOT_DELETE_SYSTEM_ROLE: t('users.deleteSystemRoleForbidden'),
      };
      setDeleteError(MSG[code] ?? t('users.deleteFailed'));
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

  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

  const chips: { key: StatusFilter; label: string; count: number }[] = [
    { key: 'all',      label: t('users.chipAll'),    count: users.length },
    { key: 'active',   label: t('users.chipActive'), count: active.length },
    { key: 'inactive', label: t('users.chipLocked'), count: inactive.length },
  ];

  const roleOptions = roles.map(r => ({ id: r.id, name: r.name }));
  const systemRoles = roles.filter(r => r.isSystem);
  const customRoles = roles.filter(r => !r.isSystem);

  function emptyMessage() {
    if (hasAnyFilter || statusFilter !== 'all') return t('users.noResultsFiltered');
    return t('users.noAccounts');
  }

  if (!canViewUsers) return <AccessDenied />;

  return (
    <div className={s.page}>
      <div className={s.pageHeader}>
        <div className={s.pageHeaderLeft}>
          <BackButton href="/settings" />
          <h1 className={s.pageTitle}>{t('users.pageTitle')}</h1>
        </div>
        {mainTab === 'users' && canCreateUser && (
          <button className={s.btnPrimary} onClick={() => setShowAdd(true)}>{t('users.addAccount')}</button>
        )}
        {mainTab === 'roles' && canCreateRole && (
          <button className={s.btnPrimary} onClick={() => setPanelRole('new')}>{t('users.createRole')}</button>
        )}
      </div>

      {/* Main tabs */}
      <div className={s.tabs}>
        <button
          className={`${s.tab} ${mainTab === 'users' ? s.tabActive : ''}`}
          onClick={() => setMainTab('users')}
        >
          {t('users.tabAccounts')}
          <span className={`${s.tabCount} ${mainTab === 'users' ? s.tabCountActive : ''}`}>{users.length}</span>
        </button>
        <button
          className={`${s.tab} ${mainTab === 'roles' ? s.tabActive : ''}`}
          onClick={() => setMainTab('roles')}
        >
          {t('users.tabRoles')}
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
                onClick={() => { setStatusFilter(c.key); setPage(1); }}
              >
                <span className={s.chipLabel}>{c.label}</span>
                <span className={s.chipCount}>{c.count}</span>
              </button>
            ))}
          </div>

          {/* Filter pills */}
          <div className={s.filterPills}>
            <FilterPill
              label={t('users.filterRoleLabel')}
              active={!!activeFilters.roleIds?.length}
              activeLabel={activeFilters.roleIds?.length === 1
                ? roleOptions.find(r => r.id === activeFilters.roleIds![0])?.name ?? t('users.filterRoleLabel')
                : t('users.filterRoleCount', { n: activeFilters.roleIds?.length ?? 0 })}
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
              label={t('users.filterNameLabel')}
              active={!!activeFilters.name}
              activeLabel={t('users.filterNameActive', { value: activeFilters.name ?? '' })}
              onClear={() => setActiveFilters(f => ({ ...f, name: undefined }))}
            >
              {close => (
                <TextFilter
                  label={t('users.filterNameLabel')}
                  value={activeFilters.name}
                  onApply={v => {
                    setActiveFilters(f => ({ ...f, name: v.trim() || undefined }));
                    close();
                  }}
                />
              )}
            </FilterPill>

            <FilterPill
              label={t('users.filterEmailLabel')}
              active={!!activeFilters.email}
              activeLabel={t('users.filterEmailActive', { value: activeFilters.email ?? '' })}
              onClear={() => setActiveFilters(f => ({ ...f, email: undefined }))}
            >
              {close => (
                <TextFilter
                  label={t('users.filterEmailLabel')}
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
                {t('users.clearFilters')}
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
                    <th className={s.th}>{t('users.colName')}</th>
                    <th className={s.th}>{t('users.colEmail')}</th>
                    <th className={s.th}>{t('users.colRole')}</th>
                    <th className={s.th}>{t('users.colStatus')}</th>
                    <th className={s.th} />
                  </tr>
                </thead>
                <tbody>
                  {paginated.map(u => (
                    <tr key={u.id} onClick={() => setEditUser(u)}>
                      <td className={s.td}>
                        <div className={s.nameCell}>
                          <span className={s.avatar} style={{ background: avatarColor(u.name ?? u.email) }}>
                            {(u.name ?? u.email)[0].toUpperCase()}
                          </span>
                          <span className={s.userName}>{u.name ?? '—'}</span>
                        </div>
                      </td>
                      <td className={`${s.td} ${s.emailCell}`}>{u.email}</td>
                      <td className={s.td}>
                        {u.roles.length > 0 ? (
                          <div className={s.roleList}>
                            <RoleBadge name={roleName(u.roles[0], t)} />
                            {u.roles.length > 1 && <span className={s.roleMore}>+{u.roles.length - 1}</span>}
                          </div>
                        ) : (
                          <span className={s.noRole}>—</span>
                        )}
                      </td>
                      <td className={s.td}>
                        {!u.hasPassword
                          ? <span className={s.badgePending}>{t('users.statusPending')}</span>
                          : <span className={u.isActive ? s.badgeActive : s.badgeInactive}>
                              {u.isActive ? t('users.statusActive') : t('users.statusLocked')}
                            </span>
                        }
                      </td>
                      <td className={s.td}>
                        <MoreMenu
                          onEdit={canEditUser ? () => setEditUser(u) : undefined}
                          onResendInvite={canCreateUser && !u.hasPassword ? () => handleResendInvite(u) : undefined}
                          onImpersonate={canImpersonateUser && u.hasPassword && u.isActive && u.id !== currentUser?.id ? () => handleImpersonate(u) : undefined}
                          onDelete={canDeleteUser ? () => setDeleteTarget({ type: 'user', item: u }) : undefined}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <Pagination
              page={page}
              pageSize={pageSize}
              total={filtered.length}
              onPageChange={setPage}
              onPageSizeChange={size => { setPageSize(size); setPage(1); }}
            />
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
                  label={t('users.systemRoles')}
                  roles={systemRoles}
                  onSelect={setPanelRole}
                  onDelete={r => setDeleteTarget({ type: 'role', item: r })}
                />
              )}
              {customRoles.length > 0 && (
                <RoleGroup
                  label={t('users.customRoles')}
                  roles={customRoles}
                  onSelect={setPanelRole}
                  onDelete={r => setDeleteTarget({ type: 'role', item: r })}
                />
              )}
              {roles.length === 0 && <div className={s.empty}>{t('users.noRolesShort')}</div>}
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
      />
    </div>
  );
}
