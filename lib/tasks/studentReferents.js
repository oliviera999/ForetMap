'use strict';

/**
 * Élèves référents automatiques des tâches récurrentes — source unique du moteur.
 *
 * Un élève **actif**, membre du groupe de l'année (`tasks.student_referent_group_id`), qui a
 * réalisé au moins N occurrences validées d'une même série (`tasks.student_referent_min_validations`,
 * règle de la progression n3beur : `lib/tasks/progressionCredit.js`, toutes années confondues)
 * en devient référent `auto`, sur **toutes les occurrences actives** de la série (ni validées, ni
 * archivées, ni proposées). Série = `COALESCE(recurrence_series_id, id)`.
 *
 * Règles (prompt R1, lot 3) :
 *  - exclusions : refus d'un n3boss (`task_series_referent_vetoes`), série sans occurrence active ;
 *  - retrait (lien `auto` seulement, jamais `manual`) : élève plus éligible (hors groupe, compte
 *    inactif, seuil relevé, groupe changé, refus) ou, si `inactivity_days > 0`, dernière
 *    réalisation plus ancienne que ce délai ;
 *  - pas de rotation : un lien `auto` encore valide est conservé, même au-delà d'un plafond ;
 *  - plafonds (0 = aucun) : les liens élève `manual` comptent dedans ; attribution gloutonne et
 *    déterministe, triée par palier de série (sans aucun référent, puis sans référent élève, puis
 *    les autres — recalculé au fil de l'attribution), occurrences décroissantes, dernière
 *    réalisation décroissante, identifiant d'élève, identifiant de série ;
 *  - limite technique `MAX_TASK_REFERENTS` : un dépassement est consigné dans `skipped`.
 *
 * `computeStudentReferentPlan` ne fait que lire ; `applyStudentReferentPlan` écrit en une
 * transaction, par les helpers de `taskQueries`, puis trace (journal d'audit, acteur `system`),
 * prévient (temps réel, notifications) après validation. `runStudentReferentSync` est le point
 * d'entrée des déclencheurs : il ne fait **rien** tant que `tasks.student_referent_enabled` est faux.
 */

const database = require('../../database');
const logger = require('../logger');
const { getSettingValue } = require('../settings');
const { MAX_TASK_REFERENTS, STUDENT_REFERENT_BOUNDS } = require('./referentBounds');
const { progressionCreditedAssignmentsQuery } = require('./progressionCredit');
const {
  addAutoReferentLinks,
  removeAutoReferentLinks,
  adoptReferentLinksAsAuto,
} = require('./taskQueries');

const defaultDb = {
  queryAll: database.queryAll,
  queryOne: database.queryOne,
  execute: database.execute,
  withTransaction: database.withTransaction,
};

const RECURRENCES_SQL = "('weekly','biweekly','monthly')";

/** Raisons consignées (retraits et couples écartés). */
const REASONS = Object.freeze({
  NOT_ELIGIBLE: 'not_eligible',
  BELOW_THRESHOLD: 'below_threshold',
  VETO: 'veto',
  INACTIVITY: 'inactivity',
  NO_ACTIVE_OCCURRENCE: 'no_active_occurrence',
  MAX_SERIES_PER_STUDENT: 'max_series_per_student',
  MAX_STUDENTS_PER_SERIES: 'max_students_per_series',
  MAX_TASK_REFERENTS: 'max_task_referents',
});

/** Raisons d'inactivité du moteur (plan vide, rien n'est retiré). */
const INACTIVE = Object.freeze({
  NO_GROUP: 'no_group',
  GROUP_NOT_FOUND: 'group_not_found',
  GROUP_INACTIVE: 'group_inactive',
});

