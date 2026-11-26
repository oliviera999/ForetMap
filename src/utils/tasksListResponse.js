/**
 * Normalise la réponse de `GET /api/tasks` (tableau historique ou enveloppe paginée).
 * Audit 26/11 P1 : le serveur renvoie `{ items, limit, offset, hasMore, total }`.
 */

export function tasksItemsFromResponse(data) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.items)) return data.items;
  return null;
}

/**
 * Charge toutes les pages de tâches pour un filtre donné (sync carte / temps réel).
 * @param {(path: string) => Promise<unknown>} apiFn
 * @param {string} querySansPagination ex. `map_id=m1` (sans `limit`/`offset`)
 * @param {{ pageLimit?: number, maxPages?: number }} [options]
 */
export async function fetchAllTaskPages(apiFn, querySansPagination, options = {}) {
  const pageLimit = Math.min(500, Math.max(1, Number(options.pageLimit) || 200));
  const maxPages = Math.min(50, Math.max(1, Number(options.maxPages) || 25));
  const base = String(querySansPagination || '')
    .replace(/^&/, '')
    .replace(/&$/, '');
  const join = base ? `${base}&` : '';
  const all = [];
  let offset = 0;
  for (let page = 0; page < maxPages; page += 1) {
    const path = `/api/tasks?${join}limit=${pageLimit}&offset=${offset}`;
    const data = await apiFn(path);
    const items = tasksItemsFromResponse(data);
    if (!items) {
      console.warn('[ForetMap] GET /api/tasks : réponse inattendue', typeof data);
      break;
    }
    all.push(...items);
    const hasMore =
      data && typeof data === 'object' && !Array.isArray(data)
        ? data.hasMore === true
        : items.length >= pageLimit;
    if (!hasMore || items.length === 0) break;
    offset += items.length;
  }
  return all;
}
