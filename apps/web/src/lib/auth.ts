const TOKEN_KEY = 'intrepid_token';
const ADMIN_TOKEN_KEY = 'intrepid_admin_token';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  window.localStorage.removeItem(TOKEN_KEY);
}

export function isImpersonating(): boolean {
  if (typeof window === 'undefined') return false;
  return !!window.localStorage.getItem(ADMIN_TOKEN_KEY);
}

export function getAdminToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(ADMIN_TOKEN_KEY);
}

export function startImpersonation(userToken: string) {
  const currentToken = getToken();
  if (currentToken) window.localStorage.setItem(ADMIN_TOKEN_KEY, currentToken);
  setToken(userToken);
}

export function stopImpersonation() {
  const adminToken = getAdminToken();
  if (adminToken) {
    setToken(adminToken);
    window.localStorage.removeItem(ADMIN_TOKEN_KEY);
  }
}
