'use strict';

// =====================================================================
// Verrou de re-tentative (« cooldown ») du conditionnement « marquer comme acquis ».
// Apres une MAUVAISE reponse a une question bloquante DANS le flux de validation,
// la ressource (ou la seule question ratee, selon la portee) est verrouillee pendant N HEURES
// (reglage, defaut 1 h — il se reglait en jours, defaut 3 j, puis 6 h, cf. lot 2 de
// docs/AUDIT_VALIDATION_QUIZ_2026-09.md). Tant que le verrou court, la validation est
// refusee — meme si toutes les reponses sont bonnes.
//
// Deux tables miroirs isolees : resource_gating_cooldowns (ForetMap, cle user_id) et
// gl_resource_gating_cooldowns (GL, cle lecteur). Aucune dependance vers
// learningGatingAcknowledge (evite un require circulaire) : la verification du lien
// bloquant approuve est refaite ici par une petite requete dediee.
// =====================================================================

const { isQuestionScopedCooldown } = require('./shared/gatingSettingsCore');
const duration = require('./shared/cooldownDurationCore');

const { MS_PER_DAY, MS_PER_HOUR } = duration;

/**
 * Date sentinelle d'une ligne de COMPTAGE (fautes sous la tolérance, pas un verrou).
 *
 * `locked_until` est NOT NULL : on ne peut pas y mettre NULL. `NOW()` était le choix
 * initial — « déjà dans le passé, donc non verrouillant » — mais `readWrongAttempts`
 * traite toute date échue comme « série soldée, compteur à zéro ». À la milliseconde
 * près, `NOW()` est échue : chaque faute sous la tolérance repartait de zéro, et le
 * verrou ne tombait jamais. 1970 est assez loin de toute date de déblocage réelle
 * (NOW()+N jours) pour que les deux cas ne se confondent pas.
 */
const COUNTING_LOCK_UNTIL = '1970-01-01 00:00:00';
const COUNTING_LOCK_UNTIL_SQL = `'${COUNTING_LOCK_UNTIL}'`;

function parseLockedUntilMs(value) {
  if (value == null || value === '') return NaN;
  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isFinite(t) ? t : NaN;
  }
  const s = String(value).trim();
  if (!s) return NaN;
  const t = Date.parse(s.includes('T') ? s : s.replace(' ', 'T'));
  return Number.isFinite(t) ? t : NaN;
}

/** Ligne de comptage (sentinelle 1970), pas un vrai verrou expiré. */
function isCountingOnlyLockedUntil(value) {
  const ms = parseLockedUntilMs(value);
  return Number.isFinite(ms) && ms < Date.UTC(1980, 0, 1);
}

/**
 * Code de question porte par la ligne de verrou, selon la portee choisie.
 * Chaine vide = verrou de portee RESSOURCE (comportement historique) ; un code =
 * verrou limite a cette seule question, l'eleve pouvant poursuivre sur les autres.
 */
function cooldownKeyQuestionCode(settings, questionCode) {
  return isQuestionScopedCooldown(settings) ? String(questionCode || '') : '';
}

/** Borne le delai de verrou en HEURES (0 = desactive). Defaut : celui du module de durees. */
function clampCooldownHours(value, fallback = duration.DEFAULT_RETRY_COOLDOWN_HOURS) {
  return duration.clampCooldownHours(value, fallback);
}

/**
 * Compatibilite : ancien bornage en jours (0..365). Ne sert plus qu'a convertir une valeur
 * exprimee en jours ; les appels internes passent par `clampCooldownHours`.
 */
function clampCooldownDays(value, fallback = 3) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(365, Math.floor(n)));
}

/** Champs de duree communs a tous les etats de verrou (verrouille ou non). */
function durationFields(retryHours, remainingMs = 0) {
  const hours = clampCooldownHours(retryHours, 0);
  const ms = Math.max(0, Number(remainingMs) || 0);
  return {
    retry_hours: hours,
    retry_label: duration.formatHoursLabel(hours),
    // Conserves pour les clients qui les lisaient : arrondi au jour superieur.
    retry_days: hours > 0 ? Math.ceil(hours / 24) : 0,
    remaining_ms: ms,
    remaining_hours: duration.remainingHours(ms),
    remaining_days: duration.remainingDays(ms),
    remaining_label: duration.formatRemainingLabel(ms),
  };
}

/**
 * Etat de verrou pur (testable sans BDD).
 * @param {Date|string|null} lockedUntil
 * @param {number} retryHours delai regle, en heures
 * @param {number} nowMs
 */
