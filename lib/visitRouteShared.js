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
 * @param {unknown} rawMapId `?map_id=` brut.
 * @param {object|null} auth lecteur (`req.auth`).
 * @returns {Promise<{ mapId: string } | { error: string }>}
 */
async function resolveVisitMapIdForViewer(rawMapId, auth) {
  const mapId = await resolveVisitMapId(rawMapId);
  if (!mapId) return { error: 'map_id requis' };
  const { isLocationManager } = require('./locationAudience');
  if (isLocationManager(auth)) return { mapId };
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
