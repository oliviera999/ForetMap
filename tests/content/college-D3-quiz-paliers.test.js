'use strict';

/**
 * Chantier collège (novembre 2026), flux D3 — migration `college_quiz_paliers`.
 *
 * Le palier d'une question de collège se déduit de ses notions effectives (au moins une notion
 * de cycle 3 → palier 1, sinon palier 2). Avant D3, 445 questions de collège portaient les deux
 * cycles : le palier ne distinguait rien. Ce test vérifie, sur la base de test (semée par les
 * migrations), que chaque question tranchée et présente porte **un seul** cycle — celui de la
 * décision —, que les questions passées au lycée n'ont plus de notion de collège, que les
 * descriptions collège des catégories sont posées, et que la migration se rejoue sans effet.
 *
 * Les décisions sont lues dans `data/college-2026-11/D3/operations.json` (résolu par
 * `scripts/college-2026-11/build-D3-migration.js`) ; la migration est retrouvée par son suffixe.
 */

require('../helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { initSchema, queryAll, queryOne, execute, splitSqlStatements } = require('../../database');
const { buildQuizQuestionNotionFilter } = require('../../lib/curriculumNotions');

const ROOT = path.resolve(__dirname, '..', '..');
const DATA_DIR = path.join(ROOT, 'data', 'college-2026-11', 'D3');
const MIGRATION_FILE = fs
  .readdirSync(path.join(ROOT, 'migrations'))
  .find((f) => /_college_quiz_paliers\.sql$/.test(f));
const { decisions: allDecisions } = JSON.parse(
  fs.readFileSync(path.join(DATA_DIR, 'operations.json'), 'utf8'),
);

/**
 * Décisions D3 revues par une décision ultérieure d'Oliv, appliquée par une migration plus
 * récente (qui l'emporte, migrations jouées dans l'ordre) :
 * - QF9877, mini-quiz de la séance `6e-eau-de-nos-lieux` (cycle 3) : D3 l'avait tranchée au
 *   cycle 4 ; la migration `college_assouplissement` (22/11/2026) lui rend la notion C3-ENV.
 */
const SUPERSEDED = new Map([['QF9877', 'college_assouplissement']]);
const decisions = allDecisions.filter((d) => !SUPERSEDED.has(d.code));
/** Migrations postérieures qui reviennent sur une décision D3 : rejouées après elle. */
const SUPERSEDING_FILES = [...new Set(SUPERSEDED.values())].map((suffix) =>
  fs
    .readdirSync(path.join(ROOT, 'migrations'))
    .find((f) => new RegExp(`^\\d+_${suffix}\\.sql$`).test(f)),
);
const categories = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'categories.json'), 'utf8'));

/** Codes (parmi `codes`) qui portent au moins une notion effective du niveau donné. */
async function codesWithNiveau(codes, niveau) {
  if (codes.length === 0) return new Set();
  const filter = buildQuizQuestionNotionFilter({ niveau, alias: 'q' });
  const rows = await queryAll(
    `SELECT q.question_code FROM quiz_questions q
      WHERE q.question_code IN (${codes.map(() => '?').join(', ')}) ${filter.sql}`,
    [...codes, ...filter.params],
  );
  return new Set(rows.map((r) => r.question_code));
}

/** Décisions dont la question existe dans la base, dans la catégorie attendue. */
async function presentDecisions(list) {
  if (list.length === 0) return [];
  const rows = await queryAll(
    `SELECT question_code, categorie_slug, niveau FROM quiz_questions
      WHERE question_code IN (${list.map(() => '?').join(', ')})`,
    list.map((d) => d.code),
  );
  const byCode = new Map(rows.map((r) => [r.question_code, r]));
  return list
    .filter((d) => byCode.get(d.code)?.categorie_slug === d.categorie)
    .map((d) => ({ ...d, row: byCode.get(d.code) }));
}

before(async () => {
  await initSchema();
});

test('la migration college_quiz_paliers existe (un seul fichier, retrouvé par son suffixe)', () => {
  assert.ok(MIGRATION_FILE, 'migration *_college_quiz_paliers.sql introuvable');
});

test('les fichiers de données D3 passent le contrôle (forme, typographie, vocabulaire)', () => {
  const res = spawnSync(
    process.execPath,
    [path.join(ROOT, 'scripts', 'college-2026-11', 'check-D3-donnees.js')],
    {
      encoding: 'utf8',
    },
  );
  assert.equal(res.status, 0, res.stderr || res.stdout);
});

test('la migration générée est à jour de ses données', () => {
  const res = spawnSync(
    process.execPath,
    [path.join(ROOT, 'scripts', 'college-2026-11', 'build-D3-migration.js'), '--check'],
    { encoding: 'utf8' },
  );
  assert.equal(res.status, 0, res.stderr || res.stdout);
});