function buildCooldownState(lockedUntil, retryHours, nowMs = Date.now()) {
  const unlocked = { locked: false, locked_until: null, ...durationFields(retryHours, 0) };
  if (!lockedUntil) return unlocked;
  const untilMs = lockedUntil instanceof Date ? lockedUntil.getTime() : Date.parse(lockedUntil);
  if (!Number.isFinite(untilMs) || untilMs <= nowMs) return unlocked;
  const remainingMs = untilMs - nowMs;
  return {
    locked: true,
    locked_until: new Date(untilMs).toISOString(),
    ...durationFields(retryHours, remainingMs),
  };
}

/** Jours restants (arrondi au superieur) avant deblocage — conserve pour compatibilite. */
function remainingCooldownDays(remainingMs) {
  return duration.remainingDays(remainingMs);
}

function isGlProduct(product) {
  return String(product || '').toLowerCase() === 'gl';
}

/** Le lecteur/utilisateur est-il verrouille sur cette ressource ? Lit la table miroir du produit. */
async function getResourceCooldownState(
  db,
  {
    product,
    userId = null,
    reader = null,
    resourceType,
    resourceRef,
    retryHours = 0,
    questionCode = null,
  } = {},
) {
  const hours = clampCooldownHours(retryHours, 0);
  const emptyLocked = { locked: false, locked_until: null, ...durationFields(hours, 0) };
  // Delai a 0 = verrou desactive : on ne bloque jamais, meme si une ligne de verrou subsiste.
  if (!db || hours <= 0 || !resourceType || !resourceRef) return emptyLocked;

  // Verrou de portee ressource ('') OU verrou de la question interrogee : on prend
  // le plus contraignant (celui qui expire le plus tard).
  const codes = questionCode ? ['', String(questionCode)] : [''];
  const placeholders = codes.map(() => '?').join(', ');
  let row;
  if (isGlProduct(product)) {
    if (!reader || !reader.reader_user_type || !reader.reader_user_id) return emptyLocked;
    row = await db.queryOne(
      `SELECT locked_until, wrong_attempts FROM gl_resource_gating_cooldowns
        WHERE reader_user_type = ? AND reader_user_id = ?
          AND resource_type = ? AND resource_ref = ? AND question_code IN (${placeholders})
        ORDER BY locked_until DESC
        LIMIT 1`,
      [reader.reader_user_type, reader.reader_user_id, resourceType, resourceRef, ...codes],
    );
  } else {
    if (!userId) return emptyLocked;
    row = await db.queryOne(
      `SELECT locked_until, wrong_attempts FROM resource_gating_cooldowns
        WHERE user_id = ? AND resource_type = ? AND resource_ref = ? AND question_code IN (${placeholders})
        ORDER BY locked_until DESC
        LIMIT 1`,
      [String(userId), resourceType, resourceRef, ...codes],
    );
  }
  return resourceCooldownStateFromRow(row, hours);
}

/**
 * Etat de verrou a partir d'une ligne DEJA chargee — meme contrat que la fin de
 * `getResourceCooldownState`, partage pour que le chemin groupe (`/gating/summary`) et le
 * chemin unitaire (`/gating/challenge`) ne puissent pas diverger.
 *
 * `wrong_attempts` porte le compteur de la serie EN COURS : celui d'un verrou qui court, ou
 * celui d'une ligne de comptage (sentinelle 1970, fautes sous la tolerance). Il ne valait que
 * verrou pose : l'eleve qui avait deja consomme une faute relisait « tu as droit a 2 erreurs »
 * a chaque ouverture (docs/AUDIT_VALIDATION_QUIZ_2026-09.md, A6). Un vrai verrou expire remet
 * bien le compteur a zero (la serie est soldee).
 */
function resourceCooldownStateFromRow(row, retryHours) {
  const hours = clampCooldownHours(retryHours, 0);
  if (hours <= 0) {
    return { locked: false, locked_until: null, ...durationFields(hours, 0) };
  }
  const state = buildCooldownState(row?.locked_until || null, hours);
  if (state.locked || isCountingOnlyLockedUntil(row?.locked_until)) {
    state.wrong_attempts = Number(row?.wrong_attempts) || 0;
  } else {
    state.wrong_attempts = 0;
  }
  return state;
}

/**
 * Regroupe les lignes de verrou d'UNE ressource : la ligne de portee ressource (`question_code`
 * vide) et les lignes par question (portee « question seule »).
 * @returns {{ resource: object|null, questions: Map<string, object> }}
 */
