'use strict';

// Helpers purs séances pédagogiques (sans BDD).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  TEMPLATE_KEYS,
  TEMPLATE_DEFAULT_TITLES,
  TEMPLATE_LEVELS,
  collectStepReferences,
  defaultConfigForTemplate,
  sessionDeepLink,
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

  const cfg = normalizeConfig({ plantIds: ['x', 7, 7, 8, 9, 10, 11, 12, 13] });
  assert.deepEqual(cfg.plantIds, [7, 8, 9, 10, 11, 12]);
});

test('templates lycée C/D, séance libre et nouvelles actions', () => {
  for (const key of ['lycee_arbre', 'lycee_classer', 'custom']) {
    assert.ok(TEMPLATE_KEYS.has(key), key);
    assert.equal(validateSteps(stepsForTemplate(key)).ok, true, key);
    assert.ok(TEMPLATE_DEFAULT_TITLES[key]);
  }
  assert.equal(TEMPLATE_LEVELS.lycee_arbre, 'lycee');
  assert.equal(TEMPLATE_LEVELS.lycee_classer, 'lycee');
  assert.equal(defaultConfigForTemplate('lycee_arbre').notionNiveau, 'lycee');

  const c = resolveSteps(stepsForTemplate('lycee_arbre'), { individualId: 5, mapId: 'foret' });
  const ind = c.filter((s) => s.action.type === 'open_individual');
  assert.equal(ind.length, 2);
  assert.equal(ind[0].action.payload.individualId, 5);
  assert.equal(ind[0].action.payload.mapId, 'foret');

  const d = resolveSteps(stepsForTemplate('lycee_classer'), { plantIds: [1, 2, 3, 4, 5, 6] });
  const nested = d.find((s) => s.action.type === 'open_nested_groups');
  assert.deepEqual(nested.action.payload.plantIds, [1, 2, 3, 4, 5, 6]);

  assert.equal(validateAction({ type: 'open_map_route' }).ok, true);
  const route = resolveSteps(
    [{ id: 'r', title: 'R', action: { type: 'open_map_route', payload: { routeSlug: 'tour' } } }],
    { mapRouteSlug: 'autre' },
    { payloadFirst: true },
  );
  assert.equal(
    route[0].action.payload.routeSlug,
    'tour',
    'séance libre : la cible de l’étape prime',
  );
  const templ = resolveSteps(
    [{ id: 'r', title: 'R', action: { type: 'open_map_route', payload: { routeSlug: 'tour' } } }],
    { mapRouteSlug: 'autre' },
  );
  assert.equal(templ[0].action.payload.routeSlug, 'autre', 'modèle : la config du prof prime');

  const cfg = normalizeConfig({ individualId: '9', mapRouteSlug: ' t ', requiresSessionId: 'x' });
  assert.equal(cfg.individualId, 9);
  assert.equal(cfg.mapRouteSlug, 't');
  assert.equal(cfg.requiresSessionId, 'x');
});

test('collectStepReferences et sessionDeepLink', () => {
  const refs = collectStepReferences([
    { action: { type: 'open_plant', payload: { plantId: 3 } } },
    { action: { type: 'open_nested_groups', payload: { plantIds: [3, 4] } } },
    { action: { type: 'open_individual', payload: { individualId: 8 } } },
    { action: { type: 'open_map_route', payload: { routeSlug: 'tour' } } },
    { action: { type: 'open_id_key', payload: { keyIdOrSlug: 'arbres' } } },
    { action: { type: 'message', payload: {} } },
  ]);
  assert.deepEqual(refs.plantIds.sort(), [3, 4]);
  assert.deepEqual(refs.individualIds, [8]);
  assert.deepEqual(refs.routeSlugs, ['tour']);
  assert.deepEqual(refs.keyRefs, ['arbres']);

  assert.equal(
    sessionDeepLink('https://foret.example/', 'lycee-classer'),
    'https://foret.example/?seance=lycee-classer',
  );
});

test('rewards : règles pures et catalogue', () => {
  const { sessionRewardKeysFor, describeReward, REWARD_CATALOGUE } = require('../lib/rewards');
  assert.deepEqual(sessionRewardKeysFor({ completionCount: 1, distinctCompleted: 1 }), [
    'session_first',
  ]);
  assert.deepEqual(
    sessionRewardKeysFor({ completionCount: 2, distinctCompleted: 3, level: 'lycee' }),
    ['session_first', 'session_three', 'session_replay', 'session_lycee'],
  );
  assert.deepEqual(sessionRewardKeysFor({}), []);
  assert.equal(describeReward('inconnu'), null);
  const first = describeReward('session_first', '2026-09-01T08:00:00Z');
  assert.equal(first.awardedAt, '2026-09-01T08:00:00.000Z');
  assert.ok(REWARD_CATALOGUE.every((r) => r.key && r.title && r.emoji));
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
