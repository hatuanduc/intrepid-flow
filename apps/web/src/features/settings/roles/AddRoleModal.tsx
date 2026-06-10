"use client";
import React, { useEffect, useState } from 'react';
import { listPermissions, createRole } from '../../../lib/api';
import { Modal, Input, Button } from '../../../components/common';
import Card from '../../../components/common/Card';
import FormSection from '../../../components/common/FormSection';

export default function AddRoleModal({ onClose }: { onClose?: () => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [permissions, setPermissions] = useState<any[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listPermissions().then((r) => setPermissions(r.items ?? r ?? []));
  }, []);

  function toggle(id: string) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await createRole({ name, description, permissionIds: selected });
      onClose?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Tạo vai trò thất bại';
      if (msg.includes('ROLE_KEY_EXISTS')) {
        setError('Key vai trò đã tồn tại, vui lòng chọn key khác.');
      } else {
        setError(msg);
      }
    } finally {
      setSaving(false);
    }
  }

  // group by module
  const byModule = permissions.reduce((acc: Record<string, any[]>, p) => {
    (acc[p.module] ||= []).push(p);
    return acc;
  }, {} as Record<string, any[]>);

  return (
    <Modal onClose={onClose}>
      <h3>Tạo vai trò</h3>
      <form onSubmit={submit}>
        <Card style={{ marginBottom: 12 }}>
          <FormSection>
            <Input label="Tên vai trò" value={name} onChange={(e) => setName(e.target.value)} required />
            <Input label="Mô tả" value={description} onChange={(e) => setDescription(e.target.value)} />
          </FormSection>

          <div style={{ marginTop: 6 }}>
            <h4 style={{ margin: '0 0 8px 0' }}>Phân quyền</h4>
            {Object.entries(byModule).map(([module, items]) => (
              <div key={module} style={{ marginBottom: 12 }}>
                <strong style={{ display: 'block', marginBottom: 6 }}>{module}</strong>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {items.map((p: any) => (
                    <label key={p.id} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input type="checkbox" checked={selected.includes(p.id)} onChange={() => toggle(p.id)} />
                      <span>{p.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>

        <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          {error && <span style={{ color: 'red', fontSize: 13, alignSelf: 'center' }}>{error}</span>}
          <Button variant="secondary" type="button" onClick={onClose}>Bỏ qua</Button>
          <Button type="submit" disabled={saving}>{saving ? 'Đang lưu...' : 'Lưu'}</Button>
        </div>
      </form>
    </Modal>
  );
}
