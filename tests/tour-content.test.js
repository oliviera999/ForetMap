'use strict';

/**
 * Surcharges éditoriales des visites guidées (`content.tour.registry`).
 *
 * Deux propriétés comptent ici et sont vérifiées de bout en bout : une saisie
 * malformée n'entre pas en base, et une surcharge ne peut pas toucher la structure
 * d'un parcours — c'est ce qui autorise à déléguer le droit à un prof.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { join } = require('node:path');
const { pathToFileURL } = require('node:url');

const {
  normalizeTourRegistry,
  tourRegistrySchema,
  MAX_TEXT_LENGTH,
  MAX_ENTRIES,
} = require('../lib/tourContent');
const { PERMISSIONS, ROLE_PERMISSION_MATRIX } = require('../lib/rbac');

const tourUrl = pathToFileURL(join(__dirname, '../src/constants/discoveryTour.js')).href;

test('normalizeTourRegistry écarte les clés malformées', () => {
  const normalized = normalizeTourRegistry({
    'map.intro.body': 'Texte valide',
    'map.intro.target': '.selecteur-injecte',
    'map.intro': 'clé incomplète',
    'map.intro.body.extra': 'clé trop profonde',
    "map.intro.body'; DROP": 'clé exotique',
    42: 'clé numérique',
  });
  assert.deepEqual(normalized, { 'map.intro.body': 'Texte valide' });
});

test('normalizeTourRegistry traite le vide comme un retour au défaut', () => {
  const normalized = normalizeTourRegistry({
    'map.intro.body': '   ',
    'map.intro.title': '',
    'map.sheet.body': '  Texte rogné  ',
    'map.switch.body': null,
  });
  assert.deepEqual(normalized, { 'map.sheet.body': 'Texte rogné' });
});

test('normalizeTourRegistry supporte les entrées non exploitables', () => {
  assert.deepEqual(normalizeTourRegistry(null), {});
  assert.deepEqual(normalizeTourRegistry('texte'), {});
  assert.deepEqual(normalizeTourRegistry(['map.intro.body']), {});
});

test('le schéma refuse un texte trop long et un registre trop gros', () => {
  assert.ok(tourRegistrySchema.safeParse({ 'map.intro.body': 'ok' }).success);
  assert.ok(
    !tourRegistrySchema.safeParse({ 'map.intro.body': 'x'.repeat(MAX_TEXT_LENGTH + 1) }).success,
  );
  assert.ok(!tourRegistrySchema.safeParse({ 'map.intro.placement': 'top' }).success);

  const tooMany = {};
  for (let i = 0; i <= MAX_ENTRIES; i += 1) tooMany[`tour${i}.intro.body`] = 'x';
  assert.ok(!tourRegistrySchema.safeParse(tooMany).success);
});

test('la permission tours.manage est cataloguée et réservée à l’admin par défaut', () => {
  const keys = PERMISSIONS.map(([key]) => key);
  assert.ok(keys.includes('tours.manage'), 'permission absente du catalogue');
  assert.ok(ROLE_PERMISSION_MATRIX.admin.includes('tours.manage'));
  // Délégable, mais pas donnée d'office : c'est un choix de l'établissement.
  assert.ok(!ROLE_PERMISSION_MATRIX.prof.includes('tours.manage'));
});

test('applyTourOverrides remplace les textes sans toucher la structure', async () => {
  const { DISCOVERY_TOURS, getDiscoverySteps } = await import(tourUrl);
  const before = DISCOVERY_TOURS.map.steps[0];
  const steps = getDiscoverySteps('map', false, {
    'map.intro.body': 'Texte réécrit par le prof.',
    'map.intro.target': '.cible-injectee',
    'map.intro.placement': 'top',
    'map.intro.expression': 'content',
  });
  assert.equal(steps[0].body, 'Texte réécrit par le prof.');
  assert.equal(steps[0].target, before.target, 'la cible a été surchargée');
  assert.equal(steps[0].placement, before.placement, 'le placement a été surchargé');
  assert.equal(steps[0].expression, before.expression, 'l’expression a été surchargée');
  assert.equal(steps.length, DISCOVERY_TOURS.map.steps.length, 'une étape a disparu');
});

test('applyTourOverrides ne mute pas les étapes d’origine', async () => {
  const { DISCOVERY_TOURS, getDiscoverySteps } = await import(tourUrl);
  const originalBody = DISCOVERY_TOURS.map.steps[0].body;
  getDiscoverySteps('map', false, { 'map.intro.body': 'Autre texte' });
  assert.equal(DISCOVERY_TOURS.map.steps[0].body, originalBody);
});

test('l’étape de relance se surcharge une fois pour les 13 parcours', async () => {
  const { DISCOVERY_TOURS, getDiscoverySteps, SHARED_TOUR_KEY } = await import(tourUrl);
  const overrides = { [`${SHARED_TOUR_KEY}.relaunch.body`]: 'Relance réécrite.' };
  for (const tabKey of Object.keys(DISCOVERY_TOURS)) {
    const steps = getDiscoverySteps(tabKey, true, overrides);
    const relaunch = steps[steps.length - 1];
    assert.equal(relaunch.body, 'Relance réécrite.', `parcours ${tabKey} non surchargé`);
  }
  // Et la surcharge n'a pas contaminé l'objet partagé du module.
  const { RELAUNCH_STEP } = await import(tourUrl);
  assert.notEqual(RELAUNCH_STEP.body, 'Relance réécrite.');
});

test('une surcharge ne crée pas de texte n3boss là où le parcours n’en prévoit pas', async () => {
  const { getDiscoverySteps } = await import(tourUrl);
  // `map.switch` n'a pas de `bodyTeacher` : le prof ne doit pas pouvoir en inventer un
  // sans que l'étape soit prévue pour, sinon le rendu prof diverge en silence.
  const steps = getDiscoverySteps('map', true, { 'map.switch.bodyTeacher': 'Texte prof' });
  const step = steps.find((entry) => entry.key === 'switch');
  assert.equal(step.bodyTeacher, undefined);
});

test('les clés de surcharge sont uniques dans chaque parcours', async () => {
  const { DISCOVERY_TOURS, tourOverrideKey } = await import(tourUrl);
  for (const [tabKey, tour] of Object.entries(DISCOVERY_TOURS)) {
    const keys = tour.steps.map((step) => tourOverrideKey(tabKey, step, 'body'));
    assert.equal(new Set(keys).size, keys.length, `parcours ${tabKey} : clés d’étape en double`);
  }
});
