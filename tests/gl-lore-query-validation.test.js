'use strict';

// O7 — vérifie SANS DB que GET /api/gl/lore/qcm/pool-preview est branché sur le schéma partagé
// glQcmPoolPreviewQuerySchema et que celui-ci reproduit exactement la logique historique :
// - `chapterId` : `raw != null ? Number(raw) : null` + branche `Number.isFinite` du handler
//   (lookup plateau du chapitre ssi fini, sinon chapterPlateauNumber reste null) ;
// - `difficulteMin`/`difficulteMax` : ancien `parseDifficulteQuery` local (supprimé car devenu
//   inutilisé) — null/'' → null, non fini → null, Math.floor, hors [1;5] → null.
// Le schéma ne rejette jamais ; les ~20 filtres texte/CSV restent lus manuellement sur
// req.query (hors périmètre du schéma).
// Vérifie aussi `gameId`/`teamId` de GET /feuillets et GET /feuillets/:code
// (glLoreFeuilletQuerySchema) : ex-`parseId`/`parseGlId` (Number fini > 0 → entier tronqué,
// sinon null), `biomeSlugs`/`liasse` restant lus manuellement.
const test = require('node:test');
const assert = require('node:assert');
const { validate } = require('../lib/validate');
const { glQcmPoolPreviewQuerySchema, glLoreFeuilletQuerySchema } = require('../routes/gl/lore');
const shared = require('../lib/glQuerySchemas');

