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

/** Colonnes d'un INSERT vs expressions de VALUES — échoue si un `?` a été oublié. */
function assertInsertArity(sql, expectedColumns) {
  const colPart = sql.match(/INSERT INTO \S+\s*\(([^)]+)\)/)?.[1];
  assert.ok(colPart, 'INSERT sans liste de colonnes');
  const cols = colPart
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  assert.equal(
    cols.length,
    expectedColumns,
    `attendu ${expectedColumns} colonnes, obtenu ${cols.length}`,
  );
  const valPart = sql.match(/VALUES\s*\(([\s\S]*?)\)\s*ON DUPLICATE/)?.[1];
  assert.ok(valPart, 'INSERT sans VALUES');
  const normalized = valPart
    .replace(/DATE_ADD\(NOW\(\),\s*INTERVAL \? DAY\)/g, '?')
    .replace(/\bNOW\(\)/g, '?');
  const values = normalized
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  assert.equal(
    values.length,
    cols.length,
    `colonnes (${cols.length}) != valeurs (${values.length}) — le verrou serait refusé par MariaDB`,
  );
}

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
  assertInsertArity(inserted.sql, 7);
  assert.deepEqual(inserted.params.slice(0, 3), ['7', 'tutorial', '12']);
  // La clé porte désormais le code de question ('' = verrou de portée ressource) ;
  // on vérifie la présence des valeurs plutôt que leur position, qui bougera encore.
  assert.equal(inserted.params[3], '', 'portée ressource par défaut');
  assert.ok(inserted.params.includes(3), 'le délai en jours est bien transmis');
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
  const inserted = db.calls.execute[0];
  assert.match(inserted.sql, /INSERT INTO gl_resource_gating_cooldowns/);
  // 8 colonnes (dont question_code) : sans le ? de la clé, MariaDB refuse
  // ER_WRONG_VALUE_COUNT_ON_ROW et le verrou n'est jamais posé (try/catch silencieux).
  assertInsertArity(inserted.sql, 8);
  assert.match(
    inserted.sql,
    /VALUES \(\?, \?, \?, \?, \?, DATE_ADD\(NOW\(\), INTERVAL \? DAY\), \?, \?\)/,
  );
  assert.deepEqual(inserted.params, [
    'gl_player',
    '42',
    'species',
    'SP001',
    '',
    3,
    'GQCM0001',
    1,
    3,
  ]);
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

// ---------------------------------------------------------------------------
// Tolérance d'essais avant verrou (lot 23). Sans elle, le conditionnement n'avait
// que deux régimes : verrou dès la première erreur, ou aucun contrôle du tout.
// ---------------------------------------------------------------------------

test('clampAllowedWrongAttempts — bornage 0..10', () => {
  assert.equal(cooldown.clampAllowedWrongAttempts(2), 2);
  assert.equal(cooldown.clampAllowedWrongAttempts(-3), 0);
  assert.equal(cooldown.clampAllowedWrongAttempts(99), 10);
  assert.equal(cooldown.clampAllowedWrongAttempts('2'), 2);
  assert.equal(cooldown.clampAllowedWrongAttempts('abc', 1), 1);
  assert.equal(cooldown.clampAllowedWrongAttempts(undefined), 0);
});

test('tolérance 0 — le verrou tombe dès la première erreur (comportement historique)', async () => {
  const db = fakeDb();
  await cooldown.maybeRegisterCooldownOnWrong(db, {
    product: 'fm',
    userId: '7',
    resourceType: 'tutorial',
    resourceRef: '12',
    questionCode: 'QF0001',
    isCorrect: false,
    retryDays: 3,
    allowedWrongAttempts: 0,
  });
  assert.equal(db.calls.execute.length, 1);
  assert.match(db.calls.execute[0].sql, /INTERVAL \? DAY/, 'la date de déblocage est posée');
});

test('sous la tolérance — la faute est comptée, la ressource reste ouverte', async () => {
  const db = fakeDb();
  const res = await cooldown.maybeRegisterCooldownOnWrong(db, {
    product: 'fm',
    userId: '7',
    resourceType: 'tutorial',
    resourceRef: '12',
    questionCode: 'QF0001',
    isCorrect: false,
    retryDays: 3,
    allowedWrongAttempts: 2,
  });
  assert.equal(res.locked, false, 'première faute sur deux tolérées : pas de verrou');
  assert.equal(res.wrong_attempts, 1);
  assert.equal(res.attempts_left, 1);
  assert.equal(db.calls.execute.length, 1);
  assert.ok(
    !/INTERVAL \? DAY/.test(db.calls.execute[0].sql),
    'aucune date de déblocage future ne doit être posée tant que la tolérance tient',
  );
});

