'use client';

import { type RoleItem, type PermissionItem } from '../../../lib/api';
import { moduleLabel, permissionLabel } from '../../../lib/permissionModules';
import { useT } from '../../../lib/i18n';
import { roleName, roleDescription } from '../../../lib/roleDisplay';
import RightPanel from '../../../components/common/RightPanel';
import s from './RolePanel.module.css';

type Props = {
  role: RoleItem | null;
  open: boolean;
  onClose: () => void;
};

export default function RolePanel({ role, open, onClose }: Props) {
  const { t } = useT();
  if (!role) return null;

  const permissions = role.permissions ?? [];
  const byModule = permissions.reduce<Record<string, PermissionItem[]>>((acc, p) => {
    (acc[p.module] ??= []).push(p);
    return acc;
  }, {});

  return (
    <RightPanel
      title={roleName(role, t)}
      open={open}
      onClose={onClose}
      footer={
        <button className={s.btnSecondary} onClick={onClose}>{t('common.close')}</button>
      }
    >
      <div className={s.content}>
        {role.description && (
          <p className={s.desc}>{roleDescription(role, t)}</p>
        )}

        <div className={s.permSection}>
          <div className={s.permHeader}>
            <span className={s.permTitle}>{t('roles.permissionsLabel')}</span>
            <span className={s.permCount}>{t('roles.permCount', { n: permissions.length })}</span>
          </div>

          {permissions.length === 0 ? (
            <div className={s.permsEmpty}>{t('roles.noPermissions')}</div>
          ) : (
            Object.entries(byModule).map(([mod, perms]) => (
              <div key={mod} className={s.moduleBlock}>
                <div className={s.moduleHeader}>
                  <span className={s.moduleName}>{moduleLabel(mod, t)}</span>
                  <span className={s.moduleCount}>{perms.length}</span>
                </div>
                <div className={s.permList}>
                  {perms.map(p => (
                    <div key={p.id} className={s.permRow}>
                      <span className={s.permDot} />
                      <span className={s.permLabel}>{permissionLabel(p, t)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </RightPanel>
  );
}
