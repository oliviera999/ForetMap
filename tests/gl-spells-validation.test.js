'use strict';

// O7 — vérifie SANS DB que les schémas zod de routes/gl/spells.js reproduisent exactement
// l'ancienne validation manuelle :
//   - query spellCodes : parseSpellCodesFromQuery(req.query); if (length === 0) -> 400
//                        'spellCodes requis (liste de codes séparés par des virgules)'
//   - query categorySlug : normalizeCategorySlug(req.query?.categorySlug); if (!slug) -> 400 'categorySlug requis'
//   - param :code      : String(req.params.code || '').trim().toUpperCase(); if (!code) -> 400 'Code invalide'
// Les refines sont au niveau racine (message sans préfixe de chemin). query/params ne sont PAS
// transformés : les handlers continuent de lire/normaliser eux-mêmes.
const test = require('node:test');
const assert = require('node:assert');
const { validate } = require('../lib/validate');
const {
  spellCodesQuerySchema,
  categorySlugQuerySchema,
  spellCodeParamsSchema,
} = require('../routes/gl/spells');

function run(kind, schema, value) {
  const req = {};
  req[kind] = value;
  const res = {
    statusCode: 200,
    payload: undefined,
    status(c) { this.statusCode = c; return this; },
    json(p) { this.payload = p; return this; },
  };
  let nextCalled = false;
  validate({ [kind]: schema })(req, res, () => { nextCalled = true; });
  return { nextCalled, status: res.statusCode, error: res.payload && res.payload.error, value: req[kind] };
}

// --- query spellCodes (GET /spells) ---------------------------------------------------------
// Parité avec parseSpellCodesFromQuery : accepte spellCodes='SL001,SL002' ou spellCode='SL001'.
test('query spellCodes valide -> next, query inchangée', () => {
  for (const q of [{ spellCodes: 'SL001,SL002' }, { spellCodes: 'SL001' }, { spellCode: 'SL003' }]) {
    const r = run('query', spellCodesQuerySchema, q);
    assert.strictEqual(r.nextCalled, true, `q=${JSON.stringify(q)}`);
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(r.value, q); // non transformée
  }
});

test('query spellCodes vide/absent -> 400 message exact (sans préfixe de chemin)', () => {
  const cases = [{}, { spellCodes: '' }, { spellCodes: '   ' }, { spellCode: '' }, null, undefined];
  for (const q of cases) {
    const r = run('query', spellCodesQuerySchema, q);
    assert.strictEqual(r.nextCalled, false, `q=${JSON.stringify(q)}`);
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error, 'spellCodes requis (liste de codes séparés par des virgules)');
  }
});

// --- query categorySlug (GET /admin/spells) -------------------------------------------------
// Parité avec normalizeCategorySlug(req.query?.categorySlug) : non vide après trim -> passe.
test('query categorySlug valide -> next, query inchangée', () => {
  for (const slug of ['attaque', '  defense  ', 'a']) {
    const r = run('query', categorySlugQuerySchema, { categorySlug: slug });
    assert.strictEqual(r.nextCalled, true, `slug=${JSON.stringify(slug)}`);
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(r.value, { categorySlug: slug }); // non transformée
  }
});

test('query categorySlug manquant/vide -> 400 message exact (sans préfixe de chemin)', () => {
  const cases = [{}, { categorySlug: '' }, { categorySlug: '   ' }, { categorySlug: null }, null, undefined];
  for (const q of cases) {
    const r = run('query', categorySlugQuerySchema, q);
    assert.strictEqual(r.nextCalled, false, `q=${JSON.stringify(q)}`);
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error, 'categorySlug requis');
  }
});

// --- param :code (routes sort) --------------------------------------------------------------
// Parité avec String(req.params.code || '').trim().toUpperCase() : non vide après trim -> passe.
test('param :code valide -> next, params inchangés', () => {
  for (const code of ['SL001', '  sl002  ', 'x']) {
    const r = run('params', spellCodeParamsSchema, { code });
    assert.strictEqual(r.nextCalled, true, `code=${JSON.stringify(code)}`);
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(r.value, { code }); // non transformé
  }
});

test('param :code manquant/vide -> 400 message exact (sans préfixe de chemin)', () => {
  const cases = [{}, { code: '' }, { code: '   ' }, { code: null }, { code: undefined }];
  for (const p of cases) {
    const r = run('params', spellCodeParamsSchema, p);
    assert.strictEqual(r.nextCalled, false, `p=${JSON.stringify(p)}`);
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error, 'Code invalide');
  }
});
