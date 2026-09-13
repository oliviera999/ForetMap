'use strict';

const { queryOne } = require('../database');

/**
 * Vrai si la carte existe. Sept copies locales coexistaient, avec ou sans garde sur un
 * identifiant vide (audit du 13/09/2026, §3.3) : celle-ci ne va pas en base pour `null`.
 * @param {unknown} mapId
 */
async function mapExists(mapId) {
  const id = mapId == null ? '' : String(mapId).trim();
  if (!id) return false;
  const row = await queryOne('SELECT id FROM maps WHERE id = ? LIMIT 1', [id]);
  return !!row;
}

module.exports = { mapExists };
