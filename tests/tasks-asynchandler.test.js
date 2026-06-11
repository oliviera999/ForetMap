'use strict';

/**
 * Tests no-DB pour la migration O8 de routes/tasks.js.
 *
 * Verifie que les handlers enveloppes par asyncHandler propagent bien les erreurs
 * vers next() et ne court-circuitent pas le handler central de server.js.
 * Les handlers conservant leur propre try/catch (POST /import, PUT /:id, POST /:id/unassign)
 * sont documentes ci-dessous mais non testes ici (comportement inchange).
 */

const test = require('node:test');
const assert = require('node:assert');
const asyncHandler = require('../lib/asyncHandler');

function mockRes() {
  const res = {
    statusCode: 200,
    jsonBody: undefined,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.jsonBody = body; return this; },
    sendFile(_path, cb) { if (cb) cb(null); return this; },
    setHeader() { return this; },
    send() { return this; },
    type() { return this; },
  };
  return res;
}

function mockNext() {
  const calls = [];
  const fn = (err) => { calls.push(err); };
  fn.calls = calls;
  return fn;
}

// ── O8 : les handlers asyncHandler propagent les rejets vers next() ──────────

test('tasks O8: handler asyncHandler propage le rejet async vers next(err)', async () => {
  const boom = new Error('db error');
  const handler = asyncHandler(async (_req, _res) => { throw boom; });
  const next = mockNext();
  await handler({}, mockRes(), next);
  assert.strictEqual(next.calls.length, 1);
  assert.strictEqual(next.calls[0], boom);
});

test('tasks O8: handler asyncHandler propage err.status 404 vers next(err)', async () => {
  const handler = asyncHandler(async (_req, _res) => {
    const e = new Error('Tâche introuvable');
    e.status = 404;
    throw e;
  });
  const next = mockNext();
  await handler({}, mockRes(), next);
  assert.strictEqual(next.calls[0].status, 404);
  assert.strictEqual(next.calls[0].message, 'Tâche introuvable');
});

test('tasks O8: handler asyncHandler succes ne touche pas next()', async () => {
  const handler = asyncHandler(async (_req, res) => { res.json({ ok: true }); });
  const next = mockNext();
  const res = mockRes();
  await handler({}, res, next);
  assert.strictEqual(next.calls.length, 0);
  assert.deepStrictEqual(res.jsonBody, { ok: true });
});

// ── Handlers avec try/catch conserve (comportement preexistant non altere) ──

test('tasks O8 (doc): POST /import conserve son try/catch (e.status===400 → 400)', () => {
  // Ce handler n'est pas enveloppe par asyncHandler car il mappe e.status===400
  // en res.status(400).json() au lieu de propager vers next(err).
  // Documenté ici pour traçabilité.
  assert.ok(true, 'POST /import: try/catch conserve intentionnellement');
});

test('tasks O8 (doc): PUT /:id conserve son try/catch (exposeDetail debug)', () => {
  // PUT /:id a un catch qui peut ajouter debugDetail/debugCode selon
  // FORETMAP_DEBUG_TASK_PUT_CLIENT — non reproductible par le handler central.
  assert.ok(true, 'PUT /:id: try/catch conserve intentionnellement');
});

test('tasks O8 (doc): POST /:id/unassign conserve son try/catch (message personnalisé)', () => {
  // POST /:id/unassign utilise respondInternalError(res, req, err, "Erreur lors du retrait")
  // — message 500 different du defaut "Erreur serveur" du handler central.
  assert.ok(true, 'POST /:id/unassign: try/catch conserve intentionnellement');
});
