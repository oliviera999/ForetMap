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
