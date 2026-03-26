/** Base URL API (même origine en prod et avec proxy Vite en dev) */
export const API = '';
const SESSION_KEY = 'foretmap_session';

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
    const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    const json = atob(padded);
    return JSON.parse(json);
  } catch (_) {
    return null;
  }
}

export function getAuthToken() {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.token) return parsed.token;
    }
  } catch (_) {}
  return localStorage.getItem('foretmap_auth_token') || localStorage.getItem('foretmap_teacher_token');
}

export function getStoredSession() {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  const token = localStorage.getItem('foretmap_auth_token') || localStorage.getItem('foretmap_teacher_token');
  const studentRaw = localStorage.getItem('foretmap_student');
  let student = null;
  try { student = studentRaw ? JSON.parse(studentRaw) : null; } catch (_) {}
  if (!token && !student) return null;
  return {
    token: token || null,
    user: student ? {
      id: student.id,
      userType: 'student',
      displayName: student.pseudo || `${student.first_name || ''} ${student.last_name || ''}`.trim() || 'Utilisateur',
      email: student.email || null,
    } : null,
    student: student || null,
  };
}

export function saveStoredSession(next) {
  if (typeof localStorage === 'undefined') return;
  const current = getStoredSession() || {};
  const merged = { ...current, ...(next || {}) };
  localStorage.setItem(SESSION_KEY, JSON.stringify(merged));
}

export function clearStoredSession() {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem('foretmap_auth_token');
  localStorage.removeItem('foretmap_teacher_token');
  localStorage.removeItem('foretmap_student');
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
      clearStoredSession();
      window.dispatchEvent(new CustomEvent('foretmap_teacher_expired'));
    }
    const ex = new Error(errBody.error || 'Erreur serveur');
    ex.status = res.status;
    throw ex;
  }
  return res.json();
}
