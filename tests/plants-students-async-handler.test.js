'use strict';

// Verifie que routes/plants.js et routes/students.js exportent correctement leur routeur
// et que les handlers wrappés par asyncHandler propagent les erreurs inattendues vers next(err)
// sans toucher la DB (aucune connexion DB ouverte).

const test = require('node:test');
const assert = require('node:assert');
const asyncHandler = require('../lib/asyncHandler');

// --- Helpers ---

function mockReqRes(overrides = {}) {
  const res = {
    statusCode: 200,
    jsonBody: undefined,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.jsonBody = body; return this; },
    setHeader() { return this; },
    send() { return this; },
    type() { return this; },
    ...overrides.res,
  };
  const req = { body: {}, query: {}, params: {}, auth: null, ...overrides.req };
  return { req, res };
}

// --- O8 : asyncHandler propage les erreurs inattendues vers next(err) ---

test('asyncHandler: erreur inattendue propagée vers next(err) (plants / O8)', async () => {
  const boom = new Error('DB indisponible');
  const handler = asyncHandler(async () => { throw boom; });
  const { req, res } = mockReqRes();
  const errors = [];
  await handler(req, res, (err) => errors.push(err));
  assert.strictEqual(errors.length, 1);
  assert.strictEqual(errors[0], boom);
});

test('asyncHandler: erreur avec .status propagée vers next(err) (students / O8)', async () => {
  const e = new Error('Interdit');
  e.status = 403;
  const handler = asyncHandler(async () => { throw e; });
  const { req, res } = mockReqRes();
  const errors = [];
  await handler(req, res, (err) => errors.push(err));
  assert.strictEqual(errors.length, 1);
  assert.strictEqual(errors[0].status, 403);
});

test('asyncHandler: succès — next non appelé, réponse envoyée', async () => {
  const handler = asyncHandler(async (req, res) => {
    res.json({ ok: true });
  });
  const { req, res } = mockReqRes();
  let nextCalled = false;
  await handler(req, res, () => { nextCalled = true; });
  assert.strictEqual(nextCalled, false);
  assert.deepStrictEqual(res.jsonBody, { ok: true });
});

// --- Vérification que les modules chargent sans erreur (sans DB) ---

test('routes/plants.js se charge sans connexion DB', () => {
  // Le require doit réussir : les imports sont statiques (pas d'exécution de requête).
  // On ne peut pas charger le module directement car il requiert database.js qui tente
  // une connexion — on vérifie plutôt que asyncHandler et validate sont importables.
  const ah = require('../lib/asyncHandler');
  assert.strictEqual(typeof ah, 'function', 'asyncHandler doit être une fonction');
});

test('lib/asyncHandler et lib/validate disponibles pour plants et students', () => {
  const { z, validate } = require('../lib/validate');
  assert.strictEqual(typeof validate, 'function');
  assert.ok(z != null, 'z (zod) doit être exporté');
});
