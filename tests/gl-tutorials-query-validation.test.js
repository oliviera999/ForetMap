'use strict';

// O7 — vérifie SANS DB que le schéma zod du `chapterId` de GET /api/gl/tutorials reproduit
// exactement l'ancienne logique `req.query?.chapterId != null ? Number(...) : null` suivie du
// branchement `Number.isFinite(chapterId)` (filtré / non filtré) : coercition permissive,
// jamais de 400.
const test = require('node:test');
const assert = require('node:assert');
const { validate } = require('../lib/validate');
const { glTutorialsListQuerySchema } = require('../routes/gl/tutorials');

function runQuery(rawValue) {
  const req = { query: rawValue === undefined ? {} : { chapterId: rawValue } };
  let nextCalled = false;
  const res = {
    statusCode: 200,
    status(c) { this.statusCode = c; return this; },
    json() { return this; },
  };
  validate({ query: glTutorialsListQuerySchema })(req, res, () => { nextCalled = true; });
  return { nextCalled, status: res.statusCode, value: req.validatedQuery?.chapterId };
}

// Ancienne logique : la branche filtrée n'est prise que si Number(raw) est fini.
function legacyFilter(raw) {
  const chapterId = raw !== undefined ? Number(raw) : null;
  return Number.isFinite(chapterId) ? { filtered: true, chapterId } : { filtered: false };
}

test('chapterId : équivalence exacte avec la logique historique, jamais de 400', () => {
  const cases = [undefined, '', 'abc', '0', '3', '-1', '2.5', '999999', '12abc', ['1', '2']];
  for (const raw of cases) {
    const { nextCalled, status, value } = runQuery(raw);
    assert.strictEqual(nextCalled, true, `chapterId=${JSON.stringify(raw)} ne doit jamais être rejeté`);
    assert.strictEqual(status, 200);
    // Le handler filtre désormais sur Number.isFinite(req.validatedQuery.chapterId).
    const now = Number.isFinite(value) ? { filtered: true, chapterId: value } : { filtered: false };
    assert.deepStrictEqual(now, legacyFilter(raw), `branche/valeur pour ${JSON.stringify(raw)}`);
  }
});

test('chapterId absent ou non numérique → liste complète (null), présent fini → filtre conservé', () => {
  assert.strictEqual(runQuery(undefined).value, null);
  assert.strictEqual(runQuery('abc').value, null);
  assert.strictEqual(runQuery('4').value, 4);
  assert.strictEqual(runQuery('').value, 0); // Number('') === 0 : comportement historique conservé
});
