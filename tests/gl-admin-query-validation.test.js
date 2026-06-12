'use strict';

// O7 — vérifie SANS DB que les schémas zod de routes/gl/admin.js reproduisent exactement la
// logique historique, sans jamais produire de 400 eux-mêmes :
// - GET /media-library : `limit` (`Number.isFinite(Number(x)) ? x : 300`, repli côté handler) ;
// - GET /players + GET /players/export : `classId` (`req.query?.classId ? Number(...) : null`,
//   NaN/Infinity conservés), le 400 « classId invalide » de l'export restant décidé par le
//   handler sur sa condition inchangée (`classId != null && !Number.isFinite(classId)`) ;
// - GET /media-library/chapter-scenes : `chapter` (`Number(req.query?.chapter)`, NaN conservé),
//   le 400 « Paramètre chapter requis (0–5) » restant décidé par le handler.
const test = require('node:test');
const assert = require('node:assert');
const { validate } = require('../lib/validate');
const {
  glAdminMediaQuerySchema,
  glAdminPlayersQuerySchema,
  glAdminChapterScenesQuerySchema,
} = require('../routes/gl/admin');

function runSchema(schema, query) {
  const req = { query };
  let nextCalled = false;
  const res = {
    statusCode: 200,
    status(c) { this.statusCode = c; return this; },
    json() { return this; },
  };
  validate({ query: schema })(req, res, () => { nextCalled = true; });
  return { nextCalled, status: res.statusCode, validated: req.validatedQuery };
}

function runQuery(rawValue) {
  const { nextCalled, status, validated } = runSchema(
    glAdminMediaQuerySchema,
    rawValue === undefined ? {} : { limit: rawValue }
  );
  return { nextCalled, status, value: validated?.limit };
}

test('limit : équivalence exacte avec la logique historique, jamais de 400', () => {
  // Reproduit le handler : limite effective passée à listMediaLibraryItems.
  const effective = (v) => (Number.isFinite(v) ? v : 300);
  const legacy = (raw) => { const n = Number(raw); return Number.isFinite(n) ? n : 300; };
  const cases = [undefined, '', 'abc', '0', '5', '50.9', '-3', '400', '999999', '12abc'];
  for (const raw of cases) {
    const { nextCalled, status, value } = runQuery(raw);
    assert.strictEqual(nextCalled, true, `limit=${JSON.stringify(raw)} ne doit jamais être rejeté`);
    assert.strictEqual(status, 200);
    assert.strictEqual(effective(value), legacy(raw), `limit effectif pour ${JSON.stringify(raw)}`);
  }
});

test('limit répété (?limit=1&limit=2 → tableau) : non numérique → repli 300, jamais de 400', () => {
  const { nextCalled, value } = runQuery(['1', '2']);
  assert.strictEqual(nextCalled, true);
  assert.strictEqual(Number.isFinite(value) ? value : 300, 300);
});

// Cas limites numériques communs (paramètre absent, vide, non numérique, zéro, négatif,
// décimal, très grand, Infinity, partiellement numérique, répété en tableau).
const NUMERIC_EDGE_CASES = [undefined, '', '  ', 'abc', '0', '3', '-1', '2.5', '999999', 'Infinity', '12abc', ['1', '2'], ['4']];

// ——— GET /players — ré-implémentation indépendante de l'ancien handler. ———
// Ancien : classId = req.query?.classId ? Number(...) : null, puis `classId ?` filtre SQL.
function legacyPlayersOutcome(query) {
  const classId = query?.classId ? Number(query.classId) : null;
  return classId ? { filtered: true, param: classId } : { filtered: false, param: null };
}
function currentPlayersOutcome(validated) {
  const classId = validated?.classId;
  return classId ? { filtered: true, param: classId } : { filtered: false, param: null };
}

test('GET /players — classId : équivalence exacte avec la logique historique, jamais de 400 issu du schéma', () => {
  for (const raw of NUMERIC_EDGE_CASES) {
    const query = raw === undefined ? {} : { classId: raw };
    const { nextCalled, status, validated } = runSchema(glAdminPlayersQuerySchema, query);
    const label = `classId=${JSON.stringify(raw)}`;
    assert.strictEqual(nextCalled, true, `${label} ne doit jamais être rejeté par le schéma`);
    assert.strictEqual(status, 200, label);
    assert.deepStrictEqual(currentPlayersOutcome(validated), legacyPlayersOutcome(query), label);
  }
  // Branches notables : ''/0/NaN → falsy → pas de filtre ; -1/2.5/Infinity conservés tels quels.
  assert.strictEqual(currentPlayersOutcome(runSchema(glAdminPlayersQuerySchema, { classId: '' }).validated).filtered, false);
  assert.strictEqual(currentPlayersOutcome(runSchema(glAdminPlayersQuerySchema, { classId: '0' }).validated).filtered, false);
  assert.strictEqual(currentPlayersOutcome(runSchema(glAdminPlayersQuerySchema, { classId: 'abc' }).validated).filtered, false);
  assert.strictEqual(runSchema(glAdminPlayersQuerySchema, { classId: '-1' }).validated.classId, -1);
  assert.strictEqual(runSchema(glAdminPlayersQuerySchema, { classId: '2.5' }).validated.classId, 2.5);
  assert.strictEqual(runSchema(glAdminPlayersQuerySchema, { classId: 'Infinity' }).validated.classId, Infinity);
  assert.strictEqual(runSchema(glAdminPlayersQuerySchema, { classId: ['4'] }).validated.classId, 4); // Number(['4']) === 4, comme avant
});

