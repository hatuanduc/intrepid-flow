import { clearToken, getToken } from './auth';

export function getApiBaseUrl(): string {
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
  init?: RequestInit & { auth?: boolean; skipAuthRedirect?: boolean },
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

  if (res.status === 401) {
    if (!init?.skipAuthRedirect) {
      // Token invalid or expired — clear and redirect to login
      clearToken();
      if (typeof window !== 'undefined') window.location.replace('/login');
    }
    throw new Error('UNAUTHORIZED');
  }

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
    skipAuthRedirect: true,
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

export async function deleteUser(id: string) {
  return request<{ ok: boolean }>(`/management/users/${id}`, {
    method: 'DELETE',
    auth: true,
  });
}

export async function deleteRole(id: string) {
  return request<{ ok: boolean }>(`/management/roles/${id}`, {
    method: 'DELETE',
    auth: true,
  });
}

export async function listPermissions() {
  return request<{ items: PermissionItem[] }>('/management/permissions', {
    method: 'GET',
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

// --- Bank Statement Settings ---

export type BankJobSettings = {
  id: string;
  scheduleCron: string;
  isScheduled: boolean;
  hsbcnetUsername: string | null;
};

export type BankDownloadTemplate = {
  id: string;
  headers: string[];
  headerHash: string;
  updatedAt: string;
};

export type BankCountryMapping = {
  id: string;
  companyName: string;
  countryCode: string;
  isActive: boolean;
  createdAt: string;
};

export type BankGsheetConfig = {
  id: string;
  countryCode: string;
  spreadsheetId: string;
  spreadsheetUrl: string | null;
  templateSheetName: string | null;
  hasServiceKey: boolean;
  isActive: boolean;
  updatedAt: string;
};

export async function getBankSettings() {
  return request<BankJobSettings>('/management/bank-statement/settings', { auth: true });
}

export async function updateBankSettings(input: { scheduleCron: string; isScheduled: boolean; hsbcnetUsername?: string | null }) {
  return request<BankJobSettings>('/management/bank-statement/settings', {
    method: 'PUT', auth: true, body: JSON.stringify(input),
  });
}

export async function getBankTemplate() {
  return request<BankDownloadTemplate | null>('/management/bank-statement/settings/template', { auth: true });
}

export async function updateBankTemplate(headers: string[]) {
  return request<BankDownloadTemplate>('/management/bank-statement/settings/template', {
    method: 'PUT', auth: true, body: JSON.stringify({ headers }),
  });
}

export async function listBankCountries() {
  return request<BankCountryMapping[]>('/management/bank-statement/settings/countries', { auth: true });
}

export async function createBankCountry(input: { companyName: string; countryCode: string }) {
  return request<BankCountryMapping>('/management/bank-statement/settings/countries', {
    method: 'POST', auth: true, body: JSON.stringify(input),
  });
}

export async function updateBankCountry(id: string, input: { companyName?: string; countryCode?: string; isActive?: boolean }) {
  return request<BankCountryMapping>(`/management/bank-statement/settings/countries/${id}`, {
    method: 'PUT', auth: true, body: JSON.stringify(input),
  });
}

export async function deleteBankCountry(id: string) {
  return request<{ ok: boolean }>(`/management/bank-statement/settings/countries/${id}`, {
    method: 'DELETE', auth: true,
  });
}

export async function listBankGsheets() {
  return request<BankGsheetConfig[]>('/management/bank-statement/settings/gsheets', { auth: true });
}

export async function upsertBankGsheet(countryCode: string, input: {
  spreadsheetId: string;
  spreadsheetUrl?: string;
  templateSheetName?: string;
  serviceKeyJson?: string;
  isActive?: boolean;
}) {
  return request<BankGsheetConfig>(`/management/bank-statement/settings/gsheets/${countryCode}`, {
    method: 'PUT', auth: true, body: JSON.stringify(input),
  });
}

// --- Bank Sync Jobs ---

export type BankSyncJob = {
  id: string;
  status: string;
  triggeredBy: string | null;
  startedAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
  logs: Array<{ time: string; message: string }>;
  createdAt: string;
  durationMs: number | null;
};

export async function triggerBankSync() {
  return request<BankSyncJob>('/management/bank-statement/jobs', {
    method: 'POST', auth: true,
  });
}

export async function listBankJobs() {
  return request<BankSyncJob[]>('/management/bank-statement/jobs', { auth: true });
}

export async function getBankJob(id: string) {
  return request<BankSyncJob>(`/management/bank-statement/jobs/${id}`, { auth: true });
}

export async function deleteBankJob(id: string) {
  return request<{ ok: boolean }>(`/management/bank-statement/jobs/${id}`, {
    method: 'DELETE', auth: true,
  });
}
