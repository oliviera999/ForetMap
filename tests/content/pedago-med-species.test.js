'use strict';

require('../helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert');
const { initSchema, queryAll, queryOne } = require('../../database');

const MED_SPECIES = [
  'Figuier de Barbarie',
  'Volubilis',
  'Figuier commun',
  'Olivier',
  'Caroubier',
  'Arganier',
  'Citronnier',
  'Palmier-dattier',
  'Artichaut',
  'Pois chiche',
  'Fenugrec',
  'Lavande',
  'Bougainvillier',
  'Jasmin',
  'Capucine',
  'Souci officinal',
  'Fenouil',
  'Verveine odorante',
  'Câprier',
  'Cochenille de la figue de Barbarie',
  'Hérisson d’Algérie',
  'Tarente de Maurétanie',
  'Chrysope verte',
  'Cigale',
  'Criquet marocain',
  'Tillandsia',
];

before(async () => {
  await initSchema();
});

test('fiches méditerranéennes, marocaines et de potager sont présentes', async () => {
  const rows = await queryAll(
    `SELECT name FROM plants WHERE name IN (${MED_SPECIES.map(() => '?').join(',')})`,
    MED_SPECIES,
  );
  const names = new Set(rows.map((row) => row.name));
  for (const name of MED_SPECIES) {
    assert.ok(names.has(name), `fiche absente : ${name}`);
  }
});

test('tillandsia est trouvable par son nom usuel', async () => {
  const plant = await queryOne(
    `SELECT id, name FROM plants WHERE name IN ('Tillandsia', 'Tillandsia aérienne') ORDER BY name LIMIT 1`,
  );
  assert.ok(plant, 'aucune fiche Tillandsia');
  const alias = await queryOne(
    `SELECT alias FROM plant_name_aliases WHERE alias IN ('Tillandsia', 'Fille des airs') AND plant_id IN (
       SELECT id FROM plants WHERE name IN ('Tillandsia', 'Tillandsia aérienne')
     ) LIMIT 1`,
  );
  assert.ok(alias, 'aucun alias tillandsia');
});

test('figuier de Barbarie n’est pas confondu avec l’oponce ornementale', async () => {
  const rows = await queryAll(
    `SELECT name, scientific_name FROM plants WHERE name IN ('Figuier de Barbarie', 'Oponce')`,
  );
  const byName = Object.fromEntries(rows.map((row) => [row.name, row.scientific_name]));
  if (byName.Oponce) {
    assert.notStrictEqual(byName['Figuier de Barbarie'], byName.Oponce);
  }
  assert.match(String(byName['Figuier de Barbarie'] || ''), /ficus-indica/i);
});

test('réseau : cochenille du nopal, auxiliaires et légumineuses locales', async () => {
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
    ['Cochenille de la figue de Barbarie', 'Figuier de Barbarie', 'herbivorie'],
    ['Abeille', 'Volubilis', 'pollinisation'],
    ['Abeille', 'Lavande', 'pollinisation'],
    ['Rhizobium', 'Pois chiche', 'symbiose'],
    ['Rhizobium', 'Fenugrec', 'symbiose'],
    ['Chrysope verte', 'Puceron', 'predation'],
    ['Hérisson d’Algérie', 'Escargot petit-gris', 'predation'],
    ['Tarente de Maurétanie', 'Moustique commun', 'predation'],
    ['Cigale', 'Olivier', 'herbivorie'],
    ['Mante religieuse africaine', 'Criquet marocain', 'predation'],
  ];
  for (const [fromName, toName, type] of needed) {
    const fromOk = await queryOne('SELECT id FROM plants WHERE name = ?', [fromName]);
    const toOk = await queryOne('SELECT id FROM plants WHERE name = ?', [toName]);
    if (!fromOk || !toOk) continue;
    const row = await pair(fromName, toName, type);
    assert.ok(Number(row.n) >= 1, `liaison manquante ${fromName} → ${toName} (${type})`);
  }
});
