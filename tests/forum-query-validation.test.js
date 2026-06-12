'use strict';

// O7 — vérifie SANS DB que le schéma zod de pagination du forum (`/threads`, `/threads/:id`)
// reproduit exactement l'ancienne logique `parsePageQuery` (lib/shared/httpHelpers) :
// `page` ≥ 1 (repli 1), `page_size` borné à [1, 50] (repli 20), `offset` dérivé ;
// coercition tolérante, jamais de 400 pour une query invalide.
const test = require('node:test');
const assert = require('node:assert');
const { validate } = require('../lib/validate');
const { forumPageQuerySchema } = require('../routes/forum');

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
  validate({ query: forumPageQuerySchema })(req, res, () => { nextCalled = true; });
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

const EDGE_VALUES = [undefined, '', 'abc', '0', '-3', '1', '2', '2.9', '12abc', '49', '50', '51', '5000'];

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

test('pageSize borné dans [1, 50] et offset cohérent pour toute entrée', () => {
  for (const raw of ['0', '-100', '1', '50', '51', '999999', 'abc']) {
    const { parsed } = runQuery({ page: '3', page_size: raw });
    assert.ok(parsed.pageSize >= 1 && parsed.pageSize <= MAX_PAGE_SIZE, `pageSize ${parsed.pageSize} hors borne pour ${raw}`);
    assert.strictEqual(parsed.offset, (parsed.page - 1) * parsed.pageSize);
  }
});
