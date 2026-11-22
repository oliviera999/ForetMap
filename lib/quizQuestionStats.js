'use strict';

// =====================================================================
// Taux de reussite par question (ForetMap + Gnomes & Licornes).
//
// Une question que tout le monde rate est rarement « difficile » : elle est le
// plus souvent mal formulee, ou son enonce laisse deux lectures possibles. Sans
// ces chiffres, le professeur ne peut pas la reperer — et si elle est bloquante,
// elle bloque toute une classe sans raison.
//
// Les deux produits n'enregistrent pas au meme endroit (`user_quiz_attempts` par
// compte, `gl_qcm_attempts` par lecteur) mais la lecture et le classement sont
// communs : c'est le meme ecran des deux cotes.
// =====================================================================

/** Seuil en deca duquel une moyenne n'a pas de sens statistique. */
const MIN_ATTEMPTS_FOR_FLAG = 5;
/** Taux de reussite sous lequel une question merite d'etre relue. */
const SUSPECT_SUCCESS_RATE = 0.35;
const MAX_ROWS = 300;

/** Enrichit une ligne brute : taux, et signalement s'il y a matiere. */
function decorate(row) {
  const attempts = Number(row.attempts) || 0;
  const correct = Number(row.correct) || 0;
  const rate = attempts > 0 ? correct / attempts : null;
  return {
    question_code: row.question_code,
    question: row.question || null,
    categorie_slug: row.categorie_slug || null,
    attempts,
    correct,
    wrong: attempts - correct,
    success_rate: rate == null ? null : Math.round(rate * 1000) / 1000,
    learners: Number(row.learners) || 0,
    // Un signalement n'a de valeur qu'avec assez de tentatives : sur deux essais,
    // 0 % ne veut rien dire.
    suspect: attempts >= MIN_ATTEMPTS_FOR_FLAG && rate != null && rate < SUSPECT_SUCCESS_RATE,
    is_gating: row.is_gating == null ? null : Number(row.is_gating) === 1,
  };
}

/**
 * Statistiques ForetMap. `onlyGating` restreint aux questions qui conditionnent
 * reellement une validation — celles dont un defaut coute le plus cher.
 *
 * Le caractere bloquant est lu par `EXISTS`, pas par jointure : une question rattachee a
 * trois fiches a trois lignes de liens, et la jointure 1:N multipliait ses tentatives par
 * trois (docs/AUDIT_VALIDATION_QUIZ_2026-09.md, C3).
 */
async function listFmQuestionStats(db, { onlyGating = false, minAttempts = 1 } = {}) {
  const rows = await db.queryAll(
    `SELECT a.question_code,
            q.question,
            q.categorie_slug,
            COUNT(*) AS attempts,
            SUM(CASE WHEN a.is_correct = 1 THEN 1 ELSE 0 END) AS correct,
            COUNT(DISTINCT a.user_id) AS learners,
            EXISTS (
              SELECT 1 FROM resource_question_links l
               WHERE l.question_code = a.question_code
                 AND l.is_gating = 1 AND l.status = 'approved'
            ) AS is_gating
       FROM user_quiz_attempts a
       LEFT JOIN quiz_questions q ON q.question_code = a.question_code
      GROUP BY a.question_code, q.question, q.categorie_slug
     HAVING attempts >= ?
        ${onlyGating ? 'AND is_gating = 1' : ''}
      ORDER BY (SUM(CASE WHEN a.is_correct = 1 THEN 1 ELSE 0 END) / COUNT(*)) ASC, attempts DESC
      LIMIT ${MAX_ROWS}`,
    [Math.max(1, Math.floor(Number(minAttempts) || 1))],
  );
  return rows.map(decorate);
}

