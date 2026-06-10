"use client";
import React, { useEffect, useState } from 'react';
import { listRoles, listPermissions } from '../../../lib/api';
import { Button, Table } from '../../../components/common';
import AddRoleModal from './AddRoleModal';

export default function RolesPage() {
  const [roles, setRoles] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const r = await listRoles();
      setRoles(r.items ?? r ?? []);
    } catch (err) {
      console.error('load roles', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <section>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3>Quản lý vai trò</h3>
        <div>
          <Button variant="primary" onClick={() => setShowAdd(true)}>+ Tạo vai trò</Button>
        </div>
      </div>

      {loading ? (
        <div>Loading...</div>
      ) : (
        <Table>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: 8 }}>Vai trò</th>
              <th style={{ textAlign: 'left', padding: 8 }}>Mô tả</th>
              <th style={{ textAlign: 'left', padding: 8 }}>Tài khoản</th>
              <th style={{ textAlign: 'left', padding: 8 }}>Quyền</th>
            </tr>
          </thead>
          <tbody>
            {roles.map((role) => (
              <tr key={role.id}>
                <td style={{ padding: 8 }}>{role.name}</td>
                <td style={{ padding: 8 }}>{role.description || '-'}</td>
                <td style={{ padding: 8 }}>{role.userCount ?? 0}</td>
                <td style={{ padding: 8 }}>{role.permissions?.length ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      {showAdd && <AddRoleModal onClose={() => { setShowAdd(false); load(); }} />}
    </section>
  );
}
