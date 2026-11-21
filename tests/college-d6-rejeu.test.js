'use strict';

// Chantier collège (novembre 2026), flux D6 : mécanique de rejeu de la migration
// « college_especes_phares » (patron `tests/learning-links-migration-300.test.js`).
// Fiches et présences semées sous leurs clés naturelles ; rejeu deux fois ; gardes contre
// l'écrasement d'une saisie faite dans l'application. Tests BDD partagée : exécution séquentielle.

require('./helpers/setup');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { initSchema, execute, queryOne, queryAll, splitSqlStatements } = require('../database');
const { loadData } = require('../scripts/college-2026-11/check-d6-donnees');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');
const MIGRATION = path.join(
  MIGRATIONS_DIR,
  fs.readdirSync(MIGRATIONS_DIR).find((f) => /^\d+_college_especes_phares\.sql$/.test(f)),
);

const data = loadData();
const descOf = (name) => data.descriptions.especes.find((d) => d.name === name);
const stamp = Date.now().toString(36);
const TEMOIN = `Espèce témoin D6 ${stamp}`;
const TEXTE_APPLI = 'Texte saisi dans l’application, à conserver.';

/** Fiches semées : carte, nom ; `preset` = description déjà saisie dans l'application. */
const SEMIS = [
  { map: 'foret', name: 'Pourpier' },
  { map: 'foret', name: 'Basilic' },
  { map: 'n3', name: 'Drosophile' },
  { map: 'foret', name: 'Moineau domestique', preset: TEXTE_APPLI },
];

const createdPlants = [];
const createdPresences = [];
const restoreDescriptions = [];
let temoinId = 0;

async function runMigration() {
  const sql = fs.readFileSync(MIGRATION, 'utf8');
  for (const stmt of splitSqlStatements(sql)) await execute(stmt);
}

async function plantIdFor(entry) {
  const d = descOf(entry.name);
  const found = await queryOne(
    'SELECT id, description_college FROM plants WHERE name = ? AND scientific_name <=> ?',
    [d.name, d.scientific_name],
  );
  if (found) {
    restoreDescriptions.push({ id: found.id, value: found.description_college });
    return found.id;
  }
  const { insertId } = await execute(
    'INSERT INTO plants (name, emoji, description, scientific_name) VALUES (?, ?, ?, ?)',
    [d.name, '🌱', 'rejeu D6', d.scientific_name],
  );
  createdPlants.push(insertId);
  return insertId;
}

before(async () => {
  await initSchema();
  for (const entry of SEMIS) {
    entry.id = await plantIdFor(entry);
    await execute('UPDATE plants SET description_college = ? WHERE id = ?', [
      entry.preset ?? null,
      entry.id,
    ]);
    const present = await queryOne(
      'SELECT 1 AS ok FROM map_species WHERE map_id = ? AND plant_id = ?',
      [entry.map, entry.id],
    );
    if (!present) {
      await execute(
        "INSERT INTO map_species (map_id, plant_id, validation_status) VALUES (?, ?, 'attendu')",
        [entry.map, entry.id],
      );
      createdPresences.push([entry.map, entry.id]);
    } else {
      await execute('UPDATE map_species SET is_featured = 0 WHERE map_id = ? AND plant_id = ?', [
        entry.map,
        entry.id,
      ]);
    }
  }
  temoinId = (
    await execute('INSERT INTO plants (name, emoji, description) VALUES (?, ?, ?)', [
      TEMOIN,
      '🌱',
      'rejeu D6',
    ])
  ).insertId;
  createdPlants.push(temoinId);
  await execute(
    "INSERT INTO map_species (map_id, plant_id, validation_status) VALUES ('foret', ?, 'attendu')",
    [temoinId],
  );
});

after(async () => {
  for (const [map, id] of createdPresences) {
    await execute('DELETE FROM map_species WHERE map_id = ? AND plant_id = ?', [map, id]);
  }
  for (const id of createdPlants) await execute('DELETE FROM plants WHERE id = ?', [id]);
  for (const { id, value } of restoreDescriptions) {
    await execute('UPDATE plants SET description_college = ? WHERE id = ?', [value, id]);
  }
});

async function snapshotState() {
  const ids = [...SEMIS.map((e) => e.id), temoinId];
  return queryAll(
    `SELECT ms.map_id, ms.plant_id, ms.is_featured, p.description_college
       FROM map_species ms JOIN plants p ON p.id = ms.plant_id
      WHERE ms.plant_id IN (${ids.map(() => '?').join(',')})
      ORDER BY ms.map_id, ms.plant_id`,
    ids,
  );
}

test('D6 rejeu : espèces phares marquées et descriptions posées sous clé naturelle', async () => {
  await runMigration();
  for (const entry of SEMIS) {
    const row = await queryOne(
      `SELECT ms.is_featured, p.description_college
         FROM map_species ms JOIN plants p ON p.id = ms.plant_id
        WHERE ms.map_id = ? AND ms.plant_id = ?`,
      [entry.map, entry.id],
    );
    assert.equal(Number(row.is_featured), 1, entry.name);
    const attendu = entry.preset ?? descOf(entry.name).description_college;
    assert.equal(row.description_college, attendu, entry.name);
  }
});

test('D6 rejeu : une saisie de l’application n’est jamais écrasée', async () => {
  const row = await queryOne('SELECT description_college FROM plants WHERE id = ?', [
    SEMIS.find((e) => e.preset).id,
  ]);
  assert.equal(row.description_college, TEXTE_APPLI);
});

test('D6 rejeu : une espèce hors liste reste non phare et sans description', async () => {
  const row = await queryOne(
    `SELECT ms.is_featured, p.description_college
       FROM map_species ms JOIN plants p ON p.id = ms.plant_id
      WHERE ms.map_id = 'foret' AND ms.plant_id = ?`,
    [temoinId],
  );
  assert.equal(Number(row.is_featured), 0);
  assert.equal(row.description_college, null);
});

test('D6 rejeu : seconde exécution sans erreur ni changement', async () => {
  const before1 = await snapshotState();
  await runMigration();
  assert.deepEqual(await snapshotState(), before1);
});

test('D6 rejeu : une marque posée par l’application est conservée au rejeu', async () => {
  // La garde porte sur l'écriture (0 → 1) : la migration ne repasse jamais une valeur posée
  // à 1 par l'application, et ne met jamais une présence à 0.
  const pourpier = SEMIS.find((e) => e.name === 'Pourpier');
  await execute('UPDATE map_species SET is_featured = 1 WHERE map_id = ? AND plant_id = ?', [
    'foret',
    temoinId,
  ]);
  await runMigration();
  const temoin = await queryOne(
    'SELECT is_featured FROM map_species WHERE map_id = ? AND plant_id = ?',
    ['foret', temoinId],
  );
  assert.equal(Number(temoin.is_featured), 1, 'une marque posée par l’application est conservée');
  const p = await queryOne(
    'SELECT is_featured FROM map_species WHERE map_id = ? AND plant_id = ?',
    ['foret', pourpier.id],
  );
  assert.equal(Number(p.is_featured), 1);
});
