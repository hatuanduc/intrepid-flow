'use client';

import { useUser } from '../app/(dashboard)/user-context';

export function useHasPermission(permission: string): boolean {
  const user = useUser();
  return user?.permissions.includes(permission) ?? false;
}

export function useHasAnyPermission(...permissions: string[]): boolean {
  const user = useUser();
  if (!user) return false;
  return permissions.some(p => user.permissions.includes(p));
}
