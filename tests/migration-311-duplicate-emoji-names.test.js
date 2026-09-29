'use strict';

// Migration 311 : l'emoji recopié en tête du nom d'une zone ou d'un repère est retiré quand il
// est identique au champ emoji (audit étiquettes du 29/09/2026, seconde passe). Tests BDD
// partagée : exécution séquentielle. La migration est rejouée par `pool.query` (protocole
// texte), avec le découpage du runner.

require('./helpers/setup');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { initSchema, execute, queryOne, pool, splitSqlStatements } = require('../database');
const fx = require('./helpers/fmFixtures');

const MIGRATION_311 = path.join(
  __dirname,
  '..',
  'migrations',
  '311_strip_duplicate_emoji_from_names.sql',
);

async function runMigration311() {
  const sql = fs.readFileSync(MIGRATION_311, 'utf8');
  for (const stmt of splitSqlStatements(sql)) await pool.query(stmt);
}

const stamp = Date.now().toString(36);
const zones = {};
const markers = {};

async function zoneName(id) {
  return (await queryOne('SELECT name FROM zones WHERE id = ?', [id])).name;
}

async function markerLabel(id) {
  return (await queryOne('SELECT label FROM map_markers WHERE id = ?', [id])).label;
}

before(async () => {
  await initSchema();
  zones.duplicate = (await fx.createZone({ name: `🧪 Bât.S ${stamp}`, emoji: '🧪' })).id;
  // Emoji différent de celui du champ : le nom est gardé tel quel.
  zones.otherEmoji = (await fx.createZone({ name: `🌳 Verger ${stamp}`, emoji: '🧪' })).id;
  // Pas d'espace après l'emoji : ce n'est pas un préfixe recopié.
  zones.glued = (await fx.createZone({ name: `🧪Labo ${stamp}`, emoji: '🧪' })).id;
  // Emoji seul : on ne vide jamais un nom.
  zones.onlyEmoji = (await fx.createZone({ name: '🧪 ', emoji: '🧪' })).id;
  zones.noEmoji = (await fx.createZone({ name: `🧪 Serre ${stamp}`, emoji: null })).id;
  markers.duplicate = (await fx.createMarker({ label: `🌱 Menthe ${stamp}`, emoji: '🌱' })).id;
  markers.clean = (await fx.createMarker({ label: `Ruche ${stamp}`, emoji: '🐝' })).id;
});

after(async () => {
  const zoneIds = Object.values(zones);
  await execute(`DELETE FROM zones WHERE id IN (${zoneIds.map(() => '?').join(', ')})`, zoneIds);
  const markerIds = Object.values(markers);
  await execute(
    `DELETE FROM map_markers WHERE id IN (${markerIds.map(() => '?').join(', ')})`,
    markerIds,
  );
});

test('311 : l’emoji recopié en tête du nom est retiré (zones et repères)', async () => {
  await runMigration311();
  assert.equal(await zoneName(zones.duplicate), `Bât.S ${stamp}`);
  assert.equal(await markerLabel(markers.duplicate), `Menthe ${stamp}`);
});

test('311 : autre emoji, emoji collé, emoji seul ou sans emoji → nom inchangé', async () => {
  await runMigration311();
  assert.equal(await zoneName(zones.otherEmoji), `🌳 Verger ${stamp}`);
  assert.equal(await zoneName(zones.glued), `🧪Labo ${stamp}`);
  assert.equal((await zoneName(zones.onlyEmoji)).trim(), '🧪');
  assert.equal(await zoneName(zones.noEmoji), `🧪 Serre ${stamp}`);
  assert.equal(await markerLabel(markers.clean), `Ruche ${stamp}`);
});

test('311 : idempotente', async () => {
  await runMigration311();
  await runMigration311();
  assert.equal(await zoneName(zones.duplicate), `Bât.S ${stamp}`);
  assert.equal(await markerLabel(markers.duplicate), `Menthe ${stamp}`);
});
