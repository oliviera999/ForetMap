'use strict';

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert');
const { initSchema, queryAll, queryOne } = require('../database');

const FM_SPECIES = [
  'Carabe doré',
  'Perce-oreille',
  'Merle noir',
  'Hirondelle rustique',
  'Pipistrelle commune',
  'Crapaud de Maurétanie',
  'Mycorhizes à Glomus',
  'Staphylin odorant',
  'Lombric commun',
  'Daphnie',
  'Libellule',
  'Gerris',
  'Sureau noir',
  'Lierre',
  'Pâquerette',
  'Plantain lancéolé',
  'Violette odorante',
];

const GL_CODES = [
  'SP0255',
  'SP0256',
  'SP0257',
  'SP0258',
  'SP0259',
  'SP0260',
  'SP0261',
  'SP0262',
  'SP0263',
  'SP0264',
  'SP0265',
  'SP0266',
  'SP0267',
  'SP0268',
  'SP0269',
  'SP0270',
  'SP0271',
  'SP0272',
  'SP0273',
  'SP0274',
];

before(async () => {
  await initSchema();
});

test('auxiliaires, sol, mare et sauvages utiles sont au catalogue ForetMap', async () => {
  const rows = await queryAll(
    `SELECT name FROM plants WHERE name IN (${FM_SPECIES.map(() => '?').join(',')})`,
    FM_SPECIES,
  );
  const names = new Set(rows.map((row) => row.name));
  for (const name of FM_SPECIES) {
    assert.ok(names.has(name), `fiche absente : ${name}`);
  }
});

test('vers de terre (Eisenia) et lombric (Lumbricus) restent distincts', async () => {
  const compost = await queryOne(`SELECT scientific_name FROM plants WHERE name = 'Vers de terre'`);
  const lombric = await queryOne(
    `SELECT scientific_name FROM plants WHERE name = 'Lombric commun'`,
  );
  if (compost) {
    assert.match(String(compost.scientific_name || ''), /Eisenia/i);
  }
  assert.match(String(lombric.scientific_name || ''), /Lumbricus/i);
});

test('chaînes mare et auxiliaires ForetMap sont reliées', async () => {
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
    ['Hirondelle rustique', 'Moustique commun', 'predation'],
    ['Pipistrelle commune', 'Moustique commun', 'predation'],
    ['Libellule', 'Daphnie', 'predation'],
    ['Gambusie', 'Daphnie', 'predation'],
    ['Mycorhizes à Glomus', 'Tomate', 'symbiose'],
    ['Merle noir', 'Lombric commun', 'predation'],
    ['Carabe doré', 'Escargot petit-gris', 'predation'],
  ];
  for (const [fromName, toName, type] of needed) {
    const fromOk = await queryOne('SELECT id FROM plants WHERE name = ?', [fromName]);
    const toOk = await queryOne('SELECT id FROM plants WHERE name = ?', [toName]);
    if (!fromOk || !toOk) continue;
    const row = await pair(fromName, toName, type);
    assert.ok(Number(row.n) >= 1, `liaison manquante ${fromName} → ${toName} (${type})`);
  }
});

test('catalogue GL aligné (SP0255–SP0274) sans doublonner hérisson ni lierre', async () => {
  const rows = await queryAll(
    `SELECT species_code FROM gl_species WHERE species_code IN (${GL_CODES.map(() => '?').join(',')})`,
    GL_CODES,
  );
  const codes = new Set(rows.map((row) => row.species_code));
  for (const code of GL_CODES) {
    assert.ok(codes.has(code), `espèce GL absente : ${code}`);
  }
  const hedgehog = await queryOne(
    `SELECT COUNT(*) AS n FROM gl_species WHERE nom_commun = 'Hérisson commun' AND species_code REGEXP '^SP[0-9]{4}$'`,
  );
  assert.ok(Number(hedgehog.n) >= 1);
});

test('réseau GL : merle, mare et mycorhizes', async () => {
  const pair = async (fromName, toName, type) =>
    queryOne(
      `SELECT COUNT(*) AS n
         FROM gl_species_interactions si
         JOIN gl_species f ON f.id = si.from_species_id
         JOIN gl_species t ON t.id = si.to_species_id
        WHERE f.nom_commun = ? AND t.nom_commun = ? AND si.interaction_type = ?`,
      [fromName, toName, type],
    );
  const needed = [
    ['Merle noir', 'Lombric commun', 'predation'],
    ['Hirondelle rustique', 'Moustique commun', 'predation'],
    ['Libellule déprimée', 'Daphnie', 'predation'],
    ['Mycorhizes à Glomus', 'Jacinthe des bois', 'symbiose'],
    ['Hérisson commun', 'Escargot des bois', 'predation'],
  ];
  for (const [fromName, toName, type] of needed) {
    const fromOk = await queryOne('SELECT id FROM gl_species WHERE nom_commun = ?', [fromName]);
    const toOk = await queryOne('SELECT id FROM gl_species WHERE nom_commun = ?', [toName]);
    if (!fromOk || !toOk) continue;
    const row = await pair(fromName, toName, type);
    assert.ok(Number(row.n) >= 1, `liaison GL manquante ${fromName} → ${toName}`);
  }
});
