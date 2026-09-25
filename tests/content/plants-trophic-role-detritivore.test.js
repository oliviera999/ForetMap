'use strict';

// Rôle trophique du corpus après la migration 295 (valeur `detritivore`).
//
// Un animal ne minéralise pas la matière morte : il la fragmente. Le classer
// « décomposeur » faisait perdre un niveau à tous ses prédateurs dans le réseau
// trophique (l'étourneau qui mange des lombrics s'affichait consommateur primaire).
// Ce test tombe si une migration de contenu réintroduit un animal « décomposeur ».

require('../helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { initSchema, queryAll, queryOne } = require('../../database');

before(async () => {
  await initSchema();
});

test('aucun animal n’est classé décomposeur', async () => {
  const rows = await queryAll(
    `SELECT name FROM plants
      WHERE trophic_role = 'decomposeur' AND taxon_kingdom LIKE 'Anim%'
      ORDER BY name`,
  );
  assert.deepEqual(
    rows.map((row) => row.name),
    [],
    'animaux encore « décomposeur » (à reclasser en « detritivore »)',
  );
});

test('les détritivores semés par les migrations sont bien détritivores', async () => {
  // Fiches créées par les migrations 223 (Collembole) et 225 (Lombric commun) : présentes
  // sur toute base, neuve comme de production. Leur absence est une erreur, pas un saut.
  for (const name of ['Collembole', 'Lombric commun']) {
    const row = await queryOne('SELECT trophic_role FROM plants WHERE name = ?', [name]);
    assert.ok(row, `fiche absente : ${name}`);
    assert.equal(row.trophic_role, 'detritivore', `${name} doit être détritivore`);
  }
});

test('les champignons décomposeurs restent décomposeurs', async () => {
  const row = await queryOne('SELECT trophic_role FROM plants WHERE name = ?', [
    'Champignons de litière',
  ]);
  assert.ok(row, 'fiche absente : Champignons de litière');
  assert.equal(row.trophic_role, 'decomposeur');
});
