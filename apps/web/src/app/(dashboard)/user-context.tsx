'use client';

import { createContext, useContext } from 'react';

export type User = {
  id: string;
  email: string;
  name: string | null;
  roles: string[];
  permissions: string[];
};

export const UserContext = createContext<User | null>(null);

export function useUser(): User | null {
  return useContext(UserContext);
}
