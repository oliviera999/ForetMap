'use strict';

/**
 * Chantier collège (flux C3) : une étape « réseau trophique » peut montrer une liste
 * d'espèces (`plantIds`, liens mutuels), en plus de `highlightPlantId`, dont la forme ne
 * change pas. Validation partagée (`lib/shared/pedagoStepActions.js`).
 */

require('./helpers/setup');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute, queryAll } = require('../database');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');
const {
  PEDAGO_STEP_ACTION: A,
  PEDAGO_STEP_ACTION_PAYLOAD_FIELDS,
  FOODWEB_STEP_MAX_PLANT_IDS,
  validateStepActionPayload,
} = require('../lib/shared/pedagoStepActions');
const { validateSteps, resolveSteps, collectStepReferences } = require('../lib/pedagoSessions');

const stamp = Date.now();
let token = '';
let createdId = '';
const auth = () => ({ Authorization: `Bearer ${token}` });

before(async () => {
  await initSchema();
  token = await ensureAdminTeacherAuthToken();
});

after(async () => {
  if (createdId) {
    await execute('DELETE FROM pedago_sessions WHERE id = ?', [createdId]).catch(() => {});
  }
});

test('plantIds est un champ documenté de l’étape réseau trophique', () => {
  assert.deepEqual(
    [...PEDAGO_STEP_ACTION_PAYLOAD_FIELDS[A.OPEN_FOODWEB]],
    ['mapId', 'highlightPlantId', 'plantIds'],
  );
});

test('validateStepActionPayload : normalise, refuse l’invalide, ne touche pas aux autres actions', () => {
  assert.deepEqual(validateStepActionPayload(A.OPEN_FOODWEB, { plantIds: [3, '4', 3] }), {
    ok: true,
    payload: { plantIds: [3, 4] },
  });
  // Liste vide : retirée (forme inchangée).
  assert.deepEqual(validateStepActionPayload(A.OPEN_FOODWEB, { mapId: 'foret', plantIds: [] }), {
    ok: true,
    payload: { mapId: 'foret' },
  });
  assert.equal(validateStepActionPayload(A.OPEN_FOODWEB, { plantIds: '3,4' }).ok, false);
  assert.equal(validateStepActionPayload(A.OPEN_FOODWEB, { plantIds: [0] }).ok, false);
  assert.equal(validateStepActionPayload(A.OPEN_FOODWEB, { plantIds: ['x'] }).ok, false);
  const many = Array.from({ length: FOODWEB_STEP_MAX_PLANT_IDS + 1 }, (_, i) => i + 1);
  assert.match(validateStepActionPayload(A.OPEN_FOODWEB, { plantIds: many }).error, /au plus/);
  // Autre action : rien n'est contrôlé ici (`open_nested_groups` normalise à sa façon).
  assert.deepEqual(validateStepActionPayload(A.OPEN_NESTED_GROUPS, { plantIds: 'x' }), {
    ok: true,
    payload: { plantIds: 'x' },
  });
});

test('validateSteps / resolveSteps : plantIds gardé, highlightPlantId inchangé', () => {
  const bad = validateSteps([
    { title: 'Réseau', action: { type: A.OPEN_FOODWEB, payload: { plantIds: [-1] } } },
  ]);
  assert.equal(bad.ok, false);
  assert.match(bad.error, /étape 1 : plantIds/);

  const ok = validateSteps([
    {
      title: 'Réseau',
      action: { type: A.OPEN_FOODWEB, payload: { highlightPlantId: 5, plantIds: [5, 6] } },
    },
    { title: 'Réseau seul', action: { type: A.OPEN_FOODWEB, payload: { highlightPlantId: 7 } } },
  ]);
  assert.equal(ok.ok, true);
  const resolved = resolveSteps(ok.steps, {}, { payloadFirst: true });
  assert.deepEqual(resolved[0].action.payload.plantIds, [5, 6]);
  assert.equal(resolved[0].action.payload.highlightPlantId, 5);
  assert.equal('plantIds' in resolved[1].action.payload, false);
  assert.deepEqual(collectStepReferences(resolved).plantIds.sort(), [5, 6, 7]);
});

test('API : séance libre avec plantIds ; liste invalide refusée (400)', async () => {
  const plants = await queryAll('SELECT id FROM plants ORDER BY id LIMIT 3');
  assert.ok(plants.length >= 2, 'jeu de démonstration : au moins deux espèces');
  const ids = plants.map((p) => Number(p.id));

  const refused = await request(app)
    .post('/api/pedago-sessions')
    .set(auth())
    .send({
      templateKey: 'custom',
      slug: `c3-plantids-ko-${stamp}`,
      steps: [{ title: 'Réseau', action: { type: A.OPEN_FOODWEB, payload: { plantIds: 'x' } } }],
    })
    .expect(400);
  assert.match(refused.body.error, /plantIds/);

  const created = await request(app)
    .post('/api/pedago-sessions')
    .set(auth())
    .send({
      templateKey: 'custom',
      slug: `c3-plantids-${stamp}`,
      steps: [
        {
          title: 'Qui mange qui',
          action: { type: A.OPEN_FOODWEB, payload: { plantIds: ids, highlightPlantId: ids[0] } },
        },
      ],
    })
    .expect(201);
  createdId = created.body.id;
  const payload = created.body.steps[0].action.payload;
  assert.deepEqual(payload.plantIds, ids);
  assert.equal(payload.highlightPlantId, ids[0]);
});
