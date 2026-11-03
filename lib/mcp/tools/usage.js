'use strict';

/**
 * `foretmap_usage_overview` — vue d'usage **anonyme et seuillée**.
 *
 * Données produites par les élèves (observations, réponses aux QCM, lectures de tutoriels,
 * tâches réalisées, compteurs d'usage) : uniquement des agrégats `COUNT` regroupés par période
 * et par catégorie de contenu, jamais par personne, jamais par classe. Toute case d'effectif
 * strictement inférieur à 5 est remplacée par la chaîne `"<5"` (seuil de diffusion classique
 * en statistique publique : une case de 1 à 4 permettrait de reconnaître un élève).
 */

const { z } = require('zod');
const { withReadOnly } = require('../readDb');
const { READ_ONLY, READ_REQUIRES } = require('./common');

const K_ANONYMITY_THRESHOLD = 5;
const USAGE_WINDOWS = Object.freeze([7, 30, 90, 365]);

function threshold(n) {
  const v = Number(n || 0);
  if (v === 0) return 0;
  return v < K_ANONYMITY_THRESHOLD ? '<5' : v;
}

function thresholdRows(rows, countKey = 'n') {
  return rows.map((r) => ({ ...r, [countKey]: threshold(r[countKey]) }));
}

async function usageOverview(args) {
  // Fenêtres fixes (relecture de sécurité, M6) : avec une fenêtre libre, deux appels à un
  // jour d'écart isoleraient par différence l'activité d'une seule journée — donc parfois d'un
  // seul élève, sous le seuil de 5.
  const days = USAGE_WINDOWS.includes(args.days) ? args.days : 90;
  return withReadOnly(async (db) => {
    const since = `DATE_SUB(CURDATE(), INTERVAL ${days} DAY)`; // entier borné ci-dessus
    const [usage, observations, quizzes, quizByCat, reads, glQuizzes] = await Promise.all([
      db.aggregate(
        `SELECT product, event, SUM(count) AS n FROM usage_counters
          WHERE day >= ${since} GROUP BY product, event ORDER BY product, event`,
      ),
      db.aggregate(
        `SELECT status, COUNT(*) AS n FROM species_observations
          WHERE created_at >= ${since} GROUP BY status`,
      ),
      db.aggregate(
        `SELECT SUM(is_correct) AS correct, COUNT(*) AS n FROM user_quiz_attempts
          WHERE answered_at >= ${since}`,
      ),
      db.aggregate(
        `SELECT categorie_slug, COUNT(*) AS n, SUM(is_correct) AS correct FROM user_quiz_attempts
          WHERE answered_at >= ${since} GROUP BY categorie_slug ORDER BY n DESC`,
      ),
      db.aggregate(
        `SELECT COUNT(*) AS n FROM user_tutorial_reads WHERE acknowledged_at >= ${since}`,
      ),
      db.aggregate(
        `SELECT question_dataset, COUNT(*) AS n, SUM(is_correct) AS correct FROM gl_qcm_attempts
          WHERE answered_at >= ${since} GROUP BY question_dataset`,
      ),
    ]);
    const tasksDone = await db.aggregate(
      `SELECT COUNT(*) AS n FROM task_assignments WHERE done_at >= ${since}`,
    );
    const rate = (row) => {
      const n = Number(row?.n || 0);
      if (n < K_ANONYMITY_THRESHOLD) return null;
      return Math.round((Number(row.correct || 0) / n) * 1000) / 10;
    };
    return {
      window_days: days,
      threshold: `effectifs < ${K_ANONYMITY_THRESHOLD} masqués (« <5 »)`,
      usage_counters: thresholdRows(usage),
      species_observations_by_status: thresholdRows(observations),
      quiz_attempts: {
        n: threshold(quizzes[0]?.n),
        success_rate_pct: rate(quizzes[0]),
      },
      quiz_attempts_by_category: quizByCat.map((r) => ({
        categorie_slug: r.categorie_slug,
        n: threshold(r.n),
        success_rate_pct: rate(r),
      })),
      gl_qcm_attempts: glQuizzes.map((r) => ({
        question_dataset: r.question_dataset,
        n: threshold(r.n),
        success_rate_pct: rate(r),
      })),
      tutorial_reads: threshold(reads[0]?.n),
      tasks_completed: threshold(tasksDone[0]?.n),
    };
  });
}

function buildUsageTools() {
  return [
    {
      name: 'foretmap_usage_overview',
      title: 'Usage anonyme (agrégats)',
      description:
        'Vue d’usage ANONYME sur une période fixe (7, 30, 90 ou 365 jours, défaut 90) : compteurs d’usage par produit, observations d’espèces par statut, réponses aux QCM (volume et taux de réussite par catégorie), lectures de tutoriels, tâches réalisées. Aucune donnée par élève ni par classe ; tout effectif inférieur à 5 est affiché « <5 ».',
      inputSchema: z.strictObject({
        days: z
          .union([z.literal(7), z.literal(30), z.literal(90), z.literal(365)])
          .optional()
          .describe('Fenêtre en jours : 7, 30, 90 ou 365'),
      }),
      annotations: READ_ONLY,
      requires: READ_REQUIRES,
      handler: usageOverview,
    },
  ];
}

module.exports = { K_ANONYMITY_THRESHOLD, USAGE_WINDOWS, buildUsageTools, threshold };