function runSchema(schema, query) {
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

function runQuery(query) {
  return runSchema(glQcmPoolPreviewQuerySchema, query);
}

// Ré-implémentations indépendantes de la logique historique.
function legacyChapterId(raw) {
  return raw !== undefined ? Number(raw) : null;
}
function legacyParseDifficulteQuery(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const i = Math.floor(n);
  if (i < 1 || i > 5) return null;
  return i;
}

const EDGE_CASES = [
  undefined,
  '',
  'abc',
  '0',
  '3',
  '5',
  '6',
  '-1',
  '2.5',
  '5.9',
  '0.5',
  '999999',
  '12abc',
  ['1', '2'],
  ['4'],
];

test('le schéma de la route lore est bien le schéma partagé de lib/glQuerySchemas (commun avec qcm)', () => {
  assert.strictEqual(glQcmPoolPreviewQuerySchema, shared.glQcmPoolPreviewQuerySchema);
});

test('chapterId : équivalence exacte avec la logique historique, jamais de 400 issu du schéma', () => {
  for (const raw of EDGE_CASES) {
    const query = raw === undefined ? {} : { chapterId: raw };
    const { nextCalled, status, validated } = runQuery(query);
    assert.strictEqual(
      nextCalled,
      true,
      `chapterId=${JSON.stringify(raw)} ne doit jamais être rejeté par le schéma`,
    );
    assert.strictEqual(status, 200);
    // Branche historique : lookup plateau ssi chapterId != null && Number.isFinite(chapterId).
    const legacy = legacyChapterId(raw);
    const legacyBranch = legacy != null && Number.isFinite(legacy);
    const currentBranch = validated.chapterId != null && Number.isFinite(validated.chapterId);
    assert.strictEqual(
      currentBranch,
      legacyBranch,
      `branche chapterId pour ${JSON.stringify(raw)}`,
    );
    if (legacyBranch)
      assert.strictEqual(
        validated.chapterId,
        legacy,
        `valeur chapterId pour ${JSON.stringify(raw)}`,
      );
  }
  // '' → Number('') === 0 : fini, passait la branche historique (lookup chapitre 0), conservé.
  assert.strictEqual(runQuery({ chapterId: '' }).validated.chapterId, 0);
  assert.strictEqual(runQuery({ chapterId: '-1' }).validated.chapterId, -1);
  assert.strictEqual(runQuery({ chapterId: '2.5' }).validated.chapterId, 2.5);
  assert.strictEqual(runQuery({}).validated.chapterId, null);
  assert.strictEqual(runQuery({ chapterId: 'abc' }).validated.chapterId, null);
  assert.strictEqual(runQuery({ chapterId: ['1', '2'] }).validated.chapterId, null); // Number(['1','2']) → NaN
});

test('difficulteMin/difficulteMax : équivalence exacte avec parseDifficulteQuery historique', () => {
  for (const raw of EDGE_CASES) {
    const query = {};
    if (raw !== undefined) {
      query.difficulteMin = raw;
      query.difficulteMax = raw;
    }
    const { nextCalled, status, validated } = runQuery(query);
    assert.strictEqual(
      nextCalled,
      true,
      `difficulte=${JSON.stringify(raw)} ne doit jamais être rejeté par le schéma`,
    );
    assert.strictEqual(status, 200);
    const legacy = legacyParseDifficulteQuery(raw === undefined ? undefined : raw);
    assert.strictEqual(
      validated.difficulteMin,
      legacy,
      `difficulteMin pour ${JSON.stringify(raw)}`,
    );
    assert.strictEqual(
      validated.difficulteMax,
      legacy,
      `difficulteMax pour ${JSON.stringify(raw)}`,
    );
  }
  // Bornes et replis notables : décimal → floor, hors [1;5]/vide/non numérique → null.
  assert.strictEqual(runQuery({ difficulteMax: '5.9' }).validated.difficulteMax, 5);
  assert.strictEqual(runQuery({ difficulteMax: '0.5' }).validated.difficulteMax, null);
  assert.strictEqual(runQuery({ difficulteMax: '0' }).validated.difficulteMax, null);
  assert.strictEqual(runQuery({ difficulteMax: '6' }).validated.difficulteMax, null);
  assert.strictEqual(runQuery({ difficulteMax: '-1' }).validated.difficulteMax, null);
  assert.strictEqual(runQuery({ difficulteMax: '' }).validated.difficulteMax, null);
  assert.strictEqual(runQuery({ difficulteMax: ['1', '2'] }).validated.difficulteMax, null);
  assert.strictEqual(runQuery({ difficulteMax: ['4'] }).validated.difficulteMax, 4); // Number(['4']) === 4, comme avant
});

// Ré-implémentation indépendante de l'ancien parseId/parseGlId de lib/glTeamContext.js.
function legacyParseGlId(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

test('GET /feuillets(/:code) — gameId/teamId : équivalence exacte avec parseId historique, jamais de 400 issu du schéma', () => {
  const cases = [
    undefined,
    '',
    '  ',
    'abc',
    '0',
    '3',
    '-1',
    '2.5',
    '2.9',
    '999999',
    'Infinity',
    '-Infinity',
    '0.5',
    '12abc',
    ['1', '2'],
    ['4'],
  ];
  for (const rawGameId of cases) {
    for (const rawTeamId of cases) {
      const query = {};
      if (rawGameId !== undefined) query.gameId = rawGameId;
      if (rawTeamId !== undefined) query.teamId = rawTeamId;
      const { nextCalled, status, validated } = runSchema(glLoreFeuilletQuerySchema, query);
      const label = `gameId=${JSON.stringify(rawGameId)} teamId=${JSON.stringify(rawTeamId)}`;
      assert.strictEqual(nextCalled, true, `${label} ne doit jamais être rejeté par le schéma`);
      assert.strictEqual(status, 200, label);
      // Ancienne logique : parseId(req.query?.gameId) / parseId(req.query?.teamId).
      assert.strictEqual(validated.gameId, legacyParseGlId(rawGameId), `gameId pour ${label}`);
      assert.strictEqual(validated.teamId, legacyParseGlId(rawTeamId), `teamId pour ${label}`);
      // Branche historique du chargement de progression : `if (gameId && teamId)`.
      assert.strictEqual(
        Boolean(validated.gameId && validated.teamId),
        Boolean(legacyParseGlId(rawGameId) && legacyParseGlId(rawTeamId)),
        `branche progression pour ${label}`,
      );
    }
  }
});

test('GET /feuillets(/:code) — gameId/teamId : bornes et replis notables conservés', () => {
  const one = (raw) =>
    runSchema(glLoreFeuilletQuerySchema, raw === undefined ? {} : { gameId: raw }).validated.gameId;
  // Absent / vide / non numérique / zéro / négatif / Infinity → null (pas de progression chargée).
  assert.strictEqual(one(undefined), null);
  assert.strictEqual(one(''), null); // Number('') === 0, non > 0
  assert.strictEqual(one('abc'), null);
  assert.strictEqual(one('0'), null);
  assert.strictEqual(one('-1'), null);
  assert.strictEqual(one('Infinity'), null);
  assert.strictEqual(one(['1', '2']), null); // Number(['1','2']) → NaN
  // Décimal → troncature (Math.trunc), comme l'ancien parseGlId.
  assert.strictEqual(one('2.9'), 2);
  // '0.5' : parseGlId teste n > 0 AVANT troncature → Math.trunc(0.5) === 0 (falsy en aval),
  // valeur conservée à l'identique (pas repliée sur null).
  assert.strictEqual(one('0.5'), 0);
});