test('chaque décision porte un seul palier, et 445 questions doublement rattachées sont tranchées', () => {
  // Données D3 telles que décidées le 21/11 (décisions revues ensuite comprises).
  const twoCycles = allDecisions.filter(
    (d) => d.before.some((n) => /^C3/.test(n)) && d.before.some((n) => /^C4/.test(n)),
  );
  assert.equal(twoCycles.length, 445);
  for (const d of allDecisions) {
    if (d.palier === 'lycee') continue;
    const keep = d.palier === 3 ? /^C3/ : /^C4/;
    const drop = d.palier === 3 ? /^C4/ : /^C3/;
    assert.ok(
      d.after.some((n) => keep.test(n)),
      `${d.code} : aucune notion du palier retenu`,
    );
    assert.ok(!d.after.some((n) => drop.test(n)), `${d.code} : notion de l'autre cycle restante`);
  }
});

/**
 * Codes vérifiables : question présente au collège et au moins une notion attendue (`after`)
 * présente dans la base. Quatre notions de la prod (`C3-DEV`, `C3-MAT`, `C4-MICRO`,
 * `C4-REPRO`) ont été créées dans l'application et manquent à une base semée par les
 * migrations : une question qui ne s'appuie que sur elles n'y est pas vérifiable.
 */
async function verifiableCodes(palier) {
  const known = new Set((await queryAll('SELECT id FROM curriculum_notions')).map((r) => r.id));
  const present = await presentDecisions(decisions.filter((d) => d.palier === palier));
  return present
    .filter((d) => d.row.niveau === 'college' && d.after.some((n) => known.has(n)))
    .map((d) => d.code);
}

test('questions tranchées au cycle 3 : notion de cycle 3, aucune de cycle 4', async () => {
  const codes = await verifiableCodes(3);
  assert.ok(codes.length > 0, 'aucune question de cycle 3 tranchée dans la base de test');
  const c3 = await codesWithNiveau(codes, 'cycle3');
  const c4 = await codesWithNiveau(codes, 'cycle4');
  assert.deepEqual(
    codes.filter((c) => !c3.has(c)),
    [],
    'sans notion de cycle 3',
  );
  assert.deepEqual(
    codes.filter((c) => c4.has(c)),
    [],
    'encore rattachées au cycle 4',
  );
});

test('questions tranchées au cycle 4 : notion de cycle 4, aucune de cycle 3', async () => {
  const codes = await verifiableCodes(4);
  assert.ok(codes.length > 0, 'aucune question de cycle 4 tranchée dans la base de test');
  const c3 = await codesWithNiveau(codes, 'cycle3');
  const c4 = await codesWithNiveau(codes, 'cycle4');
  assert.deepEqual(
    codes.filter((c) => !c4.has(c)),
    [],
    'sans notion de cycle 4',
  );
  assert.deepEqual(
    codes.filter((c) => c3.has(c)),
    [],
    'encore rattachées au cycle 3',
  );
});

test('questions passées au lycée : niveau lycee, notion de lycée, aucune notion de collège', async () => {
  const present = await presentDecisions(decisions.filter((d) => d.palier === 'lycee'));
  const codes = present.map((d) => d.code);
  for (const d of present) assert.equal(d.row.niveau, 'lycee', `${d.code} : niveau`);
  const college = await codesWithNiveau(codes, 'college');
  const lycee = await codesWithNiveau(codes, 'lycee');
  assert.deepEqual(
    codes.filter((c) => college.has(c)),
    [],
    'encore rattachées au collège',
  );
  assert.deepEqual(
    codes.filter((c) => !lycee.has(c)),
    [],
    'sans notion de lycée',
  );
});

test('descriptions collège des catégories partagées avec le lycée', async () => {
  for (const c of categories) {
    const row = await queryOne('SELECT description_college FROM quiz_categories WHERE slug = ?', [
      c.slug,
    ]);
    if (!row) continue; // catégorie absente de la base de test : ligne sautée par la migration
    assert.equal(row.description_college, c.description_college, c.slug);
  }
});

test('la migration se rejoue sans erreur ni effet', async () => {
  const snapshot = async () =>
    queryAll(
      `SELECT 'n' AS t, question_code AS k, CONCAT(notion_id, ':', mode) AS v FROM quiz_question_notions
       UNION ALL SELECT 'q', question_code, CONCAT(niveau, ':', SHA2(question, 256)) FROM quiz_questions
       UNION ALL SELECT 'c', slug, COALESCE(description_college, '') FROM quiz_categories
       ORDER BY 1, 2, 3`,
    );
  const before = await snapshot();
  const sql = fs.readFileSync(path.join(ROOT, 'migrations', MIGRATION_FILE), 'utf8');
  for (let i = 0; i < 2; i += 1) {
    for (const stmt of splitSqlStatements(sql)) await execute(stmt);
  }
  // Une décision revue plus tard (SUPERSEDED) est rétablie par la migration qui l'a revue,
  // rejouée à la suite comme dans l'ordre normal des migrations.
  for (const file of SUPERSEDING_FILES) {
    const later = fs.readFileSync(path.join(ROOT, 'migrations', file), 'utf8');
    for (const stmt of splitSqlStatements(later)) await execute(stmt);
  }
  assert.deepEqual(await snapshot(), before);
});
