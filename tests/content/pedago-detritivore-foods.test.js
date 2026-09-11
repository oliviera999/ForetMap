'use strict';

require('../helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert');
const { initSchema, queryAll, queryOne } = require('../../database');

const LIVING_SPECIES = [
  'Moustique commun',
  'Coccinelle à sept points',
  'Syrphe ceinturé',
  'Rhizobium',
  'Champignons de litière',
  'Ortie dioïque',
  'Pissenlit',
  'Collembole',
  'Escargot petit-gris',
];

const FOOD_RESOURCES = [
  'Litière de feuilles',
  'Compost et épluchures',
  'Bois mort',
  'Biofilm',
  'Fruits et légumes tombés',
  'Carton de lombricompost',
  'Crottes et fientes',
];

const DETRITIVORES = [
  'Cloporte',
  'Ver de lombricompost',
  'Vers de terre',
  'Planorbe',
  'Limnée',
  'Fourmi',
  'Blatte germanique',
  'Collembole',
];

before(async () => {
  await initSchema();
});

test('fiches espèces et nourritures pédagogiques sont présentes', async () => {
  const rows = await queryAll(
    `SELECT name FROM plants WHERE name IN (${[...LIVING_SPECIES, ...FOOD_RESOURCES].map(() => '?').join(',')})`,
    [...LIVING_SPECIES, ...FOOD_RESOURCES],
  );
  const names = new Set(rows.map((row) => row.name));
  for (const name of [...LIVING_SPECIES, ...FOOD_RESOURCES]) {
    assert.ok(names.has(name), `fiche absente : ${name}`);
  }
});

test('les nourritures-nœuds ne portent pas de rôle trophique d’organisme', async () => {
  const rows = await queryAll(
    `SELECT name, trophic_role FROM plants WHERE name IN (${FOOD_RESOURCES.map(() => '?').join(',')})`,
    FOOD_RESOURCES,
  );
  assert.strictEqual(rows.length, FOOD_RESOURCES.length);
  for (const row of rows) {
    assert.strictEqual(
      row.trophic_role,
      null,
      `${row.name} ne doit pas être un producteur/consommateur/décomposeur`,
    );
  }
});

test('gambusie et détritivores du seed n’ont plus de flèche vers le vide', async () => {
  const dangling = await queryAll(
    `SELECT f.name AS from_name, si.interaction_type
       FROM species_interactions si
       JOIN plants f ON f.id = si.from_plant_id
      WHERE si.to_plant_id IS NULL
        AND f.name IN ('Gambusie', 'Cloporte', 'Ver de lombricompost', 'Vers de terre')`,
  );
  assert.deepStrictEqual(dangling, []);
});

test('chaque détritivore connu a au moins une nourriture nommée', async () => {
  const present = await queryAll(
    `SELECT name FROM plants WHERE name IN (${DETRITIVORES.map(() => '?').join(',')})`,
    DETRITIVORES,
  );
  const presentNames = new Set(present.map((row) => row.name));
  for (const name of DETRITIVORES) {
    if (!presentNames.has(name)) continue;
    const row = await queryOne(
      `SELECT COUNT(*) AS n
         FROM species_interactions si
         JOIN plants f ON f.id = si.from_plant_id
         JOIN plants t ON t.id = si.to_plant_id
        WHERE f.name = ? AND si.interaction_type = 'decomposition'`,
      [name],
    );
    assert.ok(Number(row.n) >= 1, `${name} sans nourriture de décomposition`);
  }
});

test('exemples de nourritures couvrent litière, compost, bois, biofilm et carton', async () => {
  const rows = await queryAll(
    `SELECT t.name AS food, COUNT(*) AS n
       FROM species_interactions si
       JOIN plants t ON t.id = si.to_plant_id
      WHERE si.interaction_type = 'decomposition'
        AND t.name IN (${FOOD_RESOURCES.map(() => '?').join(',')})
      GROUP BY t.name`,
    FOOD_RESOURCES,
  );
  const byFood = Object.fromEntries(rows.map((row) => [row.food, Number(row.n)]));
  for (const food of [
    'Litière de feuilles',
    'Compost et épluchures',
    'Bois mort',
    'Biofilm',
    'Carton de lombricompost',
  ]) {
    assert.ok(Number(byFood[food]) >= 1, `aucune flèche vers ${food}`);
  }
});

test('auxiliaires et Rhizobium sont reliés aux fiches déjà présentes', async () => {
  const pair = async (fromName, toName, type) =>
    queryOne(
      `SELECT COUNT(*) AS n
         FROM species_interactions si
         JOIN plants f ON f.id = si.from_plant_id
         JOIN plants t ON t.id = si.to_plant_id
        WHERE f.name = ? AND t.name = ? AND si.interaction_type = ?`,
      [fromName, toName, type],
    );

  const needed = [
    ['Gambusie', 'Moustique commun', 'predation'],
    ['Coccinelle à sept points', 'Puceron', 'predation'],
    ['Syrphe ceinturé', 'Puceron', 'predation'],
    ['Rhizobium', 'Haricot', 'symbiose'],
  ];
  for (const [fromName, toName, type] of needed) {
    const fromOk = await queryOne('SELECT id FROM plants WHERE name = ?', [fromName]);
    const toOk = await queryOne('SELECT id FROM plants WHERE name = ?', [toName]);
    if (!fromOk || !toOk) continue;
    const row = await pair(fromName, toName, type);
    assert.ok(Number(row.n) >= 1, `liaison manquante ${fromName} → ${toName} (${type})`);
  }
});
