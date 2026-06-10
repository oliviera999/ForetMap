'use strict';

// O7 — vérifie SANS DB que le schéma zod du `limit` d'audit reproduit exactement l'ancienne
// logique `Math.max(1, Math.min(parseInt(req.query.limit, 10) || 50, 200))` : coercition tolérante,
// repli sur 50, bornage [1, 200], jamais de 400.
const test = require('node:test');
const assert = require('node:assert');
const { validate } = require('../lib/validate');
const { auditQuerySchema } = require('../routes/audit');

function effectiveLimit(rawQuery) {
  const req = { query: rawQuery };
  const res = {
    statusCode: 200,
    status(c) { this.statusCode = c; return this; },
    json() { return this; },
  };
  let nextCalled = false;
  validate({ query: auditQuerySchema })(req, res, () => { nextCalled = true; });
  return { nextCalled, status: res.statusCode, limit: req.validatedQuery?.limit };
}

function legacy(raw) {
  return Math.max(1, Math.min(parseInt(raw, 10) || 50, 200));
}

test('limit : équivalence exacte avec la logique historique, jamais de 400', () => {
  const cases = [
    undefined, '', 'abc', '0', '1', '50', '199', '200', '201', '5000', '-3', '50.9', '12abc',
  ];
  for (const raw of cases) {
    const query = raw === undefined ? {} : { limit: raw };
    const { nextCalled, status, limit } = effectiveLimit(query);
    assert.strictEqual(nextCalled, true, `limit=${JSON.stringify(raw)} ne doit jamais être rejeté`);
    assert.strictEqual(status, 200);
    assert.strictEqual(limit, legacy(raw), `limit effectif pour ${JSON.stringify(raw)}`);
  }
});

test('limit borné dans [1, 200] pour toute entrée', () => {
  for (const raw of ['0', '-100', '1', '200', '201', '999999']) {
    const { limit } = effectiveLimit({ limit: raw });
    assert.ok(limit >= 1 && limit <= 200, `limit ${limit} hors borne pour ${raw}`);
  }
});
