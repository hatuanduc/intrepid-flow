'use client';

import { useEffect, useRef, useState } from 'react';
import {
  listBranches,
  createBranch,
  updateBranch,
  deleteBranch,
  type BranchItem,
} from '../../../lib/api';
import RightPanel from '../../../components/common/RightPanel';
import PageLoader, { Spinner } from '../../../components/common/PageLoader';
import s from './BranchesPage.module.css';

export default function BranchesPage() {
  const [branches, setBranches] = useState<BranchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [panelOpen, setPanelOpen] = useState(false);
  const [editing, setEditing] = useState<BranchItem | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await listBranches();
      setBranches(res.items ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function openCreate() {
    setEditing(null);
    setPanelOpen(true);
  }

  function openEdit(branch: BranchItem) {
    setEditing(branch);
    setOpenMenuId(null);
    setPanelOpen(true);
  }

  async function handleDelete(branch: BranchItem) {
    setOpenMenuId(null);
    if (!confirm(`Xóa chi nhánh "${branch.name}"?`)) return;
    await deleteBranch(branch.id);
    load();
  }

  if (loading) return <PageLoader />;

  return (
    <div className={s.page}>
      <div className={s.pageHeader}>
        <h1 className={s.pageTitle}>Chi nhánh</h1>
        <button className={s.btnPrimary} onClick={openCreate}>+ Thêm chi nhánh</button>
      </div>

      <div className={s.tableWrap}>
        <table className={s.table}>
          <thead>
            <tr>
              <th>Mã</th>
              <th>Tên chi nhánh</th>
              <th>Địa chỉ</th>
              <th>Trạng thái</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {branches.length === 0 ? (
              <tr>
                <td colSpan={5}>
                  <div className={s.empty}>Chưa có chi nhánh nào.</div>
                </td>
              </tr>
            ) : branches.map(b => (
              <tr key={b.id}>
                <td><span className={s.code}>{b.code}</span></td>
                <td className={s.nameCell}>{b.name}</td>
                <td className={s.address}>{b.address || <span className={s.muted}>—</span>}</td>
                <td>
                  {b.isActive
                    ? <span className={s.badgeActive}>Hoạt động</span>
                    : <span className={s.badgeInactive}>Đã đóng</span>
                  }
                </td>
                <td>
                  <MoreMenu
                    open={openMenuId === b.id}
                    onToggle={() => setOpenMenuId(openMenuId === b.id ? null : b.id)}
                    onEdit={() => openEdit(b)}
                    onDelete={() => handleDelete(b)}
                    onClose={() => setOpenMenuId(null)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <BranchPanel
        open={panelOpen}
        branch={editing}
        onClose={() => setPanelOpen(false)}
        onSaved={() => { setPanelOpen(false); load(); }}
      />
    </div>
  );
}

function MoreMenu({ open, onToggle, onEdit, onDelete, onClose }: {
  open: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, onClose]);

  return (
    <div className={s.moreWrap} ref={ref}>
      <button className={s.moreBtn} onClick={onToggle}>⋯</button>
      {open && (
        <div className={s.moreDropdown}>
          <button className={s.moreItem} onClick={onEdit}>Chỉnh sửa</button>
          <button className={`${s.moreItem} ${s.moreItemDanger}`} onClick={onDelete}>Xóa</button>
        </div>
      )}
    </div>
  );
}

function BranchPanel({ open, branch, onClose, onSaved }: {
  open: boolean;
  branch: BranchItem | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isNew = branch === null;
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (branch) {
      setCode(branch.code);
      setName(branch.name);
      setAddress(branch.address ?? '');
      setIsActive(branch.isActive);
    } else {
      setCode(''); setName(''); setAddress(''); setIsActive(true);
    }
  }, [open, branch]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      if (isNew) {
        await createBranch({ code: code.trim().toUpperCase(), name: name.trim(), address: address.trim() || undefined });
      } else {
        await updateBranch(branch!.id, { name: name.trim(), address: address.trim() || undefined, isActive });
      }
      onSaved();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      setError(msg.includes('BRANCH_CODE_EXISTS')
        ? `Mã "${code.trim().toUpperCase()}" đã tồn tại.`
        : 'Lưu thất bại. Vui lòng thử lại.');
    } finally {
      setSaving(false);
    }
  }

  const footer = (
    <>
      <button type="button" className={s.btnSecondary} onClick={onClose}>Hủy</button>
      <button type="submit" form="branch-panel-form" className={s.btnPrimary} disabled={saving}>
        {saving ? 'Đang lưu...' : isNew ? 'Tạo chi nhánh' : 'Lưu thay đổi'}
      </button>
    </>
  );

  return (
    <RightPanel
      title={isNew ? 'Thêm chi nhánh' : branch?.name ?? ''}
      open={open}
      onClose={onClose}
      footer={footer}
    >
      <form id="branch-panel-form" onSubmit={submit} className={s.form}>
        <div className={s.field}>
          <label className={s.label}>Mã chi nhánh</label>
          <input
            className={s.input}
            value={code}
            onChange={e => setCode(e.target.value)}
            placeholder="VD: HN01"
            required
            disabled={!isNew}
            style={!isNew ? { background: '#f6f9fc', color: '#8898aa' } : undefined}
            autoFocus
          />
        </div>

        <div className={s.field}>
          <label className={s.label}>Tên chi nhánh</label>
          <input
            className={s.input}
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="VD: Hà Nội - Hoàn Kiếm"
            required
          />
        </div>

        <div className={s.field}>
          <label className={s.label}>Địa chỉ <span className={s.optional}>(tùy chọn)</span></label>
          <input
            className={s.input}
            value={address}
            onChange={e => setAddress(e.target.value)}
            placeholder="Số nhà, đường, quận/huyện..."
          />
        </div>

        {!isNew && (
          <div className={s.field}>
            <label className={s.checkboxRow}>
              <input
                type="checkbox"
                checked={isActive}
                onChange={e => setIsActive(e.target.checked)}
                className={s.checkbox}
              />
              <span className={s.label} style={{ marginBottom: 0 }}>Đang hoạt động</span>
            </label>
          </div>
        )}

        {error && <div className={s.error}>{error}</div>}
      </form>
    </RightPanel>
  );
}
