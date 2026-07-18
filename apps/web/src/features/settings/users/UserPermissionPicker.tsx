'use client';

import { useState } from 'react';
import { type PermissionItem } from '../../../lib/api';
import { moduleLabel } from '../../../lib/permissionModules';
import { useT } from '../../../lib/i18n';
import s from './AddUserPanel.module.css';

type Props = {
  permissions: PermissionItem[];
  selectedIds: number[];
  onToggle: (id: number) => void;
  onToggleModule: (ids: number[]) => void;
};

export default function UserPermissionPicker({ permissions, selectedIds, onToggle, onToggleModule }: Props) {
  const { t } = useT();
  const byModule = permissions.reduce<Record<string, PermissionItem[]>>((acc, p) => {
    (acc[p.module] ??= []).push(p);
    return acc;
  }, {});

  return (
    <div className={s.permGroupList}>
      {Object.entries(byModule).map(([mod, perms]) => (
        <PermissionModuleGroup
          key={mod}
          label={moduleLabel(mod, t)}
          perms={perms}
          selectedIds={selectedIds}
          onToggle={onToggle}
          onToggleModule={onToggleModule}
        />
      ))}
    </div>
  );
}

function PermissionModuleGroup({
  label, perms, selectedIds, onToggle, onToggleModule,
}: {
  label: string;
  perms: PermissionItem[];
  selectedIds: number[];
  onToggle: (id: number) => void;
  onToggleModule: (ids: number[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ids = perms.map(p => p.id);
  const checkedCount = ids.filter(id => selectedIds.includes(id)).length;
  const allChecked = checkedCount === ids.length;
  const someChecked = checkedCount > 0 && !allChecked;

  return (
    <div className={s.permGroup}>
      <div className={s.permGroupHeader}>
        <label className={s.permGroupHeaderLeft}>
          <input
            type="checkbox"
            checked={allChecked}
            ref={el => { if (el) el.indeterminate = someChecked; }}
            onChange={() => onToggleModule(ids)}
            className={s.permGroupCheckbox}
          />
          <span className={s.permGroupLabel}>{label}</span>
        </label>
        <button type="button" className={s.permGroupToggle} onClick={() => setOpen(v => !v)}>
          <span className={s.permGroupCount}>{checkedCount}/{ids.length}</span>
          <ChevronIcon open={open} />
        </button>
      </div>
      {open && (
        <div className={s.permGroupBody}>
          {perms.map(p => (
            <label key={p.id} className={s.permRow}>
              <input
                type="checkbox"
                checked={selectedIds.includes(p.id)}
                onChange={() => onToggle(p.id)}
                className={s.permRowCheckbox}
              />
              <span className={s.permRowLabel}>{p.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
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
