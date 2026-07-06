'use strict';

// =====================================================================
// Verrou de re-tentative (« cooldown ») du conditionnement « marquer comme acquis ».
// Apres une MAUVAISE reponse a une question bloquante DANS le flux de validation,
// la ressource entiere est verrouillee pendant N jours (reglage, defaut 3). Tant que
// le verrou court, la validation est refusee — meme si toutes les reponses sont bonnes.
//
// Deux tables miroirs isolees : resource_gating_cooldowns (ForetMap, cle user_id) et
// gl_resource_gating_cooldowns (GL, cle lecteur). Aucune dependance vers
// learningGatingAcknowledge (evite un require circulaire) : la verification du lien
// bloquant approuve est refaite ici par une petite requete dediee.
// =====================================================================

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Borne le nombre de jours de cooldown (0 = desactive). */
function clampCooldownDays(value, fallback = 3) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(365, Math.floor(n)));
}

/**
 * Etat de verrou pur (testable sans BDD).
 * @param {Date|string|null} lockedUntil
 * @param {number} retryDays
 * @param {number} nowMs
 */
function buildCooldownState(lockedUntil, retryDays, nowMs = Date.now()) {
  const days = clampCooldownDays(retryDays, 0);
  const unlocked = {
    locked: false,
    locked_until: null,
    retry_days: days,
    remaining_ms: 0,
    remaining_days: 0,
  };
  if (!lockedUntil) return unlocked;
  const untilMs = lockedUntil instanceof Date ? lockedUntil.getTime() : Date.parse(lockedUntil);
  if (!Number.isFinite(untilMs) || untilMs <= nowMs) return unlocked;
  const remainingMs = untilMs - nowMs;
  return {
    locked: true,
    locked_until: new Date(untilMs).toISOString(),
    retry_days: days,
    remaining_ms: remainingMs,
    remaining_days: remainingCooldownDays(remainingMs),
  };
}

/** Jours restants (arrondi au superieur) avant deblocage. */
function remainingCooldownDays(remainingMs) {
  const ms = Number(remainingMs) || 0;
  if (ms <= 0) return 0;
  return Math.ceil(ms / MS_PER_DAY);
}

function isGlProduct(product) {
  return String(product || '').toLowerCase() === 'gl';
}

/** Le lecteur/utilisateur est-il verrouille sur cette ressource ? Lit la table miroir du produit. */
async function getResourceCooldownState(
  db,
  { product, userId = null, reader = null, resourceType, resourceRef, retryDays = 0 } = {},
) {
  const days = clampCooldownDays(retryDays, 0);
  const emptyLocked = {
    locked: false,
    locked_until: null,
    retry_days: days,
    remaining_ms: 0,
    remaining_days: 0,
  };
  // Delai a 0 = verrou desactive : on ne bloque jamais, meme si une ligne de verrou subsiste.
  if (!db || days <= 0 || !resourceType || !resourceRef) return emptyLocked;

  let row;
  if (isGlProduct(product)) {
    if (!reader || !reader.reader_user_type || !reader.reader_user_id) return emptyLocked;
    row = await db.queryOne(
      `SELECT locked_until FROM gl_resource_gating_cooldowns
        WHERE reader_user_type = ? AND reader_user_id = ?
          AND resource_type = ? AND resource_ref = ?
        LIMIT 1`,
      [reader.reader_user_type, reader.reader_user_id, resourceType, resourceRef],
    );
  } else {
    if (!userId) return emptyLocked;
    row = await db.queryOne(
      `SELECT locked_until FROM resource_gating_cooldowns
        WHERE user_id = ? AND resource_type = ? AND resource_ref = ?
        LIMIT 1`,
      [String(userId), resourceType, resourceRef],
    );
  }
  return buildCooldownState(row?.locked_until || null, days);
}

