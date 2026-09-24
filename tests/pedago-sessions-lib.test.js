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

test('runs : serializeRunRow et summarizeRunStats (agrégats anonymes)', () => {
  const { serializeRunRow, summarizeRunStats } = require('../lib/pedagoSessionRuns');
  assert.equal(serializeRunRow(null), null);
  const run = serializeRunRow({
    session_id: 's1',
    user_id: 'u1',
    start_count: 2,
    completion_count: 0,
    first_started_at: '2026-09-01T08:00:00Z',
    last_started_at: '2026-09-02T08:00:00Z',
    first_completed_at: null,
    last_completed_at: null,
  });
  assert.equal(run.sessionId, 's1');
  assert.equal(run.startCount, 2);
  assert.equal(run.completed, false);
  assert.equal(run.lastCompletedAt, null);
  assert.equal(run.firstStartedAt, '2026-09-01T08:00:00.000Z');
  assert.equal(Object.hasOwn(run, 'userId'), false);

  const stats = summarizeRunStats([
    { session_id: 's1', user_id: 'u1', start_count: 1, completion_count: 0 },
    {
      session_id: 's1',
      user_id: 'u2',
      start_count: 1,
      completion_count: 2,
      last_completed_at: '2026-09-03T10:00:00Z',
    },
    {
      session_id: 's1',
      user_id: 'u3',
      start_count: 0,
      completion_count: 1,
      last_completed_at: '2026-09-04T10:00:00Z',
    },
    { session_id: 's2', user_id: 'u1', start_count: 0, completion_count: 0 },
    { session_id: null },
  ]);
  const s1 = stats.find((s) => s.sessionId === 's1');
  assert.deepEqual(s1, {
    sessionId: 's1',
    startedUsers: 3,
    completedUsers: 2,
    lastCompletedAt: '2026-09-04T10:00:00.000Z',
  });
  const s2 = stats.find((s) => s.sessionId === 's2');
  assert.equal(s2.startedUsers, 0);
  assert.equal(s2.completedUsers, 0);
  assert.deepEqual(summarizeRunStats(null), []);
});
