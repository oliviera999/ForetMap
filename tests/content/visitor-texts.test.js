'use strict';

require('../helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert');
const { initSchema, queryAll } = require('../../database');
const { scanVisitorTextCorpus } = require('../../lib/visitorTextCorpus');
const { findVisitorTextIncitations } = require('../../lib/visitorTextGuard');

/**
 * Règle permanente : **aucun texte affiché aux visiteurs n'invite à cueillir, goûter ou
 * manipuler un être vivant** (audit du 25/09/2026, § 1.4.8).
 *
 * Test de contenu (job CI `contenu`) : il porte sur les textes semés par les migrations. Les
 * contenus saisis en production se contrôlent avec `npm run audit:visitor-texts`. Seules les
 * **incitations** font échouer le test ; les zones grises (information de consommation,
 * manipulation décrite) sont listées par le script d'audit, pas bloquées.
 */

before(async () => {
  await initSchema();
});

test('le détecteur reconnaît une incitation et ignore les gestes d’écran et les négations', () => {
  assert.equal(findVisitorTextIncitations('Cueillez les fraises mûres !').length, 1);
  assert.equal(findVisitorTextIncitations('Tu peux goûter une feuille.').length, 1);
  assert.equal(findVisitorTextIncitations('Touche une zone pour ouvrir sa fiche.').length, 0);
  assert.equal(findVisitorTextIncitations('Ne pas toucher les chenilles.').length, 0);
  assert.equal(findVisitorTextIncitations('L’oiseau mange des graines.').length, 0);
});

test('aucun texte visiteur semé n’invite à cueillir, goûter ou manipuler un être vivant', async () => {
  const hits = await scanVisitorTextCorpus({ queryAll });
  const incitations = hits
    .filter((hit) => hit.cls === 'incitation' && !hit.excepted)
    .map((hit) => `${hit.table}#${hit.id}.${hit.column} — « ${hit.extract} »`);
  assert.deepStrictEqual(incitations, []);
});
