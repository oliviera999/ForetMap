'use strict';

// Agrégats de progression du conditionnement par ressource (vue professeur).
//
// Deux colonnes inexistantes ont fait répondre 500 à `GET /api/learning-links/progress` depuis
// sa livraison, sans qu'aucun test ne l'exerce (docs/AUDIT_VALIDATION_QUIZ_2026-09.md, A2) :
// `users` n'a pas de `deleted_at` (les suppressions sont dures), et la table des accusés porte
// `target_type` / `target_code`. Le test tests/learning-gating-progress.test.js tient la route.

const { getFmGatingSite } = require('./learningGatingRuntime');
const { resolveEffectiveGatingPolicy } = require('./shared/gatingPolicyLayersCore');
const {
  evaluateUnlock,
  gatingQuestionCodes,
  requiredCorrectCount,
} = require('./shared/resourceQuestionGatingCore');
const { loadApprovedGatingLinks } = require('./learningGatingAcknowledge');
const { groupCooldownRows, buildResourceCooldownView } = require('./learningGatingCooldown');

const MAX_STUDENTS = 500;

async function countFmRead(db, resourceType, resourceRef) {
  if (resourceType === 'tutorial') {
    const row = await db.queryOne(
      `SELECT COUNT(*) AS n FROM user_tutorial_reads WHERE tutorial_id = ?`,
      [Number(resourceRef)],
    );
    return Number(row?.n) || 0;
  }
  if (resourceType === 'plant') {
    const row = await db.queryOne(
      `SELECT COUNT(DISTINCT user_id) AS n FROM user_plant_observation_events WHERE plant_id = ?`,
      [Number(resourceRef)],
    );
    return Number(row?.n) || 0;
  }
  if (resourceType === 'glossary') {
    const row = await db.queryOne(
      `SELECT COUNT(*) AS n FROM learning_acknowledgements
       WHERE target_type = 'glossary' AND target_code = ?`,
      [String(resourceRef)],
    );
    return Number(row?.n) || 0;
  }
  return 0;
}

/**
 * Résumé agrégé (pas nominatif) pour une ressource ForetMap.
 */
