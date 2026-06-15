'use strict';

// O7 — vérifie SANS DB que les schémas zod de routes/gl/species.js reproduisent exactement
// l'ancienne validation manuelle :
//   - query biomeSlug : normalizeBiomeSlug(req.query?.biomeSlug); if (!biomeSlug) -> 400 'biomeSlug requis'
//   - param :code     : String(req.params.code || '').trim(); if (!code) -> 400 'Code invalide'
// Les refines sont au niveau racine (message sans préfixe de chemin). query/params ne sont PAS
// transformés : les handlers continuent de lire/normaliser eux-mêmes.
const test = require('node:test');
const assert = require('node:assert');
const { validate } = require('../lib/validate');
const { biomeSlugQuerySchema, speciesCodeParamsSchema } = require('../routes/gl/species');

function runQuery(query) {
  const req = { query };
  const res = {
    statusCode: 200,
    payload: undefined,
    status(c) { this.statusCode = c; return this; },
    json(p) { this.payload = p; return this; },
  };
  let nextCalled = false;
  validate({ query: biomeSlugQuerySchema })(req, res, () => { nextCalled = true; });
  return { nextCalled, status: res.statusCode, error: res.payload && res.payload.error, query: req.query };
}

function runParams(params) {
  const req = { params };
  const res = {
    statusCode: 200,
    payload: undefined,
    status(c) { this.statusCode = c; return this; },
    json(p) { this.payload = p; return this; },
  };
  let nextCalled = false;
  validate({ params: speciesCodeParamsSchema })(req, res, () => { nextCalled = true; });
  return { nextCalled, status: res.statusCode, error: res.payload && res.payload.error, params: req.params };
}

// Parité avec `normalizeBiomeSlug(req.query?.biomeSlug)` : toute valeur non vide après trim passe.
test('query biomeSlug valide -> next, query inchangée', () => {
  for (const slug of ['savane', '  desert  ', 'a']) {
    const r = runQuery({ biomeSlug: slug });
    assert.strictEqual(r.nextCalled, true, `slug=${JSON.stringify(slug)}`);
    assert.strictEqual(r.status, 200);
    // query non transformée : le handler refait normalizeBiomeSlug(req.query?.biomeSlug).
    assert.deepStrictEqual(r.query, { biomeSlug: slug });
  }
});

test('query biomeSlug manquant/vide -> 400 message exact (sans préfixe de chemin)', () => {
  const cases = [{}, { biomeSlug: '' }, { biomeSlug: '   ' }, { biomeSlug: null }, { biomeSlug: undefined }];
  for (const q of cases) {
    const r = runQuery(q);
    assert.strictEqual(r.nextCalled, false, `q=${JSON.stringify(q)}`);
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error, 'biomeSlug requis');
  }
});

test('query null/undefined -> 400 (parité avec req.query?.biomeSlug)', () => {
  for (const q of [null, undefined]) {
    const r = runQuery(q);
    assert.strictEqual(r.nextCalled, false);
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error, 'biomeSlug requis');
  }
});

// Parité avec `String(req.params.code || '').trim()` : toute valeur non vide après trim passe.
test('param :code valide -> next, params inchangés', () => {
  for (const code of ['SP0001', '  SP0002  ', 'x']) {
    const r = runParams({ code });
    assert.strictEqual(r.nextCalled, true, `code=${JSON.stringify(code)}`);
    assert.strictEqual(r.status, 200);
    // params non transformés : le handler refait String(req.params.code || '').trim().
    assert.deepStrictEqual(r.params, { code });
  }
});

test('param :code manquant/vide -> 400 message exact (sans préfixe de chemin)', () => {
  const cases = [{}, { code: '' }, { code: '   ' }, { code: null }, { code: undefined }];
  for (const p of cases) {
    const r = runParams(p);
    assert.strictEqual(r.nextCalled, false, `p=${JSON.stringify(p)}`);
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error, 'Code invalide');
  }
});
