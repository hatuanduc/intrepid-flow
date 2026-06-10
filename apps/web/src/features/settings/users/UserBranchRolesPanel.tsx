"use client";
import React, { useEffect, useState } from 'react';
import {
  listUserBranchRoles,
  assignBranchRole,
  removeBranchRole,
  listBranches,
  listRoles,
  type UserBranchRoleItem,
  type BranchItem,
  type RoleItem,
} from '../../../lib/api';
import { Button } from '../../../components/common';

export default function UserBranchRolesPanel({ userId }: { userId: string }) {
  const [items, setItems] = useState<UserBranchRoleItem[]>([]);
  const [branches, setBranches] = useState<BranchItem[]>([]);
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [branchId, setBranchId] = useState('');
  const [roleId, setRoleId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const [r, b, ro] = await Promise.all([
      listUserBranchRoles(userId),
      listBranches(),
      listRoles(),
    ]);
    setItems(r.items ?? []);
    setBranches(b.items ?? []);
    setRoles(ro.items ?? []);
  }

  useEffect(() => { load(); }, [userId]);

  async function assign(e: React.FormEvent) {
    e.preventDefault();
    if (!branchId || !roleId) return;
    setError(null);
    setSaving(true);
    try {
      await assignBranchRole(userId, { branchId, roleId });
      setBranchId('');
      setRoleId('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi gán vai trò');
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    await removeBranchRole(id);
    await load();
  }

  return (
    <div style={{ marginTop: 16 }}>
      <h4 style={{ margin: '0 0 8px 0' }}>Phân quyền theo chi nhánh</h4>

      {/* Danh sách hiện tại */}
      {items.length === 0 ? (
        <p style={{ color: '#888', fontSize: 13 }}>Chưa có phân quyền chi nhánh.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 12, fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '4px 8px', borderBottom: '1px solid #eee' }}>Chi nhánh</th>
              <th style={{ textAlign: 'left', padding: '4px 8px', borderBottom: '1px solid #eee' }}>Vai trò</th>
              <th style={{ padding: '4px 8px', borderBottom: '1px solid #eee' }}></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td style={{ padding: '4px 8px' }}>{item.branch.name} <span style={{ color: '#888' }}>({item.branch.code})</span></td>
                <td style={{ padding: '4px 8px' }}>{item.role.name}</td>
                <td style={{ padding: '4px 8px' }}>
                  <Button variant="secondary" onClick={() => remove(item.id)} style={{ fontSize: 12, padding: '2px 8px' }}>
                    Xóa
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Form thêm mới */}
      <form onSubmit={assign} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div>
          <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Chi nhánh</label>
          <select value={branchId} onChange={(e) => setBranchId(e.target.value)} required style={{ padding: '6px 8px', borderRadius: 4, border: '1px solid #ccc' }}>
            <option value="">-- Chọn chi nhánh --</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name} ({b.code})</option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Vai trò</label>
          <select value={roleId} onChange={(e) => setRoleId(e.target.value)} required style={{ padding: '6px 8px', borderRadius: 4, border: '1px solid #ccc' }}>
            <option value="">-- Chọn vai trò --</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>
        <Button type="submit" disabled={saving || !branchId || !roleId} variant="primary">
          {saving ? 'Đang lưu...' : '+ Thêm'}
        </Button>
        {error && <span style={{ color: 'red', fontSize: 12 }}>{error}</span>}
      </form>
    </div>
  );
}
