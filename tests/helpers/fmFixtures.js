'use strict';

/**
 * Fabrique d'objets métier ForetMap pour les tests (pendant de `glFixtures.js`, lot 1 du
 * plan de convergence — l'asymétrie « GL a des fixtures métier, ForetMap seulement des
 * fixtures d'authentification » est relevée dans `docs/AUDIT_CONVERGENCE_APPS_2026-09.md`
 * §4.6).
 *
 * Tout passe par les helpers SQL de `database.js` (paramétrés) avec des identifiants
 * uniques par appel : deux tests ne se marchent jamais dessus, et rien n'est à nettoyer
 * (la base de test est réinitialisée par la suite).
 */

const crypto = require('node:crypto');
const { execute, queryOne } = require('../../database');

function uid(prefix) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

/** Carte (`maps`). */
async function createMap({ id = uid('map'), label = 'Carte de test', sortOrder = 99 } = {}) {
  await execute(
    'INSERT INTO maps (id, label, map_image_url, sort_order, is_active) VALUES (?, ?, ?, ?, 1)',
    [id, label, '/maps/map-foret.svg', sortOrder],
  );
  return { id, label };
}

/** Zone polygonale (points en % de l'image). */
async function createZone({
  id = uid('zone'),
  mapId = 'foret',
  name = 'Zone de test',
  emoji = '🌿',
  points = [
    { xp: 10, yp: 10 },
    { xp: 30, yp: 10 },
    { xp: 30, yp: 30 },
    { xp: 10, yp: 30 },
  ],
  color = '#86efac90',
  description = '',
  hiddenSurfaces = [],
  searchAliases = null,
} = {}) {
  await execute(
    `INSERT INTO zones (id, map_id, name, emoji, x, y, width, height, current_plant, stage, special, shape, points, color, description, hidden_surfaces, search_aliases)
     VALUES (?, ?, ?, ?, 0, 0, 0, 0, '', 'growing', 0, 'rect', ?, ?, ?, ?, ?)`,
    [
      id,
      mapId,
      name,
      emoji,
      JSON.stringify(points),
      color,
      description,
      [].concat(hiddenSurfaces).join(','),
      searchAliases,
    ],
  );
  return { id, map_id: mapId, name, emoji, points };
}

/** Repère ponctuel. */
async function createMarker({
  id = uid('marker'),
  mapId = 'foret',
  label = 'Repère de test',
  emoji = '📍',
  xPct = 50,
  yPct = 50,
  note = '',
  hiddenSurfaces = [],
  searchAliases = null,
} = {}) {
  await execute(
    `INSERT INTO map_markers (id, map_id, x_pct, y_pct, label, plant_name, note, emoji, hidden_surfaces, search_aliases)
     VALUES (?, ?, ?, ?, ?, '', ?, ?, ?, ?)`,
    [id, mapId, xPct, yPct, label, note, emoji, [].concat(hiddenSurfaces).join(','), searchAliases],
  );
  return { id, map_id: mapId, label, emoji, x_pct: xPct, y_pct: yPct };
}

/** Catégorie de lieu (globale par défaut), éventuellement posée sur des zones / repères. */
async function createLocationCategory({
  id = uid('cat'),
  mapId = null,
  label = 'Catégorie de test',
  emoji = '🏷️',
  color = '#86efac90',
  appliesTo = 'both',
  isInfrastructure = false,
  sortOrder = 0,
  surfaces = ['map', 'visit', 'plan'],
  zoneIds = [],
  markerIds = [],
} = {}) {
  const slug = id;
  await execute(
    `INSERT INTO location_categories (id, map_id, slug, label, emoji, color, description, applies_to, is_infrastructure, sort_order, is_active, surfaces)
     VALUES (?, ?, ?, ?, ?, ?, '', ?, ?, ?, 1, ?)`,
    [
      id,
      mapId,
      slug,
      label,
      emoji,
      color,
      appliesTo,
      isInfrastructure ? 1 : 0,
      sortOrder,
      [].concat(surfaces).join(','),
    ],
  );
  for (const zoneId of zoneIds) {
    await execute('INSERT IGNORE INTO zone_categories (zone_id, category_id) VALUES (?, ?)', [
      zoneId,
      id,
    ]);
  }
  for (const markerId of markerIds) {
    await execute('INSERT IGNORE INTO marker_categories (marker_id, category_id) VALUES (?, ?)', [
      markerId,
      id,
    ]);
  }
  return { id, map_id: mapId, label, emoji, color, applies_to: appliesTo };
}

/** Plante du catalogue biodiversité (identifiant numérique auto-incrémenté). */
async function createPlant({ name = uid('Plante'), emoji = '🌱', description = '' } = {}) {
  const result = await execute('INSERT INTO plants (name, emoji, description) VALUES (?, ?, ?)', [
    name,
    emoji,
    description,
  ]);
  const row = await queryOne('SELECT id, name, emoji FROM plants WHERE id = ?', [result.insertId]);
  return row;
}

module.exports = {
  uid,
  createMap,
  createZone,
  createMarker,
  createLocationCategory,
  createPlant,
};
