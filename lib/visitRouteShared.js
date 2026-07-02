'use strict';

/**
 * Helpers partagés du cluster visite (`routes/visit.js` + sous-routeurs `routes/visit/*.js`).
 * Regroupe les copies identiques historiques (audit §4.3) : horodatage ISO, résolution du
 * plan de visite et existence d'une carte. I/O limitée à une requête SQL mono-table.
 */

const { queryOne } = require('../database');
const { resolveDefaultMapId } = require('./settings');

function nowIso() {
  return new Date().toISOString();
}

async function resolveVisitMapId(rawMapId) {
  const requested = String(rawMapId || '').trim();
  if (requested) return requested;
  return resolveDefaultMapId('visit');
}

async function mapExists(mapId) {
  const row = await queryOne('SELECT id FROM maps WHERE id = ? LIMIT 1', [mapId]);
  return !!row;
}

module.exports = {
  nowIso,
  resolveVisitMapId,
  mapExists,
};