/** Statistiques GL. Le lecteur peut etre un joueur, un invite ou un MJ. */
async function listGlQuestionStats(db, { dataset = 'qcm', minAttempts = 1 } = {}) {
  const table = dataset === 'qcm_lore' ? 'gl_qcm_lore_questions' : 'gl_qcm_questions';
  const rows = await db.queryAll(
    `SELECT a.question_code,
            q.question,
            q.categorie_slug,
            COUNT(*) AS attempts,
            SUM(CASE WHEN a.is_correct = 1 THEN 1 ELSE 0 END) AS correct,
            COUNT(DISTINCT CONCAT(a.reader_user_type, ':', a.reader_user_id)) AS learners
       FROM gl_qcm_attempts a
       LEFT JOIN ${table} q ON q.question_code = a.question_code
      WHERE a.question_dataset = ?
      GROUP BY a.question_code, q.question, q.categorie_slug
     HAVING attempts >= ?
      ORDER BY (SUM(CASE WHEN a.is_correct = 1 THEN 1 ELSE 0 END) / COUNT(*)) ASC, attempts DESC
      LIMIT ${MAX_ROWS}`,
    [dataset, Math.max(1, Math.floor(Number(minAttempts) || 1))],
  );
  return rows.map(decorate);
}

// =====================================================================
// Statistiques d'items ForetMap : réponse choisie (migration `quiz_attempt_choice`).
//
// Une répartition des choix n'a de sens que pour un même jeu de choix : tout est calculé sur
// la VERSION COURANTE de chaque question (tentatives dont `question_empreinte` = empreinte
// actuelle, lib/quizQuestionFingerprint.js), avec rappel des tentatives des versions
// antérieures. Les tentatives historiques sans lettre comptent dans le taux de réussite, pas
// dans la répartition (`choix_connus` / `tentatives`).
//
// SQL groupé (par question × version × lettre, par élève × question × version, par position),
// jamais une requête par élève ; les signaux sont tirés de ces agrégats par des fonctions
// pures, testées une à une. Aucun nom d'élève ne sort : seulement des effectifs.
//
// Les seuils sont des constantes du module, pas des réglages d'administration.
// =====================================================================

const { computeQuestionFingerprint } = require('./quizQuestionFingerprint');

/** Distracteur « mort » : choisi par moins de 5 % des répondants… */
const DEAD_DISTRACTOR_RATE = 0.05;
/** … évalué seulement à partir de 20 réponses dont le choix est connu. */
const DEAD_DISTRACTOR_MIN_ANSWERS = 20;
/** Indice de discrimination affiché à partir de 30 répondants distincts. */
const DISCRIMINATION_MIN_RESPONDENTS = 30;
/** Part des répondants dans chacun des groupes « forts » et « faibles » (27 %, Kelley). */
const DISCRIMINATION_GROUP_SHARE = 0.27;
const ITEM_LETTERS = ['A', 'B', 'C', 'D', 'E'];
/** Taille des lots de codes dans un `IN (…)`. */
const CODE_BATCH = 500;

function round3(value) {
  return value == null ? null : Math.round(value * 1000) / 1000;
}

function toPercent(part, total) {
  return total > 0 ? Math.round((part / total) * 1000) / 10 : null;
}

