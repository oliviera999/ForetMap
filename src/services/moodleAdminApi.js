import { api } from './api';

/**
 * Accès à l'API administrateur du lien Moodle (`/api/admin/integrations/moodle`).
 * Fines enveloppes autour de `api()` : le composant ne connaît pas les URL.
 */

const BASE = '/api/admin/integrations/moodle';

export const moodleAdminApi = {
  status: () => api(`${BASE}/status`),
  check: () => api(`${BASE}/check`, 'POST', {}),
  cohorts: () => api(`${BASE}/cohorts`),
  courses: () => api(`${BASE}/courses`),
  runs: ({ limit = 20, offset = 0 } = {}) => api(`${BASE}/runs?limit=${limit}&offset=${offset}`),
  run: (id) => api(`${BASE}/runs/${encodeURIComponent(id)}`),
  startRun: (body) => api(`${BASE}/runs`, 'POST', body),
  undoRun: (id) => api(`${BASE}/runs/${encodeURIComponent(id)}/undo`, 'POST', {}),
  pendingMatches: () => api(`${BASE}/pending-matches`),
  decidePendingMatch: (id, body) =>
    api(`${BASE}/pending-matches/${encodeURIComponent(id)}`, 'POST', body),
  conflicts: () => api(`${BASE}/conflicts`),
  resolveConflict: (id, resolution) =>
    api(`${BASE}/conflicts/${encodeURIComponent(id)}`, 'POST', { resolution }),
  exempt: () => api(`${BASE}/exempt`),
  setExempt: (body) => api(`${BASE}/exempt`, 'POST', body),
  merge: (body) => api(`${BASE}/merge`, 'POST', body),
  ltiSuggest: (courseId) => api(`${BASE}/lti/suggest`, 'POST', { courseId }),
};

/** L'API répond 503 avec ce code tant que `.env` ne porte pas l'URL et le jeton. */
export function isNotConfiguredError(error) {
  return error?.status === 503 || /non configurée/i.test(String(error?.message || ''));
}
