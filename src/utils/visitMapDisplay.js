/**
 * Helpers purs d'affichage du plan visite — extraits de `visit-views.jsx` (O6).
 *
 * Fonctions sans dépendance React/DOM :
 * - transformation SVG uniforme sur l'axe Y (compensation anisotropie viewBox),
 * - pincement position mascotte dans le viewport,
 * - calcul de progression cartographique,
 * - libellé de statut réseau.
 */

/** Hauteur estimée de la mascotte en px — sert à calculer la marge haute dans le viewport. */
export const VISIT_MAP_MASCOT_ESTIMATED_HEIGHT_PX = 78;

/**
 * Compensation de l'étirement anisotrope d'un calque SVG `viewBox="0 0 100 100"` +
 * `preserveAspectRatio="none"` positionné sur un rectangle carte (largeur ≠ hauteur).
 * Sans cette correction, les `<text>` et emojis paraissent tassés sur l'axe Y.
 *
 * @param {number} cx  — centre X (unités SVG 0–100)
 * @param {number} cy  — centre Y
 * @param {number} fitW — largeur du calque carte (px)
 * @param {number} fitH — hauteur du calque carte (px)
 * @returns {string|undefined} attribut `transform` SVG, ou `undefined` si aucune correction nécessaire
 */
export function visitZoneSvgTextUniformYTransform(cx, cy, fitW, fitH) {
  if (!(fitW > 0 && fitH > 0)) return undefined;
  const r = fitW / fitH;
  if (Math.abs(r - 1) < 0.0005) return undefined;
  return `translate(${cx},${cy}) scale(1,${r}) translate(${-cx},${-cy})`;
}

/**
 * Restreint la position de la mascotte (en % du plan) dans le viewport visible,
 * en tenant compte de la hauteur rendue de la mascotte (évite qu'elle passe sous le bord bas
 * ou complètement hors du plan).
 *
 * @param {number} xp — position X brute (%)
 * @param {number} yp — position Y brute (%)
 * @param {number} [fitHeightPx=0] — hauteur rendue du calque carte en px
 * @returns {{ xp: number, yp: number }}
 */
export function clampVisitMascotPctForViewport(xp, yp, fitHeightPx = 0) {
  const nx = Math.max(0, Math.min(100, Number(xp) || 0));
  const rawY = Math.max(0, Math.min(100, Number(yp) || 0));
  if (!(fitHeightPx > 0)) return { xp: nx, yp: rawY };
  const minVisibleY = Math.max(
    6,
    (VISIT_MAP_MASCOT_ESTIMATED_HEIGHT_PX / Math.max(1, fitHeightPx)) * 100
  );
  const ny = Math.max(minVisibleY, Math.min(99.2, rawY));
  return { xp: nx, yp: ny };
}

/**
 * Calcule la progression cartographique de la visite : zones polygonales valides + repères
 * marqués comme vus parmi tous ceux affichés sur le plan.
 *
 * @param {Array<{id: unknown, points?: unknown}>} zones — zones de la visite (filtrage par polygone ≥ 3 pts)
 * @param {Array<{id: unknown}>} markers — repères de la visite
 * @param {Set<string>} seen — clés `type:id` des éléments vus (voir `itemSeenKey`)
 * @param {(type: string, id: unknown) => string} seenKeyFn — ex. `itemSeenKey` de visitMediaGallery
 * @param {(points: unknown) => Array<unknown>} parsePctPointsFn — ex. `parseVisitZonePoints`
 * @returns {{ total: number, seenCount: number, pct: number }}
 */
export function computeVisitCartographyProgress(zones, markers, seen, seenKeyFn, parsePctPointsFn) {
  const zoneList = Array.isArray(zones) ? zones : [];
  const markerList = Array.isArray(markers) ? markers : [];
  let total = 0;
  let seenCount = 0;
  for (const z of zoneList) {
    if (parsePctPointsFn(z.points).length < 3) continue;
    total += 1;
    if (seen.has(seenKeyFn('zone', z.id))) seenCount += 1;
  }
  for (const m of markerList) {
    total += 1;
    if (seen.has(seenKeyFn('marker', m.id))) seenCount += 1;
  }
  const pct = total > 0 ? Math.min(100, Math.round((seenCount / total) * 100)) : 0;
  return { total, seenCount, pct };
}

/**
 * Produit le libellé de statut réseau/synchro à afficher dans la barre de la carte visite.
 * Retourne `null` si aucun message à afficher (état nominal connecté, file vide).
 *
 * @param {boolean} isOnline
 * @param {'idle'|'pending'|'syncing'|'synced'|'error'} syncStatus
 * @param {number} pendingSyncCount — nombre d'actions en attente de synchronisation
 * @returns {string|null}
 */
export function computeVisitNetworkStatusLabel(isOnline, syncStatus, pendingSyncCount) {
  if (!isOnline) return 'Hors ligne — consultation locale';
  if (syncStatus === 'syncing') return 'Synchronisation en cours…';
  if (pendingSyncCount > 0) {
    return `${pendingSyncCount} action${pendingSyncCount > 1 ? 's' : ''} en attente de sync.`;
  }
  if (syncStatus === 'error') return 'Synchronisation en attente';
  if (syncStatus === 'synced') return 'Synchronisé';
  return null;
}
