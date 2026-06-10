"use client";
import React, { useEffect, useState } from 'react';
import { listUsers, type UserItem } from '../../../lib/api';
import AddUserModal from './AddUserModal';
import UserBranchRolesPanel from './UserBranchRolesPanel';
import { Button, Table } from '../../../components/common';

export default function UsersPage() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await listUsers();
      setUsers(res.items ?? res ?? []);
    } catch (err) {
      console.error('load users', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <section>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3>Danh sách người dùng</h3>
        <div>
          <Button onClick={() => setShowAdd(true)} variant="primary">+ Tạo tài khoản</Button>
        </div>
      </div>

      {loading ? (
        <div>Loading...</div>
      ) : (
        <Table>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #eee', padding: '8px' }}>Tên</th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #eee', padding: '8px' }}>Email</th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #eee', padding: '8px' }}>Vai trò</th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #eee', padding: '8px' }}>Trạng thái</th>
              <th style={{ borderBottom: '1px solid #eee', padding: '8px' }}></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <React.Fragment key={u.id}>
                <tr>
                  <td style={{ padding: '8px', borderBottom: '1px solid #fafafa' }}>{u.name ?? '-'}</td>
                  <td style={{ padding: '8px', borderBottom: '1px solid #fafafa' }}>{u.email}</td>
                  <td style={{ padding: '8px', borderBottom: '1px solid #fafafa' }}>{(u.roles || []).map((r) => r.key ?? r.name).join(', ')}</td>
                  <td style={{ padding: '8px', borderBottom: '1px solid #fafafa' }}>{u.isActive ? 'Đang hoạt động' : 'Đã khóa'}</td>
                  <td style={{ padding: '8px', borderBottom: '1px solid #fafafa', textAlign: 'right' }}>
                    <Button
                      variant="secondary"
                      onClick={() => setExpandedUserId(expandedUserId === u.id ? null : u.id)}
                      style={{ fontSize: 12 }}
                    >
                      {expandedUserId === u.id ? 'Ẩn chi nhánh ▲' : 'Chi nhánh ▼'}
                    </Button>
                  </td>
                </tr>
                {expandedUserId === u.id && (
                  <tr>
                    <td colSpan={5} style={{ padding: '0 16px 16px 16px', background: '#fafafa' }}>
                      <UserBranchRolesPanel userId={u.id} />
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </Table>
      )}

      {showAdd && <AddUserModal onClose={() => { setShowAdd(false); load(); }} />}
    </section>
  );
}
