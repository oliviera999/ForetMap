'use strict';

// O7 — vérifie SANS DB que le schéma zod du `group_id` des observations (`GET /all`)
// reproduit exactement l'ancienne lecture manuelle `String(req.query?.group_id || '').trim()`.
// Coercition tolérante, jamais de 400 pour une query invalide.
const test = require('node:test');
const assert = require('node:assert');
const { validate } = require('../lib/validate');
const { observationsAllQuerySchema } = require('../routes/observations');

function runQuery(rawQuery) {
  const req = { query: rawQuery };
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
  let nextCalled = false;
  validate({ query: observationsAllQuerySchema })(req, res, () => {
    nextCalled = true;
  });
  return { nextCalled, status: res.statusCode, parsed: req.validatedQuery };
}

function legacy(query) {
  return String(query?.group_id || '').trim();
}

test("group_id : équivalence exacte avec String(x || '').trim(), jamais de 400", () => {
  for (const raw of [undefined, '', '   ', ' g-1 ', 'abc', '0', '-3', '7.5']) {
    const query = raw === undefined ? {} : { group_id: raw };
    const { nextCalled, status, parsed } = runQuery(query);
    assert.strictEqual(
      nextCalled,
      true,
      `group_id=${JSON.stringify(raw)} ne doit jamais être rejeté`,
    );
    assert.strictEqual(status, 200);
    assert.strictEqual(parsed.groupId, legacy(query), `groupId pour ${JSON.stringify(raw)}`);
  }
});
