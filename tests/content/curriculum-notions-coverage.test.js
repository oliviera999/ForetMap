'use strict';

/**
 * Couverture du référentiel de notions (audit du 25/09/2026, § 1.3.1 ; migration 294).
 *
 * Avant la migration 294, 60 questions de collège ne portaient que des notions de lycée : un
 * tirage « cycle 3 » ou « cycle 4 » ne les proposait jamais. Garde : toute question **active**
 * de niveau collège, dans une catégorie rattachée au référentiel, porte au moins une notion de
 * collège — calculée par le même filtre SQL que l'application (héritage de catégorie, garde de
 * palier, exceptions).
 */

require('../helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert');
const { initSchema, queryAll } = require('../../database');
const { buildQuizQuestionNotionFilter } = require('../../lib/curriculumNotions');

before(async () => {
  await initSchema();
});

test('toute question de collège rattachée au référentiel porte une notion de collège', async () => {
  const filter = buildQuizQuestionNotionFilter({ niveau: 'college', alias: 'q' });
  assert.ok(filter, 'le filtre « college » doit exister');
  const withCollege = await queryAll(
    `SELECT q.question_code FROM quiz_questions q
      WHERE q.statut = 'actif' AND q.niveau = 'college' ${filter.sql}`,
    filter.params,
  );
  const covered = new Set(withCollege.map((r) => r.question_code));
  const candidates = await queryAll(
    `SELECT q.question_code, q.categorie_slug FROM quiz_questions q
      WHERE q.statut = 'actif' AND q.niveau = 'college'
        AND EXISTS (SELECT 1 FROM quiz_category_notions c WHERE c.categorie_slug = q.categorie_slug)`,
  );
  const missing = candidates.filter((r) => !covered.has(r.question_code));
  assert.deepStrictEqual(
    missing.map((r) => `${r.question_code} (${r.categorie_slug})`),
    [],
    'questions de collège sans aucune notion de collège',
  );
});

test('chaque étape du collège a plus de deux notions', async () => {
  const rows = await queryAll(
    "SELECT niveau, COUNT(*) AS n FROM curriculum_notions WHERE niveau IN ('cycle3', 'cycle4') GROUP BY niveau",
  );
  const total = rows.reduce((sum, r) => sum + Number(r.n), 0);
  assert.ok(total >= 8, `seulement ${total} notions de collège`);
});