// ——— GET /players/export — ré-implémentation indépendante de l'ancien handler. ———
// Ancien : classId = raw == null ? null : Number(raw) ; 400 si présent et non fini ; puis
// `classId ?` filtre SQL. ('' → 0 historique vs null nouveau : même branche observable.)
function legacyExportOutcome(query) {
  const classId = query?.classId == null ? null : Number(query.classId);
  if (classId != null && !Number.isFinite(classId)) return { rejected: true };
  return { rejected: false, ...(classId ? { filtered: true, param: classId } : { filtered: false, param: null }) };
}
function currentExportOutcome(validated) {
  const classId = validated?.classId;
  if (classId != null && !Number.isFinite(classId)) return { rejected: true };
  return { rejected: false, ...(classId ? { filtered: true, param: classId } : { filtered: false, param: null }) };
}

test('GET /players/export — classId : équivalence exacte, le 400 « classId invalide » reste décidé par le handler', () => {
  for (const raw of NUMERIC_EDGE_CASES) {
    const query = raw === undefined ? {} : { classId: raw };
    const { nextCalled, status, validated } = runSchema(glAdminPlayersQuerySchema, query);
    const label = `classId=${JSON.stringify(raw)}`;
    assert.strictEqual(nextCalled, true, `${label} ne doit jamais être rejeté par le schéma`);
    assert.strictEqual(status, 200, label);
    assert.deepStrictEqual(currentExportOutcome(validated), legacyExportOutcome(query), label);
  }
  // Branches notables : non numérique/Infinity → 400 du handler ; '' → ni 400 ni filtre (comme
  // l'ancien Number('') === 0) ; '0' → ni 400 ni filtre ; négatif/décimal → filtre conservé.
  assert.strictEqual(currentExportOutcome(runSchema(glAdminPlayersQuerySchema, { classId: 'abc' }).validated).rejected, true);
  assert.strictEqual(currentExportOutcome(runSchema(glAdminPlayersQuerySchema, { classId: ['1', '2'] }).validated).rejected, true);
  assert.deepStrictEqual(currentExportOutcome(runSchema(glAdminPlayersQuerySchema, { classId: '' }).validated), { rejected: false, filtered: false, param: null });
  assert.deepStrictEqual(currentExportOutcome(runSchema(glAdminPlayersQuerySchema, { classId: '0' }).validated), { rejected: false, filtered: false, param: null });
  assert.deepStrictEqual(currentExportOutcome(runSchema(glAdminPlayersQuerySchema, { classId: '-1' }).validated), { rejected: false, filtered: true, param: -1 });
});

// ——— GET /media-library/chapter-scenes — ré-implémentation indépendante. ———
// Ancien : n = Number(req.query?.chapter) ; 400 si !Number.isInteger(n) || n < 0 || n > 5.
function legacyChapterOutcome(query) {
  const n = Number(query?.chapter);
  if (!Number.isInteger(n) || n < 0 || n > 5) return { rejected: true };
  return { rejected: false, chapter: n };
}
function currentChapterOutcome(validated) {
  const n = validated?.chapter;
  if (!Number.isInteger(n) || n < 0 || n > 5) return { rejected: true };
  return { rejected: false, chapter: n };
}

test('GET /media-library/chapter-scenes — chapter : équivalence exacte, le 400 (0–5) reste décidé par le handler', () => {
  const cases = [...NUMERIC_EDGE_CASES, '5', '6', '5.5', '-0', ' 3 '];
  for (const raw of cases) {
    const query = raw === undefined ? {} : { chapter: raw };
    const { nextCalled, status, validated } = runSchema(glAdminChapterScenesQuerySchema, query);
    const label = `chapter=${JSON.stringify(raw)}`;
    assert.strictEqual(nextCalled, true, `${label} ne doit jamais être rejeté par le schéma`);
    assert.strictEqual(status, 200, label);
    assert.deepStrictEqual(currentChapterOutcome(validated), legacyChapterOutcome(query), label);
  }
  // Branches notables : absent → NaN → 400 du handler ; '' → 0 (prologue) accepté comme avant ;
  // bornes 0/5 acceptées, 6/-1/décimal/non numérique → 400 du handler.
  assert.strictEqual(currentChapterOutcome(runSchema(glAdminChapterScenesQuerySchema, {}).validated).rejected, true);
  assert.deepStrictEqual(currentChapterOutcome(runSchema(glAdminChapterScenesQuerySchema, { chapter: '' }).validated), { rejected: false, chapter: 0 });
  assert.deepStrictEqual(currentChapterOutcome(runSchema(glAdminChapterScenesQuerySchema, { chapter: '5' }).validated), { rejected: false, chapter: 5 });
  assert.strictEqual(currentChapterOutcome(runSchema(glAdminChapterScenesQuerySchema, { chapter: '6' }).validated).rejected, true);
  assert.strictEqual(currentChapterOutcome(runSchema(glAdminChapterScenesQuerySchema, { chapter: '2.5' }).validated).rejected, true);
  assert.strictEqual(currentChapterOutcome(runSchema(glAdminChapterScenesQuerySchema, { chapter: 'abc' }).validated).rejected, true);
});
