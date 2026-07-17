'use client';

import { type RoleItem, type PermissionItem } from '../../../lib/api';
import { moduleLabel } from '../../../lib/permissionModules';
import RightPanel from '../../../components/common/RightPanel';
import s from './RolePanel.module.css';

type Props = {
  role: RoleItem | null;
  open: boolean;
  onClose: () => void;
};

export default function RolePanel({ role, open, onClose }: Props) {
  if (!role) return null;

  const permissions = role.permissions ?? [];
  const byModule = permissions.reduce<Record<string, PermissionItem[]>>((acc, p) => {
    (acc[p.module] ??= []).push(p);
    return acc;
  }, {});

  return (
    <RightPanel
      title={role.name}
      open={open}
      onClose={onClose}
      footer={
        <button className={s.btnSecondary} onClick={onClose}>Đóng</button>
      }
    >
      <div className={s.content}>
        {role.description && (
          <p className={s.desc}>{role.description}</p>
        )}

        <div className={s.permSection}>
          <div className={s.permHeader}>
            <span className={s.permTitle}>Quyền hạn</span>
            <span className={s.permCount}>{permissions.length} quyền</span>
          </div>

          {permissions.length === 0 ? (
            <div className={s.permsEmpty}>Không có quyền hạn.</div>
          ) : (
            Object.entries(byModule).map(([mod, perms]) => (
              <div key={mod} className={s.moduleBlock}>
                <div className={s.moduleHeader}>
                  <span className={s.moduleName}>{moduleLabel(mod)}</span>
                  <span className={s.moduleCount}>{perms.length}</span>
                </div>
                <div className={s.permList}>
                  {perms.map(p => (
                    <div key={p.id} className={s.permRow}>
                      <span className={s.permDot} />
                      <span className={s.permLabel}>{p.label}</span>
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
