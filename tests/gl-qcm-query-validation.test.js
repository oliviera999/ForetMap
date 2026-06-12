'use strict';

// O7 — vérifie SANS DB que le schéma partagé glQcmPoolPreviewQuerySchema (branché sur
// GET /api/gl/qcm/pool-preview) reproduit exactement la logique historique :
// - `chapterId` : `raw != null ? Number(raw) : null` + branche `Number.isFinite` du handler ;
// - `difficulteMin`/`difficulteMax` : ancien `parseDifficulteQuery` (null/'' → null,
//   non fini → null, Math.floor, hors [1;5] → null).
// Le schéma ne rejette jamais (coercition permissive) ; le 400 « biomeSlugs ou chapterId
// requis » historique reste décidé par le handler sur sa condition inchangée.
const test = require('node:test');
const assert = require('node:assert');
const { validate } = require('../lib/validate');
const { glQcmPoolPreviewQuerySchema } = require('../routes/gl/qcm');
const shared = require('../lib/glQuerySchemas');

function runQuery(query) {
  const req = { query };
  let nextCalled = false;
  const res = {
    statusCode: 200,
    status(c) { this.statusCode = c; return this; },
    json() { return this; },
  };
  validate({ query: glQcmPoolPreviewQuerySchema })(req, res, () => { nextCalled = true; });
  return { nextCalled, status: res.statusCode, validated: req.validatedQuery };
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

const EDGE_CASES = [undefined, '', 'abc', '0', '3', '5', '6', '-1', '2.5', '5.9', '0.5', '999999', '12abc', ['1', '2'], ['4']];

test('le schéma de la route est bien le schéma partagé de lib/glQuerySchemas', () => {
  assert.strictEqual(glQcmPoolPreviewQuerySchema, shared.glQcmPoolPreviewQuerySchema);
});

test('chapterId : équivalence exacte avec la logique historique, jamais de 400 issu du schéma', () => {
  for (const raw of EDGE_CASES) {
    const query = raw === undefined ? {} : { chapterId: raw };
    const { nextCalled, status, validated } = runQuery(query);
    assert.strictEqual(nextCalled, true, `chapterId=${JSON.stringify(raw)} ne doit jamais être rejeté par le schéma`);
    assert.strictEqual(status, 200);
    // Branche historique : filtre biomes ssi chapterId != null && Number.isFinite(chapterId).
    const legacy = legacyChapterId(raw);
    const legacyBranch = legacy != null && Number.isFinite(legacy);
    const currentBranch = validated.chapterId != null && Number.isFinite(validated.chapterId);
    assert.strictEqual(currentBranch, legacyBranch, `branche chapterId pour ${JSON.stringify(raw)}`);
    if (legacyBranch) assert.strictEqual(validated.chapterId, legacy, `valeur chapterId pour ${JSON.stringify(raw)}`);
  }
  // '' → Number('') === 0 : fini, passait la branche historique (lookup chapitre 0), conservé.
  assert.strictEqual(runQuery({ chapterId: '' }).validated.chapterId, 0);
  assert.strictEqual(runQuery({ chapterId: '-1' }).validated.chapterId, -1);
  assert.strictEqual(runQuery({ chapterId: '2.5' }).validated.chapterId, 2.5);
  assert.strictEqual(runQuery({}).validated.chapterId, null);
  assert.strictEqual(runQuery({ chapterId: 'abc' }).validated.chapterId, null);
});

test('difficulteMin/difficulteMax : équivalence exacte avec parseDifficulteQuery historique', () => {
  for (const raw of EDGE_CASES) {
    const query = {};
    if (raw !== undefined) { query.difficulteMin = raw; query.difficulteMax = raw; }
    const { nextCalled, status, validated } = runQuery(query);
    assert.strictEqual(nextCalled, true, `difficulte=${JSON.stringify(raw)} ne doit jamais être rejeté par le schéma`);
    assert.strictEqual(status, 200);
    const legacy = legacyParseDifficulteQuery(raw === undefined ? undefined : raw);
    assert.strictEqual(validated.difficulteMin, legacy, `difficulteMin pour ${JSON.stringify(raw)}`);
    assert.strictEqual(validated.difficulteMax, legacy, `difficulteMax pour ${JSON.stringify(raw)}`);
  }
  // Bornes et replis notables : décimal → floor, hors [1;5]/vide/non numérique → null.
  assert.strictEqual(runQuery({ difficulteMin: '5.9' }).validated.difficulteMin, 5);
  assert.strictEqual(runQuery({ difficulteMin: '0.5' }).validated.difficulteMin, null);
  assert.strictEqual(runQuery({ difficulteMin: '0' }).validated.difficulteMin, null);
  assert.strictEqual(runQuery({ difficulteMin: '6' }).validated.difficulteMin, null);
  assert.strictEqual(runQuery({ difficulteMin: '-1' }).validated.difficulteMin, null);
  assert.strictEqual(runQuery({ difficulteMin: '' }).validated.difficulteMin, null);
  assert.strictEqual(runQuery({ difficulteMin: ['1', '2'] }).validated.difficulteMin, null);
  assert.strictEqual(runQuery({ difficulteMin: ['4'] }).validated.difficulteMin, 4); // Number(['4']) === 4, comme avant
});
