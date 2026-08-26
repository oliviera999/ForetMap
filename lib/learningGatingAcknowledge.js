'use strict';

// =====================================================================
// Phase 3 — Gating « pull » à l'accusé « Marquer comme lu/appris/étudié ».
// Charge les liens gating approuvés, vérifie les bonnes réponses en BDD
// et expose l'état du challenge.
//
// La POLITIQUE EFFECTIVE est résolue à chaque appel (audit F1/F5, 2026-08) :
//   réglages du site (mode, seuil, granularité) + surcharge par ressource
//   (`resource_gating_policy` / `gl_resource_gating_policy`) via `resolveEffectivePolicy`.
// L'accusé n'est donc plus figé sur « toutes les questions » : `any` (une réussite suffit),
// `all` et `threshold` (N réussites) sont appliqués pour de bon.
//
// Deux garde-fous délibérés :
//   - l'interrupteur global reste MAÎTRE : site éteint = aucun quiz, même si une ressource
//     porte `enabled = 1`. La surcharge par ressource ne peut donc qu'ASSOUPLIR (désactiver
//     le conditionnement d'une ressource), jamais l'allumer derrière l'interrupteur global ;
//   - granularité `team` : les bonnes réponses de l'équipe comptent EN PLUS de celles du
//     lecteur (union), ce qui rattrape le mode « QCM réservés au MJ » où c'est le MJ qui
//     répond pour l'équipe (audit F4).
// =====================================================================

const { getFmGatingSite, FM_MARKABLE, GL_MARKABLE } = require('./learningGatingRuntime');
const { getGlGatingSettings } = require('./glSettings');
const { buildReaderKey } = require('./shared/learningAckCore');
const {
  normalizeResourceType,
  normalizeResourceRef,
  normalizeQuestionCode,
  normalizeGranularity,
  clampRequiredCorrect,
  gatingQuestionCodes,
  evaluateUnlock,
  resolveEffectivePolicy,
  FORETMAP_RESOURCE_TYPES,
  GL_RESOURCE_TYPES,
} = require('./shared/resourceQuestionGatingCore');
const { listCorrectQcmCodesForReader } = require('./glQcmAttempts');
const {
  getResourceCooldownState,
  clampCooldownDays,
  clampAllowedWrongAttempts,
} = require('./learningGatingCooldown');

/** Borne le nombre de questions posees d'affilee (1 a 10, defaut 3). */
function clampQuestionsPerSession(value, fallback = 3) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(10, Math.floor(n)));
}

/** Mode retenu quand aucun réglage n'est lisible (le plus exigeant : on ne débloque pas par accident). */
const FALLBACK_MODE = 'all';

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

/** Surcharge de politique pour une ressource (mode / seuil / activation). `null` si aucune. */
async function loadResourcePolicy(db, product, resourceType, resourceRef) {
  const table = product === 'gl' ? 'gl_resource_gating_policy' : 'resource_gating_policy';
  try {
    return await db.queryOne(
      `SELECT mode, required_correct, enabled FROM ${table}
        WHERE resource_type = ? AND resource_ref = ? LIMIT 1`,
      [resourceType, resourceRef],
    );
  } catch (_err) {
    return null; // défensif : une politique illisible ne doit pas casser l'accusé
  }
}

/**
 * Équipe du lecteur GL, pour la granularité `team`. Le JWT GL porte `teamId` ;
 * on retombe sur l'équipe courante du joueur en base si le jeton ne l'a pas.
 */
async function resolveGlReaderTeamId(db, glAuth) {
  const fromToken = Number(glAuth?.teamId);
  if (Number.isFinite(fromToken) && fromToken > 0) return Math.trunc(fromToken);
  if (glAuth?.userType !== 'gl_player' || glAuth?.userId == null) return null;
  try {
    const row = await db.queryOne('SELECT team_id FROM gl_players WHERE id = ? LIMIT 1', [
      String(glAuth.userId),
    ]);
    const teamId = Number(row?.team_id);
    return Number.isFinite(teamId) && teamId > 0 ? Math.trunc(teamId) : null;
  } catch (_err) {
    return null;
  }
}