async function getFmResourceProgressSummary(db, { resourceType, resourceRef } = {}) {
  const students = await db.queryAll(
    `SELECT u.id FROM users u
     INNER JOIN user_roles ur ON ur.user_id = u.id
     INNER JOIN roles r ON r.id = ur.role_id
     WHERE r.slug LIKE 'eleve%'
     ORDER BY u.created_at DESC, u.id ASC
     LIMIT ${MAX_STUDENTS}`,
  );
  // Au-delà du plafond, ce sont les comptes les plus RÉCENTS qui sont retenus (l'ordre par
  // identifiant UUID était arbitraire) ; le résumé annonce `truncated` (C4).
  const totalStudents = students.length;

  const site = await getFmGatingSite();
  const perResource = await db.queryOne(
    'SELECT * FROM resource_gating_policy WHERE resource_type = ? AND resource_ref = ? LIMIT 1',
    [resourceType, resourceRef],
  );
  const typePolicy = await db.queryOne(
    'SELECT * FROM resource_gating_policy WHERE resource_type = ? AND resource_ref = ? LIMIT 1',
    [resourceType, '*'],
  );
  const policy = resolveEffectiveGatingPolicy({
    perResource,
    typePolicy,
    site,
    product: 'fm',
    resourceType,
  });
  const links = await loadApprovedGatingLinks(db, 'fm', resourceType, resourceRef);
  const gatingCodes = gatingQuestionCodes(links);
  const readCount = await countFmRead(db, resourceType, resourceRef);

  if (!site.enabled || !policy.enabled || policy.mode === 'off' || gatingCodes.length === 0) {
    return {
      summary: {
        total_students: totalStudents,
        read_count: readCount,
        pending_count: 0,
        satisfied_count: readCount,
        locked_count: 0,
      },
    };
  }

  const requiredCount = requiredCorrectCount(
    { mode: policy.mode, requiredCorrect: policy.requiredCorrect },
    gatingCodes.length,
  );

  let pendingCount = 0;
  let satisfiedCount = 0;
  let lockedCount = 0;

  // Chargement GROUPE (docs/AUDIT_VALIDATION_QUIZ_2026-09.md, C4) : deux requetes pour toute la
  // classe — bonnes reponses aux questions de la fiche, lignes de verrou de la fiche — au lieu
  // de deux par eleve en serie (jusqu'a 1 001 requetes pour un seul appel HTTP). Le calcul par
  // eleve reste celui du challenge (`buildResourceCooldownView`).
  const studentIds = students.map((row) => String(row.id));
  const correctByStudent = new Map();
  const cooldownRowsByStudent = new Map();
  if (studentIds.length > 0) {
    const studentPlaceholders = studentIds.map(() => '?').join(', ');
    const codePlaceholders = gatingCodes.map(() => '?').join(', ');
    const correctRows = await db.queryAll(
      `SELECT user_id, question_code
         FROM user_quiz_attempts
        WHERE is_correct = 1 AND question_code IN (${codePlaceholders})
          AND user_id IN (${studentPlaceholders})
        GROUP BY user_id, question_code`,
      [...gatingCodes, ...studentIds],
    );
    for (const row of correctRows) {
      const key = String(row.user_id);
      if (!correctByStudent.has(key)) correctByStudent.set(key, new Set());
      correctByStudent.get(key).add(String(row.question_code));
    }
    const cooldownRows = await db.queryAll(
      `SELECT user_id, question_code, locked_until, wrong_attempts
         FROM resource_gating_cooldowns
        WHERE resource_type = ? AND resource_ref = ? AND user_id IN (${studentPlaceholders})
        ORDER BY locked_until DESC`,
      [resourceType, resourceRef, ...studentIds],
    );
    for (const row of cooldownRows) {
      const key = String(row.user_id);
      if (!cooldownRowsByStudent.has(key)) cooldownRowsByStudent.set(key, []);
      cooldownRowsByStudent.get(key).push(row);
    }
  }

  for (const userId of studentIds) {
    const correctSet = correctByStudent.get(userId) || new Set();
    // Même seuil que l'accusé : borné au nombre de questions liées, sinon un seuil de 5
    // sur 3 questions comptait « en attente » un élève que la validation accepte.
    const unlocked = evaluateUnlock({
      links,
      correctRefs: [...correctSet],
      mode: policy.mode,
      requiredCorrect: requiredCount,
    });

    // Même vue que le challenge : en portée « question seule », un élève n'est « bloqué »
    // que si plus aucune question ne lui est posable (lot 3).
    const correctForStudent = gatingCodes.filter((c) => correctSet.has(c)).length;
    const { cooldown } = buildResourceCooldownView({
      rows: groupCooldownRows(cooldownRowsByStudent.get(userId) || []),
      retryHours: policy.retryCooldownHours ?? 0,
      gatingCodes,
      correctSet,
      pendingCount: Math.max(0, requiredCount - correctForStudent),
    });

    if (cooldown?.locked) {
      lockedCount += 1;
      continue;
    }
    if (unlocked) satisfiedCount += 1;
    else pendingCount += 1;
  }

  return {
    summary: {
      total_students: totalStudents,
      read_count: readCount,
      pending_count: pendingCount,
      satisfied_count: satisfiedCount,
      locked_count: lockedCount,
      required_correct: requiredCount,
      gating_questions: gatingCodes.length,
      // Plafond annoncé (C4) : au-delà, l'agrégat ne porte que sur les premiers élèves.
      max_students: MAX_STUDENTS,
      truncated: totalStudents >= MAX_STUDENTS,
    },
  };
}

module.exports = {
  MAX_STUDENTS,
  getFmResourceProgressSummary,
};
