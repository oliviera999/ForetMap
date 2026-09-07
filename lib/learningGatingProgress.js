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
  normalizeQuestionCode,
} = require('./shared/resourceQuestionGatingCore');
const { loadApprovedGatingLinks } = require('./learningGatingAcknowledge');
const { loadCooldownRowsForRef, buildResourceCooldownView } = require('./learningGatingCooldown');

const MAX_STUDENTS = 500;

async function listFmCorrectQuestionCodes(db, userId) {
  if (!userId) return [];
  const rows = await db.queryAll(
    'SELECT DISTINCT question_code FROM user_quiz_attempts WHERE user_id = ? AND is_correct = 1',
    [String(userId)],
  );
  return rows.map((r) => normalizeQuestionCode(r.question_code)).filter(Boolean);
}

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
     ORDER BY u.id ASC
     LIMIT ${MAX_STUDENTS}`,
  );
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

  for (const row of students) {
    const userId = row.id;
    const correctSet = new Set(await listFmCorrectQuestionCodes(db, userId));
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
      rows: await loadCooldownRowsForRef(db, {
        product: 'fm',
        userId,
        resourceType,
        resourceRef,
      }),
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
    },
  };
}

module.exports = {
  getFmResourceProgressSummary,
};
