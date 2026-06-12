'use strict';

// O7 — vérifie SANS DB que le schéma zod de pagination de GET /api/gl/market/trades reproduit
// exactement l'ancienne logique `parsePageQuery(req.query, { defaultPageSize: 20,
// maxPageSize: 50 })` : `page` ≥ 1 (repli 1), `page_size` borné à [1, 50] (repli 20) ;
// coercition tolérante, jamais de 400 pour une query invalide.
const test = require('node:test');
const assert = require('node:assert');
const { validate } = require('../lib/validate');
const { glMarketTradesQuerySchema } = require('../routes/gl/market');

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

function runQuery(rawQuery) {
  const req = { query: rawQuery };
  const res = {
    statusCode: 200,
    status(c) { this.statusCode = c; return this; },
    json() { return this; },
  };
  let nextCalled = false;
  validate({ query: glMarketTradesQuerySchema })(req, res, () => { nextCalled = true; });
  return { nextCalled, status: res.statusCode, parsed: req.validatedQuery };
}

// Ré-implémentation indépendante de l'ancienne logique (parsePositiveInt + parsePageQuery).
function legacyParsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return parsed;
}
function legacyPageQuery(query) {
  const page = legacyParsePositiveInt(query?.page, 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, legacyParsePositiveInt(query?.page_size, DEFAULT_PAGE_SIZE));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

const EDGE_VALUES = [undefined, '', 'abc', '0', '-3', '1', '2.9', '12abc', '50', '51', '999999', ['3', '4']];

test('page/page_size : équivalence exacte avec parsePageQuery sur tous les cas limites, jamais de 400', () => {
  for (const page of EDGE_VALUES) {
    for (const pageSize of EDGE_VALUES) {
      const query = {};
      if (page !== undefined) query.page = page;
      if (pageSize !== undefined) query.page_size = pageSize;
      const { nextCalled, status, parsed } = runQuery(query);
      const label = `page=${JSON.stringify(page)} page_size=${JSON.stringify(pageSize)}`;
      assert.strictEqual(nextCalled, true, `${label} ne doit jamais être rejeté`);
      assert.strictEqual(status, 200, label);
      assert.deepStrictEqual(parsed, legacyPageQuery(query), label);
    }
  }
});

test('page/pageSize toujours des entiers ≥ 1, pageSize ≤ 50', () => {
  for (const raw of ['0', '-100', '1', '50', '51', '999999', 'abc', '2.5', ['1', '2']]) {
    const { parsed } = runQuery({ page: raw, page_size: raw });
    assert.ok(Number.isInteger(parsed.page) && parsed.page >= 1, `page ${parsed.page} invalide pour ${JSON.stringify(raw)}`);
    assert.ok(Number.isInteger(parsed.pageSize) && parsed.pageSize >= 1 && parsed.pageSize <= MAX_PAGE_SIZE,
      `pageSize ${parsed.pageSize} hors borne pour ${JSON.stringify(raw)}`);
  }
});
