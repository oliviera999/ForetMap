'use strict';

// O7 — vérifie SANS DB que le schéma zod du corps de POST /task-projects (création) reproduit
// exactement l'ancienne validation manuelle : normalisation permissive de tous les champs, puis
// vérification des champs requis dans l'ordre map_id → title → status, avec les mêmes messages
// d'erreur et un statut 400 via lib/validate. Les contrôles dépendant de la base restent dans le
// handler et ne sont donc pas couverts ici.
const test = require('node:test');
const assert = require('node:assert');
const { validate } = require('../lib/validate');
const { createProjectBodySchema } = require('../routes/task-projects');

function run(body) {
  const req = { body };
  const res = {
    statusCode: 200,
    payload: undefined,
    status(c) {
      this.statusCode = c;
      return this;
    },
    json(p) {
      this.payload = p;
      return this;
    },
  };
  let nextCalled = false;
  validate({ body: createProjectBodySchema })(req, res, () => {
    nextCalled = true;
  });
  return {
    nextCalled,
    status: res.statusCode,
    error: res.payload && res.payload.error,
    body: req.body,
  };
}

test('corps valide : normalise les champs et appelle next', () => {
  const { nextCalled, status, body } = run({
    map_id: '  map-1  ',
    title: '  Mon projet  ',
    description: '  desc  ',
    status: 'on_hold',
    zone_ids: ['z1', ' z1 ', '', 'z2', null],
    marker_ids: ['m1', 'm1'],
    tutorial_ids: ['3', 3, 0, -1, 'abc', 5],
  });
  assert.strictEqual(nextCalled, true);
  assert.strictEqual(status, 200);
  assert.deepStrictEqual(body, {
    map_id: 'map-1',
    title: 'Mon projet',
    description: 'desc',
    status: 'on_hold',
    zone_ids: ['z1', 'z2'],
    marker_ids: ['m1'],
    tutorial_ids: [3, 5],
  });
});

test('status par défaut sur active quand absent ; alias en_attente -> on_hold', () => {
  const a = run({ map_id: 'm', title: 't' });
  assert.strictEqual(a.nextCalled, true);
  assert.strictEqual(a.body.status, 'active');
  assert.strictEqual(a.body.description, null);
  assert.deepStrictEqual(a.body.zone_ids, []);
  assert.deepStrictEqual(a.body.marker_ids, []);
  assert.deepStrictEqual(a.body.tutorial_ids, []);

  for (const raw of ['en_attente', 'en attente', 'attente', '  EN_ATTENTE ']) {
    assert.strictEqual(run({ map_id: 'm', title: 't', status: raw }).body.status, 'on_hold');
  }
});

test('map_id manquant -> 400 "Carte requise" (priorité la plus haute)', () => {
  const r = run({ title: '', status: 'nope' });
  assert.strictEqual(r.nextCalled, false);
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.error, 'Carte requise');
});

test('title manquant -> 400 "Titre requis" quand map_id présent', () => {
  const r = run({ map_id: 'm', title: '   ', status: 'nope' });
  assert.strictEqual(r.nextCalled, false);
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.error, 'Titre requis');
});

test('status invalide -> 400 "Statut projet invalide" quand map_id+title présents', () => {
  const r = run({ map_id: 'm', title: 't', status: 'completed' });
  assert.strictEqual(r.nextCalled, false);
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.error, 'Statut projet invalide');
});
