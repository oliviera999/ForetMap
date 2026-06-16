'use strict';

// O7 — vérifie SANS DB que le schéma zod de la query de GET /api/gl/context-comments reproduit
// exactement l'ancienne lecture manuelle : `contextType` via normalizeContextType (type inconnu
// → '', types gl_*), `contextId` via normalizeOptionalString (vide → null), pagination via
// `parsePageQuery` (`page` ≥ 1 repli 1, `page_size` borné [1, 50] repli 20, `offset` dérivé) ;
// coercition permissive, jamais de 400 issu du schéma (les 400 contextType/contextId restent
// au handler).
const test = require('node:test');
const assert = require('node:assert');
const { validate } = require('../lib/validate');
const { glContextCommentsListQuerySchema } = require('../routes/gl/context-comments');

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;
const ALLOWED_CONTEXT_TYPES = new Set(['gl_chapter', 'gl_scene', 'gl_game', 'gl_mascot_pack']);

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
  validate({ query: glContextCommentsListQuerySchema })(req, res, () => {
    nextCalled = true;
  });
  return { nextCalled, status: res.statusCode, parsed: req.validatedQuery };
}

// Ré-implémentation indépendante de l'ancienne logique du handler.
function legacyNormalizeContextType(value) {
  const t = String(value || '')
    .trim()
    .toLowerCase();
  return ALLOWED_CONTEXT_TYPES.has(t) ? t : '';
}
function legacyNormalizeOptionalString(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length > 0 ? s : null;
}
function legacyParsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return parsed;
}
function legacyQuery(query) {
  const page = legacyParsePositiveInt(query?.page, 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    legacyParsePositiveInt(query?.page_size, DEFAULT_PAGE_SIZE),
  );
  return {
    contextType: legacyNormalizeContextType(query?.contextType),
    contextId: legacyNormalizeOptionalString(query?.contextId),
    page,
    pageSize,
    offset: (page - 1) * pageSize,
  };
}

const PAGE_EDGE_VALUES = [
  undefined,
  '',
  'abc',
  '0',
  '-3',
  '2',
  '2.9',
  '50',
  '51',
  '999999',
  ['1', '2'],
];

test('page/page_size : équivalence exacte avec parsePageQuery sur les cas limites, jamais de 400', () => {
  for (const page of PAGE_EDGE_VALUES) {
    for (const pageSize of PAGE_EDGE_VALUES) {
      const query = { contextType: 'gl_game', contextId: '7' };
      if (page !== undefined) query.page = page;
      if (pageSize !== undefined) query.page_size = pageSize;
      const { nextCalled, status, parsed } = runQuery(query);
      const label = `page=${JSON.stringify(page)} page_size=${JSON.stringify(pageSize)}`;
      assert.strictEqual(nextCalled, true, `${label} ne doit jamais être rejeté`);
      assert.strictEqual(status, 200, label);
      assert.deepStrictEqual(parsed, legacyQuery(query), label);
    }
  }
});

test('contextType/contextId : normalisation identique à l’historique, jamais de 400', () => {
  const cases = [
    {},
    { contextType: 'gl_chapter', contextId: '3' },
    { contextType: ' GL_GAME ', contextId: '  9  ' },
    { contextType: 'task', contextId: '' }, // type de l'app principale : refusé côté GL
    { contextType: '', contextId: '   ' },
    { contextType: ['gl_game', 'gl_scene'], contextId: ['a', 'b'] }, // paramètre répété en tableau
    { contextType: 'gl_mascot_pack', contextId: '42' },
  ];
  for (const query of cases) {
    const { nextCalled, status, parsed } = runQuery(query);
    const label = JSON.stringify(query);
    assert.strictEqual(nextCalled, true, `${label} ne doit jamais être rejeté`);
    assert.strictEqual(status, 200, label);
    assert.deepStrictEqual(parsed, legacyQuery(query), label);
  }
});

test('pageSize borné dans [1, 50] et offset cohérent pour toute entrée', () => {
  for (const raw of ['0', '-100', '1', '50', '51', '999999', 'abc', '2.5']) {
    const { parsed } = runQuery({
      contextType: 'gl_game',
      contextId: 'x',
      page: '3',
      page_size: raw,
    });
    assert.ok(
      parsed.pageSize >= 1 && parsed.pageSize <= MAX_PAGE_SIZE,
      `pageSize ${parsed.pageSize} hors borne pour ${raw}`,
    );
    assert.strictEqual(parsed.offset, (parsed.page - 1) * parsed.pageSize);
  }
});
