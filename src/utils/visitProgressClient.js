/**
 * Normalisation côté client de GET /api/visit/progress (résilience si erreur réseau ou corps inattendu).
 */

/**
 * @param {unknown} body — corps JSON de la progression, ou null / absent en cas d’échec d’appel
 * @returns {{ seen: Array<{ target_type: string, target_id: string }> }}
 */
export function safeVisitProgressPayload(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { seen: [] };
  }
  const raw = body.seen;
  if (!Array.isArray(raw)) return { seen: [] };
  const seen = [];
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue;
    const target_type = String(r.target_type || '').trim();
    const target_id = String(r.target_id ?? '').trim();
    if (!target_type || !target_id) continue;
    seen.push({ target_type, target_id });
  }
  return { seen };
}
