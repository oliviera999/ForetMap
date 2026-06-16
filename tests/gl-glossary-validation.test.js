'use strict';

// O7 — vérifie SANS DB que le schéma zod de routes/gl/glossary.js reproduit exactement
// l'ancienne validation manuelle du param :code :
//   String(req.params.code || '').trim(); if (!code) -> 400 'Code invalide'
// (routes GET /glossary/:code, GET|PUT|PATCH /admin/glossary/terms/:code).
// Le refine est au niveau racine (message sans préfixe de chemin). params n'est PAS transformé :
// les handlers continuent de lire/normaliser eux-mêmes.
const test = require('node:test');
const assert = require('node:assert');
const { validate } = require('../lib/validate');
const { glossaryCodeParamsSchema } = require('../routes/gl/glossary');

function runParams(params) {
  const req = { params };
  const res = {
    statusCode: 200,
    payload: undefined,
    status(c) {
      this.statusCode = c;
      return this;
    },
    json(p) {
      this.payload = p;
      return this;
    },
  };
  let nextCalled = false;
  validate({ params: glossaryCodeParamsSchema })(req, res, () => {
    nextCalled = true;
  });
  return {
    nextCalled,
    status: res.statusCode,
    error: res.payload && res.payload.error,
    params: req.params,
  };
}

// Parité avec `String(req.params.code || '').trim()` : toute valeur non vide après trim passe.
test('param :code valide -> next, params inchangés', () => {
  for (const code of ['GL0001', '  GL0002  ', 'x']) {
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
