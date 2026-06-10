'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { me } from '../../lib/api';
import { clearToken, getToken } from '../../lib/auth';
import { UserContext, type User } from './user-context';

export default function DashboardRootLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function run() {
      const token = getToken();
      if (!token) {
        router.replace('/login');
        return;
      }
      try {
        const result = await me();
        setUser(result.user);
      } catch {
        clearToken();
        router.replace('/login');
      } finally {
        setLoading(false);
      }
    }
    run();
  }, [router]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100dvh', color: '#697386', fontSize: 14 }}>
        Đang tải...
      </div>
    );
  }

  if (!user) return null;

  return (
    <UserContext.Provider value={user}>
      <DashboardLayout user={user}>
        {children}
      </DashboardLayout>
    </UserContext.Provider>
  );
}
