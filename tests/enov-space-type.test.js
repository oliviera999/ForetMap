'use strict';

// Type d'espace e-nov (migration 323) : normalisation serveur, et miroir front
// (`src/shared/enov/enovSpaceTypes.js`) identique à la liste serveur — la légende du plan
// annoté imprimable et le sélecteur des fiches lisent la copie front.

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const { ENOV_SPACE_TYPES, normalizeEnovSpaceType } = require('../lib/enovPlan');

test('normalizeEnovSpaceType : identifiant connu, sinon null', () => {
  assert.equal(normalizeEnovSpaceType('exterieur'), 'exterieur');
  assert.equal(normalizeEnovSpaceType('  Sportif '), 'sportif');
  assert.equal(normalizeEnovSpaceType('vie-scolaire'), 'vie-scolaire');
  assert.equal(normalizeEnovSpaceType(''), null);
  assert.equal(normalizeEnovSpaceType(null), null);
  assert.equal(normalizeEnovSpaceType(undefined), null);
  assert.equal(normalizeEnovSpaceType('piscine'), null);
});

test('types d’espace : identifiants courts (colonne VARCHAR(24)), uniques', () => {
  const ids = ENOV_SPACE_TYPES.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.ok(id.length <= 24, id);
  // Les types que cite le cahier des charges du label (domaine 1, niveau 3).
  for (const id of ['exterieur', 'pedagogique', 'administratif', 'sportif', 'restauration']) {
    assert.ok(ids.includes(id), id);
  }
});

test('miroir front identique à la liste serveur (même ordre, mêmes libellés)', async () => {
  const front = await import(
    pathToFileURL(path.join(__dirname, '..', 'src', 'shared', 'enov', 'enovSpaceTypes.js')).href
  );
  assert.deepEqual(
    front.ENOV_SPACE_TYPES.map((t) => ({ ...t })),
    ENOV_SPACE_TYPES.map((t) => ({ ...t })),
  );
});