function clampInt(value, { min, max, default: def }) {
  const n = Number(value);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/** Réglages du moteur, bornés (une valeur hors bornes en base retombe dans l'intervalle). */
async function loadStudentReferentConfig(overrides = {}) {
  const B = STUDENT_REFERENT_BOUNDS;
  const read = async (key, def) =>
    Object.prototype.hasOwnProperty.call(overrides, key)
      ? overrides[key]
      : getSettingValue(`tasks.student_referent_${key}`, def);
  return {
    __resolved: true,
    enabled: !!(await read('enabled', false)),
    groupKey: String((await read('group_id', '')) || '').trim(),
    minValidations: clampInt(await read('min_validations', 2), B.minValidations),
    maxSeriesPerStudent: clampInt(await read('max_series_per_student', 0), B.maxSeriesPerStudent),
    maxStudentsPerSeries: clampInt(
      await read('max_students_per_series', 0),
      B.maxStudentsPerSeries,
    ),
    inactivityDays: clampInt(await read('inactivity_days', 0), B.inactivityDays),
    notifyManagers: !!(await read('notify_managers', true)),
  };
}

/** Groupe de l'année (identifiant ou slug) ; `{ group }` ou `{ inactiveReason }`. */
async function resolveReferentGroup(groupKey, dbx = defaultDb) {
  if (!groupKey) return { group: null, inactiveReason: INACTIVE.NO_GROUP };
  const row = await dbx.queryOne(
    'SELECT id, slug, is_active FROM `groups` WHERE id = ? OR slug = ? ORDER BY id = ? DESC LIMIT 1',
    [groupKey, groupKey, groupKey],
  );
  if (!row) return { group: null, inactiveReason: INACTIVE.GROUP_NOT_FOUND };
  if (!Number(row.is_active)) return { group: null, inactiveReason: INACTIVE.GROUP_INACTIVE };
  return { group: { id: String(row.id), slug: String(row.slug) } };
}

function toTime(value) {
  if (value == null || value === '') return null;
  const d = value instanceof Date ? value : new Date(String(value).replace(' ', 'T'));
  const t = d.getTime();
  return Number.isFinite(t) ? t : null;
}

function toIso(t) {
  return t == null ? null : new Date(t).toISOString();
}

const pairKey = (seriesId, userId) => `${seriesId}\u0000${userId}`;

/** Lecture de l'état : occurrences actives, liens, éligibles, comptes, refus. */
async function loadState(group, dbx) {
  const occurrences = await dbx.queryAll(
    `SELECT id, title, COALESCE(recurrence_series_id, id) AS series_id
       FROM tasks
      WHERE recurrence IN ${RECURRENCES_SQL}
        AND status NOT IN ('validated','proposed')
        AND archived_at IS NULL
      ORDER BY created_at, id`,
  );
  const links = await dbx.queryAll(
    `SELECT tr.task_id, tr.user_id, tr.source, u.user_type
       FROM task_referents tr
       INNER JOIN tasks t ON t.id = tr.task_id
       INNER JOIN users u ON u.id = tr.user_id
      WHERE t.recurrence IN ${RECURRENCES_SQL}
        AND t.status NOT IN ('validated','proposed')
        AND t.archived_at IS NULL`,
  );
  const eligibleRows = group
    ? await dbx.queryAll(
        `SELECT u.id FROM group_members gm
           INNER JOIN users u ON u.id = gm.user_id
          WHERE gm.group_id = ? AND u.user_type = 'student' AND u.is_active = 1`,
        [group.id],
      )
    : [];
  const credited = group
    ? progressionCreditedAssignmentsQuery({ groupId: group.id, recurringOnly: true })
    : null;
  const counts = credited
    ? await dbx.queryAll(
        `SELECT pc.user_id, pc.series_id, COUNT(DISTINCT pc.task_id) AS n,
                MAX(pc.validated_at) AS last_validated_at, MAX(pc.assigned_at) AS last_assigned_at
           FROM (${credited.sql}) pc
          GROUP BY pc.user_id, pc.series_id`,
        credited.params,
      )
    : [];
  const vetoes = await dbx.queryAll('SELECT series_id, user_id FROM task_series_referent_vetoes');
  return { occurrences, links, eligibleRows, counts, vetoes };
}

/**
 * Plan des liens `auto` à poser, retirer, garder — sans rien écrire.
 *
 * @param {{ dbx?: object, config?: object, now?: Date }} [options]
 *   `config` : réglages déjà lus (ou surcharges partielles passées à `loadStudentReferentConfig`).
 * @returns {Promise<{ config, group, inactiveReason, toAdd, toRemove, kept, adoptable, skipped,
 *   series }>}
 */
async function computeStudentReferentPlan({ dbx = defaultDb, config, now = new Date() } = {}) {
  // `config` : réglages déjà résolus (`loadStudentReferentConfig`) ou surcharges brutes.
  const cfg = config && config.__resolved ? config : await loadStudentReferentConfig(config || {});
  const resolved = cfg;
  const empty = {
    config: resolved,
    group: null,
    inactiveReason: null,
    toAdd: [],
    toRemove: [],
    kept: [],
    adoptable: [],
    skipped: [],
    series: {},
  };
  const { group, inactiveReason } = await resolveReferentGroup(cfg.groupKey, dbx);
  if (!group) {
    logger.warn(
      { inactiveReason, groupKey: cfg.groupKey || null },
      'student_referents_inactive: groupe de l’année absent, introuvable ou inactif',
    );
    return { ...empty, inactiveReason };
  }
  const state = await loadState(group, dbx);

  // Séries actives : occurrences, titre, référents par occurrence.
  const series = new Map();
  for (const o of state.occurrences) {
    const sid = String(o.series_id);
    if (!series.has(sid)) series.set(sid, { id: sid, title: o.title, taskIds: [] });
    series.get(sid).taskIds.push(String(o.id));
  }
  const occurrenceById = new Map(state.occurrences.map((o) => [String(o.id), o]));
  const refCountByTask = new Map();
  /** (série, élève) → { sources: Set, taskIds: Set, userType } */
  const linkByPair = new Map();
  for (const l of state.links) {
    const tid = String(l.task_id);
    refCountByTask.set(tid, (refCountByTask.get(tid) || 0) + 1);
    const occ = occurrenceById.get(tid);
    if (!occ) continue;
    const key = pairKey(String(occ.series_id), String(l.user_id));
    if (!linkByPair.has(key)) {
      linkByPair.set(key, {
        seriesId: String(occ.series_id),
        userId: String(l.user_id),
        userType: l.user_type,
        sources: new Set(),
        taskIds: new Set(),
      });
    }
    const entry = linkByPair.get(key);
    entry.sources.add(l.source === 'auto' ? 'auto' : 'manual');
    entry.taskIds.add(tid);
  }

  const eligible = new Set(state.eligibleRows.map((r) => String(r.id)));
  const vetoes = new Set(state.vetoes.map((v) => pairKey(String(v.series_id), String(v.user_id))));
  const countByPair = new Map();
  for (const c of state.counts) {
    const last = toTime(c.last_validated_at) ?? toTime(c.last_assigned_at);
    countByPair.set(pairKey(String(c.series_id), String(c.user_id)), {
      seriesId: String(c.series_id),
      userId: String(c.user_id),
      count: Number(c.n) || 0,
      last,
    });
  }
  const cutoff = cfg.inactivityDays > 0 ? now.getTime() - cfg.inactivityDays * 86_400_000 : null;

  /** Le couple satisfait-il la règle ? `null` si oui, sinon la raison. */
  const ruleFailure = (seriesId, userId) => {
    if (!eligible.has(userId)) return REASONS.NOT_ELIGIBLE;
    const c = countByPair.get(pairKey(seriesId, userId));
    if (!c || c.count < cfg.minValidations) return REASONS.BELOW_THRESHOLD;
    if (vetoes.has(pairKey(seriesId, userId))) return REASONS.VETO;
    if (cutoff != null && (c.last == null || c.last < cutoff)) return REASONS.INACTIVITY;
    return null;
  };
  const statsOf = (seriesId, userId) => {
    const c = countByPair.get(pairKey(seriesId, userId));
    return { count: c?.count || 0, lastValidatedAt: toIso(c?.last ?? null) };
  };

  const toRemove = [];
  const kept = [];
  const adoptable = [];
  const skipped = [];
  const toAdd = [];
  // Liens élève gardés, pour les plafonds et les paliers.
  const studentSeriesCount = new Map();
  const studentRefsBySeries = new Map();
  const anyRefsBySeries = new Map();
  const bump = (map, k) => map.set(k, (map.get(k) || 0) + 1);

  for (const entry of linkByPair.values()) {
    const { seriesId, userId } = entry;
    const hasManual = entry.sources.has('manual');
    const failure = ruleFailure(seriesId, userId);
    if (!hasManual && failure) {
      toRemove.push({
        seriesId,
        userId,
        reason: failure,
        taskIds: [...entry.taskIds].sort(),
        ...statsOf(seriesId, userId),
      });
      continue;
    }
    bump(anyRefsBySeries, seriesId);
    if (entry.userType !== 'student') continue;
    bump(studentRefsBySeries, seriesId);
    bump(studentSeriesCount, userId);
    const stats = statsOf(seriesId, userId);
    kept.push({
      seriesId,
      userId,
      source: hasManual ? 'manual' : 'auto',
      ...stats,
    });
    if (hasManual && !failure) {
      adoptable.push({ seriesId, userId, taskIds: [...entry.taskIds].sort(), ...stats });
    }
    // Lien `auto` absent d'une occurrence active (deux occurrences ouvertes) : réparé.
    const s = series.get(seriesId);
    const missing = s ? s.taskIds.filter((t) => !entry.taskIds.has(t)) : [];
    if (!hasManual && !failure && missing.length) {
      toAdd.push({ seriesId, userId, taskIds: missing, repair: true, ...stats });
    }
  }

  // Candidats : couples au seuil, sans lien actif.
  const candidates = [];
  for (const c of countByPair.values()) {
    const { seriesId, userId } = c;
    if (linkByPair.has(pairKey(seriesId, userId))) continue;
    if (c.count < cfg.minValidations || !eligible.has(userId)) continue;
    const stats = statsOf(seriesId, userId);
    if (!series.has(seriesId)) {
      skipped.push({ seriesId, userId, reason: REASONS.NO_ACTIVE_OCCURRENCE, ...stats });
      continue;
    }
    const failure = ruleFailure(seriesId, userId);
    if (failure) {
      skipped.push({ seriesId, userId, reason: failure, ...stats });
      continue;
    }
    candidates.push({ seriesId, userId, count: c.count, last: c.last ?? -Infinity, ...stats });
  }

  // Attribution gloutonne et déterministe.
  const tierOf = (seriesId) => {
    if (!(anyRefsBySeries.get(seriesId) || 0)) return 0;
    if (!(studentRefsBySeries.get(seriesId) || 0)) return 1;
    return 2;
  };
  const compare = (a, b) =>
    tierOf(a.seriesId) - tierOf(b.seriesId) ||
    b.count - a.count ||
    b.last - a.last ||
    (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0) ||
    (a.seriesId < b.seriesId ? -1 : a.seriesId > b.seriesId ? 1 : 0);
  const pool = [...candidates];
  while (pool.length) {
    pool.sort(compare);
    const cand = pool.shift();
    const { seriesId, userId } = cand;
    const stats = { count: cand.count, lastValidatedAt: cand.lastValidatedAt };
    if (
      cfg.maxSeriesPerStudent > 0 &&
      (studentSeriesCount.get(userId) || 0) >= cfg.maxSeriesPerStudent
    ) {
      skipped.push({ seriesId, userId, reason: REASONS.MAX_SERIES_PER_STUDENT, ...stats });
      continue;
    }
    if (
      cfg.maxStudentsPerSeries > 0 &&
      (studentRefsBySeries.get(seriesId) || 0) >= cfg.maxStudentsPerSeries
    ) {
      skipped.push({ seriesId, userId, reason: REASONS.MAX_STUDENTS_PER_SERIES, ...stats });
      continue;
    }
    const taskIds = series.get(seriesId).taskIds;
    if (taskIds.some((t) => (refCountByTask.get(t) || 0) + 1 > MAX_TASK_REFERENTS)) {
      skipped.push({ seriesId, userId, reason: REASONS.MAX_TASK_REFERENTS, ...stats });
      continue;
    }
    toAdd.push({ seriesId, userId, taskIds: [...taskIds], ...stats });
    for (const t of taskIds) bump(refCountByTask, t);
    bump(anyRefsBySeries, seriesId);
    bump(studentRefsBySeries, seriesId);
    bump(studentSeriesCount, userId);
  }

  const bySeriesThenUser = (a, b) =>
    a.seriesId < b.seriesId
      ? -1
      : a.seriesId > b.seriesId
        ? 1
        : a.userId < b.userId
          ? -1
          : a.userId > b.userId
            ? 1
            : 0;
  return {
    ...empty,
    group,
    toAdd,
    toRemove: toRemove.sort(bySeriesThenUser),
    kept: kept.sort(bySeriesThenUser),
    adoptable: adoptable.sort(bySeriesThenUser),
    skipped: skipped.sort(bySeriesThenUser),
    series: Object.fromEntries(
      [...series.values()].map((s) => [s.id, { title: s.title, taskIds: s.taskIds }]),
    ),
  };
}

/** Restreint un plan à une série (déclencheurs ciblés : validation, clonage). */
function filterPlanToSeries(plan, seriesId) {
  if (!seriesId) return plan;
  const sid = String(seriesId);
  const only = (list) => list.filter((e) => e.seriesId === sid);
  return {
    ...plan,
    toAdd: only(plan.toAdd),
    toRemove: only(plan.toRemove),
    kept: only(plan.kept),
    adoptable: only(plan.adoptable),
    skipped: only(plan.skipped),
  };
}

/**
 * Applique un plan en une transaction (helpers de `taskQueries`), puis trace et prévient.
 * Les effets (journal, temps réel, notifications) ne font jamais échouer l'application.
 *
 * @param {object} plan résultat de `computeStudentReferentPlan`
 * @param {{ dbx?: object, actor?: string, adoptExisting?: boolean, notify?: boolean }} [options]
 * @returns {Promise<{ added: number, removed: number, adopted: number, links: number }>}
 */
async function applyStudentReferentPlan(
  plan,
  { dbx = defaultDb, actor = 'system', adoptExisting = false, notify = true } = {},
) {
  const summary = { added: 0, removed: 0, adopted: 0, links: 0 };
  if (!plan || plan.inactiveReason) return summary;
  const adopt = adoptExisting ? plan.adoptable : [];
  if (!plan.toAdd.length && !plan.toRemove.length && !adopt.length) return summary;
  const changes = { added: [], removed: [], adopted: [] };
  await dbx.withTransaction(async (tx) => {
    for (const r of plan.toRemove) {
      const n = await removeAutoReferentLinks(r.taskIds, r.userId, tx);
      if (n) changes.removed.push(r);
      summary.links += n;
    }
    for (const a of plan.toAdd) {
      const n = await addAutoReferentLinks(a.taskIds, a.userId, tx);
      if (n) changes.added.push(a);
      summary.links += n;
    }
    for (const a of adopt) {
      const n = await adoptReferentLinksAsAuto(a.taskIds, a.userId, tx);
      if (n) changes.adopted.push(a);
      summary.links += n;
    }
  });
  summary.added = changes.added.filter((a) => !a.repair).length;
  summary.removed = changes.removed.length;
  summary.adopted = changes.adopted.length;
  await publishChanges(plan, changes, { actor, notify });
  return summary;
}

async function publishChanges(plan, changes, { actor, notify }) {
  const { logAudit } = require('../auditLog');
  const { emitTasksChanged } = require('../realtime');
  const titleOf = (sid) => plan.series?.[sid]?.title || '';
  const audit = async (action, entry, extra = {}) => {
    try {
      await logAudit(action, 'task_series', entry.seriesId, titleOf(entry.seriesId), {
        actorUserType: actor,
        actorUserId: null,
        payload: {
          user_id: entry.userId,
          task_ids: entry.taskIds,
          count: entry.count,
          last_validated_at: entry.lastValidatedAt,
          ...extra,
        },
      });
    } catch (err) {
      logger.warn({ err, action }, 'student_referents_audit_failed');
    }
  };
  for (const a of changes.added) {
    await audit('student_referent_auto_add', a, a.repair ? { repair: true } : {});
  }
  for (const r of changes.removed)
    await audit('student_referent_auto_remove', r, { reason: r.reason });
  for (const a of changes.adopted) await audit('student_referent_adopt', a);
  const touched = new Set(
    [...changes.added, ...changes.removed, ...changes.adopted].flatMap((e) => e.taskIds),
  );
  for (const taskId of touched) {
    try {
      emitTasksChanged({ reason: 'student_referents_sync', taskId });
    } catch (err) {
      logger.warn({ err }, 'student_referents_emit_failed');
    }
  }
  if (!notify) return;
  try {
    const { notifyStudentReferentChanges } = require('./studentReferentNotifications');
    await notifyStudentReferentChanges({
      plan,
      added: changes.added.filter((a) => !a.repair),
      removed: changes.removed,
      notifyManagers: plan.config?.notifyManagers !== false,
    });
  } catch (err) {
    logger.warn({ err }, 'student_referents_notify_failed');
  }
}

// Une seule synchronisation à la fois dans le processus : validation, clonage et job quotidien
// peuvent se croiser ; elles s'enchaînent au lieu de se doubler.
let chain = Promise.resolve();

/**
 * Point d'entrée des déclencheurs (validation, clonage, job quotidien, réglages, groupe).
 * Ne fait rien si `tasks.student_referent_enabled` est faux.
 *
 * @param {{ seriesId?: string, reason?: string, dbx?: object }} [options]
 * @returns {Promise<object>} `{ skipped: 'disabled' }`, `{ skipped: <inactif> }` ou le bilan
 */
function runStudentReferentSync({ seriesId = null, reason = 'manual', dbx = defaultDb } = {}) {
  const run = async () => {
    const config = await loadStudentReferentConfig();
    if (!config.enabled) return { skipped: 'disabled', reason };
    const plan = filterPlanToSeries(await computeStudentReferentPlan({ dbx, config }), seriesId);
    if (plan.inactiveReason) return { skipped: plan.inactiveReason, reason };
    const summary = await applyStudentReferentPlan(plan, { dbx });
    if (summary.added || summary.removed) {
      logger.info({ ...summary, reason, seriesId }, 'student_referents_sync');
    }
    return { ...summary, reason, seriesId };
  };
  const next = chain.then(run, run);
  chain = next.catch(() => {});
  return next;
}

/** Variante « sans attendre » des déclencheurs : une panne est journalisée, jamais propagée. */
function queueStudentReferentSync(options = {}) {
  return runStudentReferentSync(options).catch((err) => {
    logger.warn({ err, ...options }, 'student_referents_sync_failed');
    return { failed: true };
  });
}

/** Déclencheur « tâche » : synchronise la série d'une tâche récurrente (validation, clonage). */
async function queueStudentReferentSyncForTask(taskId, reason = 'task') {
  try {
    if (!taskId) return null;
    const row = await database.queryOne(
      `SELECT COALESCE(recurrence_series_id, id) AS series_id, recurrence
         FROM tasks WHERE id = ?`,
      [taskId],
    );
    if (!row || !['weekly', 'biweekly', 'monthly'].includes(String(row.recurrence || ''))) {
      return null;
    }
    return await queueStudentReferentSync({ seriesId: String(row.series_id), reason });
  } catch (err) {
    logger.warn({ err, taskId, reason }, 'student_referents_sync_failed');
    return { failed: true };
  }
}

/** Déclencheur « groupe » : un changement de membres du groupe de l'année resynchronise tout. */
async function queueStudentReferentSyncForGroup(groupId, reason = 'group_members') {
  try {
    const key = String(await getSettingValue('tasks.student_referent_group_id', '')).trim();
    if (!key || !groupId) return null;
    const { group } = await resolveReferentGroup(key);
    if (!group || group.id !== String(groupId)) return null;
    return await queueStudentReferentSync({ reason });
  } catch (err) {
    logger.warn({ err, groupId, reason }, 'student_referents_sync_failed');
    return { failed: true };
  }
}

/** Job quotidien `student_referents_sync`. */
function runStudentReferentsSyncJob() {
  return runStudentReferentSync({ reason: 'daily_job' });
}

module.exports = {
  REASONS,
  INACTIVE,
  loadStudentReferentConfig,
  resolveReferentGroup,
  computeStudentReferentPlan,
  filterPlanToSeries,
  applyStudentReferentPlan,
  runStudentReferentSync,
  queueStudentReferentSync,
  queueStudentReferentSyncForTask,
  queueStudentReferentSyncForGroup,
  runStudentReferentsSyncJob,
};