/** Médiane d'une liste de nombres (`null` si vide). */
function median(values) {
  const sorted = (Array.isArray(values) ? values : [])
    .map(Number)
    .filter((v) => Number.isFinite(v))
    .sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/** Lettres proposées par la question (choix non vides). */
function availableLetters(questionRow) {
  return ITEM_LETTERS.filter((letter) =>
    String(questionRow?.[`choix_${letter.toLowerCase()}`] ?? '').trim(),
  );
}

/**
 * Répartition des choix d'une version, distracteurs attracteurs et morts (fonction pure).
 *
 * @param {{ counts: Record<string, number>, correctLetter: string, letters: string[] }} input
 *   `counts` : effectif par lettre d'origine (réponses dont le choix est connu)
 */
function computeChoiceSignals({ counts, correctLetter, letters }) {
  const known = letters.reduce((sum, letter) => sum + (Number(counts?.[letter]) || 0), 0);
  const correct = String(correctLetter || '').toUpperCase();
  const repartition = letters.map((letter) => {
    const effectif = Number(counts?.[letter]) || 0;
    return {
      lettre: letter,
      effectif,
      pourcentage: toPercent(effectif, known),
      correcte: letter === correct,
    };
  });
  const correctCount = Number(counts?.[correct]) || 0;
  const distractors = repartition.filter((r) => !r.correcte);
  // Attracteur : un distracteur choisi PLUS souvent que la bonne réponse — conception erronée
  // répandue, ou clé fausse. À relire en priorité.
  const attracteurs = known > 0 ? distractors.filter((r) => r.effectif > correctCount) : [];
  // Mort : moins de 5 % des réponses, à partir de 20 réponses. Il ne trompe personne et rend
  // la question plus facile qu'elle n'en a l'air.
  const deadEvaluated = known >= DEAD_DISTRACTOR_MIN_ANSWERS;
  const morts = deadEvaluated
    ? distractors.filter((r) => r.effectif / known < DEAD_DISTRACTOR_RATE)
    : [];
  return {
    choix_connus: known,
    repartition,
    attracteurs: attracteurs.map((r) => r.lettre),
    distracteurs_morts: morts.map((r) => r.lettre),
    distracteurs_morts_evalues: deadEvaluated,
  };
}

/**
 * Indice de discrimination (fonction pure) : réussite du groupe des 27 % les plus forts moins
 * celle des 27 % les plus faibles. La force d'un élève est son taux de réussite sur ses AUTRES
 * questions ; sa réussite à la question est celle de sa première réponse à la version courante.
 *
 * @param {Array<{ strength: number, correct: boolean }>} respondents
 */
function computeDiscrimination(respondents) {
  const list = (Array.isArray(respondents) ? respondents : []).filter((r) =>
    Number.isFinite(Number(r?.strength)),
  );
  const base = {
    repondants: list.length,
    seuil_repondants: DISCRIMINATION_MIN_RESPONDENTS,
  };
  if (list.length < DISCRIMINATION_MIN_RESPONDENTS) {
    return { ...base, disponible: false, indice: null, negative: false };
  }
  const sorted = [...list].sort((a, b) => Number(b.strength) - Number(a.strength));
  const size = Math.max(1, Math.round(list.length * DISCRIMINATION_GROUP_SHARE));
  const rate = (group) => group.filter((r) => r.correct).length / group.length;
  const upper = rate(sorted.slice(0, size));
  const lower = rate(sorted.slice(-size));
  const indice = round3(upper - lower);
  return {
    ...base,
    disponible: true,
    taille_groupes: size,
    reussite_groupe_fort: round3(upper),
    reussite_groupe_faible: round3(lower),
    indice,
    // Les forts ratent plus que les faibles : question ambiguë ou clé fausse, le plus souvent.
    negative: indice < 0,
  };
}

/**
 * Effet de position (fonction pure, agrégat global) : taux de choix selon la position
 * affichée, par nombre de choix proposés. Un mélange équitable donne ~1/n à chaque position.
 *
 * @param {Array<{ nb_choix: number, position: number, effectif: number }>} rows
 */
function computePositionEffect(rows) {
  const byCount = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const n = Number(row.nb_choix);
    const pos = Number(row.position);
    const count = Number(row.effectif) || 0;
    if (!Number.isInteger(n) || n < 2 || !Number.isInteger(pos) || pos < 1 || pos > n) continue;
    if (!byCount.has(n)) byCount.set(n, new Array(n).fill(0));
    byCount.get(n)[pos - 1] += count;
  }
  return [...byCount.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([n, counts]) => {
      const total = counts.reduce((sum, c) => sum + c, 0);
      return {
        nb_choix: n,
        reponses: total,
        attendu_pourcentage: toPercent(1, n),
        positions: counts.map((effectif, i) => ({
          position: i + 1,
          effectif,
          pourcentage: toPercent(effectif, total),
        })),
      };
    });
}

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

async function queryByCodes(db, codes, buildSql) {
  const rows = [];
  for (const batch of chunk(codes, CODE_BATCH)) {
    const placeholders = batch.map(() => '?').join(', ');
    rows.push(...(await db.queryAll(buildSql(placeholders), batch)));
  }
  return rows;
}

/**
 * Force de chaque élève hors d'une question : à partir des agrégats (élève × question ×
 * version), taux de réussite sur toutes ses AUTRES questions. `null` s'il n'en a pas d'autre.
 */
