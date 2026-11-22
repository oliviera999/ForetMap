'use strict';

/**
 * Lectures agrégées du domaine « quiz » pour `foretmap_quiz stats` (lot D2) — SQL écrit ici,
 * paramétré, exécuté en transaction READ ONLY (`withReadOnly`). Aucune donnée nominative :
 * tentatives et réussites agrégées par question, catégorie et notion.
 *
 * Distracteurs (migration `quiz_attempt_choice`) : les tentatives gardent la lettre d'origine
 * du choix retenu et l'empreinte de version de la question. Par question, sur la **version
 * courante** : répartition des choix, attracteurs, distracteurs morts, discrimination, temps
 * médian — mêmes fonctions que `GET /api/quiz/admin/questions/stats`
 * (`lib/quizQuestionStats.js`), aucune requête dupliquée. Agrégats seulement : aucun
 * identifiant d'élève ne sort. Les tentatives antérieures à la migration n'ont pas de lettre :
 * elles comptent dans la réussite, pas dans la répartition (`version.choix_connus`).
 */

const { withReadOnly } = require('../readDb');
const { questionNotionJoin } = require('./curriculum');
const { rate } = require('./students');
const {
  loadFmItemAnalysis,
  loadFmPositionEffect,
  withItemSignals,
  ITEM_THRESHOLDS,
} = require('../../quizQuestionStats');

const TRUSTED = { astValidated: true };
const READ_OPTS = { appPool: true };

function num(v) {
  return Number(v || 0);
}

/**
 * @param {{ categorie_slug?: string, notion_id?: string, min_attempts?: number,
 *   limit?: number, from?: string, to?: string }} [args]
 */
