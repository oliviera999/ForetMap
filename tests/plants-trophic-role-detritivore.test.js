'use strict';

// Rôle trophique `detritivore` (migration 295).
//
// Ce que ce fichier protège :
// - l'ENUM `plants.trophic_role` porte bien la nouvelle valeur, et les deux listes du code
//   (lib/plantTrophicRole.js côté serveur, src/utils/plantTrophicRole.js côté interface)
//   restent alignées sur lui — une valeur ajoutée d'un seul côté serait soit refusée à
//   l'enregistrement (→ null, sans erreur visible), soit affichée brute ;
// - la migration reclasse un animal « décomposeur » en détritivore, et seulement lui :
//   bactéries et champignons restent décomposeurs ;
// - la vue `v_food_web`, et donc `GET /api/food-web`, remonte la valeur telle quelle sans
//   avoir été recréée.

require('./helpers/setup');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const request = require('supertest');

const { initSchema, execute, queryOne, splitSqlStatements } = require('../database');
const { app } = require('../server');
const { TROPHIC_ROLE_VALUES, normalizeTrophicRole } = require('../lib/plantTrophicRole');
const { syncNormalizedAndLegacyPlantFields } = require('../lib/plantPayloadSync');
const { buildPlantPayload } = require('../lib/plantsRouteHelpers');

const MIGRATION = path.join(
  __dirname,
  '..',
  'migrations',
  '295_plants_trophic_role_detritivore.sql',
);

const stamp = Date.now();
const createdPlantIds = [];
const createdInteractionIds = [];

async function insertPlant(name, kingdom, role) {
  const res = await execute(
    'INSERT INTO plants (name, emoji, taxon_kingdom, trophic_role) VALUES (?, ?, ?, ?)',
    [name, '🧪', kingdom, role],
  );
  createdPlantIds.push(res.insertId);
  return res.insertId;
}

async function replayMigration() {
  const sql = fs.readFileSync(MIGRATION, 'utf8');
  for (const stmt of splitSqlStatements(sql)) {
    await execute(stmt);
  }
}

async function roleOf(id) {
  const row = await queryOne('SELECT trophic_role FROM plants WHERE id = ?', [id]);
  return row.trophic_role;
}

before(async () => {
  await initSchema();
});

after(async () => {
  for (const id of createdInteractionIds) {
    await execute('DELETE FROM species_interactions WHERE id = ?', [id]);
  }
  for (const id of createdPlantIds) {
    await execute('DELETE FROM plants WHERE id = ?', [id]);
  }
});

test('l’ENUM plants.trophic_role porte detritivore, aligné sur les deux listes du code', async () => {
  const row = await queryOne(
    `SELECT COLUMN_TYPE AS type, IS_NULLABLE AS nullable, COLUMN_DEFAULT AS dflt
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'plants' AND COLUMN_NAME = 'trophic_role'`,
  );
  assert.equal(row.type, "enum('producteur','consommateur','detritivore','decomposeur')");
  // Définition reprise à l'identique : nullable, sans défaut.
  assert.equal(row.nullable, 'YES');
  assert.ok(row.dflt == null || row.dflt === 'NULL');

  const enumValues = [...row.type.matchAll(/'([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual([...TROPHIC_ROLE_VALUES], enumValues);

  const esm = await import(
    pathToFileURL(path.join(__dirname, '..', 'src', 'utils', 'plantTrophicRole.js')).href
  );
  assert.deepEqual([...esm.TROPHIC_ROLE_VALUES], enumValues);
  for (const role of enumValues) {
    assert.ok(esm.TROPHIC_ROLE_LABELS[role], `libellé manquant : ${role}`);
  }
  assert.equal(esm.TROPHIC_ROLE_LABELS.detritivore, 'Détritivore');
});

test('la migration reclasse un animal décomposeur, pas une bactérie ni un champignon', async () => {
  const animal = await insertPlant(`Ver test ${stamp}`, 'Animal (Métazoaires)', 'decomposeur');
  const fungus = await insertPlant(`Moisissure test ${stamp}`, 'Champignon (Fungi)', 'decomposeur');
  const bacterium = await insertPlant(
    `Bactérie test ${stamp}`,
    'Bactérie (Eubactéries)',
    'decomposeur',
  );
  const predator = await insertPlant(`Merle test ${stamp}`, 'Animal (Métazoaires)', 'consommateur');

  await replayMigration();

  assert.equal(await roleOf(animal), 'detritivore');
  assert.equal(await roleOf(fungus), 'decomposeur');
  assert.equal(await roleOf(bacterium), 'decomposeur');
  assert.equal(await roleOf(predator), 'consommateur');

  // Idempotente : un second passage ne change rien et ne lève pas.
  await replayMigration();
  assert.equal(await roleOf(animal), 'detritivore');
  assert.equal(await roleOf(fungus), 'decomposeur');
});

test('v_food_web et GET /api/food-web remontent le rôle detritivore sans recréer la vue', async () => {
  const worm = await insertPlant(`Lombric test ${stamp}`, 'Animal (Métazoaires)', 'detritivore');
  const bird = await insertPlant(`Étourneau test ${stamp}`, 'Animal (Métazoaires)', 'consommateur');
  const res = await execute(
    `INSERT INTO species_interactions (from_plant_id, to_plant_id, interaction_type, description)
     VALUES (?, ?, 'predation', ?)`,
    [bird, worm, 'Test détritivore'],
  );
  createdInteractionIds.push(res.insertId);

  const viewRow = await queryOne('SELECT from_role, to_role FROM v_food_web WHERE id = ?', [
    res.insertId,
  ]);
  assert.equal(viewRow.from_role, 'consommateur');
  assert.equal(viewRow.to_role, 'detritivore');

  const api = await request(app).get('/api/food-web').expect(200);
  const item = api.body.items.find((row) => Number(row.id) === Number(res.insertId));
  assert.ok(item, 'interaction absente de GET /api/food-web');
  assert.equal(item.to_role, 'detritivore');
});

test('l’enregistrement d’une fiche accepte detritivore, accents et casse compris', () => {
  assert.equal(normalizeTrophicRole('detritivore'), 'detritivore');
  assert.equal(normalizeTrophicRole(' Détritivore '), 'detritivore');
  assert.equal(normalizeTrophicRole('Décomposeur'), 'decomposeur');
  assert.equal(normalizeTrophicRole('omnivore'), null);

  assert.equal(
    syncNormalizedAndLegacyPlantFields({ trophic_role: 'Détritivore' }).trophic_role,
    'detritivore',
  );
  // Hors liste → null, comme avant la migration.
  assert.equal(syncNormalizedAndLegacyPlantFields({ trophic_role: 'omnivore' }).trophic_role, null);
  assert.equal(
    buildPlantPayload({ name: 'Cloporte', trophic_role: 'detritivore' }).trophic_role,
    'detritivore',
  );
});
