'use strict';

/**
 * Chantier collège du 22/11/2026, lot 3 : une étape « réseau trophique » peut imposer son
 * cadrage (`preset` : alimentaire | relations | all). Validation partagée
 * (`lib/shared/pedagoStepActions.js`) et parité avec les cadrages du graphe (le schéma MCP est
 * vérifié par `mcp-pedago-sessions-foodweb-plantids.test.js`).
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const {
  PEDAGO_STEP_ACTION: A,
  FOODWEB_STEP_PRESETS,
  validateStepActionPayload,
} = require('../lib/shared/pedagoStepActions');
const { validateSteps } = require('../lib/pedagoSessions');

test('preset : valeurs admises, vide retiré, inconnu refusé', () => {
  for (const preset of FOODWEB_STEP_PRESETS) {
    assert.deepEqual(validateStepActionPayload(A.OPEN_FOODWEB, { preset: ` ${preset} ` }), {
      ok: true,
      payload: { preset },
    });
  }
  assert.deepEqual(validateStepActionPayload(A.OPEN_FOODWEB, { mapId: 'n3', preset: '' }), {
    ok: true,
    payload: { mapId: 'n3' },
  });
  const bad = validateStepActionPayload(A.OPEN_FOODWEB, { preset: 'chaine' });
  assert.equal(bad.ok, false);
  assert.match(bad.error, /preset : cadrage inconnu/);
  // Avec plantIds : les deux champs sont contrôlés.
  assert.deepEqual(
    validateStepActionPayload(A.OPEN_FOODWEB, { preset: 'relations', plantIds: [6, '6'] }),
    { ok: true, payload: { preset: 'relations', plantIds: [6] } },
  );
  // Autre action : `preset` n'est pas contrôlé.
  assert.equal(validateStepActionPayload(A.OPEN_PLANT, { preset: 'x' }).ok, true);
});

test('validateSteps refuse un preset inconnu, nomme l’étape', () => {
  const res = validateSteps([
    { title: 'Réseau', action: { type: A.OPEN_FOODWEB, payload: { preset: 'tout' } } },
  ]);
  assert.equal(res.ok, false);
  assert.match(res.error, /étape 1 : preset/);
});

test('parité : mêmes clés que les cadrages du graphe (GRAPH_PRESETS)', async () => {
  const model = await import(
    pathToFileURL(path.join(__dirname, '..', 'src', 'components', 'pedago', 'foodWebGraphModel.js'))
      .href
  );
  assert.deepEqual([...FOODWEB_STEP_PRESETS].sort(), Object.keys(model.GRAPH_PRESETS).sort());
});
