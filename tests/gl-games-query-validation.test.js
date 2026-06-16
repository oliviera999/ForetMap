'use strict';

// O7 — vérifie SANS DB que les schémas zod de routes/gl/games.js reproduisent exactement la
// logique historique, sans jamais produire de 400 eux-mêmes :
// - GET /api/gl/games : `classId` (ex-`parseId`) + `status` (ex-`normalizeOptionalString`),
//   les 400 « classId invalide » / « status invalide » restant décidés par le handler sur
//   les conditions inchangées (`req.query?.classId != null && !classId`, statut hors liste) ;
// - GET /api/gl/games/:id/feuillet-zones/presented : `teamId` (ex-`parseId`), le 400
//   « teamId requis pour le MJ » restant décidé par le handler (teamId == null côté MJ).
const test = require('node:test');
const assert = require('node:assert');
const { validate } = require('../lib/validate');
const {
  glGamesListQuerySchema,
  glGamesFeuilletPresentedQuerySchema,
} = require('../routes/gl/games');

function runQuery(schema, query) {
  const req = { query };
  let nextCalled = false;
  const res = {
    statusCode: 200,
    status(c) {
      this.statusCode = c;
      return this;
    },
    json() {
      return this;
    },
  };
  validate({ query: schema })(req, res, () => {
    nextCalled = true;
  });
  return { nextCalled, status: res.statusCode, validated: req.validatedQuery };
}

// Ré-implémentations indépendantes de la logique historique.
function legacyParseId(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
function legacyNormalizeOptionalString(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length > 0 ? s : null;
}

const GAME_STATUSES = ['draft', 'live', 'paused', 'ended'];

// Ancien handler GET /games : parseId/normalizeOptionalString + gardes 400, puis filtres.
function legacyGamesOutcome(query) {
  const classId = query?.classId == null ? null : legacyParseId(query.classId);
  const status = legacyNormalizeOptionalString(query?.status);
  if (query?.classId != null && !classId) return { rejected: 'classId' };
  if (status != null && !GAME_STATUSES.includes(status)) return { rejected: 'status' };
  return { rejected: null, classId, status };
}

// Nouveau handler : mêmes gardes, appliqués à req.validatedQuery.
function currentGamesOutcome(query, validated) {
  const classId = validated?.classId;
  const status = validated?.status;
  if (query?.classId != null && !classId) return { rejected: 'classId' };
  if (status != null && !GAME_STATUSES.includes(status)) return { rejected: 'status' };
  return { rejected: null, classId, status };
}

const NUMERIC_EDGE_CASES = [
  undefined,
  '',
  'abc',
  '0',
  '3',
  '-1',
  '2.5',
  '999999',
  '12abc',
  ['1', '2'],
];

test('GET /games — classId/status : équivalence exacte avec la logique historique, jamais de 400 issu du schéma', () => {
  const statusCases = [
    undefined,
    '',
    '  ',
    'live',
    ' live ',
    'LIVE',
    'bogus',
    'draft',
    'ended',
    ['live', 'x'],
  ];
  for (const rawClassId of NUMERIC_EDGE_CASES) {
    for (const rawStatus of statusCases) {
      const query = {};
      if (rawClassId !== undefined) query.classId = rawClassId;
      if (rawStatus !== undefined) query.status = rawStatus;
      const { nextCalled, status, validated } = runQuery(glGamesListQuerySchema, query);
      const label = `classId=${JSON.stringify(rawClassId)} status=${JSON.stringify(rawStatus)}`;
      assert.strictEqual(nextCalled, true, `${label} ne doit jamais être rejeté par le schéma`);
      assert.strictEqual(status, 200, label);
      assert.deepStrictEqual(
        currentGamesOutcome(query, validated),
        legacyGamesOutcome(query),
        label,
      );
    }
  }
});

test("GET /games — branches notables conservées (''/0 → 400 classId, négatif/décimal acceptés, statut trim/hors liste)", () => {
  // '' → Number('') === 0 → !0 → 400 « classId invalide » (comme parseId historique).
  assert.strictEqual(
    currentGamesOutcome(
      { classId: '' },
      runQuery(glGamesListQuerySchema, { classId: '' }).validated,
    ).rejected,
    'classId',
  );
  assert.strictEqual(
    currentGamesOutcome(
      { classId: '0' },
      runQuery(glGamesListQuerySchema, { classId: '0' }).validated,
    ).rejected,
    'classId',
  );
  assert.strictEqual(
    currentGamesOutcome(
      { classId: 'abc' },
      runQuery(glGamesListQuerySchema, { classId: 'abc' }).validated,
    ).rejected,
    'classId',
  );
  assert.strictEqual(
    currentGamesOutcome(
      { classId: ['1', '2'] },
      runQuery(glGamesListQuerySchema, { classId: ['1', '2'] }).validated,
    ).rejected,
    'classId',
  );
  // Négatif/décimal : finis et non nuls → passaient le garde historique, filtre conservé.
  assert.strictEqual(runQuery(glGamesListQuerySchema, { classId: '-1' }).validated.classId, -1);
  assert.strictEqual(runQuery(glGamesListQuerySchema, { classId: '2.5' }).validated.classId, 2.5);
  // status : trim conservé, hors liste → 400 du handler, '' → null (pas de filtre).
  assert.strictEqual(
    runQuery(glGamesListQuerySchema, { status: ' live ' }).validated.status,
    'live',
  );
  assert.strictEqual(runQuery(glGamesListQuerySchema, { status: '' }).validated.status, null);
  assert.strictEqual(
    currentGamesOutcome(
      { status: 'LIVE' },
      runQuery(glGamesListQuerySchema, { status: 'LIVE' }).validated,
    ).rejected,
    'status',
  );
});

test('GET /games/:id/feuillet-zones/presented — teamId : équivalence exacte avec parseId historique', () => {
  for (const raw of NUMERIC_EDGE_CASES) {
    const query = raw === undefined ? {} : { teamId: raw };
    const { nextCalled, status, validated } = runQuery(glGamesFeuilletPresentedQuerySchema, query);
    assert.strictEqual(
      nextCalled,
      true,
      `teamId=${JSON.stringify(raw)} ne doit jamais être rejeté par le schéma`,
    );
    assert.strictEqual(status, 200);
    // Ancienne logique : req.query?.teamId != null ? parseId(raw) : null.
    const legacy = raw !== undefined ? legacyParseId(raw) : null;
    assert.strictEqual(validated.teamId, legacy, `teamId pour ${JSON.stringify(raw)}`);
  }
  // null côté MJ → garde 400 « teamId requis pour le MJ » du handler (condition inchangée).
  assert.strictEqual(runQuery(glGamesFeuilletPresentedQuerySchema, {}).validated.teamId, null);
  assert.strictEqual(
    runQuery(glGamesFeuilletPresentedQuerySchema, { teamId: 'abc' }).validated.teamId,
    null,
  );
  // '' → 0 : parseId('') === 0 passait (lookup équipe → 404 plus loin), conservé.
  assert.strictEqual(
    runQuery(glGamesFeuilletPresentedQuerySchema, { teamId: '' }).validated.teamId,
    0,
  );
});
