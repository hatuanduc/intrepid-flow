"use client";
import React from 'react';

export default function SettingsMenu() {
  return (
    <nav>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        <li style={{ marginBottom: 8 }}>
          <a href="/settings" style={{ color: '#111', textDecoration: 'none' }}>
            Tài khoản người dùng
          </a>
        </li>
        <li style={{ marginBottom: 8 }}>
          <a href="#" style={{ color: '#111', textDecoration: 'none' }}>
            Quản lý vai trò
          </a>
        </li>
        <li style={{ marginBottom: 8 }}>
          <a href="#" style={{ color: '#111', textDecoration: 'none' }}>
            Cấu hình hàng hóa
          </a>
        </li>
        <li style={{ marginBottom: 8 }}>
          <a href="#" style={{ color: '#111', textDecoration: 'none' }}>
            Hệ thống & tích hợp
          </a>
        </li>
      </ul>
    </nav>
  );
}
