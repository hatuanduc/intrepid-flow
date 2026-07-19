'use client';

import { useEffect, useState } from 'react';
import { listRoles, type RoleItem } from '../../../lib/api';
import { useT } from '../../../lib/i18n';
import { roleName, roleDescription } from '../../../lib/roleDisplay';
import RolePanel from './RolePanel';
import BackButton from '../../../components/common/BackButton';
import { Spinner } from '../../../components/common/PageLoader';
import s from './RolesPage.module.css';

const GROUP_ORDER = ['admin', 'operations', 'view_only'];
const GROUP_LABEL_KEYS: Record<string, string> = {
  admin:      'roles.groupAdmin',
  operations: 'roles.groupOperations',
  view_only:  'roles.groupViewOnly',
};

export default function RolesPage() {
  const { t } = useT();
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRole, setSelectedRole] = useState<RoleItem | null>(null);

  useEffect(() => {
    listRoles()
      .then(r => setRoles(r.items ?? []))
      .finally(() => setLoading(false));
  }, []);

  // Group by role.group, preserve GROUP_ORDER
  const byGroup = roles.reduce<Record<string, RoleItem[]>>((acc, r) => {
    const g = r.group ?? 'other';
    (acc[g] ??= []).push(r);
    return acc;
  }, {});

  const groupKeys = [
    ...GROUP_ORDER.filter(g => byGroup[g]),
    ...Object.keys(byGroup).filter(g => !GROUP_ORDER.includes(g)),
  ];

  return (
    <div className={s.page}>
      <div className={s.pageHeader}>
        <BackButton href="/settings" />
        <h1 className={s.pageTitle}>{t('roles.pageTitle')}</h1>
      </div>

      {loading ? (
        <div className={s.empty}><Spinner size={20} /></div>
      ) : (
        <div className={s.groups}>
          {groupKeys.map(groupKey => (
            <RoleGroup
              key={groupKey}
              label={GROUP_LABEL_KEYS[groupKey] ? t(GROUP_LABEL_KEYS[groupKey]) : groupKey}
              roles={byGroup[groupKey]}
              onSelect={setSelectedRole}
            />
          ))}
          {roles.length === 0 && (
            <div className={s.empty}>{t('roles.noRolesYet')}</div>
          )}
        </div>
      )}

      <RolePanel
        role={selectedRole}
        open={selectedRole !== null}
        onClose={() => setSelectedRole(null)}
      />
    </div>
  );
}

function RoleGroup({ label, roles, onSelect }: {
  label: string;
  roles: RoleItem[];
  onSelect: (role: RoleItem) => void;
}) {
  const { t } = useT();
  return (
    <div className={s.group}>
      <div className={s.groupHeader}>
        <span className={s.groupLabel}>{label}</span>
        <span className={s.groupCount}>{roles.length}</span>
      </div>
      <div className={s.groupBody}>
        {roles.map(role => (
          <button key={role.id} className={s.roleRow} onClick={() => onSelect(role)}>
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
                {t('roles.permCount', { n: role.permissions?.length ?? 0 })}
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
