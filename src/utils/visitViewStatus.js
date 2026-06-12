import { parseVisitZonePoints } from './visitMapGeometry.js';
import { itemSeenKey } from './visitMediaGallery.js';

/**
 * IDs de mascottes autorisées pour la visite, depuis le réglage public
 * `visit.mascot.allowed_ids` : tableau d'IDs ou chaîne séparée par virgules,
 * points-virgules ou sauts de ligne. Entrées vides ignorées.
 * @returns {string[]} liste nettoyée (vide = aucune restriction).
 */
export function parseVisitMascotAllowedIds(raw) {
  if (Array.isArray(raw)) return raw.map((id) => String(id || '').trim()).filter(Boolean);
  if (typeof raw === 'string') {
    return raw
      .split(/[,\n;]+/g)
      .map((id) => String(id || '').trim())
      .filter(Boolean);
  }
  return [];
}

/**
 * Progression cartographique de la visite : zones affichées sur le plan
 * (polygone valide, ≥ 3 points) + repères, alignée sur ce que l'utilisateur
 * peut parcourir sur la carte courante.
 * @param {Array} zones zones de visite (champ `points` brut).
 * @param {Array} markers repères de visite.
 * @param {Set<string>} seen clés `itemSeenKey(type, id)` déjà vues.
 * @returns {{ total: number, seenCount: number, pct: number }}
 */
export function computeVisitCartographyProgress(zones, markers, seen) {
  let total = 0;
  let seenCount = 0;
  for (const z of zones || []) {
    if (parseVisitZonePoints(z.points).length < 3) continue;
    total += 1;
    if (seen.has(itemSeenKey('zone', z.id))) seenCount += 1;
  }
  for (const m of markers || []) {
    total += 1;
    if (seen.has(itemSeenKey('marker', m.id))) seenCount += 1;
  }
  const pct = total > 0 ? Math.min(100, Math.round((seenCount / total) * 100)) : 0;
  return { total, seenCount, pct };
}

/**
 * Libellé du statut réseau / synchronisation du bandeau visite.
 * Priorité : hors ligne > sync en cours > actions en attente > erreur > synchronisé.
 * @param {boolean} isOnline navigateur en ligne.
 * @param {'idle'|'pending'|'syncing'|'synced'|'error'} syncStatus état de la file `visit/seen`.
 * @param {number} pendingSyncCount actions en attente dans la file locale.
 * @returns {string|null} null quand il n'y a rien à signaler (état `idle`).
 */
export function buildVisitNetworkStatusLabel(isOnline, syncStatus, pendingSyncCount) {
  if (!isOnline) return 'Hors ligne — consultation locale';
  if (syncStatus === 'syncing') return 'Synchronisation en cours…';
  if (pendingSyncCount > 0) {
    return `${pendingSyncCount} action${pendingSyncCount > 1 ? 's' : ''} en attente de sync.`;
  }
  if (syncStatus === 'error') return 'Synchronisation en attente';
  if (syncStatus === 'synced') return 'Synchronisé';
  return null;
}
