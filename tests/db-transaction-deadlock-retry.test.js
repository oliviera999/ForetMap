'use strict';

/**
 * `withTransaction` rejoue le travail sur un interblocage InnoDB (1213), comme le recommande
 * MySQL. Deux transactions verrouillent deux lignes dans l'ordre inverse : l'une est choisie
 * victime par InnoDB, rejouée, et les deux aboutissent. Relevé par le banc de simulation
 * « Tenir à deux » (équipes en parallèle : 500 sur le jet).
 */

require('./helpers/setup');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const db = require('../database');

const TABLE = `tmp_deadlock_${Date.now()}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

before(async () => {
  await db.initSchema();
  await db.execute(`CREATE TABLE ${TABLE} (id INT PRIMARY KEY, n INT NOT NULL DEFAULT 0)`);
  await db.execute(`INSERT INTO ${TABLE} (id, n) VALUES (1, 0), (2, 0)`);
});

after(async () => {
  await db.execute(`DROP TABLE IF EXISTS ${TABLE}`);
});

test('isDeadlockError reconnaît le code et le numéro InnoDB', () => {
  assert.equal(db.isDeadlockError({ code: 'ER_LOCK_DEADLOCK' }), true);
  assert.equal(db.isDeadlockError({ errno: 1213 }), true);
  assert.equal(db.isDeadlockError({ code: 'ER_DUP_ENTRY', errno: 1062 }), false);
  assert.equal(db.isDeadlockError(null), false);
});

test('deux transactions croisées : la victime de l’interblocage est rejouée et les deux aboutissent', async () => {
  const attempts = { a: 0, b: 0 };
  const croise = async (name, first, second) => {
    await db.withTransaction(async (tx) => {
      attempts[name] += 1;
      await tx.execute(`UPDATE ${TABLE} SET n = n + 1 WHERE id = ?`, [first]);
      await sleep(150);
      await tx.execute(`UPDATE ${TABLE} SET n = n + 1 WHERE id = ?`, [second]);
    });
  };
  await Promise.all([croise('a', 1, 2), croise('b', 2, 1)]);
  const rows = await db.queryAll(`SELECT id, n FROM ${TABLE} ORDER BY id`);
  assert.deepEqual(
    rows.map((r) => Number(r.n)),
    [2, 2],
    'chaque ligne incrémentée par les deux transactions',
  );
  assert.ok(
    attempts.a + attempts.b >= 3,
    `une des deux a été rejouée (${JSON.stringify(attempts)})`,
  );
});

test('sans relance (deadlockRetries: 0), l’interblocage remonte', async () => {
  const croise = (first, second) =>
    db.withTransaction(
      async (tx) => {
        await tx.execute(`UPDATE ${TABLE} SET n = n + 1 WHERE id = ?`, [first]);
        await sleep(150);
        await tx.execute(`UPDATE ${TABLE} SET n = n + 1 WHERE id = ?`, [second]);
      },
      { deadlockRetries: 0 },
    );
  const results = await Promise.allSettled([croise(1, 2), croise(2, 1)]);
  const rejected = results.filter((r) => r.status === 'rejected');
  assert.equal(rejected.length, 1, 'exactement une victime');
  assert.ok(db.isDeadlockError(rejected[0].reason));
});
