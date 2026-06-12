'use strict';

// O7 — vérifie SANS DB que le schéma zod du `limit` de GET /api/gl/admin/media-library reproduit
// exactement l'ancienne logique `Number.isFinite(Number(req.query?.limit)) ? limit : 300` :
// coercition permissive, repli sur 300 côté handler, jamais de 400.
const test = require('node:test');
const assert = require('node:assert');
const { validate } = require('../lib/validate');
const { glAdminMediaQuerySchema } = require('../routes/gl/admin');

function runQuery(rawValue) {
  const req = { query: rawValue === undefined ? {} : { limit: rawValue } };
  let nextCalled = false;
  const res = {
    statusCode: 200,
    status(c) { this.statusCode = c; return this; },
    json() { return this; },
  };
  validate({ query: glAdminMediaQuerySchema })(req, res, () => { nextCalled = true; });
  return { nextCalled, status: res.statusCode, value: req.validatedQuery?.limit };
}

test('limit : équivalence exacte avec la logique historique, jamais de 400', () => {
  // Reproduit le handler : limite effective passée à listMediaLibraryItems.
  const effective = (v) => (Number.isFinite(v) ? v : 300);
  const legacy = (raw) => { const n = Number(raw); return Number.isFinite(n) ? n : 300; };
  const cases = [undefined, '', 'abc', '0', '5', '50.9', '-3', '400', '999999', '12abc'];
  for (const raw of cases) {
    const { nextCalled, status, value } = runQuery(raw);
    assert.strictEqual(nextCalled, true, `limit=${JSON.stringify(raw)} ne doit jamais être rejeté`);
    assert.strictEqual(status, 200);
    assert.strictEqual(effective(value), legacy(raw), `limit effectif pour ${JSON.stringify(raw)}`);
  }
});

test('limit répété (?limit=1&limit=2 → tableau) : non numérique → repli 300, jamais de 400', () => {
  const { nextCalled, value } = runQuery(['1', '2']);
  assert.strictEqual(nextCalled, true);
  assert.strictEqual(Number.isFinite(value) ? value : 300, 300);
});
