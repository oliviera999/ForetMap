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
  FORETMAP_RESOURCE_TYPES,
  GL_RESOURCE_TYPES,
} = require('./shared/resourceQuestionGatingCore');
const { resolveEffectiveGatingPolicy } = require('./shared/gatingPolicyLayersCore');
const { resolveGlChapterGranularity } = require('./glGatingChapterGranularity');
const { listCorrectQcmCodesForReader } = require('./glQcmAttempts');
const {
  loadCooldownRowsForRef,
  buildResourceCooldownView,
  clampCooldownHours,
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

/**
 * Un lien bloquant n'est retenu que si sa question est ACTIVE : une question archivée reste
 * introuvable à la présentation (404), donc impossible à réussir — en mode « toutes », la
 * ressource devenait insatisfiable sans aucun signal (docs/AUDIT_VALIDATION_QUIZ_2026-09.md, A5).
 */
const FM_ACTIVE_QUESTION_EXISTS = `EXISTS (
          SELECT 1 FROM quiz_questions q
           WHERE q.question_code = l.question_code AND q.statut = 'actif')`;
const GL_ACTIVE_QUESTION_EXISTS = `(
          (l.question_dataset = 'qcm_lore' AND EXISTS (
             SELECT 1 FROM gl_qcm_lore_questions q
              WHERE q.question_code = l.question_code AND q.statut = 'actif'))
          OR (l.question_dataset <> 'qcm_lore' AND EXISTS (
             SELECT 1 FROM gl_qcm_questions q
              WHERE q.question_code = l.question_code AND q.statut = 'actif')))`;

/** Liens gating approuvés pour une ressource (is_gating=1, question active). */
async function loadApprovedGatingLinks(db, product, resourceType, resourceRef) {
  const p = normalizeProduct(product);
  const rt = normalizeResourceType(resourceType, allowedResourceTypes(p));
  const ref = normalizeResourceRef(resourceRef);
  if (!p || !rt || !ref || !markableResourceTypes(p).has(rt)) return [];

  if (p === 'gl') {
    return db.queryAll(
      `SELECT l.question_code, l.question_dataset, l.is_gating, l.weight
         FROM gl_resource_question_links l
        WHERE l.resource_type = ? AND l.resource_ref = ? AND l.status = 'approved' AND l.is_gating = 1
          AND ${GL_ACTIVE_QUESTION_EXISTS}
        ORDER BY l.weight DESC, l.question_code ASC`,
      [rt, ref],
    );
  }
  return db.queryAll(
    `SELECT l.question_code, l.is_gating, l.weight
       FROM resource_question_links l
      WHERE l.resource_type = ? AND l.resource_ref = ? AND l.status = 'approved' AND l.is_gating = 1
        AND ${FM_ACTIVE_QUESTION_EXISTS}
      ORDER BY l.weight DESC, l.question_code ASC`,
    [rt, ref],
  );
}

/**
 * Liens bloquants de PLUSIEURS ressources en une requete — pendant groupe du precedent pour
 * `buildGatingSummary` (docs/AUDIT_CHARGE_BIODIVERSITE_2026-09.md, B4). L'ordre global
 * (`weight DESC, question_code ASC`) restreint a une ressource redonne exactement l'ordre
 * du chemin unitaire.
 *
 * @returns {Promise<Map<string, object[]>>}
 */
async function loadApprovedGatingLinksForRefs(db, product, resourceType, refs = []) {
  const p = normalizeProduct(product);
  const rt = normalizeResourceType(resourceType, allowedResourceTypes(p));
  if (!p || !rt || !markableResourceTypes(p).has(rt)) return new Map();
  const unique = [
    ...new Set(
      (Array.isArray(refs) ? refs : []).map((r) => normalizeResourceRef(r)).filter(Boolean),
    ),
  ];
  const byRef = new Map();
  if (unique.length === 0) return byRef;
  for (const ref of unique) byRef.set(ref, []);
  const placeholders = unique.map(() => '?').join(', ');
  const rows =
    p === 'gl'
      ? await db.queryAll(
          `SELECT l.resource_ref, l.question_code, l.question_dataset, l.is_gating, l.weight
             FROM gl_resource_question_links l
            WHERE l.resource_type = ? AND l.resource_ref IN (${placeholders})
              AND l.status = 'approved' AND l.is_gating = 1
              AND ${GL_ACTIVE_QUESTION_EXISTS}
            ORDER BY l.weight DESC, l.question_code ASC`,
          [rt, ...unique],
        )
      : await db.queryAll(
          `SELECT l.resource_ref, l.question_code, l.is_gating, l.weight
             FROM resource_question_links l
            WHERE l.resource_type = ? AND l.resource_ref IN (${placeholders})
              AND l.status = 'approved' AND l.is_gating = 1
              AND ${FM_ACTIVE_QUESTION_EXISTS}
            ORDER BY l.weight DESC, l.question_code ASC`,
          [rt, ...unique],
        );
  for (const row of Array.isArray(rows) ? rows : []) {
    // `resource_ref` sert au regroupement seulement : le payload par ressource ne le portait pas.
    const { resource_ref: ref, ...link } = row;
    const key = String(ref);
    if (!byRef.has(key)) byRef.set(key, []);
    byRef.get(key).push(link);
  }
  return byRef;
}

const { loadResourcePolicy, loadTypePolicy } = require('./gatingPolicyLoad');

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
  {
    product,
    resourceType,
    resourceRef,
    userId = null,
    glAuth = null,
    skipGating = false,
    chapterGranularity = null,
    /** Set|string[] préchargé (évite N× SELECT user_quiz_attempts dans /summary). */
    correctCodesPreload = null,
    /**
     * GL, chemin groupé : bonnes réponses de l'ÉQUIPE, préchargées à part. Elles ne comptent
     * que si la granularité EFFECTIVE de la ressource est `team` — le résumé les fusionnait
     * sans condition et pouvait dire « acquis » là où le challenge refusait
     * (docs/AUDIT_VALIDATION_QUIZ_2026-09.md, A3).
     */
    teamCodesPreload = null,
    /**
     * Prechargement groupe pour `/summary` : `{ policies, links, cooldowns }`.
     * Absent (chemin `/challenge`, une seule ressource) → requetes unitaires, inchangees.
     */
    preload = null,
  } = {},
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

  // Interrupteur global maître : éteint, aucune surcharge de ressource ne peut le rallumer.
  if (!siteEnabled) {
    return notRequired({ gating_enabled: false, mode: 'off' });
  }

  const perResource = preload?.policies
    ? preload.policies.byRef.get(ref) || null
    : await loadResourcePolicy(db, p, rt, ref);
  const typePolicy = preload?.policies
    ? preload.policies.typePolicy
    : await loadTypePolicy(db, p, rt);
  let resolvedChapterGranularity = chapterGranularity;
  if (p === 'gl' && !resolvedChapterGranularity) {
    resolvedChapterGranularity = await resolveGlChapterGranularity(db, {
      resourceType: rt,
      resourceRef: ref,
      glAuth,
    });
  }
  const policy = resolveEffectiveGatingPolicy({
    perResource,
    typePolicy,
    chapterGranularity: resolvedChapterGranularity,
    site: settings,
    product: p,
    resourceType: rt,
  });

  // Ressource explicitement dispensée (`enabled = 0`) ou mode « off ».
  if (!policy.enabled || policy.mode === 'off') {
    return notRequired({ gating_enabled: true, mode: 'off' });
  }

  const links = preload?.links
    ? preload.links.get(ref) || []
    : await loadApprovedGatingLinks(db, p, rt, ref);
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
  } else if (!userId) {
    return { ok: false, status: 403, error: 'Authentification requise' };
  }

  const teamGranularity = normalizeGranularity(policy.granularity) === 'team';
  if (correctCodesPreload instanceof Set || Array.isArray(correctCodesPreload)) {
    correctSet = new Set(
      [...correctCodesPreload].map((c) => normalizeQuestionCode(c)).filter(Boolean),
    );
    if (p === 'gl' && teamGranularity && teamCodesPreload) {
      for (const code of teamCodesPreload) {
        const normalized = normalizeQuestionCode(code);
        if (normalized) correctSet.add(normalized);
      }
    }
  } else if (p === 'gl') {
    const allCorrect = new Set();
    for (const ds of ['qcm', 'qcm_lore']) {
      for (const code of await listGlCorrectQuestionCodes(db, reader, ds)) {
        allCorrect.add(code);
      }
    }
    if (teamGranularity) {
      const teamId = await resolveGlReaderTeamId(db, glAuth);
      for (const code of await listGlCorrectQuestionCodesForTeam(db, teamId)) {
        allCorrect.add(code);
      }
    }
    correctSet = allCorrect;
  } else {
    correctSet = new Set(await listFmCorrectQuestionCodes(db, userId));
  }

  const questions = buildQuestionEntries(links, correctSet, p);
  const satisfiedCount = gatingCodes.filter((c) => correctSet.has(c)).length;
  const requiredCount = requiredCorrectCount(policy, gatingCodes.length);
  const pending_count = Math.max(0, requiredCount - satisfiedCount);

  // Verrou de re-tentative : pose apres une erreur au QCM de validation (cf. learningGatingCooldown).
  // La vue est la meme pour le chemin unitaire (lignes chargees ici) et le chemin groupe (lignes
  // prechargees par /summary) : portee ressource ou « question seule », jamais deux calculs.
  const retryHours = clampCooldownHours(policy.retryCooldownHours, 0);
  const cooldownRows = preload?.cooldowns
    ? preload.cooldowns.get(ref) || null
    : await loadCooldownRowsForRef(db, {
        product: p,
        userId,
        reader,
        resourceType: rt,
        resourceRef: ref,
      });
  const { cooldown, questionStates, askableCodes } = buildResourceCooldownView({
    rows: cooldownRows,
    retryHours,
    gatingCodes,
    correctSet,
    pendingCount: pending_count,
  });
  for (const entry of questions) {
    const st = questionStates.get(entry.question_code);
    entry.locked = !!st?.locked;
    entry.locked_until = st?.locked ? st.locked_until : null;
    entry.remaining_label = st?.locked ? st.remaining_label : '';
    entry.wrong_attempts = st?.wrong_attempts || 0;
  }

  const perSession = clampQuestionsPerSession(policy.maxQuestionsPerSession);
  // Ce qui peut etre pose MAINTENANT : borne par session et par ce qui n'est pas verrouille.
  const ask_count = Math.min(pending_count, perSession, askableCodes.length);

  return {
    ok: true,
    gating_enabled: true,
    required: true,
    mode: policy.mode,
    granularity: policy.granularity,
    required_correct: requiredCount,
    gating_questions_count: gatingCodes.length,
    questions,
    pending_count,
    ask_count,
    max_questions_per_session: perSession,
    allowed_wrong_attempts: policy.allowedWrongAttempts,
    cooldown_scope: policy.cooldownScope,
    retry_cooldown_hours: retryHours,
    retry_cooldown_label: policy.retryCooldownLabel,
    // Conservé pour les clients qui lisaient des jours : arrondi au jour supérieur.
    retry_cooldown_days: retryHours > 0 ? Math.ceil(retryHours / 24) : 0,
    lock_mode: policy.lockMode,
    effective_sources: policy.effectiveSources,
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
  // En portee « question seule », `locked` ne vaut true que si plus aucune question n'est
  // posable : la politique ne peut pas etre satisfaite sans les questions verrouillees.
  if (state.cooldown?.locked) {
    // Repli neutre : annoncer « 1 h » quand le serveur n'a pas su formater le temps restant
    // inventait un delai que rien ne garantissait.
    const remaining = state.cooldown.remaining_label || 'quelques minutes';
    // Avec une tolerance, il a fallu PLUSIEURS erreurs : « une erreur a ete commise » laissait
    // croire que la tolerance reglee par le professeur n'avait pas joue (meme correction cote
    // client, buildCooldownLockMessage).
    const wrong = Math.max(0, Number(state.cooldown.wrong_attempts) || 0);
    const commises = wrong > 1 ? `${wrong} erreurs ont été commises` : 'Une erreur a été commise';
    const error =
      state.cooldown.scope === 'question'
        ? `Une question ratée est bloquée : réessaie dans ${remaining} pour valider cette ressource.`
        : `${commises} : réessaie dans ${remaining} pour valider cette ressource.`;
    return {
      ok: false,
      status: 403,
      error,
      missing_question_codes: state.cooldown.locked_questions || [],
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
  loadApprovedGatingLinksForRefs,
  getChallengeState,
  assertGatingSatisfiedForAcknowledge,
  listFmCorrectQuestionCodes,
  listGlCorrectQuestionCodes,
  listGlCorrectQuestionCodesForTeam,
  resolveGlReaderTeamId,
};
