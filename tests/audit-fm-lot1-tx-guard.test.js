'use strict';

// Posé avant `helpers/setup`, qui charge déjà `database.js`.
process.env.FORETMAP_TX_MAX_MS = '150';
require('./helpers/setup');

/**
 * Audit ForetMap du 19/11/2026, lot 1 — S12 (`database.js`, `FORETMAP_TX_MAX_MS`).
 *
 * Après un abandon par le plafond dur, la connexion était rendue au pool pendant que le
 * travail continuait : son `commit()` tardif pouvait valider la transaction d'un autre appelant
 * sur une connexion réattribuée. Attendu : connexion détruite (jamais rendue), aucun commit.
 *
 * Le plafond est lu au chargement de `database.js` : ce fichier tourne dans son propre process
 * (node --test isole chaque fichier), la variable est posée avant tout `require`.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const database = require('../database');

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('S12 — travail abandonné : pas de commit, connexion détruite et non rendue au pool', async () => {
  const calls = [];
  const realGetConnection = database.pool.getConnection.bind(database.pool);
  database.pool.getConnection = async () => {
    const conn = await realGetConnection();
    for (const method of ['commit', 'rollback', 'release', 'destroy']) {
      const original = conn[method].bind(conn);
      conn[method] = (...args) => {
        calls.push(method);
        return original(...args);
      };
    }
    return conn;
  };

  let workFinished = false;
  try {
    await assert.rejects(
      database.withTransaction(async (tx) => {
        await tx.queryOne('SELECT 1 AS un');
        await pause(350); // dépasse FORETMAP_TX_MAX_MS
        workFinished = true;
        return 'fini';
      }),
      /durée maximale dépassée/,
    );
    // Le travail « zombie » se termine après l'abandon : c'est là que partait le commit.
    await pause(400);
    assert.strictEqual(workFinished, true);
    assert.ok(!calls.includes('commit'), `aucun commit après abandon (appels : ${calls})`);
    assert.ok(!calls.includes('release'), 'la connexion n’est pas rendue au pool');
    assert.ok(calls.includes('destroy'), 'la connexion est détruite');
  } finally {
    database.pool.getConnection = realGetConnection;
  }

  // Le pool reste utilisable : une nouvelle transaction rapide aboutit.
  const value = await database.withTransaction(async (tx) => {
    const row = await tx.queryOne('SELECT 2 AS deux');
    return Number(row.deux);
  });
  assert.strictEqual(value, 2);
});
