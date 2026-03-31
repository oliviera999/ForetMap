/**
 * Préfixe de base de l'app (Vite `base`) sans slash final.
 *
 * Pourquoi:
 * - En déploiement "sous-dossier" (ex: https://domaine.tld/foretmap/),
 *   les appels absolus "/api/..." pointent vers la racine du domaine et
 *   peuvent être réécrits vers l'accueil (symptôme: retour page d'accueil sans message).
 * - `import.meta.env.BASE_URL` est toujours suffixé par "/".
 */
export const API = String(import.meta.env.BASE_URL || '/').replace(/\/+$/, '');

export function withAppBase(path) {
  const raw = String(path || '');
  if (!raw) return API || '/';
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
  const normalized = raw.startsWith('/') ? raw : `/${raw}`;
  // Quand API === '' (base '/'), on retombe sur une URL absolue classique.
  return `${API}${normalized}` || normalized;
}
const SESSION_KEY = 'foretmap_session';

function dispatchSessionChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('foretmap_session_changed'));
}

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
      avatar_path: student.avatar_path ?? student.avatarPath ?? null,
    } : null,
    student: student || null,
  };
}

export function saveStoredSession(next) {
  if (typeof localStorage === 'undefined') return;
  const current = getStoredSession() || {};
  const merged = { ...current, ...(next || {}) };
  localStorage.setItem(SESSION_KEY, JSON.stringify(merged));
  dispatchSessionChanged();
}

export function clearStoredSession() {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem('foretmap_auth_token');
  localStorage.removeItem('foretmap_teacher_token');
  localStorage.removeItem('foretmap_student');
  dispatchSessionChanged();
}

export function getAuthClaims() {
  const token = getAuthToken();
  return token ? decodeJwtPayload(token) : null;
}

async function parseApiBody(res) {
  if (!res || res.status === 204 || res.status === 205) return null;
  const contentType = String(res.headers?.get('content-type') || '').toLowerCase();
  if (contentType.includes('application/json')) {
    return res.json().catch(() => null);
  }
  const text = await res.text().catch(() => '');
  return text ? { raw: text } : null;
}

const API_FETCH_TIMEOUT_MS = 40000;

export async function api(path, method = 'GET', body) {
  const headers = { 'Content-Type': 'application/json' };
  const authToken = getAuthToken();
  if (authToken) headers.Authorization = 'Bearer ' + authToken;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_FETCH_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(withAppBase(path), {
      method,
      headers,
      // Ne pas utiliser `body ? …` : `0` ou `false` seraient omis à tort ; `{}` reste un corps JSON valide.
      body: body !== undefined && body !== null ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
  if (!res.ok) {
    const errBody = (await parseApiBody(res)) || {};
    if (res.status === 401 && errBody.deleted) throw new AccountDeletedError();
    if (res.status === 401 && authToken && (errBody.error || '').toLowerCase().includes('token')) {
      clearStoredSession();
      window.dispatchEvent(new CustomEvent('foretmap_teacher_expired'));
    }
    const ex = new Error(errBody.error || 'Erreur serveur');
    ex.status = res.status;
    ex.body = errBody;
    throw ex;
  }
  return parseApiBody(res);
}

export async function listContextComments({ contextType, contextId, page = 1, pageSize = 10 }) {
  const qs = new URLSearchParams({
    contextType: String(contextType || ''),
    contextId: String(contextId || ''),
    page: String(page),
    page_size: String(pageSize),
  });
  return api(`/api/context-comments?${qs.toString()}`);
}

export async function createContextComment({ contextType, contextId, body }) {
  return api('/api/context-comments', 'POST', { contextType, contextId, body });
}

export async function deleteContextComment(commentId) {
  return api(`/api/context-comments/${encodeURIComponent(commentId)}`, 'DELETE');
}

export async function reportContextComment(commentId, reason) {
  return api(`/api/context-comments/${encodeURIComponent(commentId)}/report`, 'POST', { reason });
}

export async function toggleForumPostReaction(postId, emoji) {
  return api(`/api/forum/posts/${encodeURIComponent(postId)}/reactions`, 'POST', { emoji });
}

export async function toggleContextCommentReaction(commentId, emoji) {
  return api(`/api/context-comments/${encodeURIComponent(commentId)}/reactions`, 'POST', { emoji });
}
