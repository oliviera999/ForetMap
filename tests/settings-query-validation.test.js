'use strict';

// O7 — vérifie SANS DB que les schémas zod des query de settings reproduisent l'ancienne logique
// (coercition permissive, jamais de 400), pour `/admin/media-library?limit=` et `/admin/system/logs?lines=`.
const test = require('node:test');
const assert = require('node:assert');
const { validate } = require('../lib/validate');
const { settingsMediaQuerySchema, settingsLogsQuerySchema } = require('../routes/settings');

function runQuery(schema, key, rawValue) {
  const req = { query: rawValue === undefined ? {} : { [key]: rawValue } };
  let nextCalled = false;
  const res = {
    status() {
      return this;
    },
    json() {
      return this;
    },
  };
  validate({ query: schema })(req, res, () => {
    nextCalled = true;
  });
  return { nextCalled, value: req.validatedQuery?.[key] };
}

test('media-library limit : équivalent à Number.isFinite(Number(x)) ? x : 300, jamais de 400', () => {
  const effective = (v) => (Number.isFinite(v) ? v : 300);
  const legacy = (raw) => {
    const n = Number(raw);
    return Number.isFinite(n) ? n : 300;
  };
  for (const raw of [undefined, '', 'abc', '0', '5', '400', '-3']) {
    const { nextCalled, value } = runQuery(settingsMediaQuerySchema, 'limit', raw);
    assert.strictEqual(nextCalled, true, `limit=${JSON.stringify(raw)} jamais rejeté`);
    assert.strictEqual(effective(value), legacy(raw), `limit effectif pour ${JSON.stringify(raw)}`);
  }
});

test('logs lines : équivalent à Number.isFinite(parseInt(lines,10)) ? raw : 200, jamais de 400', () => {
  const legacy = (raw) => {
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : 200;
  };
  for (const raw of [undefined, '', 'abc', '0', '500', '-5', '12abc']) {
    const { nextCalled, value } = runQuery(settingsLogsQuerySchema, 'lines', raw);
    assert.strictEqual(nextCalled, true, `lines=${JSON.stringify(raw)} jamais rejeté`);
    assert.strictEqual(value, legacy(raw), `lines effectif pour ${JSON.stringify(raw)}`);
  }
});
