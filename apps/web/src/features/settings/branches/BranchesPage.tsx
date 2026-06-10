"use client";
import React, { useEffect, useState } from 'react';
import {
  listBranches,
  createBranch,
  updateBranch,
  deleteBranch,
  type BranchItem,
} from '../../../lib/api';
import { Button, Table } from '../../../components/common';

export default function BranchesPage() {
  const [branches, setBranches] = useState<BranchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingBranch, setEditingBranch] = useState<BranchItem | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await listBranches();
      setBranches(res.items ?? []);
    } catch (err) {
      console.error('load branches', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSaving(true);
    try {
      await createBranch({
        code: code.trim().toUpperCase(),
        name: name.trim(),
        address: address.trim() || undefined,
      });
      setCode('');
      setName('');
      setAddress('');
      setShowForm(false);
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      setFormError(
        msg.includes('BRANCH_CODE_EXISTS')
          ? `Mã "${code.trim().toUpperCase()}" đã tồn tại.`
          : 'Tạo chi nhánh thất bại. Vui lòng thử lại.',
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate() {
    if (!editingBranch) return;
    setSaving(true);
    try {
      await updateBranch(editingBranch.id, {
        name: editingBranch.name,
        address: editingBranch.address ?? undefined,
        isActive: editingBranch.isActive,
      });
      setEditingBranch(null);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(branch: BranchItem) {
    if (!confirm(`Xóa chi nhánh "${branch.name}"?`)) return;
    await deleteBranch(branch.id);
    await load();
  }

  return (
    <section>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3>Quản lý chi nhánh</h3>
        <Button variant="primary" onClick={() => { setShowForm(true); setFormError(null); }}>
          + Thêm chi nhánh
        </Button>
      </div>

      {loading ? (
        <div>Loading...</div>
      ) : (
        <Table>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: 8 }}>Mã</th>
              <th style={{ textAlign: 'left', padding: 8 }}>Tên</th>
              <th style={{ textAlign: 'left', padding: 8 }}>Địa chỉ</th>
              <th style={{ textAlign: 'left', padding: 8 }}>Trạng thái</th>
              <th style={{ padding: 8 }}></th>
            </tr>
          </thead>
          <tbody>
            {branches.map((b) =>
              editingBranch?.id === b.id ? (
                <tr key={b.id}>
                  <td style={{ padding: 8, color: '#888' }}>{b.code}</td>
                  <td style={{ padding: 8 }}>
                    <input
                      style={{ padding: '4px 8px', border: '1px solid #ccc', borderRadius: 4, width: '100%' }}
                      value={editingBranch.name}
                      onChange={(e) => setEditingBranch({ ...editingBranch, name: e.target.value })}
                    />
                  </td>
                  <td style={{ padding: 8 }}>
                    <input
                      style={{ padding: '4px 8px', border: '1px solid #ccc', borderRadius: 4, width: '100%' }}
                      value={editingBranch.address ?? ''}
                      onChange={(e) => setEditingBranch({ ...editingBranch, address: e.target.value })}
                    />
                  </td>
                  <td style={{ padding: 8 }}>
                    <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={editingBranch.isActive}
                        onChange={(e) => setEditingBranch({ ...editingBranch, isActive: e.target.checked })}
                      />
                      Hoạt động
                    </label>
                  </td>
                  <td style={{ padding: 8, display: 'flex', gap: 6 }}>
                    <Button variant="primary" onClick={handleUpdate} disabled={saving}>
                      {saving ? '...' : 'Lưu'}
                    </Button>
                    <Button variant="secondary" onClick={() => setEditingBranch(null)}>Hủy</Button>
                  </td>
                </tr>
              ) : (
                <tr key={b.id}>
                  <td style={{ padding: 8 }}>{b.code}</td>
                  <td style={{ padding: 8 }}>{b.name}</td>
                  <td style={{ padding: 8 }}>{b.address || '-'}</td>
                  <td style={{ padding: 8 }}>{b.isActive ? 'Đang hoạt động' : 'Đã đóng'}</td>
                  <td style={{ padding: 8, display: 'flex', gap: 6 }}>
                    <Button variant="secondary" onClick={() => setEditingBranch(b)} style={{ fontSize: 12 }}>
                      Sửa
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => handleDelete(b)}
                      style={{ fontSize: 12, color: '#c00' }}
                    >
                      Xóa
                    </Button>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </Table>
      )}

      {showForm && (
        <div style={{ marginTop: 24, padding: 20, border: '1px solid #eee', borderRadius: 8, background: '#fafafa' }}>
          <h4 style={{ margin: '0 0 16px' }}>Thêm chi nhánh mới</h4>
          <form onSubmit={handleCreate}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
              <input
                style={{ padding: '8px 12px', border: '1px solid #ccc', borderRadius: 4, flex: '1 1 120px', minWidth: 120 }}
                value={code}
                onChange={(e) => { setCode(e.target.value); setFormError(null); }}
                placeholder="Mã (vd: HN01)"
                required
              />
              <input
                style={{ padding: '8px 12px', border: '1px solid #ccc', borderRadius: 4, flex: '2 1 200px', minWidth: 180 }}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Tên chi nhánh"
                required
              />
              <input
                style={{ padding: '8px 12px', border: '1px solid #ccc', borderRadius: 4, flex: '3 1 260px', minWidth: 200 }}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Địa chỉ (tùy chọn)"
              />
            </div>
            {formError && <p style={{ color: '#c00', fontSize: 13, margin: '0 0 8px' }}>{formError}</p>}
            <div style={{ display: 'flex', gap: 8 }}>
              <Button type="submit" variant="primary" disabled={saving}>
                {saving ? 'Đang lưu...' : 'Tạo chi nhánh'}
              </Button>
              <Button variant="secondary" onClick={() => { setShowForm(false); setFormError(null); }}>
                Hủy
              </Button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
