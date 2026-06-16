'use strict';

// O7 — vérifie SANS DB que les schémas zod de params de routes/gl/chapters.js (idParamSchema /
// markerIdParamSchema) reproduisent exactement le gate manuel `const x = Number(req.params.x);
// if (!Number.isFinite(x)) -> 400 'Identifiant invalide'` : `z.coerce.number().finite()` passe
// si et seulement si `Number.isFinite(Number(raw))` est vrai. On teste l'équivalence sur tous les
// cas limites, et que le middleware `validate({ params })` renvoie 400 sur entrée invalide.
const test = require('node:test');
const assert = require('node:assert');
const { validate } = require('../lib/validate');
const { idParamSchema, markerIdParamSchema } = require('../routes/gl/chapters');

// Exécute le middleware validate({ params }) comme dans la chaîne Express, sans DB.
function runParams(schema, key, rawValue) {
  const req = { params: { [key]: rawValue } };
  const res = {
    statusCode: 200,
    body: null,
    status(c) {
      this.statusCode = c;
      return this;
    },
    json(b) {
      this.body = b;
      return this;
    },
  };
  let nextCalled = false;
  validate({ params: schema })(req, res, () => {
    nextCalled = true;
  });
  return { nextCalled, status: res.statusCode, body: res.body, parsed: req.validatedParams };
}

// Gate manuel d'origine, ré-implémenté indépendamment.
function legacyAccepts(raw) {
  return Number.isFinite(Number(raw));
}

const EDGE_VALUES = [
  '1',
  '0',
  '-3',
  '42',
  '2.9',
  '12abc',
  'abc',
  '',
  ' ',
  '  7 ',
  '0x10',
  '1e3',
  'Infinity',
  '-Infinity',
  'NaN',
  '999999999999',
];

test('idParamSchema : équivalence exacte avec Number()/Number.isFinite sur tous les cas limites', () => {
  for (const raw of EDGE_VALUES) {
    const { nextCalled, status } = runParams(idParamSchema, 'id', raw);
    const accepts = legacyAccepts(raw);
    assert.strictEqual(nextCalled, accepts, `id=${JSON.stringify(raw)} : next attendu ${accepts}`);
    assert.strictEqual(status, accepts ? 200 : 400, `id=${JSON.stringify(raw)} : status`);
  }
});

test('markerIdParamSchema : équivalence exacte avec Number()/Number.isFinite sur tous les cas limites', () => {
  for (const raw of EDGE_VALUES) {
    const { nextCalled, status } = runParams(markerIdParamSchema, 'markerId', raw);
    const accepts = legacyAccepts(raw);
    assert.strictEqual(
      nextCalled,
      accepts,
      `markerId=${JSON.stringify(raw)} : next attendu ${accepts}`,
    );
    assert.strictEqual(status, accepts ? 200 : 400, `markerId=${JSON.stringify(raw)} : status`);
  }
});

test('entrée invalide -> 400 (forme de réponse { error })', () => {
  const { status, body } = runParams(idParamSchema, 'id', 'abc');
  assert.strictEqual(status, 400);
  assert.ok(body && typeof body.error === 'string' && body.error.length > 0);
});

test('entrée valide -> next + params coercés en number fini', () => {
  const { nextCalled, parsed } = runParams(idParamSchema, 'id', '42');
  assert.strictEqual(nextCalled, true);
  assert.strictEqual(parsed.id, 42);
  assert.ok(Number.isFinite(parsed.id));
});
