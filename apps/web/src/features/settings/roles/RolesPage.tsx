'use client';

import { useEffect, useState } from 'react';
import { listRoles, type RoleItem } from '../../../lib/api';
import RolePanel from './RolePanel';
import { Spinner } from '../../../components/common/PageLoader';
import s from './RolesPage.module.css';

export default function RolesPage() {
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [panelRole, setPanelRole] = useState<RoleItem | null | 'new'>(null);

  async function load() {
    setLoading(true);
    try {
      const r = await listRoles();
      setRoles(r.items ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const systemRoles = roles.filter(r => r.isSystem);
  const customRoles = roles.filter(r => !r.isSystem);

  return (
    <div className={s.page}>
      <div className={s.pageHeader}>
        <h1 className={s.pageTitle}>Vai trò & Quyền hạn</h1>
        <button className={s.btnPrimary} onClick={() => setPanelRole('new')}>
          + Tạo vai trò
        </button>
      </div>

      {loading ? (
        <div className={s.empty}><Spinner size={20} /></div>
      ) : (
        <div className={s.groups}>
          {systemRoles.length > 0 && (
            <RoleGroup
              label="Vai trò hệ thống"
              roles={systemRoles}
              onSelect={setPanelRole}
            />
          )}
          {customRoles.length > 0 && (
            <RoleGroup
              label="Vai trò tùy chỉnh"
              roles={customRoles}
              onSelect={setPanelRole}
            />
          )}
          {roles.length === 0 && (
            <div className={s.empty}>Chưa có vai trò nào.</div>
          )}
        </div>
      )}

      <RolePanel
        role={panelRole === 'new' ? null : panelRole}
        open={panelRole !== null}
        onClose={() => setPanelRole(null)}
        onSaved={() => { setPanelRole(null); load(); }}
      />
    </div>
  );
}

function RoleGroup({ label, roles, onSelect }: {
  label: string;
  roles: RoleItem[];
  onSelect: (role: RoleItem) => void;
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
          <button key={role.id} className={s.roleRow} onClick={() => onSelect(role)}>
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
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className={s.chevron}>
              <path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        ))}
      </div>
    </div>
  );
}
