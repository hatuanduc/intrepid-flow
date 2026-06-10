"use client";
import React, { ReactNode } from 'react';
import SettingsMenu from './SettingsMenu';

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'Arial, sans-serif' }}>
      <aside style={{ width: 260, borderRight: '1px solid #e6e6e6', padding: 20 }}>
        <h3 style={{ margin: '0 0 12px' }}>Settings</h3>
        <SettingsMenu />
      </aside>
      <main style={{ flex: 1, padding: 24, overflow: 'auto' }}>{children}</main>
    </div>
  );
}
