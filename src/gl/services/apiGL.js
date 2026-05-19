import { withAppBase } from '../../services/api.js';

const GL_SESSION_KEY = 'gl_session';

function readSession() {
  try {
    const raw = localStorage.getItem(GL_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

export function getGlSession() {
  return readSession();
}

export function getGlToken() {
  return readSession()?.token || null;
}

export function saveGlSession(next) {
  const current = readSession() || {};
  const merged = { ...current, ...(next || {}) };
  localStorage.setItem(GL_SESSION_KEY, JSON.stringify(merged));
}

export function clearGlSession() {
  localStorage.removeItem(GL_SESSION_KEY);
}

export async function apiGL(path, method = 'GET', body = null) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getGlToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(withAppBase(path), {
    method,
    headers,
    body: body == null ? undefined : JSON.stringify(body),
  });
  const contentType = String(res.headers.get('content-type') || '').toLowerCase();
  const isJson = contentType.includes('application/json');
  const payload = isJson ? await res.json().catch(() => ({})) : await res.text().catch(() => '');
  if (!res.ok) {
    const message = typeof payload?.error === 'string' && payload.error ? payload.error : `Erreur HTTP ${res.status}`;
    const err = new Error(message);
    err.status = res.status;
    err.body = payload;
    throw err;
  }
  return payload;
}
