'use strict';

/**
 * Risques sanitaires (`plants.health_risk`) : une seule liste, celle du référentiel partagé
 * (`HEALTH_RISK_ENUM`). Avant le flux F7, le normaliseur serveur et le formulaire tenaient
 * chacun une copie littérale à 7 valeurs : les 7 valeurs ajoutées en prod (ornithose…) étaient
 * écartées à chaque enregistrement d'une fiche. Aucun accès à la base.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { HEALTH_RISK_ENUM, DOMESTICATION_ENUM } = require('../lib/shared/biodivEnums');
const { ID_KEY_RUN_STATUS_ENUM } = require('../lib/shared/pedagoEnums');
const healthRisk = require('../lib/plantHealthRisk');

const NEW_VALUES = [
  'ornithose',
  'mycobacteriose',
  'aspergillose',
  'toxocarose',
  'teigne',
  'echinococcose',
  'fievre_q',
];

test('référentiel : les 7 valeurs de la prod en fin de liste, libellés en français', () => {
  assert.deepEqual(HEALTH_RISK_ENUM.values.slice(-7), NEW_VALUES);
  assert.equal(HEALTH_RISK_ENUM.values.length, 14);
  assert.equal(HEALTH_RISK_ENUM.labels.fievre_q, 'Fièvre Q');
  assert.equal(HEALTH_RISK_ENUM.labels.echinococcose, 'Échinococcose');
  assert.deepEqual(
    [...DOMESTICATION_ENUM.values],
    ['sauvage', 'semi_domestique', 'domestique', 'feral'],
  );
  assert.deepEqual([...ID_KEY_RUN_STATUS_ENUM.values], ['en_cours', 'abouti', 'abandonne']);
});

test('serveur : lib/plantHealthRisk lit le référentiel (même objet, pas une copie)', () => {
  assert.equal(healthRisk.HEALTH_RISK_VALUES, HEALTH_RISK_ENUM.values);
  assert.equal(healthRisk.HEALTH_RISK_LABELS, HEALTH_RISK_ENUM.labels);
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'plantHealthRisk.js'), 'utf8');
  assert.doesNotMatch(src, /HEALTH_RISK_VALUES\s*=\s*Object\.freeze\(\[/);
});

test('serveur : une valeur de la prod n’est plus écartée à l’enregistrement', () => {
  assert.equal(healthRisk.normalizeHealthRisk('fievre_q,rage'), 'rage,fievre_q');
  assert.equal(healthRisk.normalizeHealthRisk('Fièvre Q'), 'fievre_q');
  assert.equal(
    healthRisk.normalizeHealthRisk('Échinococcose; psittacose'),
    'ornithose,echinococcose',
  );
  assert.equal(healthRisk.normalizeHealthRisk(NEW_VALUES.join(',')), NEW_VALUES.join(','));
  assert.equal(healthRisk.healthRiskLabel('teigne'), 'Teigne');
});

test('formulaire : HEALTH_RISK_OPTIONS dérivées du référentiel', async () => {
  const file = path.join(__dirname, '..', 'src', 'constants', 'plantMetaSections.js');
  const mod = await import(pathToFileURL(file).href);
  assert.deepEqual(
    mod.HEALTH_RISK_OPTIONS,
    HEALTH_RISK_ENUM.values.map((value) => ({ value, label: HEALTH_RISK_ENUM.labels[value] })),
  );
  const src = fs.readFileSync(file, 'utf8');
  assert.match(src, /HEALTH_RISK_ENUM/);
  assert.doesNotMatch(src, /\{\s*value:\s*'rage'/, 'copie littérale de la liste');
});
