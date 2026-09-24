'use strict';

/**
 * Helpers partagés du cluster visite (`routes/visit.js` + sous-routeurs `routes/visit/*.js`).
 * Regroupe les copies identiques historiques (audit §4.3) : horodatage ISO, résolution du
 * plan de visite et existence d'une carte. I/O limitée à une requête SQL mono-table.
 */

const { resolveDefaultMapId } = require('./settings');
const { nowDbTimestamp } = require('./shared/isoTimestamp');
const { mapExists } = require('./mapQueries');

/** Horodatage des colonnes temporelles — rend un `Date`, voir lib/shared/isoTimestamp.js. */
function nowIso() {
  return nowDbTimestamp();
}

async function resolveVisitMapId(rawMapId) {
  const requested = String(rawMapId || '').trim();
  if (requested) return requested;
  return resolveDefaultMapId('visit');
}

/**
 * Carte de la Visite publique : `?map_id=` **si elle y est déclarée**, sinon la carte de
 * visite par défaut.
 *
 * C'est la liste blanche qui manquait (`docs/AUDIT_SECURITE_2026-09-22.md`, lot B). Le plan
 * public l'avait déjà (`resolvePlanMap` refuse une carte hors `ui.plan.selectable_map_ids`),
 * la Visite non : `resolveVisitMapId` rendait **n'importe quel** identifiant demandé, si
 * bien que `/api/visit/content?map_id=lyautey` servait le plan du lycée — 36 zones et 47
 * repères, tous actifs — à un visiteur sans compte. C'était la plus grosse fuite anonyme de
 * la carte `lyautey`, plus large que les routes génériques.
 *
 * Un gestionnaire de lieux n'est pas borné : il prépare les contenus de visite depuis la
 * console, carte par carte, et doit pouvoir les relire.
 *
 * Un lecteur **connecté** sur la surface de travail (`map`, produit ForêtMap) n'est pas
 * borné par la liste blanche publique mais par le **périmètre de son compte** — celui-là
 * même qui décide des cartes que lui liste `/api/maps` et des lieux que lui rendent
 * `/api/zones` / `/api/map/markers`. Sans cela, le mode visite d'un prof sans permission de
 * gestion proposait une carte déclarée sur un plan gardé (complexe Nawal El Moutawakel,
 * listé dans `ui.plan.selectable_map_ids`) puis la refusait : « Carte introuvable », fond de
 * la carte demandée sous les lieux de la carte précédente. On ne lui ouvre rien de plus que
 * ce que la carte lui montre déjà.
 *
 * @param {unknown} rawMapId `?map_id=` brut.
 * @param {object|null} auth lecteur (`req.auth`).
 * @param {{ surface?: string }} [options] surface décidée par le serveur
 *   (`resolveSurfaceForRequest`) ; absente = surface publique.
 * @returns {Promise<{ mapId: string } | { error: string }>}
 */
async function resolveVisitMapIdForViewer(rawMapId, auth, { surface = 'visit' } = {}) {
  const mapId = await resolveVisitMapId(rawMapId);
  if (!mapId) return { error: 'map_id requis' };
  const { isLocationManager } = require('./locationAudience');
  if (isLocationManager(auth)) return { mapId };
  if (auth && surface === 'map') {
    const { canAccessMapId } = require('./mapAccess');
    if (!(await canAccessMapId(auth, mapId))) return { error: 'Carte introuvable' };
    return { mapId };
  }
  const { allowedMapIdsForSurface } = require('./surfaceAccess');
  const allowed = await allowedMapIdsForSurface('visit');
  // Hors liste blanche : « Carte introuvable », comme un identifiant inexistant — distinguer
  // les deux apprendrait au curieux quelles cartes existent sans être publiées.
  if (allowed && !allowed.includes(mapId)) return { error: 'Carte introuvable' };
  return { mapId };
}

module.exports = {
  nowIso,
  resolveVisitMapId,
  resolveVisitMapIdForViewer,
  mapExists,
};
