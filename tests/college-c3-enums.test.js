'use strict';

/**
 * Chantier collège (flux C3) : types d'interaction du collège et libellés en verbe.
 * Décisions 1 et 8 du 21/11/2026 : frugivorie et granivorie montrées à tout le collège ;
 * symbiose et compétition au cycle 4 seulement (sous-ensemble défini par le socle).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const {
  INTERACTION_TYPE_ENUM,
  COLLEGE_INTERACTION_TYPE_ENUM,
  CYCLE4_ONLY_INTERACTION_TYPE_ENUM,
  interactionTypeLabelSimple,
} = require('../lib/shared/biodivEnums');

test('le collège voit la frugivorie et la granivorie', () => {
  assert.ok(COLLEGE_INTERACTION_TYPE_ENUM.values.includes('frugivorie'));
  assert.ok(COLLEGE_INTERACTION_TYPE_ENUM.values.includes('granivorie'));
  assert.equal(COLLEGE_INTERACTION_TYPE_ENUM.subsetOf, 'INTERACTION_TYPE_ENUM');
  for (const type of CYCLE4_ONLY_INTERACTION_TYPE_ENUM.values) {
    assert.ok(COLLEGE_INTERACTION_TYPE_ENUM.values.includes(type), type);
  }
});

test('un libellé en verbe par type du collège, ni plus ni moins', () => {
  const { labelsSimple, values } = COLLEGE_INTERACTION_TYPE_ENUM;
  assert.ok(Object.isFrozen(COLLEGE_INTERACTION_TYPE_ENUM));
  assert.ok(Object.isFrozen(labelsSimple));
  assert.deepEqual(Object.keys(labelsSimple).sort(), [...values].sort());
  for (const [type, label] of Object.entries(labelsSimple)) {
    assert.match(label, /^[a-zàâçéèêëîïôûùüÿœ’ ]+$/, `${type} : minuscules, sans emoji ni chiffre`);
    assert.notEqual(
      label.toLowerCase(),
      INTERACTION_TYPE_ENUM.labels[type].toLowerCase(),
      `${type} : le verbe n'est pas le mot savant`,
    );
  }
  assert.equal(labelsSimple.herbivorie, 'mange des plantes');
  assert.equal(labelsSimple.predation, 'mange des animaux');
  assert.equal(labelsSimple.frugivorie, 'mange des fruits');
  assert.equal(labelsSimple.granivorie, 'mange des graines');
});

test('interactionTypeLabelSimple : verbe puis mot savant, replis', () => {
  assert.equal(interactionTypeLabelSimple('frugivorie'), 'mange des fruits (frugivorie)');
  assert.equal(interactionTypeLabelSimple(' Predation '), 'mange des animaux (prédation)');
  assert.equal(
    interactionTypeLabelSimple('herbivorie', { withScientific: false }),
    'mange des plantes',
  );
  // Hors collège : le libellé savant ; inconnu : le repli.
  assert.equal(interactionTypeLabelSimple('mutualisme'), 'Mutualisme');
  assert.equal(interactionTypeLabelSimple('bidon', { fallback: 'Interaction' }), 'Interaction');
  assert.equal(interactionTypeLabelSimple(''), '');
});

test('miroir ESM identique', async () => {
  const esm = await import(
    pathToFileURL(path.join(__dirname, '..', 'src', 'shared', 'enums', 'biodivEnums.js')).href
  );
  assert.deepEqual(
    [...esm.COLLEGE_INTERACTION_TYPE_ENUM.values],
    [...COLLEGE_INTERACTION_TYPE_ENUM.values],
  );
  assert.deepEqual(
    { ...esm.COLLEGE_INTERACTION_TYPE_ENUM.labelsSimple },
    { ...COLLEGE_INTERACTION_TYPE_ENUM.labelsSimple },
  );
  assert.equal(esm.interactionTypeLabelSimple('granivorie'), 'mange des graines (granivorie)');
});