function buildRespondentsByQuestion(rows, currentFingerprints) {
  const totals = new Map();
  const perUserQuestion = new Map();
  for (const row of rows) {
    const user = String(row.user_id);
    const n = Number(row.n) || 0;
    const ok = Number(row.correct) || 0;
    const total = totals.get(user) || { n: 0, ok: 0 };
    total.n += n;
    total.ok += ok;
    totals.set(user, total);
    const key = `${user}\u0000${row.question_code}`;
    const uq = perUserQuestion.get(key) || { n: 0, ok: 0, first: null };
    uq.n += n;
    uq.ok += ok;
    if (
      row.question_empreinte != null &&
      row.question_empreinte === currentFingerprints.get(row.question_code)
    ) {
      uq.first = Number(row.first_correct) === 1;
    }
    perUserQuestion.set(key, uq);
  }
  const byQuestion = new Map();
  for (const [key, uq] of perUserQuestion) {
    if (uq.first == null) continue;
    const [user, code] = key.split('\u0000');
    const total = totals.get(user);
    const otherN = total.n - uq.n;
    if (otherN <= 0) continue;
    if (!byQuestion.has(code)) byQuestion.set(code, []);
    byQuestion.get(code).push({ strength: (total.ok - uq.ok) / otherN, correct: uq.first });
  }
  return byQuestion;
}

/**
 * Analyse d'items des questions demandées (version courante). Renvoie une `Map` code →
 * analyse. `db.queryAll(sql, params)` seulement (pool de l'appli ou transaction en lecture).
 *
 * @param {{ queryAll: Function }} db
 * @param {string[]} questionCodes
 */
async function loadFmItemAnalysis(db, questionCodes) {
  const codes = [...new Set((questionCodes || []).map(String).filter(Boolean))];
  const out = new Map();
  if (codes.length === 0) return out;

  const questions = await queryByCodes(
    db,
    codes,
    (ph) =>
      `SELECT question_code, question, choix_a, choix_b, choix_c, choix_d, choix_e, reponse_correcte
         FROM quiz_questions WHERE question_code IN (${ph})`,
  );
  const current = new Map(questions.map((q) => [q.question_code, computeQuestionFingerprint(q)]));
  const questionByCode = new Map(questions.map((q) => [q.question_code, q]));

  const counts = await queryByCodes(
    db,
    codes,
    (ph) =>
      `SELECT question_code, question_empreinte, choix_lettre,
              COUNT(*) AS n, SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) AS correct
         FROM user_quiz_attempts
        WHERE question_code IN (${ph})
        GROUP BY question_code, question_empreinte, choix_lettre`,
  );
  const durations = await queryByCodes(
    db,
    codes,
    (ph) =>
      `SELECT question_code, question_empreinte, is_correct, duree_ms, COUNT(*) AS n
         FROM user_quiz_attempts
        WHERE question_code IN (${ph}) AND duree_ms IS NOT NULL AND question_empreinte IS NOT NULL
        GROUP BY question_code, question_empreinte, is_correct, duree_ms`,
  );
  // Force des élèves : toutes leurs tentatives (pas seulement les questions demandées).
  const perUser = await db.queryAll(
    `SELECT user_id, question_code, question_empreinte, COUNT(*) AS n,
            SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) AS correct,
            SUBSTRING_INDEX(GROUP_CONCAT(is_correct ORDER BY id), ',', 1) AS first_correct
       FROM user_quiz_attempts
      GROUP BY user_id, question_code, question_empreinte`,
  );
  const respondents = buildRespondentsByQuestion(perUser, current);

  for (const code of codes) {
    const fingerprint = current.get(code) || null;
    const row = questionByCode.get(code) || {};
    const letterCounts = {};
    let versionAttempts = 0;
    let versionCorrect = 0;
    let previous = 0;
    let unknownVersion = 0;
    for (const c of counts) {
      if (c.question_code !== code) continue;
      const n = Number(c.n) || 0;
      if (c.question_empreinte == null) unknownVersion += n;
      else if (c.question_empreinte !== fingerprint) previous += n;
      else {
        versionAttempts += n;
        versionCorrect += Number(c.correct) || 0;
        if (c.choix_lettre) letterCounts[c.choix_lettre] = (letterCounts[c.choix_lettre] || 0) + n;
      }
    }
    const allDurations = [];
    const correctDurations = [];
    for (const d of durations) {
      if (d.question_code !== code || d.question_empreinte !== fingerprint) continue;
      const times = new Array(Number(d.n) || 0).fill(Number(d.duree_ms));
      allDurations.push(...times);
      if (Number(d.is_correct) === 1) correctDurations.push(...times);
    }
    const signals = computeChoiceSignals({
      counts: letterCounts,
      correctLetter: row.reponse_correcte,
      letters: availableLetters(row),
    });
    out.set(code, {
      version: {
        empreinte: fingerprint,
        tentatives: versionAttempts,
        choix_connus: signals.choix_connus,
        success_rate: versionAttempts > 0 ? round3(versionCorrect / versionAttempts) : null,
        tentatives_versions_anterieures: previous,
        tentatives_sans_version: unknownVersion,
      },
      repartition: signals.repartition,
      attracteurs: signals.attracteurs,
      distracteurs_morts: signals.distracteurs_morts,
      distracteurs_morts_evalues: signals.distracteurs_morts_evalues,
      discrimination: computeDiscrimination(respondents.get(code) || []),
      temps_median_ms: {
        global: median(allDurations),
        bonnes_reponses: median(correctDurations),
        mesures: allDurations.length,
      },
    });
  }
  return out;
}

