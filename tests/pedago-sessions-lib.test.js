'use strict';

// Helpers purs séances pédagogiques (sans BDD).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  validateAction,
  validateSteps,
  resolveSteps,
  normalizeConfig,
  stepsForTemplate,
} = require('../lib/pedagoSessions');

test('helpers : action.type et résolution config → étapes', () => {
  assert.equal(validateAction({ type: 'message' }).ok, true);
  assert.equal(validateAction({ type: 'open_id_key' }).ok, true);
  assert.equal(validateAction({ type: 'nope' }).ok, false);

  const steps = stepsForTemplate('college_reconaitre');
  const check = validateSteps(steps);
  assert.equal(check.ok, true);
  assert.ok(check.steps.length >= 4);

  const resolved = resolveSteps(check.steps, {
    keyIdOrSlug: 'arbres-demo',
    plantId: 42,
    notionNiveau: 'cycle3',
  });
  const keyStep = resolved.find((s) => s.action.type === 'open_id_key');
  assert.equal(keyStep.action.payload.keyIdOrSlug, 'arbres-demo');
  const plantStep = resolved.find((s) => s.action.type === 'open_plant');
  assert.equal(plantStep.action.payload.plantId, 42);

  const bSteps = validateSteps(stepsForTemplate('college_qui_mange'));
  assert.equal(bSteps.ok, true);
  const withPlants = resolveSteps(bSteps.steps, { plantIds: [1, 2, 3], mapId: 'map-a' });
  const plantActions = withPlants.filter((s) => s.action.type === 'open_plant');
  assert.equal(plantActions[0].action.payload.plantId, 1);
  assert.equal(plantActions[1].action.payload.plantId, 2);
  assert.equal(plantActions[2].action.payload.plantId, 3);
  const fw = withPlants.find((s) => s.action.type === 'open_foodweb');
  assert.equal(fw.action.payload.mapId, 'map-a');

  const cfg = normalizeConfig({ plantIds: ['x', 7, 7, 8, 9, 10] });
  assert.deepEqual(cfg.plantIds, [7, 8, 9]);
});
