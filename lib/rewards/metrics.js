'use strict';

/**
 * Mesures agrégées des badges automatiques, pour un élève. Chaque mesure est **une requête
 * agrégée** (jamais une boucle par tâche), mémorisée le temps d'une évaluation : plusieurs
 * badges d'une même famille partagent la même lecture (`metier:*` lit une fois la répartition
 * par métier).
 *
 * Toutes les mesures de tâches partent de `creditedTasksQuery` (règle de crédit unique).
 */

const { creditedTasksQuery } = require('./creditedTasks');
const { notionAppliesSql, QUIZ_CONTENT } = require('../curriculumNotions');
const { LINK_STATUSES } = require('../pedago/learningLinks');

/** Règne et embranchement (classification GBIF des fiches `plants`) des invertébrés. */
const ANIMAL_KINGDOM_PREFIX = 'Animal';
const VERTEBRATE_PHYLUM = 'Chordata';
/** Statut d'une observation validée (`species_observations.status`). */
const VALIDATED_OBSERVATION = 'validee';
/** Notion maîtrisée : questions distinctes réussies, fenêtre et taux de réussite récents. */
const NOTION_MIN_DISTINCT_CORRECT = 5;
const NOTION_RECENT_WINDOW = 10;
const NOTION_MIN_RECENT_RATE = 0.8;
/** Saisons dans une année scolaire (1er septembre → 31 août) : 3 = Phénologue. */
const PHENOLOGUE_MIN_SEASONS = 3;

