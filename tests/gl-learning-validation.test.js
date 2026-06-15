'use strict';

// O7 — vérifie SANS DB que les schémas zod de routes/gl/learning.js reproduisent exactement
// l'ancienne validation manuelle :
//   - body confirm : parseConfirmBody(req.body); if (!ok) -> 400 'Confirmation explicite requise (confirm: true)'
//   - param :code  : normalizeTargetCode(req.params.code); if (!code) -> 400 'Identifiant invalide'
//                    (vide OU > 64 caractères -> invalide, comme MAX_TARGET_CODE_LEN)
//   - param :id    : Number(req.params.id); if (!Number.isFinite(id) || id <= 0) -> 400 'Identifiant invalide'
// Les refines sont au niveau racine (message sans préfixe de chemin). body/params ne sont PAS
// transformés : les handlers continuent de lire/normaliser eux-mêmes.
const test = require('node:test');
const assert = require('node:assert');
const { validate } = require('../lib/validate');
const {
  confirmBodySchema,
  learningCodeParamsSchema,
  tutorialIdParamsSchema,
} = require('../routes/gl/learning');

function run(schemas, req) {
  const r = { body: undefined, query: undefined, params: undefined, ...req };
  const res = {
    statusCode: 200,
    payload: undefined,
    status(c) { this.statusCode = c; return this; },
    json(p) { this.payload = p; return this; },
  };
  let nextCalled = false;
  validate(schemas)(r, res, () => { nextCalled = true; });
  return { nextCalled, status: res.statusCode, error: res.payload && res.payload.error, req: r };
}

// --- body confirm (parité avec parseConfirmBody) ---
test('body confirm: true -> next, body inchangé', () => {
  const r = run({ body: confirmBodySchema }, { body: { confirm: true, extra: 1 } });
  assert.strictEqual(r.nextCalled, true);
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(r.req.body, { confirm: true, extra: 1 });
});

test('body confirm absent/faux/null -> 400 message exact', () => {
  const cases = [undefined, null, {}, { confirm: false }, { confirm: 'true' }, { confirm: 1 }];
  for (const body of cases) {
    const r = run({ body: confirmBodySchema }, { body });
    assert.strictEqual(r.nextCalled, false, `body=${JSON.stringify(body)}`);
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error, 'Confirmation explicite requise (confirm: true)');
  }
});

// --- param :code (parité avec normalizeTargetCode) ---
test('param :code valide -> next, params inchangés', () => {
  for (const code of ['SP0001', '  GL0002  ', 'x', 'a'.repeat(64)]) {
    const r = run({ params: learningCodeParamsSchema }, { params: { code } });
    assert.strictEqual(r.nextCalled, true, `code=${JSON.stringify(code)}`);
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(r.req.params, { code });
  }
});

test('param :code vide/manquant/trop long -> 400 message exact', () => {
  const cases = [{}, { code: '' }, { code: '   ' }, { code: null }, { code: undefined }, { code: 'a'.repeat(65) }];
  for (const params of cases) {
    const r = run({ params: learningCodeParamsSchema }, { params });
    assert.strictEqual(r.nextCalled, false, `p=${JSON.stringify(params)}`);
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error, 'Identifiant invalide');
  }
});

// --- param :id (parité avec Number + !Number.isFinite || id <= 0) ---
test('param :id numérique positif -> next, params inchangés', () => {
  for (const id of ['1', '42', 7]) {
    const r = run({ params: tutorialIdParamsSchema }, { params: { id } });
    assert.strictEqual(r.nextCalled, true, `id=${JSON.stringify(id)}`);
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(r.req.params, { id });
  }
});

test('param :id non numérique / <= 0 / infini -> 400 message exact', () => {
  const cases = [{}, { id: '' }, { id: 'abc' }, { id: '0' }, { id: 0 }, { id: '-3' }, { id: 'Infinity' }, { id: null }];
  for (const params of cases) {
    const r = run({ params: tutorialIdParamsSchema }, { params });
    assert.strictEqual(r.nextCalled, false, `p=${JSON.stringify(params)}`);
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error, 'Identifiant invalide');
  }
});

// --- ordre body AVANT params (précédence des 400 inchangée pour species/glossary) ---
test('body invalide ET code invalide -> 400 confirm (body évalué avant params)', () => {
  const r = run(
    { body: confirmBodySchema, params: learningCodeParamsSchema },
    { body: {}, params: { code: '' } }
  );
  assert.strictEqual(r.nextCalled, false);
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.error, 'Confirmation explicite requise (confirm: true)');
});
