'use strict';

require('./helpers/setup');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  PLANT_EXTRA_FIELDS,
  PLANT_COLUMNS,
  buildPlantPayload,
  mapImportRowToPlantShape,
  validateImportPayloadRow,
} = require('../lib/plantsRouteHelpers');

const DETERMINATION_FIELDS = [
  'identification_criteria',
  'lookalike_species',
  'identification_period',
];

describe('fiches espèces — section « Détermination » (helpers purs, sans DB)', () => {
  it('les trois champs sont des colonnes de la fiche, donc écrites par INSERT/UPDATE', () => {
    for (const field of DETERMINATION_FIELDS) {
      assert.ok(PLANT_EXTRA_FIELDS.includes(field), `${field} dans PLANT_EXTRA_FIELDS`);
      assert.ok(PLANT_COLUMNS.includes(field), `${field} dans PLANT_COLUMNS`);
    }
  });

  it('buildPlantPayload : les valeurs sont conservées et détourées', () => {
    const payload = buildPlantPayload({
      name: 'Sureau noir',
      identification_criteria: '  Tige à moelle blanche, fleurs en corymbe plat.  ',
      lookalike_species: 'Sureau yèble : herbacé, toxique.',
      identification_period: 'Floraison en juin',
    });
    assert.equal(payload.identification_criteria, 'Tige à moelle blanche, fleurs en corymbe plat.');
    assert.equal(payload.lookalike_species, 'Sureau yèble : herbacé, toxique.');
    assert.equal(payload.identification_period, 'Floraison en juin');
  });

  it('buildPlantPayload : champs absents → null, jamais de undefined en base', () => {
    const payload = buildPlantPayload({ name: 'Cloporte commun' });
    for (const field of DETERMINATION_FIELDS) {
      assert.equal(payload[field], null, `${field} vaut null quand il est absent`);
    }
  });

  it('buildPlantPayload : le fallback préserve la valeur existante lors d’une mise à jour partielle', () => {
    const existing = {
      name: 'Amanite',
      identification_criteria: 'Volve à la base du pied.',
      lookalike_species: 'Ne pas confondre avec les agarics.',
      identification_period: 'Automne',
    };
    const payload = buildPlantPayload({ name: 'Amanite' }, existing);
    assert.equal(payload.identification_criteria, 'Volve à la base du pied.');
    assert.equal(payload.lookalike_species, 'Ne pas confondre avec les agarics.');
    assert.equal(payload.identification_period, 'Automne');
  });

  it('import en masse : en-têtes français et clés canoniques reconnus', () => {
    const mapped = mapImportRowToPlantShape({
      Nom: 'Lombric commun',
      'Critères de détermination': 'Clitellum vers le tiers avant, corps cylindrique.',
      'Confusions possibles': 'Ver de compost Eisenia : plus petit, annelé de rouge.',
      'Période observation': 'Après la pluie',
    });
    assert.equal(mapped.name, 'Lombric commun');
    assert.equal(
      mapped.identification_criteria,
      'Clitellum vers le tiers avant, corps cylindrique.',
    );
    assert.equal(mapped.lookalike_species, 'Ver de compost Eisenia : plus petit, annelé de rouge.');
    assert.equal(mapped.identification_period, 'Après la pluie');

    const canonical = mapImportRowToPlantShape({
      name: 'Carabe',
      identification_criteria: 'Élytres striés, course rapide au sol.',
      lookalike_species: 'Staphylin : abdomen long et découvert.',
      identification_period: 'Nuit, sous une planche',
    });
    assert.equal(canonical.identification_criteria, 'Élytres striés, course rapide au sol.');
    assert.equal(canonical.lookalike_species, 'Staphylin : abdomen long et découvert.');
    assert.equal(canonical.identification_period, 'Nuit, sous une planche');
  });

  it('import en masse : une ligne valide porte la détermination jusqu’au payload', () => {
    const { payload, error } = validateImportPayloadRow(
      {
        nom: 'Plantain lancéolé',
        confusions: 'Feuilles de jeune digitale : duveteuses, toxiques.',
      },
      2,
    );
    assert.equal(error, undefined);
    assert.equal(payload.name, 'Plantain lancéolé');
    assert.equal(payload.lookalike_species, 'Feuilles de jeune digitale : duveteuses, toxiques.');
  });
});