function groupCooldownRows(rows) {
  const grouped = { resource: null, questions: new Map() };
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row) continue;
    const code = String(row.question_code || '');
    if (!code) {
      // `ORDER BY locked_until DESC` + premier gagnant = le `LIMIT 1` historique.
      if (!grouped.resource) grouped.resource = row;
    } else if (!grouped.questions.has(code)) {
      grouped.questions.set(code, row);
    }
  }
  return grouped;
}

/** Toutes les lignes de verrou d'une ressource pour ce lecteur (portee ressource ET question). */
async function loadCooldownRowsForRef(
  db,
  { product, userId = null, reader = null, resourceType, resourceRef } = {},
) {
  if (!db || !resourceType || !resourceRef) return groupCooldownRows([]);
  let rows = [];
  if (isGlProduct(product)) {
    if (!reader || !reader.reader_user_type || !reader.reader_user_id) return groupCooldownRows([]);
    rows = await db.queryAll(
      `SELECT question_code, locked_until, wrong_attempts FROM gl_resource_gating_cooldowns
        WHERE reader_user_type = ? AND reader_user_id = ?
          AND resource_type = ? AND resource_ref = ?
        ORDER BY locked_until DESC`,
      [reader.reader_user_type, reader.reader_user_id, resourceType, resourceRef],
    );
  } else {
    if (!userId) return groupCooldownRows([]);
    rows = await db.queryAll(
      `SELECT question_code, locked_until, wrong_attempts FROM resource_gating_cooldowns
        WHERE user_id = ? AND resource_type = ? AND resource_ref = ?
        ORDER BY locked_until DESC`,
      [String(userId), resourceType, resourceRef],
    );
  }
  return groupCooldownRows(rows);
}

/**
 * Lignes de verrou de PLUSIEURS ressources en une requete, regroupees par ressource
 * (`groupCooldownRows`). Pendant groupe de `loadCooldownRowsForRef`, pour `buildGatingSummary`
 * qui en emettait une par ressource (docs/AUDIT_CHARGE_BIODIVERSITE_2026-09.md, B4).
 *
 * @returns {Promise<Map<string, {resource: object|null, questions: Map<string, object>}>>}
 */
async function loadResourceCooldownRows(
  db,
  { product, userId = null, reader = null, resourceType, refs = [] } = {},
) {
  const unique = [
    ...new Set(
      (Array.isArray(refs) ? refs : [])
        .map((r) => String(r == null ? '' : r).trim())
        .filter(Boolean),
    ),
  ];
  if (!db || !resourceType || unique.length === 0) return new Map();
  const placeholders = unique.map(() => '?').join(', ');
  let rows = [];
  if (isGlProduct(product)) {
    if (!reader || !reader.reader_user_type || !reader.reader_user_id) return new Map();
    rows = await db.queryAll(
      `SELECT resource_ref, question_code, locked_until, wrong_attempts
         FROM gl_resource_gating_cooldowns
        WHERE reader_user_type = ? AND reader_user_id = ?
          AND resource_type = ? AND resource_ref IN (${placeholders})
        ORDER BY locked_until DESC`,
      [reader.reader_user_type, reader.reader_user_id, resourceType, ...unique],
    );
  } else {
    if (!userId) return new Map();
    rows = await db.queryAll(
      `SELECT resource_ref, question_code, locked_until, wrong_attempts
         FROM resource_gating_cooldowns
        WHERE user_id = ? AND resource_type = ? AND resource_ref IN (${placeholders})
        ORDER BY locked_until DESC`,
      [String(userId), resourceType, ...unique],
    );
  }
  const rowsByRef = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const key = String(row.resource_ref);
    if (!rowsByRef.has(key)) rowsByRef.set(key, []);
    rowsByRef.get(key).push(row);
  }
  const byRef = new Map();
  for (const [key, list] of rowsByRef) byRef.set(key, groupCooldownRows(list));
  return byRef;
}

