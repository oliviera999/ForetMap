'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert');
const {
  TOXICITY_LEVEL_VALUES,
  HAZARD_EXPOSURE_VALUES,
  normalizeToxicityLevel,
  normalizeHazardExposure,
  listHazardExposures,
  toxicityLevelLabel,
  hazardExposureLabel,
  hasHazard,
  toxicityRank,
} = require('../lib/plantHazard');
const { syncNormalizedAndLegacyPlantFields } = require('../lib/plantPayloadSync');
const { PLANT_HAZARD_FIELDS } = require('../lib/plantsRouteHelpers');

/**
 * Danger des fiches espèces (migration 246).
 *
 * L'enjeu de la normalisation n'est pas cosmétique : `hazard_exposure` alimente un SET SQL,
 * qui rejette toute valeur hors liste. Une valeur non canonique laissée passer ferait
 * échouer l'enregistrement de la fiche, pas seulement l'affichage.
 */

describe('normalizeToxicityLevel', () => {
  test('accepte les valeurs canoniques', () => {
    for (const value of TOXICITY_LEVEL_VALUES) {
      assert.strictEqual(normalizeToxicityLevel(value), value);
    }
  });

  test('accepte accents, casse et alias d’import', () => {
    assert.strictEqual(normalizeToxicityLevel('Toxique'), 'toxique');
    assert.strictEqual(normalizeToxicityLevel('MORTELLE'), 'mortel');
    assert.strictEqual(normalizeToxicityLevel('létal'), 'mortel');
    assert.strictEqual(normalizeToxicityLevel('irritant'), 'irritation');
    assert.strictEqual(normalizeToxicityLevel('urticant'), 'irritation');
    assert.strictEqual(normalizeToxicityLevel('sans danger'), 'aucune');
    assert.strictEqual(normalizeToxicityLevel('non toxique'), 'aucune');
  });

  test('rend null sur une valeur inconnue ou vide', () => {
    assert.strictEqual(normalizeToxicityLevel('peut-être'), null);
    assert.strictEqual(normalizeToxicityLevel(''), null);
    assert.strictEqual(normalizeToxicityLevel(null), null);
    assert.strictEqual(normalizeToxicityLevel(undefined), null);
  });
});

describe('normalizeHazardExposure', () => {
  test('accepte une liste séparée par virgules, points-virgules ou barres', () => {
    assert.strictEqual(normalizeHazardExposure('ingestion,contact'), 'ingestion,contact');
    assert.strictEqual(normalizeHazardExposure('ingestion; contact'), 'ingestion,contact');
    assert.strictEqual(normalizeHazardExposure('ingestion | contact'), 'ingestion,contact');
  });

  test('accepte un tableau', () => {
    assert.strictEqual(normalizeHazardExposure(['latex', 'peau']), 'contact,seve_latex');
  });

  test('réimpose l’ordre canonique — deux saisies équivalentes donnent la même chaîne', () => {
    assert.strictEqual(
      normalizeHazardExposure('seve_latex,contact'),
      normalizeHazardExposure('contact,seve_latex'),
    );
    assert.strictEqual(normalizeHazardExposure('seve_latex,contact'), 'contact,seve_latex');
  });

  test('écrase les doublons', () => {
    assert.strictEqual(normalizeHazardExposure('contact, peau, cutané'), 'contact');
  });

  test('ignore les valeurs inconnues sans perdre les valeurs valides', () => {
    assert.strictEqual(normalizeHazardExposure('ingestion, télépathie'), 'ingestion');
  });

  test('rend null quand rien n’est reconnu', () => {
    assert.strictEqual(normalizeHazardExposure('n’importe quoi'), null);
    assert.strictEqual(normalizeHazardExposure(''), null);
    assert.strictEqual(normalizeHazardExposure(null), null);
  });

  test('toutes les valeurs canoniques passent la normalisation', () => {
    for (const value of HAZARD_EXPOSURE_VALUES) {
      assert.strictEqual(normalizeHazardExposure(value), value, `voie perdue : ${value}`);
    }
  });
});

describe('listHazardExposures et libellés', () => {
  test('listHazardExposures rend un tableau ordonné', () => {
    assert.deepStrictEqual(listHazardExposures('seve_latex,ingestion'), [
      'ingestion',
      'seve_latex',
    ]);
    assert.deepStrictEqual(listHazardExposures(null), []);
  });

  test('chaque valeur canonique a un libellé non vide', () => {
    for (const value of TOXICITY_LEVEL_VALUES) {
      assert.ok(toxicityLevelLabel(value), `libellé manquant : ${value}`);
    }
    for (const value of HAZARD_EXPOSURE_VALUES) {
      assert.ok(hazardExposureLabel(value), `libellé manquant : ${value}`);
    }
  });
});

describe('hasHazard — critère d’affichage de l’encadré', () => {
  test('« aucune » n’est pas un danger : vérifié et sans danger', () => {
    assert.strictEqual(hasHazard({ toxicity_level: 'aucune' }), false);
  });

  test('une fiche non renseignée n’affiche rien', () => {
    assert.strictEqual(hasHazard({}), false);
    assert.strictEqual(hasHazard({ toxicity_level: null }), false);
  });

  test('les trois niveaux de danger déclenchent l’encadré', () => {
    for (const level of ['irritation', 'toxique', 'mortel']) {
      assert.strictEqual(hasHazard({ toxicity_level: level }), true);
    }
  });

  test('hazard_reviewed ne conditionne pas l’affichage', () => {
    assert.strictEqual(hasHazard({ toxicity_level: 'mortel', hazard_reviewed: 0 }), true);
  });
});

describe('toxicityRank', () => {
  test('ordonne par gravité croissante, « aucune » à 0', () => {
    assert.strictEqual(toxicityRank('aucune'), 0);
    assert.ok(toxicityRank('irritation') < toxicityRank('toxique'));
    assert.ok(toxicityRank('toxique') < toxicityRank('mortel'));
  });

  test('rend -1 pour une fiche non renseignée', () => {
    assert.strictEqual(toxicityRank(null), -1);
  });
});

describe('intégration au payload plante', () => {
  test('le payload est normalisé avant écriture', () => {
    const payload = {
      toxicity_level: 'Irritant',
      hazard_exposure: 'Peau ; latex',
      hazard_reviewed: 'oui',
    };
    syncNormalizedAndLegacyPlantFields(payload);
    assert.strictEqual(payload.toxicity_level, 'irritation');
    assert.strictEqual(payload.hazard_exposure, 'contact,seve_latex');
    assert.strictEqual(payload.hazard_reviewed, 1);
  });

  test('une gravité non reconnue est écrite à null, jamais telle quelle', () => {
    const payload = { toxicity_level: 'un peu dangereux', hazard_exposure: 'par la pensée' };
    syncNormalizedAndLegacyPlantFields(payload);
    assert.strictEqual(payload.toxicity_level, null);
    assert.strictEqual(payload.hazard_exposure, null);
  });

  test('hazard_reviewed retombe à 0 et jamais à null (colonne NOT NULL)', () => {
    const payload = {};
    syncNormalizedAndLegacyPlantFields(payload);
    assert.strictEqual(payload.hazard_reviewed, 0);
  });

  test('les quatre colonnes sont dans la whitelist des champs plante', () => {
    assert.deepStrictEqual(PLANT_HAZARD_FIELDS, [
      'toxicity_level',
      'hazard_exposure',
      'hazard_notes',
      'hazard_reviewed',
    ]);
  });
});