/** Effet de position global (toutes questions, réponses dont l'ordre et la lettre sont connus). */
async function loadFmPositionEffect(db) {
  const rows = await db.queryAll(
    `SELECT CHAR_LENGTH(ordre_presente) AS nb_choix,
            LOCATE(choix_lettre, ordre_presente) AS position,
            COUNT(*) AS effectif
       FROM user_quiz_attempts
      WHERE choix_lettre IS NOT NULL AND ordre_presente IS NOT NULL
      GROUP BY CHAR_LENGTH(ordre_presente), LOCATE(choix_lettre, ordre_presente)`,
  );
  return computePositionEffect(rows);
}

/**
 * Drapeau `suspect` ForetMap enrichi : taux de réussite bas (signal historique), OU
 * distracteur attracteur, OU discrimination négative. `signaux` dit lequel.
 */
function withItemSignals(stat, analysis) {
  if (!analysis) return stat;
  const signaux = {
    reussite_faible: stat.suspect === true,
    attracteur: analysis.attracteurs.length > 0,
    discrimination_negative: analysis.discrimination.negative === true,
  };
  return {
    ...stat,
    ...analysis,
    signaux,
    suspect: signaux.reussite_faible || signaux.attracteur || signaux.discrimination_negative,
  };
}

/** Seuils exposés avec les statistiques (lecture, pas réglage). */
const ITEM_THRESHOLDS = Object.freeze({
  distracteur_mort_taux: DEAD_DISTRACTOR_RATE,
  distracteur_mort_min_reponses: DEAD_DISTRACTOR_MIN_ANSWERS,
  discrimination_min_repondants: DISCRIMINATION_MIN_RESPONDENTS,
  discrimination_part_groupes: DISCRIMINATION_GROUP_SHARE,
});

module.exports = {
  MIN_ATTEMPTS_FOR_FLAG,
  SUSPECT_SUCCESS_RATE,
  MAX_ROWS,
  DEAD_DISTRACTOR_RATE,
  DEAD_DISTRACTOR_MIN_ANSWERS,
  DISCRIMINATION_MIN_RESPONDENTS,
  DISCRIMINATION_GROUP_SHARE,
  ITEM_THRESHOLDS,
  decorate,
  listFmQuestionStats,
  listGlQuestionStats,
  median,
  computeChoiceSignals,
  computeDiscrimination,
  computePositionEffect,
  loadFmItemAnalysis,
  loadFmPositionEffect,
  withItemSignals,
};
