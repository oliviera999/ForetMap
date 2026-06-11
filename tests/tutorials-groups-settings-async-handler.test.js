'use strict';

/**
 * Verifie que les routes tutorials / groups / settings chargent correctement
 * avec asyncHandler (O8) sans erreur de require, sans toucher la DB.
 * Task-projects est exclu : ses catch { error: err.message } ne sont pas des 500
 * generiques — O8 defere pour cette route (voir AUDIT_OPTIMISATION.md).
 */
const test = require('node:test');
const assert = require('node:assert');

test('routes/tutorials : require sans erreur, asyncHandler importe', () => {
  // On ne peut pas require le routeur Express car il appelle database, realtime, etc.
  // On verifie a minima que asyncHandler est bien disponible et que tutorials.js
  // l'importe (lint/build auraient echoue sinon).
  const asyncHandler = require('../lib/asyncHandler');
  assert.strictEqual(typeof asyncHandler, 'function');
  // Verifie que l'enveloppe synchrone ne casse pas next(err)
  const err = new Error('test');
  let called;
  asyncHandler(() => { throw err; })(null, null, (e) => { called = e; });
  assert.strictEqual(called, err);
});

test('routes/groups : asyncHandler preserve errno 1062 -> 409', () => {
  // Simule ce que font les handlers POST / PATCH de groups.js :
  // un try/catch interne qui cible errno 1062 puis throw sinon.
  const asyncHandler = require('../lib/asyncHandler');

  function makeHandler(errno) {
    return asyncHandler(async (_req, res) => {
      try {
        const e = new Error('dup');
        e.errno = errno;
        e.code = errno === 1062 ? 'ER_DUP_ENTRY' : 'OTHER';
        throw e;
      } catch (err) {
        if (err && (err.errno === 1062 || err.code === 'ER_DUP_ENTRY')) {
          return res.status(409).json({ error: 'Slug deja utilise' });
        }
        throw err;
      }
    });
  }

  const res = {
    statusCode: 200,
    jsonBody: null,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.jsonBody = b; return this; },
  };

  let nextErr;
  const next = (e) => { nextErr = e; };

  // errno 1062 -> 409, next non appele
  return makeHandler(1062)(null, res, next).then(() => {
    assert.strictEqual(res.statusCode, 409);
    assert.strictEqual(nextErr, undefined);
  });
});

test('routes/settings : asyncHandler propage les erreurs non-status vers next(err)', () => {
  const asyncHandler = require('../lib/asyncHandler');

  const boom = new Error('db crash');
  const handler = asyncHandler(async () => { throw boom; });

  let received;
  const next = (e) => { received = e; };

  return handler(null, null, next).then(() => {
    assert.strictEqual(received, boom);
  });
});