function toDate(value) {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Année scolaire d'une date : l'année de la rentrée de septembre. */
function schoolYearOf(value) {
  const d = toDate(value);
  if (!d) return null;
  const month = d.getMonth() + 1;
  return month >= 9 ? d.getFullYear() : d.getFullYear() - 1;
}

/** Saison scolaire : 0 sept.-nov., 1 déc.-fév., 2 mars-mai, 3 juin-août. */
function schoolSeasonOf(value) {
  const d = toDate(value);
  if (!d) return null;
  const month = d.getMonth() + 1;
  if (month >= 9 && month <= 11) return 0;
  if (month === 12 || month <= 2) return 1;
  if (month <= 5) return 2;
  return 3;
}

/** Plus longue suite de `true` consécutifs. */
function longestRun(flags) {
  let best = 0;
  let current = 0;
  for (const flag of flags) {
    current = flag ? current + 1 : 0;
    if (current > best) best = current;
  }
  return best;
}

/** Clé d'ordre d'une occurrence : échéance, sinon ancre, sinon date de création. */
function occurrenceOrderKey(row) {
  const day = (v) => {
    if (v == null || v === '') return '';
    const d = toDate(v);
    return d ? d.toISOString().slice(0, 10) : String(v).slice(0, 10);
  };
  const created = toDate(row.created_at);
  return `${day(row.due_date) || day(row.recurrence_anchor_date) || day(row.created_at)}|${created ? created.toISOString() : ''}`;
}

/**
 * Plus longue suite d'occurrences consécutives d'une même série qui créditent l'élève.
 * @param {Array<{ series: string, credited: number|boolean, due_date?, recurrence_anchor_date?, created_at? }>} rows
 */
function longestSeriesStreak(rows) {
  const bySeries = new Map();
  for (const row of rows || []) {
    if (!bySeries.has(row.series)) bySeries.set(row.series, []);
    bySeries.get(row.series).push(row);
  }
  let best = 0;
  for (const list of bySeries.values()) {
    list.sort((a, b) => occurrenceOrderKey(a).localeCompare(occurrenceOrderKey(b)));
    best = Math.max(best, longestRun(list.map((r) => Boolean(Number(r.credited)))));
  }
  return best;
}

/**
 * Plus longue suite de tâches créditées (ordre d'inscription) sans désinscription de
 * soi-même entre elles.
 * @param {Array<{ assigned_at }>} credited
 * @param {Array<{ created_at }>} selfUnassigns
 */
function longestKeptPromiseRun(credited, selfUnassigns) {
  const events = [
    ...(credited || []).map((r) => ({ at: toDate(r.assigned_at), kept: true })),
    ...(selfUnassigns || []).map((r) => ({ at: toDate(r.created_at), kept: false })),
  ].filter((e) => e.at);
  // À instant égal, la désinscription passe d'abord (elle précède l'inscription suivante).
  events.sort((a, b) => a.at - b.at || Number(a.kept) - Number(b.kept));
  return longestRun(events.map((e) => e.kept));
}

/** Saisons distinctes maximales dans une même année scolaire. */
function maxSeasonsInSchoolYear(dates) {
  const byYear = new Map();
  for (const d of dates || []) {
    const year = schoolYearOf(d);
    const season = schoolSeasonOf(d);
    if (year == null || season == null) continue;
    if (!byYear.has(year)) byYear.set(year, new Set());
    byYear.get(year).add(season);
  }
  let best = 0;
  for (const seasons of byYear.values()) best = Math.max(best, seasons.size);
  return best;
}

function distinctSchoolYears(dates) {
  return new Set((dates || []).map(schoolYearOf).filter((y) => y != null)).size;
}

/**
 * Notions maîtrisées à partir des tentatives triées (notion, plus récente d'abord).
 * @param {Array<{ notion_id: string, question_code: string, is_correct: number }>} rows
 */
function countMasteredNotions(rows) {
  const byNotion = new Map();
  for (const row of rows || []) {
    if (!byNotion.has(row.notion_id)) byNotion.set(row.notion_id, []);
    byNotion.get(row.notion_id).push(row);
  }
  let mastered = 0;
  for (const attempts of byNotion.values()) {
    const distinctCorrect = new Set(
      attempts.filter((a) => Number(a.is_correct) === 1).map((a) => a.question_code),
    ).size;
    if (distinctCorrect < NOTION_MIN_DISTINCT_CORRECT) continue;
    const recent = attempts.slice(0, NOTION_RECENT_WINDOW);
    const correct = recent.filter((a) => Number(a.is_correct) === 1).length;
    if (correct / recent.length >= NOTION_MIN_RECENT_RATE) mastered += 1;
  }
  return mastered;
}

function countMap(rows) {
  const out = {};
  for (const row of rows || []) if (row.k != null) out[row.k] = Number(row.n) || 0;
  return out;
}

/** Lectures agrégées (une requête chacune), regroupées par source de données. */
const LOADERS = {
  async categories(db, userId) {
    const c = creditedTasksQuery({ userId });
    return countMap(
      await db.queryAll(
        `SELECT c.category AS k, COUNT(*) AS n FROM (${c.sql}) c GROUP BY c.category`,
        c.params,
      ),
    );
  },
  async formats(db, userId) {
    const c = creditedTasksQuery({ userId });
    return countMap(
      await db.queryAll(
        `SELECT c.format AS k, COUNT(*) AS n FROM (${c.sql}) c GROUP BY c.format`,
        c.params,
      ),
    );
  },
  async phases(db, userId) {
    const c = creditedTasksQuery({ userId });
    return countMap(
      await db.queryAll(
        `SELECT c.project_phase AS k, COUNT(*) AS n FROM (${c.sql}) c
          WHERE c.project_id IS NOT NULL GROUP BY c.project_phase`,
        c.params,
      ),
    );
  },
  async dates(db, userId) {
    const c = creditedTasksQuery({ userId });
    const rows = await db.queryAll(
      `SELECT DISTINCT DATE(c.validated_at) AS d FROM (${c.sql}) c`,
      c.params,
    );
    return rows.map((r) => r.d);
  },
  async fidele(db, userId) {
    const a = creditedTasksQuery({ userId });
    const b = creditedTasksQuery({ userId });
    const rows = await db.queryAll(
      `SELECT t.recurrence_series_id AS series, t.due_date, t.recurrence_anchor_date, t.created_at,
              CASE WHEN c.task_id IS NULL THEN 0 ELSE 1 END AS credited
         FROM tasks t
         LEFT JOIN (${a.sql}) c ON c.task_id = t.id
        WHERE t.recurrence_series_id IN (
          SELECT DISTINCT c2.recurrence_series_id FROM (${b.sql}) c2
           WHERE c2.recurrence_series_id IS NOT NULL
        )`,
      [...a.params, ...b.params],
    );
    return longestSeriesStreak(rows);
  },
  async parole(db, userId) {
    const c = creditedTasksQuery({ userId });
    const credited = await db.queryAll(`SELECT c.assigned_at FROM (${c.sql}) c`, c.params);
    const unassigns = await db.queryAll(
      `SELECT created_at FROM audit_log WHERE action = 'unassign_task' AND actor_user_id = ?`,
      [userId],
    );
    return longestKeptPromiseRun(credited, unassigns);
  },
  async cycle(db, userId) {
    const a = creditedTasksQuery({ userId });
    const b = creditedTasksQuery({ userId });
    const row = await db.queryOne(
      `SELECT COUNT(*) AS n FROM (
         SELECT p.id
           FROM task_projects p
           JOIN tasks t ON t.project_id = p.id AND t.project_phase IS NOT NULL
           LEFT JOIN (${a.sql}) c ON c.task_id = t.id
          WHERE p.status = 'validated'
            AND p.id IN (SELECT c2.project_id FROM (${b.sql}) c2 WHERE c2.project_id IS NOT NULL)
          GROUP BY p.id
         HAVING COUNT(DISTINCT t.project_phase) >= 3
            AND COUNT(DISTINCT CASE WHEN c.task_id IS NOT NULL THEN t.project_phase END)
                = COUNT(DISTINCT t.project_phase)
       ) complete_projects`,
      [...a.params, ...b.params],
    );
    return Number(row?.n) || 0;
  },
  async herbier(db, userId) {
    const row = await db.queryOne(
      `SELECT COUNT(DISTINCT plant_id) AS n FROM species_observations
        WHERE observer_user_id = ? AND status = ? AND plant_id IS NOT NULL`,
      [userId, VALIDATED_OBSERVATION],
    );
    return Number(row?.n) || 0;
  },
  async entomo(db, userId) {
    const row = await db.queryOne(
      `SELECT COUNT(*) AS n FROM species_observations o
         JOIN plants p ON p.id = o.plant_id
        WHERE o.observer_user_id = ? AND o.status = ?
          AND p.taxon_kingdom LIKE ? AND p.taxon_phylum IS NOT NULL AND p.taxon_phylum <> ?`,
      [userId, VALIDATED_OBSERVATION, `${ANIMAL_KINGDOM_PREFIX}%`, VERTEBRATE_PHYLUM],
    );
    return Number(row?.n) || 0;
  },
  async lecteur(db, userId) {
    // Liens question ↔ tutoriel : source unique `resource_question_links` (migration 300),
    // liens approuvés seulement — `quiz_question_tutorials` est une table historique en retrait.
    const row = await db.queryOne(
      `SELECT COUNT(DISTINCT r.tutorial_id) AS n
         FROM user_tutorial_reads r
         JOIN resource_question_links l
           ON l.resource_type = 'tutorial' AND l.status = ?
          AND CAST(l.resource_ref AS UNSIGNED) = r.tutorial_id
         JOIN user_quiz_attempts a
           ON a.question_code = l.question_code AND a.user_id = r.user_id
          AND a.is_correct = 1 AND a.answered_at >= r.acknowledged_at
        WHERE r.user_id = ?`,
      [LINK_STATUSES.APPROVED, userId],
    );
    return Number(row?.n) || 0;
  },
  async notion(db, userId) {
    const applies = notionAppliesSql(QUIZ_CONTENT, 'q');
    const rows = await db.queryAll(
      `SELECT n.id AS notion_id, a.question_code, a.is_correct
         FROM user_quiz_attempts a
         JOIN quiz_questions q ON q.question_code = a.question_code
         JOIN curriculum_notions n ON ${applies.sql}
        WHERE a.user_id = ?
        ORDER BY n.id, a.answered_at DESC, a.id DESC`,
      [...applies.params, userId],
    );
    return countMasteredNotions(rows);
  },
  async semeur(db, userId) {
    const row = await db.queryOne(
      `SELECT COUNT(DISTINCT COALESCE(recurrence_series_id, id)) AS n FROM tasks
        WHERE proposed_by_user_id = ? AND status <> 'proposed'`,
      [userId],
    );
    return Number(row?.n) || 0;
  },
  async tuteur(db, userId) {
    const c = creditedTasksQuery();
    const row = await db.queryOne(
      `SELECT COUNT(DISTINCT tr.task_id) AS n
         FROM task_referents tr
         JOIN (${c.sql}) c ON c.task_id = tr.task_id AND c.user_id <> tr.user_id
        WHERE tr.user_id = ?`,
      [...c.params, userId],
    );
    return Number(row?.n) || 0;
  },
  async sessions(db, userId) {
    const row = await db.queryOne(
      `SELECT COUNT(*) AS completed, COALESCE(MAX(r.completion_count), 0) AS max_count,
              COALESCE(SUM(s.level = 'lycee'), 0) AS lycee
         FROM pedago_session_runs r
         LEFT JOIN pedago_sessions s ON s.id = r.session_id
        WHERE r.user_id = ? AND r.completion_count > 0`,
      [userId],
    );
    return {
      completed: Number(row?.completed) || 0,
      maxCount: Number(row?.max_count) || 0,
      lycee: Number(row?.lycee) || 0,
    };
  },
};

/** Valeur d'une mesure à partir des lectures (chargées à la demande, une fois). */
const METRICS = {
  ecotone: async (get) =>
    Object.entries(await get('categories')).filter(([k, n]) => k && n > 0).length,
  'format:flash': async (get) => (await get('formats')).flash || 0,
  fidele: (get) => get('fidele'),
  parole: (get) => get('parole'),
  cycle_complet: (get) => get('cycle'),
  herbier: (get) => get('herbier'),
  entomo: (get) => get('entomo'),
  lecteur: (get) => get('lecteur'),
  notion: (get) => get('notion'),
  phenologue: async (get) =>
    maxSeasonsInSchoolYear(await get('dates')) >= PHENOLOGUE_MIN_SEASONS ? 1 : 0,
  racines: async (get) => (distinctSchoolYears(await get('dates')) >= 2 ? 1 : 0),
  semeur: (get) => get('semeur'),
  tuteur: (get) => get('tuteur'),
  session_first: async (get) => ((await get('sessions')).completed >= 1 ? 1 : 0),
  session_three: async (get) => ((await get('sessions')).completed >= 3 ? 1 : 0),
  session_replay: async (get) => ((await get('sessions')).maxCount >= 2 ? 1 : 0),
  session_lycee: async (get) => ((await get('sessions')).lycee >= 1 ? 1 : 0),
};

/**
 * Contexte de mesure d'un élève : `value(metricName)` charge à la demande les lectures
 * nécessaires (une requête agrégée chacune) et les garde le temps de l'évaluation.
 */
function createMetricContext(db, userId) {
  const cache = new Map();
  const get = (loader) => {
    if (!cache.has(loader)) cache.set(loader, LOADERS[loader](db, userId));
    return cache.get(loader);
  };
  return {
    async value(metric) {
      const [family, key] = String(metric).split(':');
      if (family === 'metier') return (await get('categories'))[key] || 0;
      if (family === 'phase') return (await get('phases'))[key] || 0;
      const fn = METRICS[metric];
      if (!fn) throw new Error(`Mesure de badge inconnue : ${metric}`);
      return Number(await fn(get)) || 0;
    },
  };
}

module.exports = {
  ANIMAL_KINGDOM_PREFIX,
  VERTEBRATE_PHYLUM,
  schoolYearOf,
  schoolSeasonOf,
  longestRun,
  longestSeriesStreak,
  longestKeptPromiseRun,
  maxSeasonsInSchoolYear,
  distinctSchoolYears,
  countMasteredNotions,
  createMetricContext,
};
