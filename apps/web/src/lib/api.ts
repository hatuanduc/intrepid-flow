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
    cache: init && Object.prototype.hasOwnProperty.call(init, 'cache') ? init.cache : 'no-store',
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
    id: number;
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

export async function googleLogin(credential: string) {
  return request<LoginResponse>('/auth/google', {
    method: 'POST',
    body: JSON.stringify({ credential }),
    skipAuthRedirect: true,
  });
}

export async function me() {
  return request<{
    user: {
      id: number;
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
  id: number;
  key: string;
  module: string;
  action: string;
  label: string;
  description?: string | null;
};

export type RoleItem = {
  id: number;
  key: string;
  name: string;
  group?: string | null;
  description?: string | null;
  isSystem: boolean;
  userCount: number;
  permissions: PermissionItem[];
};

export type UserItem = {
  id: number;
  email: string;
  name: string | null;
  isActive: boolean;
  hasPassword: boolean;
  lastLoginAt: string | null;
  roles: Array<{ id: number; key: string; name: string }>;
  permissions: PermissionItem[];
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
  roleIds: number[];
  permissionIds?: number[];
}) {
  return request<{ item: UserItem }>('/management/users', {
    method: 'POST',
    auth: true,
    body: JSON.stringify(input),
  });
}

export async function updateUser(
  id: number,
  input: {
    name?: string;
    isActive?: boolean;
    roleIds?: number[];
    permissionIds?: number[];
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


export async function deleteUser(id: number) {
  return request<{ ok: boolean }>(`/management/users/${id}`, {
    method: 'DELETE',
    auth: true,
  });
}

export async function impersonateUser(id: number) {
  return request<{ token: string; user: { id: number; email: string; name: string | null } }>(
    `/management/users/${id}/impersonate`,
    { method: 'POST', auth: true },
  );
}

export async function deleteRole(id: number) {
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

// --- Bank Statement Settings ---

export type SyncDateMode = 'today' | 'yesterday' | 'last_7_days' | 'custom';

export type BankJobSettings = {
  id: string;
  scheduleCron: string;
  isScheduled: boolean;
  hsbcnetUsername: string | null;
  googleTemplateSpreadsheetId: string | null;
  googleTemplateSheet: string | null;
  syncDateMode: SyncDateMode;
  syncCustomDays: number;
};

export type BankDownloadTemplate = {
  id: number;
  headers: string[];
  headerHash: string;
  updatedAt: string;
};

export type BankGsheetConfig = {
  id: number;
  accountCode: string;
  spreadsheetId: string;
  spreadsheetUrl: string | null;
  templateSheetName: string | null;
  isActive: boolean;
  updatedAt: string;
};

export async function getBankSettings() {
  return request<BankJobSettings>('/management/bank-statement/settings', { auth: true });
}

export async function updateBankSettings(input: {
  scheduleCron: string;
  isScheduled: boolean;
  hsbcnetUsername?: string | null;
  googleTemplateSpreadsheetId?: string | null;
  googleTemplateSheet?: string | null;
  syncDateMode: SyncDateMode;
  syncCustomDays: number;
}) {
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

export async function listBankGsheets() {
  return request<BankGsheetConfig[]>('/management/bank-statement/settings/gsheets', { auth: true });
}

export async function upsertBankGsheet(accountCode: string, input: {
  spreadsheetId: string;
  isActive?: boolean;
}) {
  return request<BankGsheetConfig>(`/management/bank-statement/settings/gsheets/${accountCode}`, {
    method: 'PUT', auth: true, body: JSON.stringify(input),
  });
}

// --- Bank Sync Jobs ---

export type JobStep = {
  key: 'bank_sync' | 'sheets_sync';
  label: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
};

export type JobStats = {
  totalAccounts: number;
  downloaded: number;
  downloadFailed: number;
  synced: number;
  syncFailed: number;
  syncSkipped: number;
  syncPending: number;
  syncNoData: number;
  totalRowsDownloaded: number;
  totalRowsInserted: number;
  totalRowsSynced: number;
};

export type BankSyncJob = {
  id: string;
  status: string;
  triggeredBy: string | null;
  triggeredByName: string | null;
  startedAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
  logs: Array<{ time: string; message: string; step?: string; level?: string }>;
  steps: JobStep[];
  createdAt: string;
  durationMs: number | null;
  stats: JobStats | null;
  dateRangeFrom: string | null;
  dateRangeTo: string | null;
};

export async function triggerBankSync(dateRange?: { dateFrom: string; dateTo: string }) {
  return request<BankSyncJob>('/management/bank-statement/jobs', {
    method: 'POST',
    body: JSON.stringify(dateRange ?? {}),
    auth: true,
  });
}

export async function listBankJobs() {
  return request<BankSyncJob[]>('/management/bank-statement/jobs', { auth: true });
}

export async function getBankJob(id: string) {
  return request<BankSyncJob>(`/management/bank-statement/jobs/${id}`, { auth: true });
}

export async function retryBankJob(id: string, stepKey?: 'bank_sync' | 'sheets_sync') {
  return request<BankSyncJob>(`/management/bank-statement/jobs/${id}/retry`, {
    method: 'POST', auth: true,
    body: JSON.stringify({ stepKey }),
  });
}

export async function cancelBankJob(id: string) {
  return request<{ ok: boolean }>(`/management/bank-statement/jobs/${id}/cancel`, {
    method: 'POST', auth: true,
  });
}

export async function deleteBankJob(id: string) {
  return request<{ ok: boolean }>(`/management/bank-statement/jobs/${id}`, {
    method: 'DELETE', auth: true,
  });
}

export type BankAccount = {
  id: number;
  accountNumber: string;
  accountName: string;
  bankName: string;
  currency: string;
  accountCode: string;
  isActive: boolean;
  syncEnabled: boolean;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
};

export type BankAccountNameItem = {
  id: number;
  name: string;
  accountCode: string;
  isActive: boolean;
};

export async function listBankAccountNames(opts?: { all?: boolean }) {
  const query = opts?.all ? '?all=true' : '';
  return request<BankAccountNameItem[]>(`/management/bank-statement/account-names${query}`, { auth: true });
}

export async function createBankAccountName(body: { name: string; accountCode: string }) {
  return request<BankAccountNameItem>('/management/bank-statement/account-names', {
    method: 'POST',
    auth: true,
    body: JSON.stringify(body),
  });
}

export async function updateBankAccountName(
  id: number,
  body: Partial<{ name: string; isActive: boolean }>,
) {
  return request<BankAccountNameItem>(`/management/bank-statement/account-names/${id}`, {
    method: 'PUT',
    auth: true,
    body: JSON.stringify(body),
  });
}

export async function deleteBankAccountName(id: number) {
  return request<{ ok: boolean }>(`/management/bank-statement/account-names/${id}`, {
    method: 'DELETE',
    auth: true,
  });
}

export async function updateBankAccountSync(id: number, syncEnabled: boolean) {
  return request<BankAccount>(`/management/bank-statement/accounts/${id}`, {
    method: 'PUT',
    auth: true,
    body: JSON.stringify({ syncEnabled }),
  });
}


export type DailyMetricsRow = {
  date: string;
  accountId: number;
  accountNumber: string;
  accountName: string;
  accountCode: string;
  currency: string;
  totalCredit: number;
  totalDebit: number;
  txCount: number;
};

export type MetricsResponse = {
  summary: { totalCredit: number; totalDebit: number; netFlow: number; txCount: number; accountCount: number };
  daily: DailyMetricsRow[];
  balances: { accountId: number; balance: number | null }[];
};

export type JobAccountSummary = {
  accountId: number;
  accountNumber: string;
  accountName: string;
  accountCode: string;
  currency: string;
  txCount: number;
  totalCredit: number;
  totalDebit: number;
  rowsDuplicate: number;
  downloadStatus: 'pending' | 'completed' | 'failed' | 'not_attempted';
  downloadError: string | null;
  sheetsSyncStatus: 'pending' | 'completed' | 'failed' | 'skipped' | 'no_data' | 'not_attempted';
  sheetsSyncError: string | null;
};

export async function listBankAccounts() {
  return request<BankAccount[]>('/management/bank-statement/accounts', { auth: true });
}

export async function resyncBankAccountSheets(jobPublicId: string, bankAccountId: number) {
  return request<{ ok: boolean; alreadyQueued: boolean }>(`/management/bank-statement/jobs/${jobPublicId}/accounts/${bankAccountId}/resync-sheets`, {
    method: 'POST',
    auth: true,
  });
}

export async function resyncBankJobSheets(jobPublicId: string) {
  return request<{ ok: boolean; count: number; skipped: number }>(`/management/bank-statement/jobs/${jobPublicId}/resync-sheets`, {
    method: 'POST',
    auth: true,
  });
}

export async function getBankMetrics(from: string, to: string, accountCode?: string, accountId?: number) {
  const params = new URLSearchParams({ from, to });
  if (accountCode) params.set('accountCode', accountCode);
  if (accountId != null) params.set('accountId', String(accountId));
  return request<MetricsResponse>(`/management/bank-statement/metrics?${params}`, { auth: true });
}

export type BankSyncCoverageStatus = 'future' | 'not_fetched' | 'partial' | 'fetched_not_synced' | 'synced' | 'in_progress';

export type BankSyncCoverageAccount = {
  id: number;
  accountNumber: string;
  accountName: string;
  downloaded: boolean;
  synced: boolean;
};

export type BankSyncCoverageDay = {
  date: string; // YYYY-MM-DD
  status: BankSyncCoverageStatus;
  accounts: BankSyncCoverageAccount[];
};

export async function getBankCoverage(from: string, to: string) {
  return request<{ days: BankSyncCoverageDay[] }>(
    `/management/bank-statement/coverage?from=${from}&to=${to}`,
    { auth: true },
  );
}

export async function getBankJobSummary(jobId: string) {
  return request<JobAccountSummary[]>(`/management/bank-statement/jobs/${jobId}/summary`, { auth: true });
}

export async function getBankJobStats(jobId: string) {
  return request<JobStats>(`/management/bank-statement/jobs/${jobId}/stats`, { auth: true });
}

export type JobTransaction = {
  id: number;
  postDate: string;
  narrative: string | null;
  bankReference: string | null;
  creditAmount: number | null;
  debitAmount: number | null;
  balance: number | null;
  fetchedAt: string;
};

export async function getJobAccountTransactions(jobId: string, accountId: number) {
  return request<JobTransaction[]>(
    `/management/bank-statement/jobs/${jobId}/account-transactions?accountId=${accountId}`,
    { auth: true },
  );
}

export async function getAccountTransactions(accountId: number, from: string, to: string) {
  return request<JobTransaction[]>(
    `/management/bank-statement/account-transactions?accountId=${accountId}&from=${from}&to=${to}`,
    { auth: true },
  );
}

// --- Report AR ---

export type ArGsheetConfig = {
  id: number;
  countryCode: string;
  spreadsheetId: string;
  sheetName: string;
  spreadsheetUrl: string | null;
  isActive: boolean;
  updatedAt: string;
};

export type ArSummary = {
  totalAR: number;
  unbilled: number;
  underTerm: number;
  overdue: number;
};

export type ArBrandRow = {
  brand: string;
  totalLeadtime: number;
  unbilledDays: number;
  overdueDays: number;
  underTermDays: number;
};


export type ArDetailRow = {
  period: string;
  brand: string;
  bizClass: string;
  amount: number;
  status: string;
};

export type ArData = {
  summary: ArSummary;
  byBrand: ArBrandRow[];
  unbilledRows: ArDetailRow[];
  overdueRows: ArDetailRow[];
  bizClasses: string[];
};

export async function listArGsheets() {
  return request<ArGsheetConfig[]>('/management/report-ar/settings/gsheets', { auth: true });
}

export async function createArGsheet(input: {
  countryCode: string;
  spreadsheetId: string;
  sheetName: string;
  spreadsheetUrl?: string;
  isActive?: boolean;
}) {
  return request<ArGsheetConfig>('/management/report-ar/settings/gsheets', {
    method: 'POST', auth: true, body: JSON.stringify(input),
  });
}

export async function updateArGsheet(id: number, input: {
  countryCode?: string;
  spreadsheetId: string;
  sheetName: string;
  spreadsheetUrl?: string;
  isActive?: boolean;
}) {
  return request<ArGsheetConfig>(`/management/report-ar/settings/gsheets/${id}`, {
    method: 'PUT', auth: true, body: JSON.stringify(input),
  });
}

export async function getArData(country: string = 'TH', bizClass?: string) {
  const params = new URLSearchParams({ country });
  if (bizClass) params.set('bizClass', bizClass);
  return request<ArData>(`/management/report-ar/data?${params}`, { auth: true });
}

// ─── System Settings ──────────────────────────────────────────────────────────

export type SystemSettingsStatus = {
  hasServiceKey: boolean;
  updatedAt: string | null;
  serviceKeyJson: string | null;
  clientEmail: string | null;
};

export async function getSystemSettings() {
  return request<SystemSettingsStatus>('/management/settings/system', { auth: true });
}

export type ServiceAccountStatus = {
  hasServiceKey: boolean;
  clientEmail: string | null;
};

export async function getServiceAccountStatus() {
  return request<ServiceAccountStatus>('/management/settings/system/service-account-status', { auth: true });
}

export async function updateSystemServiceAccount(serviceKeyJson: string | null) {
  return request<SystemSettingsStatus>('/management/settings/system/service-account', {
    method: 'PUT',
    auth: true,
    body: JSON.stringify({ serviceKeyJson }),
  });
}

export async function getBankCurrencyRates() {
  return request<CurrencyRate[]>('/management/bank-statement/currency-rates', { auth: true });
}

// ─── Currency Rates ───────────────────────────────────────────────────────────

export type CurrencyRate = { currency: string; rateToUsd: number; updatedAt: string };
export type CurrencySettingsData = {
  id: string;
  autoUpdateDay: number;
  lastUpdatedAt: string | null;
  nextUpdateAt: string | null;
  updatedAt: string;
};
export type CurrencyData = { rates: CurrencyRate[]; settings: CurrencySettingsData | null };

export async function getCurrencyData() {
  return request<CurrencyData>('/management/settings/system/currency-rates', { auth: true });
}

export async function refreshCurrencyRates() {
  return request<CurrencyData>('/management/settings/system/currency-rates/refresh', {
    method: 'POST',
    auth: true,
  });
}

export async function updateCurrencySettings(body: { autoUpdateDay: number }) {
  return request<CurrencySettingsData>('/management/settings/system/currency-settings', {
    method: 'PUT',
    auth: true,
    body: JSON.stringify(body),
  });
}

export async function addCurrencyRate(currency: string) {
  return request<CurrencyData>('/management/settings/system/currency-rates', {
    method: 'POST',
    auth: true,
    body: JSON.stringify({ currency }),
  });
}

export async function deleteCurrencyRate(currency: string) {
  return request<CurrencyData>(`/management/settings/system/currency-rates/${currency}`, {
    method: 'DELETE',
    auth: true,
  });
}

export async function resendInvite(userId: number) {
  return request<{ ok: boolean }>(`/management/users/${userId}/resend-invite`, {
    method: 'POST',
    auth: true,
  });
}

export async function verifyInviteToken(token: string) {
  return request<{ valid: boolean; email: string; name: string | null }>(`/auth/invite/${token}`);
}

export async function setPasswordWithToken(token: string, password: string, name?: string) {
  // Trả kèm session token — user vừa kích hoạt được auto-login luôn.
  return request<{ ok: boolean } & LoginResponse>('/auth/set-password', {
    method: 'POST',
    body: JSON.stringify({ token, password, name }),
  });
}

export async function forgotPassword(email: string) {
  return request<{ ok: boolean }>('/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export async function verifyResetToken(token: string) {
  return request<{ valid: boolean; email: string }>(`/auth/reset-password/${token}`);
}

export async function resetPasswordWithToken(token: string, password: string) {
  return request<{ ok: boolean }>('/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, password }),
  });
}

export async function updateMyProfile(name: string) {
  return request<{ id: number; email: string; name: string | null }>('/auth/me/profile', {
    method: 'PUT',
    auth: true,
    body: JSON.stringify({ name }),
  });
}

export async function changeMyPassword(currentPassword: string, newPassword: string) {
  return request<{ ok: boolean }>('/auth/me/password', {
    method: 'PUT',
    auth: true,
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}

export type AppNotification = {
  id: number;
  type: 'job_completed' | 'job_failed' | 'job_waiting_2fa';
  title: string;
  body: string | null;
  jobPublicId: string | null;
  isRead: boolean;
  createdAt: string;
};

export async function listNotifications(skip = 0, take = 15) {
  return request<{ items: AppNotification[]; hasMore: boolean }>(`/notifications?skip=${skip}&take=${take}`, { auth: true });
}

export async function getUnreadNotificationCount() {
  return request<{ count: number }>('/notifications/unread-count', { auth: true });
}

export async function markNotificationRead(id: number) {
  return request<AppNotification>(`/notifications/${id}/read`, { method: 'PATCH', auth: true });
}

export async function markAllNotificationsRead() {
  return request<{ ok: boolean }>('/notifications/read-all', { method: 'PATCH', auth: true });
}

// ─── Reconcile ────────────────────────────────────────────────────────────────
// Bypasses request() on purpose: this call sends multipart/form-data (not JSON)
// and reads a binary file back (not JSON), so it needs its own auth/error handling.

function filenameFromContentDisposition(header: string | null, fallback: string): string {
  if (!header) return fallback;
  const utf8Match = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (utf8Match) {
    try { return decodeURIComponent(utf8Match[1]); } catch { /* fall through */ }
  }
  const plainMatch = /filename="?([^";]+)"?/i.exec(header);
  return plainMatch ? plainMatch[1] : fallback;
}

// Shared by multipartFetch (below) and downloadReconcileResult() — both bypass request() because
// they don't exchange plain JSON (multipart body in, binary body out), but still need the same
// auth-header + 401 + error-body handling request() gives everything else.
async function checkRawResponse(res: Response): Promise<Response> {
  if (res.status === 401) {
    clearToken();
    if (typeof window !== 'undefined') window.location.replace('/login');
    throw new Error('UNAUTHORIZED');
  }

  if (!res.ok) {
    let message = `Request failed: ${res.status}`;
    try {
      const data = await res.json() as { message?: string };
      if (data?.message) message = data.message;
    } catch { /* body wasn't JSON */ }
    throw new Error(message);
  }

  return res;
}

async function multipartFetch(path: string, formData: FormData): Promise<Response> {
  let baseUrl = getApiBaseUrl();
  if (!baseUrl || typeof baseUrl !== 'string' || !baseUrl.trim()) baseUrl = 'http://localhost:4000';

  const headers = new Headers();
  const token = getToken();
  if (token) headers.set('authorization', `Bearer ${token}`);

  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers, // no content-type — the browser sets the multipart boundary itself
    body: formData,
    cache: 'no-store',
  });

  return checkRawResponse(res);
}

// Starts the filter-merge job — the actual invoice parsing now runs async in a Lambda (see
// apps/reconcile-lambda), so this returns immediately with a jobId instead of the merged file.
// Poll getReconcileJobStatus(jobId) until status is 'done', then call downloadReconcileResult().
export async function startReconcileFilterMerge(formData: FormData): Promise<{ jobId: string }> {
  const res = await multipartFetch('/management/reconcile/filter-merge', formData);
  return res.json() as Promise<{ jobId: string }>;
}

export type ReconcileJobStatus =
  | { status: 'processing' }
  | { status: 'done' }
  | { status: 'error'; message: string };

export async function getReconcileJobStatus(jobId: string) {
  return request<ReconcileJobStatus>(`/management/reconcile/filter-merge/${jobId}/status`, { auth: true });
}

export async function downloadReconcileResult(jobId: string): Promise<{ blob: Blob; filename: string }> {
  let baseUrl = getApiBaseUrl();
  if (!baseUrl || typeof baseUrl !== 'string' || !baseUrl.trim()) baseUrl = 'http://localhost:4000';

  const headers = new Headers();
  const token = getToken();
  if (token) headers.set('authorization', `Bearer ${token}`);

  const res = await checkRawResponse(await fetch(`${baseUrl}/management/reconcile/filter-merge/${jobId}/download`, {
    headers,
    cache: 'no-store',
  }));

  const blob = await res.blob();
  const filename = filenameFromContentDisposition(res.headers.get('content-disposition'), 'service_invoices_merged.xlsx');
  return { blob, filename };
}

export type MasterCustomerItem = { brandName: string; customerName: string };
export type MasterCustomerInfo = { count: number; updatedAt: string | null; items: MasterCustomerItem[] };

export async function getMasterCustomerInfo() {
  return request<MasterCustomerInfo>('/management/reconcile/master-customer', { auth: true });
}

export type ReconcileSettings = {
  id: string;
  headerRow: number;
  salesColumn: string;
  taxColumn: string;
  noteColumn: string;
  customerColumn: string;
  updatedAt: string;
};

export async function getReconcileSettings() {
  return request<ReconcileSettings>('/management/reconcile/settings', { auth: true });
}

export async function updateReconcileSettings(body: {
  headerRow: number;
  salesColumn: string;
  taxColumn: string;
  noteColumn: string;
  customerColumn: string;
}) {
  return request<ReconcileSettings>('/management/reconcile/settings', {
    method: 'PUT',
    auth: true,
    body: JSON.stringify(body),
  });
}

export async function replaceMasterCustomerFile(formData: FormData): Promise<MasterCustomerInfo> {
  const res = await multipartFetch('/management/reconcile/master-customer', formData);
  return res.json() as Promise<MasterCustomerInfo>;
}

export type GasLink = {
  id: number;
  name: string;
  url: string;
  icon: string;
  description: string | null;
  createdById: number | null;
  createdAt: string;
  updatedAt: string;
  createdBy: { id: number; name: string | null; email: string } | null;
};

export async function listGasLinks() {
  return request<{ items: GasLink[] }>('/management/gas-links', { auth: true });
}

export async function createGasLink(body: {
  name: string;
  url: string;
  icon: string;
  description?: string;
}) {
  return request<{ item: GasLink }>('/management/gas-links', {
    method: 'POST',
    auth: true,
    body: JSON.stringify(body),
  });
}

export async function updateGasLink(
  id: number,
  body: Partial<{ name: string; url: string; icon: string; description: string }>,
) {
  return request<{ item: GasLink }>(`/management/gas-links/${id}`, {
    method: 'PUT',
    auth: true,
    body: JSON.stringify(body),
  });
}

export async function deleteGasLink(id: number) {
  return request<{ ok: boolean }>(`/management/gas-links/${id}`, {
    method: 'DELETE',
    auth: true,
  });
}
