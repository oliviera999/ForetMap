'use strict';

/**
 * Helpers partagés du cluster visite (`routes/visit.js` + sous-routeurs `routes/visit/*.js`).
 * Regroupe les copies identiques historiques (audit §4.3) : horodatage ISO, résolution du
 * plan de visite et existence d'une carte. I/O limitée à une requête SQL mono-table.
 */

const { resolveDefaultMapId } = require('./settings');
const { nowDbTimestamp } = require('./shared/isoTimestamp');
const { mapExists } = require('./mapQueries');

/** Horodatage des colonnes VARCHAR temporelles — format unique, voir lib/shared/isoTimestamp.js. */
function nowIso() {
  return nowDbTimestamp();
}

async function resolveVisitMapId(rawMapId) {
  const requested = String(rawMapId || '').trim();
  if (requested) return requested;
  return resolveDefaultMapId('visit');
}

module.exports = {
  nowIso,
  resolveVisitMapId,
  mapExists,
};
