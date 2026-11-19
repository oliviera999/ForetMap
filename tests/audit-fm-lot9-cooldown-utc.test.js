'use strict';

// Audit ForetMap du 19/11/2026, P10 : l'échéance du verrou de re-tentative était écrite par
// la base (`DATE_ADD(NOW(), INTERVAL ? HOUR)`), dans le fuseau de la session MySQL, puis
// relue par mysql2 comme une date UTC (`timezone: 'Z'`). Sur une base de production qui
// n'est pas en UTC, le verrou était décalé du fuseau. L'échéance est désormais calculée en
// UTC par Node, et la liste des verrous en cours compare à l'heure UTC de Node.
// Test sans base : connexion factice qui capture le SQL et les paramètres.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  registerResourceCooldown,
  toUtcSqlDateTime,
  lockedUntilFromNow,
} = require('../lib/learningGatingCooldown');
const { listFmLocks, listGlLocks } = require('../lib/learningGatingAdmin');

function fakeDb() {
  const calls = [];
  return {
    calls,
    execute: async (sql, params) => {
      calls.push({ sql, params });
      return { affectedRows: 1 };
    },
    queryOne: async (sql, params) => {
      calls.push({ sql, params });
      return null;
    },
    queryAll: async (sql, params) => {
      calls.push({ sql, params });
      return [];
    },
  };
}

test('toUtcSqlDateTime / lockedUntilFromNow : format SQL en UTC', () => {
  assert.equal(toUtcSqlDateTime(Date.UTC(2031, 0, 15, 22, 30, 5)), '2031-01-15 22:30:05');
  // Passage de minuit UTC : aucune dépendance au fuseau du processus.
  assert.equal(lockedUntilFromNow(6, Date.UTC(2031, 0, 15, 22, 0, 0)), '2031-01-16 04:00:00');
  assert.equal(lockedUntilFromNow(0.5, Date.UTC(2031, 0, 15, 22, 0, 0)), '2031-01-15 22:30:00');
});

test('registerResourceCooldown : échéance calculée par Node, jamais par NOW() de la base', async () => {
  const db = fakeDb();
  await registerResourceCooldown(db, {
    product: 'fm',
    userId: '42',
    resourceType: 'tutorial',
    resourceRef: '7',
    questionCode: 'QF0001',
    retryHours: 6,
    nowMs: Date.UTC(2031, 0, 15, 10, 0, 0),
  });
  const insert = db.calls.find((c) => /INSERT INTO/i.test(c.sql));
  assert.ok(insert, 'INSERT émis');
  assert.doesNotMatch(insert.sql, /DATE_ADD\s*\(\s*NOW\(\)/i);
  assert.ok(insert.params.includes('2031-01-15 16:00:00'), JSON.stringify(insert.params));
});

test('GL : même calcul (produit gl, couple lecteur)', async () => {
  const db = fakeDb();
  await registerResourceCooldown(db, {
    product: 'gl',
    reader: { reader_user_type: 'gl_player', reader_user_id: '9' },
    resourceType: 'species',
    resourceRef: 'ESP1',
    retryHours: 2,
    nowMs: Date.UTC(2031, 5, 1, 23, 0, 0),
  });
  const insert = db.calls.find((c) => /INSERT INTO/i.test(c.sql));
  assert.ok(insert, 'INSERT émis');
  assert.doesNotMatch(insert.sql, /DATE_ADD\s*\(\s*NOW\(\)/i);
  assert.ok(insert.params.includes('2031-06-02 01:00:00'), JSON.stringify(insert.params));
});

test('listFmLocks / listGlLocks : « en cours » comparé à l’heure UTC de Node', async () => {
  const nowMs = Date.UTC(2031, 0, 15, 10, 0, 0);
  for (const list of [listFmLocks, listGlLocks]) {
    const db = fakeDb();
    await list(db, { nowMs });
    const [call] = db.calls;
    assert.doesNotMatch(call.sql, /locked_until\s*>\s*NOW\(\)/i);
    assert.ok(call.params.includes('2031-01-15 10:00:00'), JSON.stringify(call.params));
  }
});
