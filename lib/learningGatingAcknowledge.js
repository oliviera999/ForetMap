'use strict';

// =====================================================================
// Phase 3 — Gating « pull » à l'accusé « Marquer comme lu/appris/étudié ».
// Charge les liens gating approuvés, vérifie les bonnes réponses en BDD
// et expose l'état du challenge (toutes les questions obligatoires, mode all).
// =====================================================================

const { getFmGatingSite, FM_MARKABLE, GL_MARKABLE } = require('./learningGatingRuntime');
const { getGlGatingSettings } = require('./glSettings');
const { buildReaderKey } = require('./shared/learningAckCore');
const {
  normalizeResourceType,
  normalizeResourceRef,
  normalizeQuestionCode,
  gatingQuestionCodes,
  evaluateUnlock,
  FORETMAP_RESOURCE_TYPES,
  GL_RESOURCE_TYPES,
} = require('./shared/resourceQuestionGatingCore');
const { listCorrectQcmCodesForReader } = require('./glQcmAttempts');
const { getResourceCooldownState, clampCooldownDays } = require('./learningGatingCooldown');

const ACKNOWLEDGE_MODE = 'all';

function normalizeProduct(value) {
  const v = String(value || '')
    .trim()
    .toLowerCase();
  if (v === 'fm' || v === 'foretmap') return 'fm';
  if (v === 'gl') return 'gl';
  return null;
}

function allowedResourceTypes(product) {
  return product === 'gl' ? GL_RESOURCE_TYPES : FORETMAP_RESOURCE_TYPES;
}

function markableResourceTypes(product) {
  return product === 'gl' ? GL_MARKABLE : FM_MARKABLE;
}

/** Liens gating approuvés pour une ressource (is_gating=1). */
async function loadApprovedGatingLinks(db, product, resourceType, resourceRef) {
  const p = normalizeProduct(product);
  const rt = normalizeResourceType(resourceType, allowedResourceTypes(p));
  const ref = normalizeResourceRef(resourceRef);
  if (!p || !rt || !ref || !markableResourceTypes(p).has(rt)) return [];

  if (p === 'gl') {
    return db.queryAll(
      `SELECT question_code, question_dataset, is_gating, weight
         FROM gl_resource_question_links
        WHERE resource_type = ? AND resource_ref = ? AND status = 'approved' AND is_gating = 1
        ORDER BY weight DESC, question_code ASC`,
      [rt, ref],
    );
  }
  return db.queryAll(
    `SELECT question_code, is_gating, weight
       FROM resource_question_links
      WHERE resource_type = ? AND resource_ref = ? AND status = 'approved' AND is_gating = 1
      ORDER BY weight DESC, question_code ASC`,
    [rt, ref],
  );
}

async function listFmCorrectQuestionCodes(db, userId) {
  if (!userId) return [];
  const rows = await db.queryAll(
    'SELECT DISTINCT question_code FROM user_quiz_attempts WHERE user_id = ? AND is_correct = 1',
    [String(userId)],
  );
  return rows.map((r) => normalizeQuestionCode(r.question_code)).filter(Boolean);
}

async function listGlCorrectQuestionCodes(db, reader, dataset) {
  if (!reader) return [];
  return (await listCorrectQcmCodesForReader(db, reader, dataset))
    .map((c) => normalizeQuestionCode(c))
    .filter(Boolean);
}

function buildQuestionEntries(links, correctSet, product) {
  const seen = new Set();
  const questions = [];
  for (const link of links) {
    const code = normalizeQuestionCode(link.question_code);
    if (!code || seen.has(code)) continue;
    seen.add(code);
    const entry = {
      question_code: code,
      already_correct: correctSet.has(code),
    };
    if (product === 'gl') {
      entry.question_dataset = String(link.question_dataset || 'qcm')
        .trim()
        .toLowerCase();
    }
    questions.push(entry);
  }
  return questions;
}

/**
 * État du challenge gating pour une ressource.
 * @param {object} params
 * @param {boolean} [params.skipGating] — premier marquage déjà fait (re-observation, etc.)
 */
