'use strict';

// O7 — vérifie SANS DB que le schéma zod du `chapterId` de GET /api/gl/kingdom-map/zones
// reproduit exactement l'ancienne logique `req.query?.chapterId != null ? Number(...) : null`
// suivie du garde `if (chapterId == null || !Number.isFinite(chapterId)) → 400` : le schéma
// ne rejette jamais (coercition permissive), le 400 « chapterId requis » historique reste
// décidé par le handler sur la même condition.
const test = require('node:test');
const assert = require('node:assert');
const { validate } = require('../lib/validate');
const { glKingdomZonesQuerySchema } = require('../routes/gl/kingdom-map');

function runQuery(rawValue) {
  const req = { query: rawValue === undefined ? {} : { chapterId: rawValue } };
  let nextCalled = false;
  const res = {
    statusCode: 200,
    status(c) {
      this.statusCode = c;
      return this;
    },
    json() {
      return this;
    },
  };
  validate({ query: glKingdomZonesQuerySchema })(req, res, () => {
    nextCalled = true;
  });
  return { nextCalled, status: res.statusCode, value: req.validatedQuery?.chapterId };
}

// Ancienne logique : 400 si absent ou non fini, sinon filtre sur Number(raw).
function legacyOutcome(raw) {
  const chapterId = raw !== undefined ? Number(raw) : null;
  if (chapterId == null || !Number.isFinite(chapterId)) return { rejectedByHandler: true };
  return { rejectedByHandler: false, chapterId };
}

// Nouvelle logique : même garde, appliqué à req.validatedQuery.chapterId.
function currentOutcome(value) {
  if (value == null || !Number.isFinite(value)) return { rejectedByHandler: true };
  return { rejectedByHandler: false, chapterId: value };
}

test('chapterId : équivalence exacte avec la logique historique, jamais de 400 issu du schéma', () => {
  const cases = [undefined, '', 'abc', '0', '3', '-1', '2.5', '999999', '12abc', ['1', '2']];
  for (const raw of cases) {
    const { nextCalled, status, value } = runQuery(raw);
    assert.strictEqual(
      nextCalled,
      true,
      `chapterId=${JSON.stringify(raw)} ne doit jamais être rejeté par le schéma`,
    );
    assert.strictEqual(status, 200);
    assert.deepStrictEqual(
      currentOutcome(value),
      legacyOutcome(raw),
      `branche/valeur pour ${JSON.stringify(raw)}`,
    );
  }
});

test('chapterId absent/non numérique → garde 400 du handler ; fini → filtre conservé (y compris 0, négatif, décimal)', () => {
  assert.strictEqual(runQuery(undefined).value, null); // absent → garde 400 du handler
  assert.strictEqual(runQuery('abc').value, null); // non numérique → garde 400 du handler
  assert.strictEqual(runQuery(['1', '2']).value, null); // tableau → Number(...) NaN → garde 400
  assert.strictEqual(runQuery('4').value, 4);
  assert.strictEqual(runQuery('').value, 0); // Number('') === 0 : passait le garde historique, conservé
  assert.strictEqual(runQuery('-1').value, -1); // fini : passait le garde historique, conservé
  assert.strictEqual(runQuery('2.5').value, 2.5); // fini : passait le garde historique, conservé
});
