'use strict';

// O7 — vérifie SANS DB que le schéma zod du corps de POST /groups (création) reproduit exactement
// l'ancienne validation manuelle : normalisation permissive de chaque champ (slug dérivé de
// slug||name, name trimé, description/parent_group_id via normalizeId, kind via normalizeKind), puis
// les gardes 400 dans l'ordre slug/name -> kind, avec les mêmes messages et un statut 400 via
// lib/validate. La vérification d'existence du parent (dépendante de la base) reste dans le handler
// et n'est donc pas couverte ici.
const test = require('node:test');
const assert = require('node:assert');
const { validate } = require('../lib/validate');
const { createGroupBodySchema } = require('../routes/groups');

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
  validate({ body: createGroupBodySchema })(req, res, () => {
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
    slug: '  Ma Classe!  ',
    name: '  Ma Classe  ',
    description: '  une desc  ',
    kind: '  TEAM ',
    parent_group_id: '  p-1  ',
  });
  assert.strictEqual(nextCalled, true);
  assert.strictEqual(status, 200);
  assert.deepStrictEqual(body, {
    slug: 'ma-classe',
    name: 'Ma Classe',
    description: 'une desc',
    kind: 'team',
    parent_group_id: 'p-1',
  });
});

test('slug dérivé du name quand slug absent ; defaults permissifs', () => {
  const { nextCalled, body } = run({ name: 'Groupe A' });
  assert.strictEqual(nextCalled, true);
  assert.strictEqual(body.slug, 'groupe-a');
  assert.strictEqual(body.name, 'Groupe A');
  assert.strictEqual(body.description, null);
  assert.strictEqual(body.kind, 'class'); // normalizeKind('') -> 'class'
  assert.strictEqual(body.parent_group_id, null);
});

test('slug et name manquants -> 400 "slug et name requis" (priorité la plus haute)', () => {
  const r = run({ kind: 'nope' });
  assert.strictEqual(r.nextCalled, false);
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.error, 'slug et name requis');
});

test('name vide -> 400 "slug et name requis" même si slug dérivable', () => {
  const r = run({ slug: 'x', name: '   ' });
  assert.strictEqual(r.nextCalled, false);
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.error, 'slug et name requis');
});

test('kind invalide -> 400 "kind invalide (class|team|unit|club)" quand slug+name présents', () => {
  const r = run({ name: 'Groupe', kind: 'planete' });
  assert.strictEqual(r.nextCalled, false);
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.error, 'kind invalide (class|team|unit|club)');
});
