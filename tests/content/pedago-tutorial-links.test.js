'use strict';

require('../helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert');
const { initSchema, queryAll, queryOne } = require('../../database');

const TUTORIAL_SLUGS = [
  'arrosage-potager',
  'desherbage-doux',
  'jardin-n3',
  'rempotage',
  'associations-plantes',
  'compostage',
  'eau-au-jardin',
  'semences',
  'lire-son-sol',
  'sol-vivant',
];

const REQUIRED_NEW_CODES = [
  'QF9201',
  'QF9205',
  'QF9209',
  'QF9213',
  'QF9217',
  'QF9221',
  'QF9225',
  'QF9229',
  'QF9233',
  'QF9237',
];

const FORBIDDEN_PAIRS = [
  { slug: 'sol-vivant', question_code: 'QF0040' },
  { slug: 'associations-plantes', question_code: 'QF0061' },
  { slug: 'compostage', question_code: 'QF0340' },
  { slug: 'rempotage', question_code: 'QF0265' },
  { slug: 'arrosage-potager', question_code: 'QF0020' },
];

before(async () => {
  await initSchema();
});

test('les 10 tutoriels seedés sont présents (jardin punk unifié)', async () => {
  const rows = await queryAll(
    `SELECT slug, title FROM tutorials WHERE slug IN (${TUTORIAL_SLUGS.map(() => '?').join(',')})`,
    TUTORIAL_SLUGS,
  );
  assert.strictEqual(rows.length, TUTORIAL_SLUGS.length);
  const jardin = rows.find((row) => row.slug === 'jardin-n3');
  assert.ok(jardin.title.toLowerCase().includes('punk'));
});

test('chaque tutoriel a au moins 3 questions bloquantes approuvées', async () => {
  const rows = await queryAll(
    `SELECT t.slug, COUNT(*) AS n
       FROM tutorials t
       JOIN resource_question_links rql
         ON rql.resource_type = 'tutorial'
        AND rql.resource_ref = CAST(t.id AS CHAR) COLLATE utf8mb4_unicode_ci
      WHERE t.slug IN (${TUTORIAL_SLUGS.map(() => '?').join(',')})
        AND rql.status = 'approved'
        AND rql.is_gating = 1
      GROUP BY t.slug`,
    TUTORIAL_SLUGS,
  );
  const bySlug = Object.fromEntries(rows.map((row) => [row.slug, Number(row.n)]));
  for (const slug of TUTORIAL_SLUGS) {
    assert.ok(bySlug[slug] >= 3, `${slug} n'a que ${bySlug[slug] || 0} lien(s) bloquant(s)`);
  }
});

test('les QCM spécifiques aux fiches sont actifs', async () => {
  const rows = await queryAll(
    `SELECT question_code, statut FROM quiz_questions
      WHERE question_code IN (${REQUIRED_NEW_CODES.map(() => '?').join(',')})`,
    REQUIRED_NEW_CODES,
  );
  assert.strictEqual(rows.length, REQUIRED_NEW_CODES.length);
  for (const row of rows) {
    assert.strictEqual(row.statut, 'actif', row.question_code);
  }
});

test('les couples tutoriel ↔ question interdits ont disparu', async () => {
  for (const pair of FORBIDDEN_PAIRS) {
    const row = await queryOne(
      `SELECT rql.id
         FROM resource_question_links rql
         JOIN tutorials t ON CAST(t.id AS CHAR) COLLATE utf8mb4_unicode_ci = rql.resource_ref
        WHERE rql.resource_type = 'tutorial'
          AND t.slug = ?
          AND rql.question_code = ?`,
      [pair.slug, pair.question_code],
    );
    assert.ok(!row, `${pair.question_code} ne doit plus être sur ${pair.slug}`);
  }
});

test('tables legacy et unifiées restent alignées pour les tutoriels', async () => {
  const orphanLegacy = await queryAll(
    `SELECT qqt.question_code, qqt.tutorial_id
       FROM quiz_question_tutorials qqt
       LEFT JOIN resource_question_links rql
         ON rql.resource_type = 'tutorial'
        AND rql.resource_ref = CAST(qqt.tutorial_id AS CHAR) COLLATE utf8mb4_unicode_ci
        AND rql.question_code = qqt.question_code
      WHERE rql.id IS NULL`,
  );
  assert.deepStrictEqual(orphanLegacy, []);
});

test('aucun lien tutoriel vers une question inactive', async () => {
  const rows = await queryAll(
    `SELECT rql.question_code
       FROM resource_question_links rql
       JOIN quiz_questions q ON q.question_code = rql.question_code
      WHERE rql.resource_type = 'tutorial'
        AND q.statut <> 'actif'`,
  );
  assert.deepStrictEqual(rows, []);
});
