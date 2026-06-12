'use client';

import { useHasPermission } from '../../hooks/useHasPermission';

interface Props {
  permission: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export default function CanAccess({ permission, children, fallback = null }: Props) {
  const can = useHasPermission(permission);
  return can ? <>{children}</> : <>{fallback}</>;
}
