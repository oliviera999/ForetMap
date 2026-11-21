'use strict';

/**
 * Chantier collège (novembre 2026), flux C6 — corpus du quiz par palier.
 *
 * Le palier d'entrée d'une question de collège se déduit de ses notions effectives (cycle 3
 * → palier 1, sinon palier 2 : `quizQuestionEntryPalier`, `quizQuestionEntryPalierSql`).
 * Une question de collège **sans aucune notion de collège** tombe au palier 2 par défaut :
 * elle disparaît du quiz d'une 6ᵉ sans que personne l'ait décidé. Cette garde la signale,
 * quelle que soit sa catégorie (la garde de `curriculum-notions-coverage` ne regarde que les
 * catégories rattachées au référentiel).
 */

require('../helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert');
const { initSchema, queryAll } = require('../../database');
const {
  buildQuizQuestionNotionFilter,
  quizQuestionEntryPalierSql,
} = require('../../lib/curriculumNotions');

before(async () => {
  await initSchema();
});

/**
 * Catégories rattachées au référentiel en production (instantané du 21/11/2026 :
 * `demarche_mesure` → 2-BIODIV, C4-TERRE ; `microbes_sante` → 2-MICRO, C4-MICRO) mais absentes
 * d'une base fraîche (la migration 273 sème `demarche_mesure` avant que la catégorie existe :
 * `INSERT IGNORE` sans effet) : leurs questions de collège n'y ont aucune notion.
 * Dérive dépôt ↔ prod signalée au flux D3 / à SI ; tolérée ici, nommément, jusqu'à ce qu'une
 * migration sème ces liens. Toute autre catégorie fautive fait échouer le test.
 */
const KNOWN_UNSEEDED_CATEGORY_LINKS = new Set(['demarche_mesure', 'microbes_sante']);

/** Catégories créées à la volée par les tests de code (`rqlcat12345`…), hors corpus. */
const RUNTIME_FIXTURE_CATEGORY = /\d{5,}$/;

test('toute question active de collège porte au moins une notion de collège', async (t) => {
  const filter = buildQuizQuestionNotionFilter({ niveau: 'college', alias: 'q' });
  const rows = await queryAll(
    `SELECT q.question_code, q.categorie_slug FROM quiz_questions q
      WHERE q.statut = 'actif' AND q.niveau = 'college'
        AND NOT (1 = 1 ${filter.sql})
      ORDER BY q.question_code`,
    filter.params,
  );
  const corpus = rows.filter((r) => !RUNTIME_FIXTURE_CATEGORY.test(r.categorie_slug));
  const tolerated = corpus.filter((r) => KNOWN_UNSEEDED_CATEGORY_LINKS.has(r.categorie_slug));
  if (tolerated.length > 0) {
    t.diagnostic(
      `tolérées (liens de catégorie absents des migrations) : ${tolerated
        .map((r) => `${r.question_code} (${r.categorie_slug})`)
        .join(', ')}`,
    );
  }
  const missing = corpus.filter((r) => !KNOWN_UNSEEDED_CATEGORY_LINKS.has(r.categorie_slug));
  assert.deepStrictEqual(
    missing.map((r) => `${r.question_code} (${r.categorie_slug})`),
    [],
    'questions de collège sans notion de collège (palier non décidé)',
  );
});

test('le quiz garde des questions pour la 6ᵉ (palier 1) et pour la 3ᵉ (palier 2)', async () => {
  const rows = await queryAll(
    `SELECT ${quizQuestionEntryPalierSql('q')} AS palier, COUNT(*) AS n
       FROM quiz_questions q
      WHERE q.statut = 'actif' AND q.niveau = 'college'
      GROUP BY palier`,
  );
  const byPalier = new Map(rows.map((r) => [Number(r.palier), Number(r.n)]));
  assert.ok((byPalier.get(1) || 0) >= 10, `palier 1 : ${byPalier.get(1) || 0} question(s)`);
  // Le cycle 4 voit aussi le palier 1 : le total collège doit dépasser le seul cycle 3.
  assert.ok((byPalier.get(2) || 0) >= 1, `palier 2 : ${byPalier.get(2) || 0} question(s)`);
});
