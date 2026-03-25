/** Base URL API (même origine en prod et avec proxy Vite en dev) */
export const API = '';

export class AccountDeletedError extends Error {
  constructor() {
    super('Compte supprimé');
    this.deleted = true;
  }
}

function decodeJwtPayload(token) {
  try {
    const parts = String(token || '').split('.');
    if (parts.length < 2) return null;
    const json = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json);
  } catch (_) {
    return null;
  }
}

export function getAuthToken() {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem('foretmap_auth_token') || localStorage.getItem('foretmap_teacher_token');
}

export function getAuthClaims() {
  const token = getAuthToken();
  return token ? decodeJwtPayload(token) : null;
}

export async function api(path, method = 'GET', body) {
  const headers = { 'Content-Type': 'application/json' };
  const authToken = getAuthToken();
  if (authToken) headers.Authorization = 'Bearer ' + authToken;
  const res = await fetch(API + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    if (res.status === 401 && errBody.deleted) throw new AccountDeletedError();
    if (res.status === 401 && authToken && (errBody.error || '').toLowerCase().includes('token')) {
      localStorage.removeItem('foretmap_auth_token');
      localStorage.removeItem('foretmap_teacher_token');
      window.dispatchEvent(new CustomEvent('foretmap_teacher_expired'));
    }
    const ex = new Error(errBody.error || 'Erreur serveur');
    ex.status = res.status;
    throw ex;
  }
  return res.json();
}
