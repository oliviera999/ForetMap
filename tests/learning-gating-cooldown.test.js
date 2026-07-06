'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const cooldown = require('../lib/learningGatingCooldown');

const DAY = 24 * 60 * 60 * 1000;

test('clampCooldownDays — bornage 0..365', () => {
  assert.equal(cooldown.clampCooldownDays(3), 3);
  assert.equal(cooldown.clampCooldownDays(-5), 0);
  assert.equal(cooldown.clampCooldownDays(1000), 365);
  assert.equal(cooldown.clampCooldownDays('3'), 3);
  assert.equal(cooldown.clampCooldownDays('abc', 3), 3);
  assert.equal(cooldown.clampCooldownDays(2.9), 2);
});

test('buildCooldownState — non verrouille sans date ou date passee', () => {
  const now = 1_000_000_000_000;
  const noDate = cooldown.buildCooldownState(null, 3, now);
  assert.equal(noDate.locked, false);
  assert.equal(noDate.remaining_ms, 0);
  assert.equal(noDate.remaining_days, 0);
  assert.equal(noDate.retry_days, 3);

  const past = cooldown.buildCooldownState(new Date(now - DAY), 3, now);
  assert.equal(past.locked, false);
  assert.equal(past.locked_until, null);
});

test('buildCooldownState — verrouille avec date future', () => {
  const now = 1_000_000_000_000;
  const state = cooldown.buildCooldownState(new Date(now + 2 * DAY + 1000), 3, now);
  assert.equal(state.locked, true);
  assert.equal(state.retry_days, 3);
  assert.equal(state.remaining_days, 3); // arrondi au superieur
  assert.ok(state.remaining_ms > 2 * DAY);
  assert.equal(typeof state.locked_until, 'string');
});

test('remainingCooldownDays — arrondi superieur', () => {
  assert.equal(cooldown.remainingCooldownDays(0), 0);
  assert.equal(cooldown.remainingCooldownDays(-1), 0);
  assert.equal(cooldown.remainingCooldownDays(DAY), 1);
  assert.equal(cooldown.remainingCooldownDays(DAY + 1), 2);
  assert.equal(cooldown.remainingCooldownDays(3 * DAY), 3);
});

// Fabrique un faux `db` capturant les requetes et renvoyant des lignes programmables.
function fakeDb({ linkRow = { ok: 1 }, cooldownRow = null } = {}) {
  const calls = { execute: [], queryOne: [] };
  return {
    calls,
    async queryOne(sql, params) {
      calls.queryOne.push({ sql, params });
      if (/resource_question_links/.test(sql)) return linkRow;
      if (/gating_cooldowns/.test(sql)) return cooldownRow;
      return null;
    },
    async execute(sql, params) {
      calls.execute.push({ sql, params });
      return { affectedRows: 1 };
    },
  };
}

test('maybeRegisterCooldownOnWrong — no-op si bonne reponse', async () => {
  const db = fakeDb();
  const res = await cooldown.maybeRegisterCooldownOnWrong(db, {
    product: 'fm',
    userId: '7',
    resourceType: 'tutorial',
    resourceRef: '12',
    questionCode: 'QF0001',
    isCorrect: true,
    retryDays: 3,
  });
  assert.equal(res, null);
  assert.equal(db.calls.execute.length, 0);
});

test('maybeRegisterCooldownOnWrong — no-op si delai <= 0', async () => {
  const db = fakeDb();
  const res = await cooldown.maybeRegisterCooldownOnWrong(db, {
    product: 'fm',
    userId: '7',
    resourceType: 'tutorial',
    resourceRef: '12',
    questionCode: 'QF0001',
    isCorrect: false,
    retryDays: 0,
  });
  assert.equal(res, null);
  assert.equal(db.calls.execute.length, 0);
});

test('maybeRegisterCooldownOnWrong — no-op si code non lie a la ressource', async () => {
  const db = fakeDb({ linkRow: null });
  const res = await cooldown.maybeRegisterCooldownOnWrong(db, {
    product: 'fm',
    userId: '7',
    resourceType: 'tutorial',
    resourceRef: '12',
    questionCode: 'QF9999',
    isCorrect: false,
    retryDays: 3,
  });
  assert.equal(res, null);
  assert.equal(db.calls.execute.length, 0);
});

test('maybeRegisterCooldownOnWrong — pose le verrou FM sur erreur liee', async () => {
  const db = fakeDb();
  const res = await cooldown.maybeRegisterCooldownOnWrong(db, {
    product: 'fm',
    userId: '7',
    resourceType: 'tutorial',
    resourceRef: '12',
    questionCode: 'QF0001',
    isCorrect: false,
    retryDays: 3,
  });
  assert.equal(db.calls.execute.length, 1);
  const inserted = db.calls.execute[0];
  assert.match(inserted.sql, /INSERT INTO resource_gating_cooldowns/);
  assert.match(inserted.sql, /INTERVAL \? DAY/);
  assert.deepEqual(inserted.params.slice(0, 3), ['7', 'tutorial', '12']);
  assert.equal(inserted.params[3], 3); // days
  // res reflete l'etat relu (cooldownRow=null ici => non verrouille, mais l'INSERT a bien eu lieu)
  assert.ok(res === null || typeof res === 'object');
});

test('maybeRegisterCooldownOnWrong — pose le verrou GL avec le reader', async () => {
  const db = fakeDb();
  const res = await cooldown.maybeRegisterCooldownOnWrong(db, {
    product: 'gl',
    reader: { reader_user_type: 'gl_player', reader_user_id: '42' },
    resourceType: 'species',
    resourceRef: 'SP001',
    questionCode: 'GQCM0001',
    isCorrect: false,
    retryDays: 3,
  });
  assert.equal(db.calls.execute.length, 1);
  assert.match(db.calls.execute[0].sql, /INSERT INTO gl_resource_gating_cooldowns/);
  assert.deepEqual(db.calls.execute[0].params.slice(0, 4), ['gl_player', '42', 'species', 'SP001']);
  assert.ok(res === null || typeof res === 'object');
});

test('getResourceCooldownState — verrouille si locked_until futur', async () => {
  const future = new Date(Date.now() + 3 * DAY);
  const db = fakeDb({ cooldownRow: { locked_until: future } });
  const state = await cooldown.getResourceCooldownState(db, {
    product: 'fm',
    userId: '7',
    resourceType: 'tutorial',
    resourceRef: '12',
    retryDays: 3,
  });
  assert.equal(state.locked, true);
  assert.ok(state.remaining_days >= 1 && state.remaining_days <= 3);
});

test('getResourceCooldownState — non verrouille sans ligne', async () => {
  const db = fakeDb({ cooldownRow: null });
  const state = await cooldown.getResourceCooldownState(db, {
    product: 'fm',
    userId: '7',
    resourceType: 'tutorial',
    resourceRef: '12',
    retryDays: 3,
  });
  assert.equal(state.locked, false);
});