async function getChallengeState(
  db,
  { product, resourceType, resourceRef, userId = null, glAuth = null, skipGating = false } = {},
) {
  const p = normalizeProduct(product);
  const rt = normalizeResourceType(resourceType, allowedResourceTypes(p));
  const ref = normalizeResourceRef(resourceRef);
  if (!p || !rt || !ref) {
    return { ok: false, status: 400, error: 'Paramètres de ressource invalides' };
  }
  if (!markableResourceTypes(p).has(rt)) {
    return { ok: false, status: 400, error: 'Type de ressource non pris en charge' };
  }

  if (skipGating) {
    return {
      ok: true,
      gating_enabled: false,
      required: false,
      mode: ACKNOWLEDGE_MODE,
      questions: [],
      pending_count: 0,
    };
  }

  const settings = p === 'gl' ? await getGlGatingSettings() : await getFmGatingSite();
  const siteEnabled = Boolean(settings?.enabled);
  const retryCooldownDays = clampCooldownDays(settings?.retryCooldownDays, 0);

  if (!siteEnabled) {
    return {
      ok: true,
      gating_enabled: false,
      required: false,
      mode: ACKNOWLEDGE_MODE,
      questions: [],
      pending_count: 0,
    };
  }

  const links = await loadApprovedGatingLinks(db, p, rt, ref);
  const gatingCodes = gatingQuestionCodes(links);
  if (gatingCodes.length === 0) {
    return {
      ok: true,
      gating_enabled: true,
      required: false,
      mode: ACKNOWLEDGE_MODE,
      questions: [],
      pending_count: 0,
    };
  }

  let correctSet;
  let reader = null;
  if (p === 'gl') {
    reader = buildReaderKey(glAuth);
    if (!reader) {
      return { ok: false, status: 403, error: 'Profil invalide' };
    }
    const allCorrect = new Set();
    for (const ds of ['qcm', 'qcm_lore']) {
      for (const code of await listGlCorrectQuestionCodes(db, reader, ds)) {
        allCorrect.add(code);
      }
    }
    correctSet = allCorrect;
  } else {
    if (!userId) {
      return { ok: false, status: 403, error: 'Authentification requise' };
    }
    correctSet = new Set(await listFmCorrectQuestionCodes(db, userId));
  }

  const questions = buildQuestionEntries(links, correctSet, p);
  const pending_count = questions.filter((q) => !q.already_correct).length;

  // Verrou de re-tentative : pose apres une erreur au QCM de validation (cf. learningGatingCooldown).
  const cooldown = await getResourceCooldownState(db, {
    product: p,
    userId,
    reader,
    resourceType: rt,
    resourceRef: ref,
    retryDays: retryCooldownDays,
  });

  return {
    ok: true,
    gating_enabled: true,
    required: true,
    mode: ACKNOWLEDGE_MODE,
    questions,
    pending_count,
    cooldown,
  };
}

/**
 * Vérifie que toutes les questions gating ont une bonne réponse avant accusé.
 * @returns {{ ok: true } | { ok: false, status: number, error: string, missing_question_codes: string[] }}
 */
async function assertGatingSatisfiedForAcknowledge(
  db,
  { product, resourceType, resourceRef, userId = null, glAuth = null, skipGating = false } = {},
) {
  const state = await getChallengeState(db, {
    product,
    resourceType,
    resourceRef,
    userId,
    glAuth,
    skipGating,
  });
  if (!state.ok) {
    return {
      ok: false,
      status: state.status || 400,
      error: state.error || 'Challenge invalide',
      missing_question_codes: [],
    };
  }
  if (!state.required) return { ok: true };

  // Verrou actif : validation refusee, meme si toutes les questions sont deja reussies.
  if (state.cooldown?.locked) {
    const remainingDays = state.cooldown.remaining_days || 1;
    return {
      ok: false,
      status: 403,
      error: `Une erreur a été commise : réessaie dans ${remainingDays} jour${remainingDays > 1 ? 's' : ''} pour valider cette ressource.`,
      missing_question_codes: [],
      cooldown: state.cooldown,
    };
  }

  const missing = state.questions.filter((q) => !q.already_correct).map((q) => q.question_code);

  if (missing.length > 0) {
    return {
      ok: false,
      status: 403,
      error: 'Répondez correctement à toutes les questions liées avant de valider.',
      missing_question_codes: missing,
    };
  }

  const links = await loadApprovedGatingLinks(db, product, resourceType, resourceRef);
  const correctRefs = state.questions.map((q) => q.question_code);
  const satisfied = evaluateUnlock({
    links,
    correctRefs,
    mode: ACKNOWLEDGE_MODE,
    requiredCorrect: links.length,
  });
  if (!satisfied) {
    return {
      ok: false,
      status: 403,
      error: 'Répondez correctement à toutes les questions liées avant de valider.',
      missing_question_codes: missing.length ? missing : gatingQuestionCodes(links),
    };
  }

  return { ok: true };
}

module.exports = {
  ACKNOWLEDGE_MODE,
  normalizeProduct,
  loadApprovedGatingLinks,
  getChallengeState,
  assertGatingSatisfiedForAcknowledge,
};