test('tolérance épuisée — le verrou tombe', async () => {
  // Une ligne existante porte déjà deux fautes, verrou encore courant.
  const db = fakeDb({
    cooldownRow: {
      wrong_attempts: 2,
      locked_until: new Date(Date.now() + DAY).toISOString(),
    },
  });
  const res = await cooldown.maybeRegisterCooldownOnWrong(db, {
    product: 'fm',
    userId: '7',
    resourceType: 'tutorial',
    resourceRef: '12',
    questionCode: 'QF0001',
    isCorrect: false,
    retryDays: 3,
    allowedWrongAttempts: 2,
  });
  assert.match(db.calls.execute[0].sql, /INTERVAL \? DAY/);
  assert.equal(res?.attempts_left, 0);
});

test('un verrou expiré remet le compteur d’essais à zéro', async () => {
  // Sans cette remise à zéro, la faute suivant l'expiration re-verrouillerait aussitôt.
  const db = fakeDb({
    cooldownRow: {
      wrong_attempts: 5,
      locked_until: new Date(Date.now() - DAY).toISOString(),
    },
  });
  const res = await cooldown.maybeRegisterCooldownOnWrong(db, {
    product: 'fm',
    userId: '7',
    resourceType: 'tutorial',
    resourceRef: '12',
    questionCode: 'QF0001',
    isCorrect: false,
    retryDays: 3,
    allowedWrongAttempts: 2,
  });
  assert.equal(res.locked, false, 'la série précédente est soldée');
  assert.equal(res.wrong_attempts, 1);
});

test('getResourceCooldownState — le compteur ne remonte que si le verrou court', async () => {
  const locked = await cooldown.getResourceCooldownState(
    fakeDb({ cooldownRow: { wrong_attempts: 4, locked_until: new Date(Date.now() + DAY) } }),
    { product: 'fm', userId: '7', resourceType: 'tutorial', resourceRef: '12', retryDays: 3 },
  );
  assert.equal(locked.locked, true);
  assert.equal(locked.wrong_attempts, 4);

  const expired = await cooldown.getResourceCooldownState(
    fakeDb({ cooldownRow: { wrong_attempts: 4, locked_until: new Date(Date.now() - DAY) } }),
    { product: 'fm', userId: '7', resourceType: 'tutorial', resourceRef: '12', retryDays: 3 },
  );
  assert.equal(expired.locked, false);
  assert.equal(expired.wrong_attempts, 0);
});

test('portée « question » — le verrou ne bloque que la question ratée', async () => {
  const db = fakeDb();
  await cooldown.maybeRegisterCooldownOnWrong(db, {
    product: 'fm',
    userId: '7',
    resourceType: 'tutorial',
    resourceRef: '12',
    questionCode: 'QF0001',
    isCorrect: false,
    retryDays: 3,
    cooldownScope: 'question',
  });
  const inserted = db.calls.execute[0];
  assert.equal(inserted.params[3], 'QF0001', 'la clé porte le code de la question');
});

test('portée « ressource » — la clé reste vide, comportement historique', async () => {
  const db = fakeDb();
  await cooldown.maybeRegisterCooldownOnWrong(db, {
    product: 'fm',
    userId: '7',
    resourceType: 'tutorial',
    resourceRef: '12',
    questionCode: 'QF0001',
    isCorrect: false,
    retryDays: 3,
    cooldownScope: 'resource',
  });
  assert.equal(db.calls.execute[0].params[3], '');
});

test('cooldownKeyQuestionCode — la portée décide de la clé', () => {
  assert.equal(cooldown.cooldownKeyQuestionCode({ cooldownScope: 'question' }, 'QF1'), 'QF1');
  assert.equal(cooldown.cooldownKeyQuestionCode({ cooldownScope: 'resource' }, 'QF1'), '');
  assert.equal(cooldown.cooldownKeyQuestionCode({}, 'QF1'), '', 'défaut = ressource entière');
});

test('la lecture prend le verrou le plus contraignant des deux portées', async () => {
  // Une ressource peut porter à la fois un verrou global et un verrou de question :
  // la requête trie par date de déblocage décroissante et garde le plus long.
  const db = fakeDb({
    cooldownRow: { locked_until: new Date(Date.now() + 2 * DAY), wrong_attempts: 1 },
  });
  const state = await cooldown.getResourceCooldownState(db, {
    product: 'fm',
    userId: '7',
    resourceType: 'tutorial',
    resourceRef: '12',
    retryDays: 3,
    questionCode: 'QF0001',
  });
  assert.equal(state.locked, true);
  const read = db.calls.queryOne.find((c) => /gating_cooldowns/.test(c.sql));
  assert.match(read.sql, /question_code IN/);
  assert.match(read.sql, /ORDER BY locked_until DESC/);
  assert.ok(read.params.includes('QF0001') && read.params.includes(''));
});