/** Le code est-il une question bloquante approuvee de la ressource ? (garde-fou anti-verrou parasite) */
async function isApprovedGatingLink(db, product, resourceType, resourceRef, questionCode) {
  if (!db || !resourceType || !resourceRef || !questionCode) return false;
  if (isGlProduct(product)) {
    const row = await db.queryOne(
      `SELECT 1 AS ok FROM gl_resource_question_links
        WHERE resource_type = ? AND resource_ref = ? AND question_code = ?
          AND status = 'approved' AND is_gating = 1
        LIMIT 1`,
      [resourceType, resourceRef, questionCode],
    );
    return !!row;
  }
  const row = await db.queryOne(
    `SELECT 1 AS ok FROM resource_question_links
      WHERE resource_type = ? AND resource_ref = ? AND question_code = ?
        AND status = 'approved' AND is_gating = 1
      LIMIT 1`,
    [resourceType, resourceRef, questionCode],
  );
  return !!row;
}

/** Pose (ou repousse) le verrou : locked_until = NOW() + retryDays jours. */
async function registerResourceCooldown(
  db,
  {
    product,
    userId = null,
    reader = null,
    resourceType,
    resourceRef,
    questionCode = null,
    retryDays,
  },
) {
  const days = clampCooldownDays(retryDays, 0);
  if (!db || days <= 0 || !resourceType || !resourceRef) return null;

  if (isGlProduct(product)) {
    if (!reader || !reader.reader_user_type || !reader.reader_user_id) return null;
    await db.execute(
      `INSERT INTO gl_resource_gating_cooldowns
        (reader_user_type, reader_user_id, resource_type, resource_ref, locked_until, wrong_question_code)
       VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? DAY), ?)
       ON DUPLICATE KEY UPDATE
         locked_until = DATE_ADD(NOW(), INTERVAL ? DAY),
         wrong_question_code = VALUES(wrong_question_code),
         updated_at = NOW()`,
      [
        reader.reader_user_type,
        reader.reader_user_id,
        resourceType,
        resourceRef,
        days,
        questionCode,
        days,
      ],
    );
  } else {
    if (!userId) return null;
    await db.execute(
      `INSERT INTO resource_gating_cooldowns
        (user_id, resource_type, resource_ref, locked_until, wrong_question_code)
       VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? DAY), ?)
       ON DUPLICATE KEY UPDATE
         locked_until = DATE_ADD(NOW(), INTERVAL ? DAY),
         wrong_question_code = VALUES(wrong_question_code),
         updated_at = NOW()`,
      [String(userId), resourceType, resourceRef, days, questionCode, days],
    );
  }
  return getResourceCooldownState(db, {
    product,
    userId,
    reader,
    resourceType,
    resourceRef,
    retryDays: days,
  });
}

/**
 * Point d'entree des routes de reponse QCM : sur une MAUVAISE reponse a une question
 * liee a la ressource en cours de validation, pose le verrou. No-op si delai <= 0,
 * si la reponse est correcte, ou si le code n'est pas un lien bloquant approuve.
 * Best-effort : ne jette jamais (ne doit pas casser la reponse QCM).
 * @returns {Promise<object|null>} etat du verrou pose, ou null.
 */
async function maybeRegisterCooldownOnWrong(
  db,
  {
    product,
    userId = null,
    reader = null,
    resourceType,
    resourceRef,
    questionCode,
    isCorrect,
    retryDays,
  } = {},
) {
  try {
    const days = clampCooldownDays(retryDays, 0);
    if (days <= 0 || isCorrect || !resourceType || !resourceRef || !questionCode) return null;
    if (!(await isApprovedGatingLink(db, product, resourceType, resourceRef, questionCode))) {
      return null;
    }
    return await registerResourceCooldown(db, {
      product,
      userId,
      reader,
      resourceType,
      resourceRef,
      questionCode,
      retryDays: days,
    });
  } catch (_err) {
    return null; // defensif : ne jamais casser la reponse QCM
  }
}

module.exports = {
  MS_PER_DAY,
  clampCooldownDays,
  buildCooldownState,
  remainingCooldownDays,
  getResourceCooldownState,
  isApprovedGatingLink,
  registerResourceCooldown,
  maybeRegisterCooldownOnWrong,
};
