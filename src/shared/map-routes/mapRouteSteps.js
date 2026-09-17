/**
 * Logique pure du **mode parcours** (listes ordonnées de lieux, sans progression serveur).
 * Partagée par le Plan, la Visite et la carte de travail.
 */

/** Étapes d'un parcours résolues en lieux réels, dans l'ordre. */
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

/**
 * Titre affiché d'une étape : son titre propre, sinon le nom du lieu, sinon son rang.
 *
 * Le dernier repli n'est pas théorique : un repère sans libellé — ils existent — laissait la
 * barre d'étape sur son seul numéro, sans une ligne de texte.
 */
export function routeStepTitle(entry) {
  const own = String(entry?.step?.step_title || '').trim();
  if (own) return own;
  const name = String(entry?.place?.name || '').trim();
  if (name) return name;
  const number = Number(entry?.number);
  return Number.isFinite(number) && number > 0 ? `Étape ${number}` : '';
}

/** Position suivante dans un parcours, bornée (pas de boucle : la fin est la fin). */
export function nextRouteIndex(current, total, delta) {
  const next = Number(current) + Number(delta);
  if (!Number.isFinite(next) || total <= 0) return 0;
  return Math.min(Math.max(next, 0), total - 1);
}

/**
 * Zones + repères → lieux au format attendu par `resolveRouteSteps`
 * (`kind`, `id`, `name`).
 */
export function placesFromZonesAndMarkers(zones = [], markers = []) {
  return [
    ...(zones || []).map((zone) => ({
      ...zone,
      kind: 'zone',
      name: String(zone?.name || '').trim(),
    })),
    ...(markers || []).map((marker) => ({
      ...marker,
      kind: 'marker',
      name: String(marker?.label || marker?.name || '').trim(),
    })),
  ];
}

/**
 * Point de focus (% image) d'une étape de parcours résolue.
 * @param {{ place?: object }|null} entry
 * @returns {{ xp: number, yp: number }|null}
 */
export function routeEntryFocusPct(entry) {
  const place = entry?.place;
  if (!place) return null;
  if (place.kind === 'marker') {
    const xp = Number(place.x_pct);
    const yp = Number(place.y_pct);
    return Number.isFinite(xp) && Number.isFinite(yp) ? { xp, yp } : null;
  }
  let pts;
  try {
    pts = typeof place.points === 'string' ? JSON.parse(place.points || '[]') : place.points;
  } catch {
    pts = null;
  }
  if (!Array.isArray(pts) || pts.length < 1) return null;
  let sx = 0;
  let sy = 0;
  for (const p of pts) {
    sx += Number(p?.xp) || 0;
    sy += Number(p?.yp) || 0;
  }
  return { xp: sx / pts.length, yp: sy / pts.length };
}

/**
 * Clé de reprise d'un parcours sur l'appareil, par surface **et par carte** : un slug n'est
 * unique que sur sa carte, et les trois surfaces peuvent vivre dans le même navigateur.
 *
 * @param {string} surface `visit`, `map`… (le Plan passe par `planStorageKeys`).
 * @param {string} mapId carte affichée ; vide = pas de reprise mémorisée.
 */
export function mapRouteResumeStorageKey(surface, mapId) {
  const map = String(mapId || '').trim();
  if (!map) return '';
  return `foretmap:${String(surface || 'map')}:route-resume:${map}`;
}
