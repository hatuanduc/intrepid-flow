'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import PageLoader from '../../components/common/PageLoader';
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
        setLoading(false);
      } catch {
        clearToken();
        router.replace('/login');
        // giữ loading=true trong khi redirect — không flash trắng
      }
    }
    run();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <PageLoader />;

  if (!user) return null;

  return (
    <UserContext.Provider value={user}>
      <DashboardLayout user={user}>
        {children}
      </DashboardLayout>
    </UserContext.Provider>
  );
}