/**
 * Vue COMPLETE du verrou d'une ressource, portee « question seule » comprise — pure, partagee
 * par le challenge (chemin unitaire) et le resume (chemin groupe) pour qu'ils ne divergent pas.
 *
 * Portee `resource` : la ligne `question_code = ''` fait loi, comme avant.
 * Portee `question` (docs/AUDIT_VALIDATION_QUIZ_2026-09.md, A1 / lot 3) : chaque question ratee
 * porte son propre verrou ; l'eleve continue sur les autres questions bloquantes. La ressource
 * n'est « verrouillee » que s'il reste des reponses a donner et qu'aucune question n'est
 * posable — le temps restant est alors celui de la levee LA PLUS PROCHE.
 *
 * @param {object} params
 * @param {{resource: object|null, questions: Map<string, object>}|null} params.rows
 * @param {number} params.retryHours
 * @param {string[]} params.gatingCodes codes bloquants (questions actives)
 * @param {Set<string>} params.correctSet codes deja reussis
 * @param {number} params.pendingCount bonnes reponses encore attendues
 * @param {number} [params.nowMs]
 * @returns {{ cooldown: object, questionStates: Map<string, object>, askableCodes: string[] }}
 */
function buildResourceCooldownView({
  rows = null,
  retryHours = 0,
  gatingCodes = [],
  correctSet = new Set(),
  pendingCount = 0,
  nowMs = Date.now(),
} = {}) {
  const hours = clampCooldownHours(retryHours, 0);
  const grouped = rows && rows.questions instanceof Map ? rows : groupCooldownRows([]);
  const codes = Array.isArray(gatingCodes) ? gatingCodes : [];
  const correct = correctSet instanceof Set ? correctSet : new Set(correctSet || []);

  const questionStates = new Map();
  for (const code of codes) {
    const row = grouped.questions.get(code) || null;
    if (!row) continue;
    const state = buildCooldownState(row.locked_until || null, hours, nowMs);
    state.wrong_attempts =
      state.locked || isCountingOnlyLockedUntil(row.locked_until)
        ? Number(row.wrong_attempts) || 0
        : 0;
    if (hours <= 0) {
      state.locked = false;
      state.locked_until = null;
    }
    questionStates.set(code, state);
  }
  const lockedCodes = codes.filter((c) => questionStates.get(c)?.locked);
  const askableCodes = codes.filter((c) => !correct.has(c) && !lockedCodes.includes(c));

  const resourceState = buildCooldownState(grouped.resource?.locked_until || null, hours, nowMs);
  resourceState.wrong_attempts =
    resourceState.locked || isCountingOnlyLockedUntil(grouped.resource?.locked_until)
      ? Number(grouped.resource?.wrong_attempts) || 0
      : 0;
  if (hours <= 0) {
    resourceState.locked = false;
    resourceState.locked_until = null;
  }

  if (resourceState.locked) {
    return {
      cooldown: { ...resourceState, scope: 'resource', locked_questions: [] },
      questionStates,
      askableCodes: [],
    };
  }

  if (lockedCodes.length > 0 && pendingCount > 0 && askableCodes.length === 0) {
    // Plus rien a poser : la ressource attend la levee la plus proche.
    let nearest = null;
    for (const code of lockedCodes) {
      const st = questionStates.get(code);
      if (!nearest || Date.parse(st.locked_until) < Date.parse(nearest.locked_until)) nearest = st;
    }
    return {
      cooldown: {
        ...nearest,
        scope: 'question',
        locked_questions: lockedCodes,
      },
      questionStates,
      askableCodes: [],
    };
  }

  // Deverrouille (ou partiellement verrouille) : le compteur annonce est celui de la serie la
  // plus avancee parmi ce qui va etre pose, pour que « il te reste N erreurs » ne mente pas.
  let wrongAttempts = resourceState.wrong_attempts;
  for (const code of askableCodes) {
    const st = questionStates.get(code);
    if (st && st.wrong_attempts > wrongAttempts) wrongAttempts = st.wrong_attempts;
  }
  return {
    cooldown: {
      ...resourceState,
      wrong_attempts: wrongAttempts,
      scope: lockedCodes.length > 0 ? 'question' : 'resource',
      locked_questions: lockedCodes,
    },
    questionStates,
    askableCodes,
  };
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

/** Essais rates deja comptes sur cette ressource, remis a zero si le verrou a expire. */
async function readWrongAttempts(
  db,
  { product, userId, reader, resourceType, resourceRef, keyCode = '' },
) {
  try {
    const row = isGlProduct(product)
      ? await db.queryOne(
          `SELECT wrong_attempts, locked_until FROM gl_resource_gating_cooldowns
            WHERE reader_user_type = ? AND reader_user_id = ?
              AND resource_type = ? AND resource_ref = ? AND question_code = ? LIMIT 1`,
          [reader?.reader_user_type, reader?.reader_user_id, resourceType, resourceRef, keyCode],
        )
      : await db.queryOne(
          `SELECT wrong_attempts, locked_until FROM resource_gating_cooldowns
            WHERE user_id = ? AND resource_type = ? AND resource_ref = ? AND question_code = ? LIMIT 1`,
          [String(userId), resourceType, resourceRef, keyCode],
        );
    if (!row) return 0;
    // Comptage sous la tolérance : conserver le compteur. Confondre cette sentinelle
    // avec un vrai verrou expiré (date réelle déjà passée) remettait le compteur à
    // zéro à chaque faute — la tolérance ne s'épuisait jamais.
    if (isCountingOnlyLockedUntil(row.locked_until)) {
      return Number(row.wrong_attempts) || 0;
    }
    const untilMs = parseLockedUntilMs(row.locked_until);
    if (Number.isFinite(untilMs) && untilMs <= Date.now()) return 0;
    return Number(row.wrong_attempts) || 0;
  } catch (_err) {
    return 0;
  }
}

/** Borne le nombre d'essais rates toleres avant verrou (0 = verrou des la premiere erreur). */
function clampAllowedWrongAttempts(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(10, Math.floor(n)));
}

