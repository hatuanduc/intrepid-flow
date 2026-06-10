"use client";
import React, { useState } from 'react';
import { createUser, listRoles } from '../../../lib/api';
import { Modal, Input, Button } from '../../../components/common';

export default function AddUserModal({ onClose }: { onClose?: () => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [roleId, setRoleId] = useState('');
  const [roles, setRoles] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    listRoles().then((r) => setRoles(r.items ?? r ?? []));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await createUser({ email, name, password, roleIds: roleId ? [roleId] : [] });
      onClose?.();
    } catch (err) {
      console.error('create user', err);
      alert('Tạo tài khoản thất bại');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal onClose={onClose}>
      <h3>Tạo tài khoản người dùng</h3>
      <form onSubmit={submit}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <Input label="Tên hiển thị" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <Input label="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <Input label="Tên đăng nhập (optional)" />
          </div>
          <div>
            <Input label="Mật khẩu" value={password} onChange={(e) => setPassword(e.target.value)} required type="password" />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={{ display: 'block', marginBottom: 6 }}>Vai trò</label>
            <select value={roleId} onChange={(e) => setRoleId(e.target.value)} style={{ width: '100%', padding: 8, borderRadius: 6 }}>
              <option value="">(Chọn vai trò)</option>
              {roles.map((r) => (
                <option value={r.id} key={r.id}>{r.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button variant="secondary" type="button" onClick={onClose}>Hủy</Button>
          <Button type="submit" disabled={saving}>{saving ? 'Đang lưu...' : 'Lưu'}</Button>
        </div>
      </form>
    </Modal>
  );
}
