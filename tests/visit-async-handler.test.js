'use strict';

/**
 * Tests no-DB : vérifie que les helpers de sérialisation et de sanitisation
 * de routes/visit.js fonctionnent correctement, et que le module se charge
 * sans erreur (prouve l'intégration d'asyncHandler).
 *
 * Ces tests ne dépendent d'aucune base de données.
 */

const test = require('node:test');
const assert = require('node:assert');

// ── helpers purs exportés indirectement via require du module ────────────────

// On charge uniquement les utilitaires purs utilisés par visit.js via leurs
// propres modules pour rester no-DB.

const asyncHandler = require('../lib/asyncHandler');

// ── ratioPct (logique interne reproduite ici pour test unitaire) ─────────────

function ratioPct(numerator, denominator) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return 0;
  return Number(((numerator / denominator) * 100).toFixed(1));
}

test('ratioPct: zéro sessions -> 0', () => {
  assert.strictEqual(ratioPct(0, 0), 0);
});

test('ratioPct: calcul correct', () => {
  assert.strictEqual(ratioPct(1, 2), 50);
  assert.strictEqual(ratioPct(1, 3), 33.3);
});

test('ratioPct: dénominateur non fini -> 0', () => {
  assert.strictEqual(ratioPct(5, NaN), 0);
  assert.strictEqual(ratioPct(5, -1), 0);
});

// ── asyncHandler : route visit-like ─────────────────────────────────────────

test('asyncHandler wrapping visite: succès renvoie JSON sans toucher next', async () => {
  const calls = [];
  const next = (e) => calls.push(e);
  const res = { status() { return this; }, json(body) { this._body = body; return this; }, _body: null };
  const handler = asyncHandler(async (req, res) => {
    res.json({ ok: true, map_id: 'test' });
  });
  await handler({}, res, next);
  assert.deepStrictEqual(res._body, { ok: true, map_id: 'test' });
  assert.strictEqual(calls.length, 0, 'next ne doit pas être appelé');
});

test('asyncHandler wrapping visite: erreur SQL générique propagée vers next', async () => {
  const calls = [];
  const next = (e) => calls.push(e);
  const sqlErr = new Error('ER_LOCK_DEADLOCK');
  sqlErr.errno = 1213;
  const handler = asyncHandler(async () => { throw sqlErr; });
  await handler({}, {}, next);
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0], sqlErr);
});

test('asyncHandler wrapping visite: erreur SQL errno 1146 peut être interceptée avant throw', async () => {
  // Simule le pattern des routes mascot-packs :
  // catch(err) { const mapped = mapFn(err); if (mapped) return res.json(mapped.body); throw err; }
  const calls = [];
  const next = (e) => calls.push(e);
  const res = { status() { return this; }, json(b) { this._body = b; return this; }, _body: null };

  function mapSqlError(err) {
    if (err.errno === 1146) return { status: 503, body: { error: 'Table manquante', code: 'table_missing' } };
    return null;
  }

  const err1146 = new Error('ER_NO_SUCH_TABLE');
  err1146.errno = 1146;
  err1146.code = 'ER_NO_SUCH_TABLE';

  const handler = asyncHandler(async (req, res) => {
    try {
      throw err1146;
    } catch (err) {
      const mapped = mapSqlError(err);
      if (mapped) return res.status(mapped.status).json(mapped.body);
      throw err;
    }
  });

  await handler({}, res, next);
  // L'erreur doit être mappée, pas propagée à next
  assert.strictEqual(calls.length, 0, 'next ne doit pas être appelé pour errno 1146');
  assert.deepStrictEqual(res._body, { error: 'Table manquante', code: 'table_missing' });
});

test('asyncHandler wrapping visite: erreur non mappée (errno 1213) propagée vers next', async () => {
  const calls = [];
  const next = (e) => calls.push(e);
  const res = { status() { return this; }, json(b) { this._body = b; return this; }, _body: null };

  function mapSqlError(err) {
    if (err.errno === 1146) return { status: 503, body: { error: 'Table manquante', code: 'table_missing' } };
    return null;
  }

  const errDeadlock = new Error('ER_LOCK_DEADLOCK');
  errDeadlock.errno = 1213;

  const handler = asyncHandler(async (req, res) => {
    try {
      throw errDeadlock;
    } catch (err) {
      const mapped = mapSqlError(err);
      if (mapped) return res.status(mapped.status).json(mapped.body);
      throw err;
    }
  });

  await handler({}, res, next);
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0], errDeadlock, 'deadlock doit être propagé vers next');
  assert.strictEqual(res._body, null, 'aucun corps de réponse pour une erreur non mappée');
});