/**
 * Compte une faute SANS verrouiller (tolerance pas encore epuisee).
 * `locked_until` reçoit la sentinelle 1970 : la ligne existe pour porter le compteur,
 * `buildCooldownState` la lit comme non verrouillante, et `readWrongAttempts` ne la
 * confond pas avec un vrai verrou expiré. ON DUPLICATE KEY met aussi à jour
 * `locked_until` : après l'échéance d'un vrai verrou, la ligne redevient un comptage
 * plutôt que de rester une date réelle échue (qui remettrait le compteur à zéro).
 */
async function touchWrongAttempts(
  db,
  { product, userId, reader, resourceType, resourceRef, questionCode, attempts, keyCode = '' },
) {
  if (isGlProduct(product)) {
    if (!reader?.reader_user_type || !reader?.reader_user_id) return;
    await db.execute(
      `INSERT INTO gl_resource_gating_cooldowns
        (reader_user_type, reader_user_id, resource_type, resource_ref, question_code,
         locked_until, wrong_question_code, wrong_attempts)
       VALUES (?, ?, ?, ?, ?, ${COUNTING_LOCK_UNTIL_SQL}, ?, ?)
       ON DUPLICATE KEY UPDATE
         locked_until = VALUES(locked_until),
         wrong_question_code = VALUES(wrong_question_code),
         wrong_attempts = VALUES(wrong_attempts),
         updated_at = NOW()`,
      [
        reader.reader_user_type,
        reader.reader_user_id,
        resourceType,
        resourceRef,
        keyCode,
        questionCode,
        attempts,
      ],
    );
    return;
  }
  if (!userId) return;
  await db.execute(
    `INSERT INTO resource_gating_cooldowns
      (user_id, resource_type, resource_ref, question_code, locked_until, wrong_question_code, wrong_attempts)
     VALUES (?, ?, ?, ?, ${COUNTING_LOCK_UNTIL_SQL}, ?, ?)
     ON DUPLICATE KEY UPDATE
       locked_until = VALUES(locked_until),
       wrong_question_code = VALUES(wrong_question_code),
       wrong_attempts = VALUES(wrong_attempts),
       updated_at = NOW()`,
    [String(userId), resourceType, resourceRef, keyCode, questionCode, attempts],
  );
}