/** Codes réussis par l'ÉQUIPE (toute réponse juste portant ce team_id, MJ compris). */
async function listGlCorrectQuestionCodesForTeam(db, teamId) {
  if (!teamId) return [];
  try {
    const rows = await db.queryAll(
      `SELECT DISTINCT question_code FROM gl_qcm_attempts
        WHERE team_id = ? AND is_correct = 1`,
      [teamId],
    );
    return rows.map((r) => normalizeQuestionCode(r.question_code)).filter(Boolean);
  } catch (_err) {
    return [];
  }
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

/** Réponse « rien à passer » : forme stable, quelle que soit la raison de la dispense. */
function notRequired({ gating_enabled, mode }) {
  return {
    ok: true,
    gating_enabled,
    required: false,
    mode,
    questions: [],
    pending_count: 0,
    ask_count: 0,
    satisfied: true,
  };
}

/**
 * Combien de bonnes réponses la politique exige-t-elle réellement ?
 * `any` → 1 · `all` → toutes les questions bloquantes · `threshold` → le seuil, borné au
 * nombre de questions liées (un seuil de 5 sur 2 questions serait insatisfiable).
 */
function requiredCorrectCount(policy, gatingCodesCount) {
  if (gatingCodesCount <= 0) return 0;
  if (policy.mode === 'all') return gatingCodesCount;
  if (policy.mode === 'threshold') {
    return Math.min(clampRequiredCorrect(policy.requiredCorrect, 1), gatingCodesCount);
  }
  return 1; // 'any'
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
    return notRequired({ gating_enabled: false, mode: 'off' });
  }

  const settings = p === 'gl' ? await getGlGatingSettings() : await getFmGatingSite();
  const siteEnabled = Boolean(settings?.enabled);
  const retryCooldownDays = clampCooldownDays(settings?.retryCooldownDays, 0);

  // Interrupteur global maître : éteint, aucune surcharge de ressource ne peut le rallumer.
  if (!siteEnabled) {
    return notRequired({ gating_enabled: false, mode: 'off' });
  }

  const perResource = await loadResourcePolicy(db, p, rt, ref);
  const policy = resolveEffectivePolicy({
    perResource,
    site: {
      enabled: true, // déjà vérifié ci-dessus ; la surcharge ne peut ici que désactiver
      granularity: settings?.granularity,
      defaultMode: settings?.defaultMode || FALLBACK_MODE,
      defaultRequiredCorrect: settings?.defaultRequiredCorrect,
    },
  });

  // Ressource explicitement dispensée (`enabled = 0`) ou mode « off ».
  if (!policy.enabled || policy.mode === 'off') {
    return notRequired({ gating_enabled: true, mode: 'off' });
  }

  const links = await loadApprovedGatingLinks(db, p, rt, ref);
  const gatingCodes = gatingQuestionCodes(links);
  if (gatingCodes.length === 0) {
    return notRequired({ gating_enabled: true, mode: policy.mode });
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
    // Granularité « équipe » : les réponses justes portant le team_id du lecteur comptent
    // aussi — y compris celles saisies par le MJ en mode animation (audit F4).
    if (normalizeGranularity(policy.granularity) === 'team') {
      const teamId = await resolveGlReaderTeamId(db, glAuth);
      for (const code of await listGlCorrectQuestionCodesForTeam(db, teamId)) {
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
  const satisfiedCount = gatingCodes.filter((c) => correctSet.has(c)).length;
  const requiredCount = requiredCorrectCount(policy, gatingCodes.length);
  const pending_count = Math.max(0, requiredCount - satisfiedCount);

  // Verrou de re-tentative : pose apres une erreur au QCM de validation (cf. learningGatingCooldown).
  const cooldown = await getResourceCooldownState(db, {
    product: p,
    userId,
    reader,
    resourceType: rt,
    resourceRef: ref,
    retryDays: retryCooldownDays,
  });

  // Plafond de questions posees en UNE session : en mode « toutes », une ressource
  // portant huit questions bloquantes les enchainait sans limite. Les bonnes reponses
  // restant acquises, l'eleve avance par paliers au lieu de subir un marathon.
  const perSession = clampQuestionsPerSession(settings?.maxQuestionsPerSession);
  const ask_count = Math.min(pending_count, perSession);

  return {
    ok: true,
    gating_enabled: true,
    required: true,
    mode: policy.mode,
    granularity: policy.granularity,
    required_correct: requiredCount,
    questions,
    pending_count,
    ask_count,
    max_questions_per_session: perSession,
    allowed_wrong_attempts: clampAllowedWrongAttempts(settings?.allowedWrongAttempts),
    satisfied: pending_count === 0,
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

  // Décision finale par le cœur partagé, avec le mode et le seuil EFFECTIFS : `any` accepte
  // une seule bonne réponse, `threshold` en exige N, `all` les exige toutes.
  const links = await loadApprovedGatingLinks(db, product, resourceType, resourceRef);
  const correctRefs = state.questions.filter((q) => q.already_correct).map((q) => q.question_code);
  const satisfied = evaluateUnlock({
    links,
    correctRefs,
    mode: state.mode,
    requiredCorrect: state.required_correct,
  });
  if (!satisfied) {
    return {
      ok: false,
      status: 403,
      error: missingAnswersMessage(state),
      missing_question_codes: missing.length ? missing : gatingQuestionCodes(links),
    };
  }

  return { ok: true };
}

/** Message de refus accordé au mode effectif (ne pas exiger « toutes » quand une suffit). */
function missingAnswersMessage(state) {
  if (state.mode === 'any') {
    return 'Répondez correctement à une des questions liées avant de valider.';
  }
  if (state.mode === 'threshold') {
    const n = Math.max(1, Number(state.required_correct) || 1);
    return `Répondez correctement à ${n} question${n > 1 ? 's' : ''} liée${n > 1 ? 's' : ''} avant de valider.`;
  }
  return 'Répondez correctement à toutes les questions liées avant de valider.';
}

module.exports = {
  FALLBACK_MODE,
  clampQuestionsPerSession,
  normalizeProduct,
  loadApprovedGatingLinks,
  loadResourcePolicy,
  getChallengeState,
  assertGatingSatisfiedForAcknowledge,
};
