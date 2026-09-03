/**
 * Logique pure du **mode parcours** du plan (lot 8 du plan de convergence,
 * `docs/AUDIT_PLAN_LYAUTEY_2026-09.md` §8.6).
 *
 * Un parcours est une liste ordonnée de lieux. Rien n'est enregistré côté serveur : on
 * avance, on recule, on saute, on quitte — et la position courante vit sur l'appareil.
 */

/** Identifiant de parcours porté par l'URL (`?parcours=`), ou `''`. */
export function readRouteSlugFromLocation(search) {
  try {
    return String(new URLSearchParams(String(search || '')).get('parcours') || '').trim();
  } catch (_) {
    return '';
  }
}

/** URL de partage d'un parcours (QR code d'accueil) : remplace le seul paramètre `parcours`. */
export function buildRouteUrl(location, slug) {
  const params = new URLSearchParams(String(location?.search || ''));
  if (slug) params.set('parcours', slug);
  else params.delete('parcours');
  // Un lieu et un parcours ne s'ouvrent pas ensemble : le parcours pilote la sélection.
  params.delete('lieu');
  const query = params.toString();
  return `${location?.pathname || '/'}${query ? `?${query}` : ''}`;
}

/**
 * Étapes d'un parcours résolues en lieux réels, dans l'ordre. Une étape dont le lieu a été
 * supprimé est écartée : mieux vaut un parcours plus court qu'une étape qui n'existe plus.
 *
 * @param {{ steps?: Array<object> }|null} route
 * @param {Array<object>} places lieux du plan (`planPlacesFromContent`).
 * @returns {Array<{ step: object, place: object, index: number, number: number }>}
 */
export function resolveRouteSteps(route, places) {
  const byKey = new Map((places || []).map((place) => [`${place.kind}:${place.id}`, place]));
  const resolved = [];
  for (const step of route?.steps || []) {
    const place = byKey.get(`${step.target_type}:${step.target_id}`);
    if (!place) continue;
    resolved.push({
      step,
      place,
      index: resolved.length,
      number: resolved.length + 1,
    });
  }
  return resolved;
}

/** Titre affiché d'une étape : son titre propre, sinon le nom du lieu. */
export function routeStepTitle(entry) {
  return String(entry?.step?.step_title || '').trim() || String(entry?.place?.name || '').trim();
}

/** Position suivante dans un parcours, bornée (pas de boucle : la fin est la fin). */
export function nextRouteIndex(current, total, delta) {
  const next = Number(current) + Number(delta);
  if (!Number.isFinite(next) || total <= 0) return 0;
  return Math.min(Math.max(next, 0), total - 1);
}