/** Pose (ou repousse) le verrou : locked_until = NOW() + retryHours heures. */
async function registerResourceCooldown(
  db,
  {
    product,
    userId = null,
    reader = null,
    resourceType,
    resourceRef,
    questionCode = null,
    retryHours,
    wrongAttempts = 1,
    keyCode = '',
  },
) {
  const hours = clampCooldownHours(retryHours, 0);
  if (!db || hours <= 0 || !resourceType || !resourceRef) return null;

  if (isGlProduct(product)) {
    if (!reader || !reader.reader_user_type || !reader.reader_user_id) return null;
    await db.execute(
      `INSERT INTO gl_resource_gating_cooldowns
        (reader_user_type, reader_user_id, resource_type, resource_ref, question_code,
         locked_until, wrong_question_code, wrong_attempts)
       VALUES (?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? HOUR), ?, ?)
       ON DUPLICATE KEY UPDATE
         locked_until = DATE_ADD(NOW(), INTERVAL ? HOUR),
         wrong_question_code = VALUES(wrong_question_code),
         wrong_attempts = VALUES(wrong_attempts),
         updated_at = NOW()`,
      [
        reader.reader_user_type,
        reader.reader_user_id,
        resourceType,
        resourceRef,
        keyCode,
        hours,
        questionCode,
        wrongAttempts,
        hours,
      ],
    );
  } else {
    if (!userId) return null;
    await db.execute(
      `INSERT INTO resource_gating_cooldowns
        (user_id, resource_type, resource_ref, question_code, locked_until, wrong_question_code, wrong_attempts)
       VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? HOUR), ?, ?)
       ON DUPLICATE KEY UPDATE
         locked_until = DATE_ADD(NOW(), INTERVAL ? HOUR),
         wrong_question_code = VALUES(wrong_question_code),
         wrong_attempts = VALUES(wrong_attempts),
         updated_at = NOW()`,
      [
        String(userId),
        resourceType,
        resourceRef,
        keyCode,
        hours,
        questionCode,
        wrongAttempts,
        hours,
      ],
    );
  }
  return getResourceCooldownState(db, {
    product,
    userId,
    reader,
    resourceType,
    resourceRef,
    retryHours: hours,
    // Portee « question seule » : la ligne posee porte le code ; sans lui, l'etat relu ne
    // verrait que la portee ressource et dirait « pas verrouille » juste apres l'avoir ete.
    questionCode: keyCode || null,
  });
}

/**
 * Point d'entree des routes de reponse QCM : sur une MAUVAISE reponse a une question
 * liee a la ressource en cours de validation, pose le verrou. No-op si delai (heures) <= 0,
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
    retryHours,
    allowedWrongAttempts = 0,
    cooldownScope = 'resource',
  } = {},
) {
  try {
    const hours = clampCooldownHours(retryHours, 0);
    if (hours <= 0 || isCorrect || !resourceType || !resourceRef || !questionCode) return null;
    if (!(await isApprovedGatingLink(db, product, resourceType, resourceRef, questionCode))) {
      return null;
    }

    const tolerance = clampAllowedWrongAttempts(allowedWrongAttempts);
    // Portee du verrou : ressource entiere ('') ou question seule.
    const keyCode = cooldownKeyQuestionCode({ cooldownScope }, questionCode);
    const previous = await readWrongAttempts(db, {
      product,
      userId,
      reader,
      resourceType,
      resourceRef,
      keyCode,
    });
    const attempts = previous + 1;

    // Sous la tolerance : la faute est comptee, la ressource reste ouverte. On
    // renvoie tout de meme l'etat pour que l'eleve sache combien d'essais restent.
    if (attempts <= tolerance) {
      await touchWrongAttempts(db, {
        product,
        userId,
        reader,
        resourceType,
        resourceRef,
        questionCode,
        attempts,
        keyCode,
      });
      return {
        locked: false,
        locked_until: null,
        ...durationFields(hours, 0),
        wrong_attempts: attempts,
        allowed_wrong_attempts: tolerance,
        attempts_left: Math.max(0, tolerance - attempts),
        scope: keyCode ? 'question' : 'resource',
      };
    }

    const state = await registerResourceCooldown(db, {
      product,
      userId,
      reader,
      resourceType,
      resourceRef,
      questionCode,
      retryHours: hours,
      wrongAttempts: attempts,
      keyCode,
    });
    if (state) {
      state.allowed_wrong_attempts = tolerance;
      state.attempts_left = 0;
      state.scope = keyCode ? 'question' : 'resource';
      state.locked_question_code = keyCode || null;
    }
    return state;
  } catch (_err) {
    return null; // defensif : ne jamais casser la reponse QCM
  }
}

module.exports = {
  MS_PER_DAY,
  MS_PER_HOUR,
  COUNTING_LOCK_UNTIL,
  clampCooldownHours,
  durationFields,
  parseLockedUntilMs,
  isCountingOnlyLockedUntil,
  cooldownKeyQuestionCode,
  clampCooldownDays,
  clampAllowedWrongAttempts,
  readWrongAttempts,
  touchWrongAttempts,
  buildCooldownState,
  remainingCooldownDays,
  getResourceCooldownState,
  resourceCooldownStateFromRow,
  groupCooldownRows,
  loadCooldownRowsForRef,
  loadResourceCooldownRows,
  buildResourceCooldownView,
  isApprovedGatingLink,
  registerResourceCooldown,
  maybeRegisterCooldownOnWrong,
};
