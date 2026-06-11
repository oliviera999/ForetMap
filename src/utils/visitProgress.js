/**
 * Dérivations pures de l'écran de visite (progression cartographie + libellé réseau) — extraites
 * de `visit-views.jsx` (O6).
 */

import { parseVisitZonePoints } from './visitMapGeometry.js';
import { itemSeenKey } from './visitMediaGallery.js';

/**
 * Progression « cartographie » : nombre d'éléments parcourables (zones traçables ≥ 3 points +
 * repères) et nombre déjà vus (présents dans `seen`), avec le pourcentage (0–100).
 * @param {Array} zones
 * @param {Array} markers
 * @param {{ has: (key: string) => boolean }} seen ensemble des clés `itemSeenKey` déjà vues
 * @returns {{ total: number, seenCount: number, pct: number }}
 */
export function computeVisitCartographyProgress(zones, markers, seen) {
  const zoneList = zones || [];
  const markerList = markers || [];
  let total = 0;
  let seenCount = 0;
  for (const z of zoneList) {
    if (parseVisitZonePoints(z.points).length < 3) continue;
    total += 1;
    if (seen.has(itemSeenKey('zone', z.id))) seenCount += 1;
  }
  for (const m of markerList) {
    total += 1;
    if (seen.has(itemSeenKey('marker', m.id))) seenCount += 1;
  }
  const pct = total > 0 ? Math.min(100, Math.round((seenCount / total) * 100)) : 0;
  return { total, seenCount, pct };
}

/** Libellé d'état réseau / synchronisation de la visite (ou `null` si rien à signaler). */
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
