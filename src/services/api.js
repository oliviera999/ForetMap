/** Base URL API (même origine en prod et avec proxy Vite en dev) */
export const API = '';

export class AccountDeletedError extends Error {
  constructor() {
    super('Compte supprimé');
    this.deleted = true;
  }
}

export async function api(path, method = 'GET', body) {
  const headers = { 'Content-Type': 'application/json' };
  const teacherToken = typeof localStorage !== 'undefined' && localStorage.getItem('foretmap_teacher_token');
  if (teacherToken) headers.Authorization = 'Bearer ' + teacherToken;
  const res = await fetch(API + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    if (res.status === 401 && errBody.deleted) throw new AccountDeletedError();
    if (res.status === 401 && teacherToken && (errBody.error || '').toLowerCase().includes('token')) {
      localStorage.removeItem('foretmap_teacher_token');
      window.dispatchEvent(new CustomEvent('foretmap_teacher_expired'));
    }
    const ex = new Error(errBody.error || 'Erreur serveur');
    ex.status = res.status;
    throw ex;
  }
  return res.json();
}
