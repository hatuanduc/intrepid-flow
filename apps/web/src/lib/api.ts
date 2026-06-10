import { getToken } from './auth';

function getApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    const runtime = window.__INTREPID__?.apiBaseUrl;
    if (typeof runtime === 'string' && runtime.trim()) return runtime.trim();
  }

  // build-time fallback for local/dev
  const env = process.env.NEXT_PUBLIC_API_BASE_URL ?? process.env.API_BASE_URL ?? '';
  return (env?.toString().trim() || 'http://localhost:4000');
}

function errorMessageFromJson(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  if (!('message' in data)) return null;

  const message = (data as Record<string, unknown>).message;
  if (typeof message === 'string') return message;
  if (message == null) return null;
  return String(message);
}

async function request<T>(
  path: string,
  init?: RequestInit & { auth?: boolean },
): Promise<T> {
  let baseUrl = getApiBaseUrl();
  if (!baseUrl || typeof baseUrl !== 'string' || !baseUrl.trim()) baseUrl = 'http://localhost:4000';
  const headers = new Headers(init?.headers);
  headers.set('content-type', 'application/json');

  if (init?.auth) {
    const token = getToken();
    if (token) headers.set('authorization', `Bearer ${token}`);
  }

  const initialRes = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers,
    // Default to no-store unless caller provided a cache option
    cache: init && Object.prototype.hasOwnProperty.call(init, 'cache') ? (init as any).cache : 'no-store',
  });

  let res = initialRes;

  // If server returned 304 Not Modified (ETag), retry forcing no-cache to obtain a fresh body
  if (res.status === 304) {
    res = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers,
      cache: 'no-store',
    });
  }

  const text = await res.text();
  const data = text ? (JSON.parse(text) as unknown) : null;

  if (!res.ok) {
    const message = errorMessageFromJson(data) ?? `Request failed: ${res.status}`;
    throw new Error(message);
  }

  return data as T;
}

export type LoginResponse = {
  token: string;
  user: {
    id: string;
    email: string;
    name: string | null;
    roles: string[];
    permissions: string[];
  };
};

export async function login(email: string, password: string) {
  return request<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function me() {
  return request<{
    user: {
      id: string;
      email: string;
      name: string | null;
      roles: string[];
      permissions: string[];
    };
  }>(
    '/auth/me',
    {
      method: 'GET',
      auth: true,
    },
  );
}

export type PermissionItem = {
  id: string;
  key: string;
  module: string;
  action: string;
  label: string;
  description?: string | null;
};

export type RoleItem = {
  id: string;
  key: string;
  name: string;
  description?: string | null;
  isSystem: boolean;
  userCount: number;
  permissions: PermissionItem[];
};

export type UserItem = {
  id: string;
  email: string;
  name: string | null;
  isActive: boolean;
  roles: Array<{ id: string; key: string; name: string }>;
};

export async function listUsers(search = '') {
  const query = search.trim() ? `?search=${encodeURIComponent(search.trim())}` : '';
  return request<{ items: UserItem[] }>(`/management/users${query}`, {
    method: 'GET',
    auth: true,
  });
}

export async function createUser(input: {
  email: string;
  name: string;
  password: string;
  roleIds: string[];
}) {
  return request<{ item: UserItem }>('/management/users', {
    method: 'POST',
    auth: true,
    body: JSON.stringify(input),
  });
}

export async function updateUser(
  id: string,
  input: {
    name?: string;
    password?: string;
    isActive?: boolean;
    roleIds?: string[];
  },
) {
  return request<{ item: UserItem }>(`/management/users/${id}`, {
    method: 'PUT',
    auth: true,
    body: JSON.stringify(input),
  });
}

export async function listRoles() {
  return request<{ items: RoleItem[] }>('/management/roles', {
    method: 'GET',
    auth: true,
  });
}

export async function createRole(input: {
  name: string;
  description?: string;
  permissionIds: string[];
}) {
  return request<{ item: RoleItem }>('/management/roles', {
    method: 'POST',
    auth: true,
    body: JSON.stringify(input),
  });
}

export async function updateRole(id: string, input: { name?: string; description?: string; permissionIds?: string[] }) {
  return request<{ item: RoleItem }>(`/management/roles/${id}`, {
    method: 'PUT',
    auth: true,
    body: JSON.stringify(input),
  });
}

export async function listPermissions() {
  return request<{ items: PermissionItem[] }>('/management/permissions', {
    method: 'GET',
    auth: true,
  });
}

// --- Branches ---

export type BranchItem = {
  id: string;
  code: string;
  name: string;
  address?: string | null;
  isActive: boolean;
};

export async function listBranches() {
  return request<{ items: BranchItem[] }>('/management/branches', {
    method: 'GET',
    auth: true,
  });
}

export async function createBranch(input: { code: string; name: string; address?: string }) {
  return request<{ item: BranchItem }>('/management/branches', {
    method: 'POST',
    auth: true,
    body: JSON.stringify(input),
  });
}

export async function updateBranch(id: string, input: { name?: string; address?: string; isActive?: boolean }) {
  return request<{ item: BranchItem }>(`/management/branches/${id}`, {
    method: 'PUT',
    auth: true,
    body: JSON.stringify(input),
  });
}

export async function deleteBranch(id: string) {
  return request<{ success: boolean }>(`/management/branches/${id}`, {
    method: 'DELETE',
    auth: true,
  });
}

// --- UserBranchRoles ---

export type UserBranchRoleItem = {
  id: string;
  branch: { id: string; code: string; name: string };
  role: { id: string; key: string; name: string };
  assignedAt: string;
};

export async function listUserBranchRoles(userId: string) {
  return request<{ items: UserBranchRoleItem[] }>(`/management/users/${userId}/branch-roles`, {
    method: 'GET',
    auth: true,
  });
}

export async function assignBranchRole(userId: string, input: { branchId: string; roleId: string }) {
  return request<{ item: UserBranchRoleItem }>(`/management/users/${userId}/branch-roles`, {
    method: 'POST',
    auth: true,
    body: JSON.stringify(input),
  });
}

export async function removeBranchRole(id: string) {
  return request<{ success: boolean }>(`/management/users/branch-roles/${id}`, {
    method: 'DELETE',
    auth: true,
  });
}

// --- Workflow Modules ---

export type WorkflowModuleItem = {
  id: string;
  key: string;
  name: string;
  description?: string | null;
  isEnabled: boolean;
  sortOrder: number;
};

export async function listWorkflowModules() {
  return request<{ items: WorkflowModuleItem[] }>('/management/modules', {
    method: 'GET',
    auth: true,
  });
}

export async function updateWorkflowModule(key: string, input: { isEnabled?: boolean }) {
  return request<{ item: WorkflowModuleItem }>(`/management/modules/${key}`, {
    method: 'PUT',
    auth: true,
    body: JSON.stringify(input),
  });
}