async function quizStats(args = {}) {
  const minAttempts = Math.max(0, Number(args.min_attempts) || 0);
  const limit = Math.min(2000, Math.max(1, Number(args.limit) || 200));
  const where = ['1 = 1'];
  const params = [];
  if (args.categorie_slug) {
    where.push('q.categorie_slug = ?');
    params.push(String(args.categorie_slug));
  }
  if (args.from) {
    where.push('uqa.answered_at >= ?');
    params.push(`${String(args.from).slice(0, 10)} 00:00:00`);
  }
  if (args.to) {
    where.push('uqa.answered_at <= ?');
    params.push(`${String(args.to).slice(0, 10)} 23:59:59`);
  }
  const nj = questionNotionJoin('q');
  let notionFilter = '';
  const notionParams = [];
  if (args.notion_id) {
    notionFilter = `AND EXISTS (SELECT 1 FROM curriculum_notions n WHERE n.id = ? AND ${nj.sql})`;
    notionParams.push(String(args.notion_id), ...nj.params);
  }
  const w = `${where.join(' AND ')} ${notionFilter}`;
  const wp = [...params, ...notionParams];
  return withReadOnly(async (db) => {
    const q = (sql, p) => db.raw(sql, p, TRUSTED);
    const [totals] = await q(
      `SELECT COUNT(*) AS attempts, SUM(uqa.is_correct = 1) AS correct,
              COUNT(DISTINCT uqa.user_id) AS learners,
              COUNT(DISTINCT uqa.question_code) AS questions
         FROM user_quiz_attempts uqa
         JOIN quiz_questions q ON q.question_code = uqa.question_code
        WHERE ${w}`,
      wp,
    );
    const byQuestion = await q(
      `SELECT q.question_code, q.categorie_slug, q.statut, q.niveau, q.difficulte,
              LEFT(q.question, 160) AS question, q.reponse_correcte,
              COUNT(*) AS attempts, SUM(uqa.is_correct = 1) AS correct,
              COUNT(DISTINCT uqa.user_id) AS learners
         FROM user_quiz_attempts uqa
         JOIN quiz_questions q ON q.question_code = uqa.question_code
        WHERE ${w}
        GROUP BY q.question_code, q.categorie_slug, q.statut, q.niveau, q.difficulte,
                 q.question, q.reponse_correcte
       HAVING COUNT(*) >= ?
        ORDER BY (SUM(uqa.is_correct = 1) / COUNT(*)) ASC, attempts DESC
        LIMIT ${limit}`,
      [...wp, minAttempts],
    );
    const byCategory = await q(
      `SELECT q.categorie_slug, c.nom AS categorie_nom, c.theme,
              COUNT(*) AS attempts, SUM(uqa.is_correct = 1) AS correct,
              COUNT(DISTINCT uqa.question_code) AS questions
         FROM user_quiz_attempts uqa
         JOIN quiz_questions q ON q.question_code = uqa.question_code
         LEFT JOIN quiz_categories c ON c.slug = q.categorie_slug
        WHERE ${w}
        GROUP BY q.categorie_slug, c.nom, c.theme
        ORDER BY (SUM(uqa.is_correct = 1) / COUNT(*)) ASC`,
      wp,
    );
    const byNotion = await q(
      `SELECT n.id AS notion_id, n.niveau, n.notion,
              COUNT(*) AS attempts, SUM(uqa.is_correct = 1) AS correct,
              COUNT(DISTINCT uqa.question_code) AS questions
         FROM user_quiz_attempts uqa
         JOIN quiz_questions q ON q.question_code = uqa.question_code
         JOIN curriculum_notions n ON ${nj.sql}
        WHERE ${w}
        GROUP BY n.id, n.niveau, n.notion
        ORDER BY n.sort_order ASC`,
      [...nj.params, ...wp],
    );
    // Analyse d'items (version courante, toutes dates : une répartition n'a de sens que pour
    // un même jeu de choix, pas pour une période).
    const itemsDb = { queryAll: (sql, p) => q(sql, p) };
    const analysis = await loadFmItemAnalysis(
      itemsDb,
      byQuestion.map((r) => r.question_code),
    );
    const positionEffect = await loadFmPositionEffect(itemsDb);
    return {
      perimetre: {
        categorie_slug: args.categorie_slug || null,
        notion_id: args.notion_id || null,
        from: args.from || null,
        to: args.to || null,
        min_attempts: minAttempts,
      },
      totals: {
        attempts: num(totals?.attempts),
        correct: num(totals?.correct),
        learners: num(totals?.learners),
        questions: num(totals?.questions),
        success_rate_percent: rate(totals?.correct, totals?.attempts),
      },
      by_question: byQuestion.map((r) => {
        const item = analysis.get(r.question_code);
        const flagged = item ? withItemSignals({ suspect: false }, item) : null;
        return {
          question_code: r.question_code,
          categorie_slug: r.categorie_slug,
          statut: r.statut,
          niveau: r.niveau,
          difficulte: r.difficulte == null ? null : num(r.difficulte),
          question: r.question,
          reponse_correcte: r.reponse_correcte,
          attempts: num(r.attempts),
          correct: num(r.correct),
          learners: num(r.learners),
          success_rate_percent: rate(r.correct, r.attempts),
          ...(item
            ? {
                version: item.version,
                repartition: item.repartition,
                attracteurs: item.attracteurs,
                distracteurs_morts: item.distracteurs_morts,
                distracteurs_morts_evalues: item.distracteurs_morts_evalues,
                discrimination: item.discrimination,
                temps_median_ms: item.temps_median_ms,
                signaux: {
                  attracteur: flagged.signaux.attracteur,
                  discrimination_negative: flagged.signaux.discrimination_negative,
                },
              }
            : {}),
        };
      }),
      by_category: byCategory.map((r) => ({
        categorie_slug: r.categorie_slug,
        categorie_nom: r.categorie_nom,
        theme: r.theme,
        questions: num(r.questions),
        attempts: num(r.attempts),
        correct: num(r.correct),
        success_rate_percent: rate(r.correct, r.attempts),
      })),
      by_notion: byNotion.map((r) => ({
        notion_id: r.notion_id,
        niveau: r.niveau,
        notion: r.notion,
        questions: num(r.questions),
        attempts: num(r.attempts),
        correct: num(r.correct),
        success_rate_percent: rate(r.correct, r.attempts),
      })),
      distractors: {
        available: true,
        portee:
          'par question (by_question) : répartition des choix, attracteurs, distracteurs morts, discrimination et temps médian, sur la version courante de la question, toutes dates ; les tentatives antérieures au 22/11/2026 n’ont pas de lettre (version.choix_connus)',
        seuils: ITEM_THRESHOLDS,
        effet_position: positionEffect,
      },
    };
  }, READ_OPTS);
}

module.exports = { quizStats };
