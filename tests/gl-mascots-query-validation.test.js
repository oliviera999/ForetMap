'use strict';

// O7 — vérifie SANS DB que les schémas zod des query de gl/mascots reproduisent exactement
// l'ancienne logique manuelle (coercition permissive, jamais de 400) :
// - GET /api/gl/mascots : `gameId` chargé seulement si `Number.isFinite(Number(raw)) && > 0` ;
// - GET /packs et /sprite-library : `chapterId` filtré seulement si `Number.isFinite(Number(raw))`.
const test = require('node:test');
const assert = require('node:assert');
const { validate } = require('../lib/validate');
const {
  glMascotsCatalogQuerySchema,
  glMascotsChapterQuerySchema,
} = require('../routes/gl/mascots');

function runQuery(schema, key, rawValue) {
  const req = { query: rawValue === undefined ? {} : { [key]: rawValue } };
  let nextCalled = false;
  const res = {
    statusCode: 200,
    status(c) { this.statusCode = c; return this; },
    json() { return this; },
  };
  validate({ query: schema })(req, res, () => { nextCalled = true; });
  return { nextCalled, status: res.statusCode, value: req.validatedQuery?.[key] };
}

const CASES = [undefined, '', 'abc', '0', '3', '-1', '2.5', '999999', '12abc', ['1', '2']];

test('gameId : équivalence exacte (fetch ssi fini et > 0), jamais de 400', () => {
  // Ancienne logique : assignations chargées ssi raw != null, Number(raw) fini et > 0.
  const legacyFetch = (raw) => {
    if (raw === undefined) return { fetch: false };
    const gameId = Number(raw);
    return Number.isFinite(gameId) && gameId > 0 ? { fetch: true, gameId } : { fetch: false };
  };
  for (const raw of CASES) {
    const { nextCalled, status, value } = runQuery(glMascotsCatalogQuerySchema, 'gameId', raw);
    assert.strictEqual(nextCalled, true, `gameId=${JSON.stringify(raw)} ne doit jamais être rejeté`);
    assert.strictEqual(status, 200);
    const now = value != null ? { fetch: true, gameId: value } : { fetch: false };
    assert.deepStrictEqual(now, legacyFetch(raw), `branche/valeur pour ${JSON.stringify(raw)}`);
  }
});

test('chapterId (packs / sprite-library) : équivalence exacte (filtre ssi fini), jamais de 400', () => {
  const legacyFilter = (raw) => {
    const chapterId = raw !== undefined ? Number(raw) : null;
    return Number.isFinite(chapterId) ? { filtered: true, chapterId } : { filtered: false };
  };
  for (const raw of CASES) {
    const { nextCalled, status, value } = runQuery(glMascotsChapterQuerySchema, 'chapterId', raw);
    assert.strictEqual(nextCalled, true, `chapterId=${JSON.stringify(raw)} ne doit jamais être rejeté`);
    assert.strictEqual(status, 200);
    const now = Number.isFinite(value) ? { filtered: true, chapterId: value } : { filtered: false };
    assert.deepStrictEqual(now, legacyFilter(raw), `branche/valeur pour ${JSON.stringify(raw)}`);
  }
});

test('cas limites notables conservés : gameId 0/négatif/décimal, chapterId vide → 0', () => {
  assert.strictEqual(runQuery(glMascotsCatalogQuerySchema, 'gameId', '0').value, null); // 0 → pas de fetch
  assert.strictEqual(runQuery(glMascotsCatalogQuerySchema, 'gameId', '-5').value, null);
  assert.strictEqual(runQuery(glMascotsCatalogQuerySchema, 'gameId', '1.5').value, 1.5); // > 0 fini → fetch
  assert.strictEqual(runQuery(glMascotsChapterQuerySchema, 'chapterId', '').value, 0); // Number('') === 0
});
