'use strict';

// =====================================================================
// Phase 2 — RUNTIME du conditionnement « lu/appris ».
// Branche l'AUTO-MARQUAGE sur bonne reponse (mecanique « push », additive : le
// marquage manuel reste possible) et l'enregistrement des tentatives QCM GL.
// Tout est garde par le flag de gating (OFF par defaut) et ne considere que les
// liens status='approved' & is_gating=1. Defensif : toute erreur est avalee pour
// ne JAMAIS casser la reponse a une question.
//
// Marquage par type de ressource :
//   ForetMap : tutorial -> user_tutorial_reads ; plant -> user_plant_observation_events.
//              (glossary FM : pas de table de marquage -> ignore.)
//   GL       : species|glossary|tutorial -> gl_learning_acknowledgements (par lecteur).
//              (lore_glossary|feuillet : pas de marquage par joueur -> ignore.)
// =====================================================================

const { getSettingValue } = require('./settings');
const { getGlGatingSettings } = require('./glSettings');
const { resolveEffectivePolicy, evaluateUnlock } = require('./shared/resourceQuestionGatingCore');
const { buildReaderKey, upsertLearningAck } = require('./shared/learningAckCore');
const { recordGlQcmAttempt, listCorrectQcmCodesForReader } = require('./glQcmAttempts');

const FM_MARKABLE = new Set(['tutorial', 'plant']);
const GL_MARKABLE = new Set(['species', 'glossary', 'tutorial']);

async function getFmGatingSite() {
  return {
    enabled: await getSettingValue('learning.gating.enabled', false),
    autoMarkOnCorrect: await getSettingValue('learning.gating.auto_mark_on_correct', true),
    defaultMode: await getSettingValue('learning.gating.default_mode', 'any'),
    defaultRequiredCorrect: await getSettingValue('learning.gating.default_required_correct', 1),
  };
}

/** Pour une ressource liee, decide si le lecteur l'a debloquee (politique + bonnes reponses). */
async function resourceUnlocked(
  db,
  table,
  policyTable,
  site,
  resourceType,
  resourceRef,
  correctRefs,
) {
  const resLinks = await db.queryAll(
    `SELECT question_code, is_gating FROM ${table}
      WHERE resource_type = ? AND resource_ref = ? AND status = 'approved'`,
    [resourceType, resourceRef],
  );
  const perResource = await db.queryOne(
    `SELECT * FROM ${policyTable} WHERE resource_type = ? AND resource_ref = ? LIMIT 1`,
    [resourceType, resourceRef],
  );
  const policy = resolveEffectivePolicy({ perResource, site });
  if (!policy.enabled) return false;
  return evaluateUnlock({
    links: resLinks,
    correctRefs,
    mode: policy.mode,
    requiredCorrect: policy.requiredCorrect,
  });
}

async function markFmResource(db, userId, resourceType, resourceRef) {
  const now = new Date().toISOString();
  if (resourceType === 'tutorial') {
    const id = Number(resourceRef);
    if (!Number.isFinite(id)) return;
    await db.execute(
      `INSERT INTO user_tutorial_reads (user_id, tutorial_id, acknowledged_at)
       VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE acknowledged_at = VALUES(acknowledged_at)`,
      [userId, id, now],
    );
  } else if (resourceType === 'plant') {
    const id = Number(resourceRef);
    if (!Number.isFinite(id)) return;
    // Dedup : ne pas empiler d'evenements d'observation a chaque bonne reponse.
    const existing = await db.queryOne(
      'SELECT 1 AS x FROM user_plant_observation_events WHERE user_id = ? AND plant_id = ? LIMIT 1',
      [userId, id],
    );
    if (!existing) {
      await db.execute(
        'INSERT INTO user_plant_observation_events (user_id, plant_id, observed_at) VALUES (?, ?, ?)',
        [userId, id, now],
      );
    }
  }
}

/** ForetMap — appele apres une reponse de quiz (a-t-elle ete juste ?). */
async function autoMarkFmOnAnswer(db, { userId, questionCode, isCorrect }) {
  try {
    if (!userId || !isCorrect) return;
    const site = await getFmGatingSite();
    if (!site.enabled || !site.autoMarkOnCorrect) return;
    const links = await db.queryAll(
      `SELECT DISTINCT resource_type, resource_ref FROM resource_question_links
        WHERE question_code = ? AND status = 'approved' AND is_gating = 1`,
      [questionCode],
    );
    if (!links.length) return;
    const correctRefs = (
      await db.queryAll(
        'SELECT DISTINCT question_code FROM user_quiz_attempts WHERE user_id = ? AND is_correct = 1',
        [userId],
      )
    ).map((r) => r.question_code);
    for (const l of links) {
      if (!FM_MARKABLE.has(l.resource_type)) continue;
      const unlocked = await resourceUnlocked(
        db,
        'resource_question_links',
        'resource_gating_policy',
        site,
        l.resource_type,
        l.resource_ref,
        correctRefs,
      );
      if (unlocked) await markFmResource(db, userId, l.resource_type, l.resource_ref);
    }
  } catch (_err) {
    /* defensif : ne jamais casser la reponse */
  }
}

/** GL — enregistre la tentative (par lecteur) puis auto-marque sur bonne reponse. */
async function recordGlAttemptAndAutoMark(
  db,
  { glAuth, dataset, questionCode, isCorrect, gameId = null, teamId = null },
) {
  try {
    const g = await getGlGatingSettings();
    if (!g || !g.enabled) return;
    const reader = buildReaderKey(glAuth);
    if (!reader) return;
    await recordGlQcmAttempt(db, { reader, dataset, questionCode, isCorrect, gameId, teamId });
    if (!isCorrect || !g.autoMarkOnCorrect) return;
    const links = await db.queryAll(
      `SELECT DISTINCT resource_type, resource_ref FROM gl_resource_question_links
        WHERE question_dataset = ? AND question_code = ? AND status = 'approved' AND is_gating = 1`,
      [dataset, questionCode],
    );
    if (!links.length) return;
    const correctRefs = await listCorrectQcmCodesForReader(db, reader);
    const site = {
      enabled: g.enabled,
      granularity: g.granularity,
      defaultMode: g.defaultMode,
      defaultRequiredCorrect: g.defaultRequiredCorrect,
    };
    for (const l of links) {
      if (!GL_MARKABLE.has(l.resource_type)) continue;
      const unlocked = await resourceUnlocked(
        db,
        'gl_resource_question_links',
        'gl_resource_gating_policy',
        site,
        l.resource_type,
        l.resource_ref,
        correctRefs,
      );
      if (unlocked) await upsertLearningAck(db, reader, l.resource_type, l.resource_ref);
    }
  } catch (_err) {
    /* defensif */
  }
}

module.exports = {
  FM_MARKABLE,
  GL_MARKABLE,
  getFmGatingSite,
  autoMarkFmOnAnswer,
  recordGlAttemptAndAutoMark,
};
