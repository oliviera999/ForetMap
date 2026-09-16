/**
 * Duplication automatique des tâches récurrentes validées (job quotidien).
 * Ancre du rythme : la date de départ quand elle est renseignée, sinon l’échéance.
 * Calendrier scolaire : pas de spawn auto un jour fermé ; échéances accrochées
 * au prochain jour ouvré ; rattrapage = une seule occurrence « à jour ».
 */
const crypto = require('node:crypto');
const { queryAll, withTransaction } = require('../database');
const { nowDbTimestamp } = require('./shared/isoTimestamp');
const logger = require('./logger');
const { getSettingValue } = require('./settings');
const { logAudit } = require('./auditLog');
const { emitTasksChanged } = require('./realtime');
const { syncTaskProjectCompletionForProjects } = require('./syncTaskProjectCompletion');
const {
  isSchoolOpenDay,
  nextSchoolOpenDay,
  getCalendarToday,
  parseISODateOnly: parseSchoolDate,
} = require('./schoolCalendar');

const ALLOWED_RECURRENCE = new Set(['weekly', 'biweekly', 'monthly']);

function shouldSkipRecurringJob() {
  if (
    String(process.env.NODE_ENV || '')
      .trim()
      .toLowerCase() === 'test'
  )
    return true;
  if (String(process.env.FORETMAP_DISABLE_RECURRING_TASK_JOB || '').trim() === '1') return true;
  return false;
}

function getRecurrenceToday() {
  return getCalendarToday(process.env.FORETMAP_RECURRENCE_TZ);
}

function parseISODateOnly(value) {
  return parseSchoolDate(value);
}

/** Colonnes JSON (snapshot validation) : liste d’identifiants zones/repères. */
function parseTemplateIdArray(raw) {
  if (raw == null || raw === '') return [];
  try {
    const v = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(v)) return [];
    return v.map((x) => String(x).trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function addDaysToDateString(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function addMonthsToDateString(dateStr, monthsToAdd = 1) {
  const [y0, m0, d0] = dateStr.split('-').map(Number);
  let monthIndex = m0 - 1 + monthsToAdd;
  let year = y0 + Math.floor(monthIndex / 12);
  monthIndex = ((monthIndex % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const day = Math.min(d0, lastDay);
  const mm = String(monthIndex + 1).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

function advanceDateByRecurrence(dateStr, recurrence) {
  if (recurrence === 'weekly') return addDaysToDateString(dateStr, 7);
  if (recurrence === 'biweekly') return addDaysToDateString(dateStr, 14);
  if (recurrence === 'monthly') return addMonthsToDateString(dateStr, 1);
  return null;
}

/**
 * Prochaine échéance : avance d’une période, accroche au jour ouvré, saute les
 * périodes déjà passées jusqu’à due >= today (rattrapage « une occurrence à jour »).
 * @param {object} [opts]
 * @param {(d: string) => Promise<string|null>} [opts.nextOpenDay]
 */
async function computeNextOccurrenceDue(lastDue, recurrence, today, opts = {}) {
  const due0 = parseISODateOnly(lastDue);
  const todayStr = parseISODateOnly(today);
  if (!due0 || !todayStr || !ALLOWED_RECURRENCE.has(recurrence)) return null;

  const nextOpen = opts.nextOpenDay || (async (d) => nextSchoolOpenDay(d));

  let cursor = due0;
  // Garde-fou : ~12 ans de pas hebdomadaires (rattrapage après longue coupure).
  for (let i = 0; i < 650; i += 1) {
    let d = advanceDateByRecurrence(cursor, recurrence);
    if (!d) return null;
    d = await nextOpen(d);
    if (!d) return null;
    if (d >= todayStr) return d;
    cursor = d;
  }
  return null;
}

function dateFromCreatedAt(createdAt) {
  if (createdAt == null) return null;
  const s = String(createdAt).trim();
  if (s.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function daysBetweenUtc(fromStr, toStr) {
  const [y1, m1, d1] = fromStr.split('-').map(Number);
  const [y2, m2, d2] = toStr.split('-').map(Number);
  const a = Date.UTC(y1, m1 - 1, d1);
  const b = Date.UTC(y2, m2 - 1, d2);
  return Math.round((b - a) / (24 * 60 * 60 * 1000));
}

/**
 * Fenêtre (start_date, due_date) de la prochaine occurrence.
 *
 * Ancre = la **date de départ** de la source dès qu’elle est renseignée et cohérente
 * (start ≤ due) : c’est elle qui porte le rythme (un mardi reste un mardi), et
 * l’échéance est reposée à la même distance derrière. Sans date de départ, on retombe
 * sur l’ancrage historique par l’échéance (`computeNextOccurrenceDue` +
 * `computeCloneStartDate`).
 *
 * Invariants conservés dans les deux cas : l’échéance tombe un **jour ouvré scolaire**
 * et n’est **jamais déjà dépassée** (due >= today) — rattrapage « une seule occurrence
 * à jour » après une coupure.
 *
 * @param {object} taskRow ligne `tasks` source (start_date, due_date, created_at)
 * @param {object} [opts]
 * @param {(d: string) => Promise<string|null>} [opts.nextOpenDay]
 * @returns {Promise<{startDate: string|null, dueDate: string}|null>}
 */
async function computeNextOccurrenceWindow(taskRow, recurrence, today, opts = {}) {
  const dueSrc = parseISODateOnly(taskRow.due_date);
  const todayStr = parseISODateOnly(today);
  if (!dueSrc || !todayStr || !ALLOWED_RECURRENCE.has(recurrence)) return null;

  // Seule la colonne start_date fait ancre : le repli created_at de
  // computeCloneStartDate n’est pas une date de départ voulue par le professeur.
  const startSrc = parseISODateOnly(taskRow.start_date);
  if (!startSrc || startSrc > dueSrc) {
    const dueDate = await computeNextOccurrenceDue(dueSrc, recurrence, todayStr, opts);
    if (!dueDate) return null;
    return { startDate: await computeCloneStartDate(taskRow, dueDate, recurrence, opts), dueDate };
  }

  const span = Math.max(0, daysBetweenUtc(startSrc, dueSrc));
  const nextOpen = opts.nextOpenDay || (async (d) => nextSchoolOpenDay(d));

  let cursor = startSrc;
  // Garde-fou : ~12 ans de pas hebdomadaires (rattrapage après longue coupure).
  for (let i = 0; i < 650; i += 1) {
    let start = advanceDateByRecurrence(cursor, recurrence);
    if (!start) return null;
    start = await nextOpen(start);
    if (!start) return null;
    const due = await nextOpen(addDaysToDateString(start, span));
    if (!due) return null;
    if (due >= todayStr) return { startDate: start, dueDate: due };
    cursor = start;
  }
  return null;
}

/**
 * start_date du clone : conserve la durée start→due de la source, plafonnée à newDue,
 * puis accrochée au prochain jour ouvré ≤ newDue.
 * Utilisé uniquement quand la source n’a **pas** de date de départ exploitable comme
 * ancre (cf. `computeNextOccurrenceWindow`).
 */
async function computeCloneStartDate(taskRow, newDueDate, _recurrence, opts = {}) {
  const dueSrc = parseISODateOnly(taskRow.due_date);
  const startSrc = parseISODateOnly(taskRow.start_date) || dateFromCreatedAt(taskRow.created_at);
  if (!newDueDate) return null;
  let start = newDueDate;
  if (startSrc && dueSrc && dueSrc >= startSrc) {
    const span = daysBetweenUtc(startSrc, dueSrc);
    start = addDaysToDateString(newDueDate, -Math.max(0, span));
  }
  if (start > newDueDate) start = newDueDate;
  const nextOpen = opts.nextOpenDay || ((d) => nextSchoolOpenDay(d));
  const openStart = await nextOpen(start);
  if (openStart && openStart <= newDueDate) return openStart;
  return newDueDate;
}

function resolveTaskMapId(taskRow) {
  return taskRow.map_id || null;
}

function isDuplicateKeyError(err) {
  return Boolean(err && (err.errno === 1062 || err.code === 'ER_DUP_ENTRY'));
}

/**
 * Trace un candidat écarté pour donnée inexploitable.
 * Les autres sorties à `null` (course entre instances, doublon déjà créé, échéance encore
 * future) sont des rejets légitimes et restent silencieuses ; celles-ci sont des séries
 * qui **ne réapparaîtront jamais** et doivent laisser une trace (audit échéances §5).
 */
function warnRecurringCandidateSkipped(row, reason, details = {}) {
  logger.warn(
    {
      job: 'recurring_tasks',
      taskId: row?.id || null,
      recurrence: row?.recurrence || null,
      startDate: row?.start_date ?? null,
      dueDate: row?.due_date ?? null,
      reason,
      ...details,
    },
    'Tâche récurrente écartée : donnée de date inexploitable',
  );
}

async function spawnSingleRecurringTask(taskRow, today, opts = {}) {
  const recurrence = String(taskRow.recurrence || '').trim();
  if (!ALLOWED_RECURRENCE.has(recurrence)) return null;
  const dueSrc = parseISODateOnly(taskRow.due_date);
  if (!dueSrc) {
    warnRecurringCandidateSkipped(taskRow, 'due_date_unparsable');
    return null;
  }
  if (dueSrc > today) return null;
  if (String(taskRow.status || '').trim() !== 'validated') return null;

  return withTransaction(async (tx) => {
    const row = await tx.queryOne(
      `SELECT * FROM tasks WHERE id = ?
         AND recurrence IN ('weekly','biweekly','monthly')
         AND due_date IS NOT NULL AND TRIM(due_date) <> ''
         AND status = 'validated'
         AND archived_at IS NULL
         AND due_date <= ?
         AND (recurrence_spawned_for_due_date IS NULL OR recurrence_spawned_for_due_date <> due_date)
       FOR UPDATE`,
      [taskRow.id, today],
    );
    if (!row) return null;

    const dueLocked = parseISODateOnly(row.due_date);
    if (!dueLocked) {
      warnRecurringCandidateSkipped(row, 'due_date_unparsable');
      return null;
    }
    if (dueLocked > today) return null;

    const windowLocked = await computeNextOccurrenceWindow(row, recurrence, today, opts);
    if (!windowLocked) {
      // Aucune fenêtre calculable : plus aucun jour ouvré au calendrier au-delà de
      // l'échéance (année scolaire non prolongée), ou garde-fou de rattrapage épuisé.
      warnRecurringCandidateSkipped(row, 'next_occurrence_uncomputable', { today });
      return null;
    }
    const newDueLocked = windowLocked.dueDate;
    const newStartLocked = windowLocked.startDate;

    const zoneRows = await tx.queryAll(
      'SELECT zone_id FROM task_zones WHERE task_id = ? ORDER BY zone_id',
      [row.id],
    );
    const markerRows = await tx.queryAll(
      'SELECT marker_id FROM task_markers WHERE task_id = ? ORDER BY marker_id',
      [row.id],
    );
    let zIds = zoneRows.map((r) => r.zone_id).filter(Boolean);
    let mIds = markerRows.map((r) => r.marker_id).filter(Boolean);
    if (zIds.length === 0 && mIds.length === 0) {
      const snapZ = parseTemplateIdArray(row.recurrence_template_zone_ids);
      const snapM = parseTemplateIdArray(row.recurrence_template_marker_ids);
      if (snapZ.length || snapM.length) {
        zIds = snapZ;
        mIds = snapM;
      }
    }
    const tutorialRows = await tx.queryAll(
      `SELECT tt.tutorial_id
         FROM task_tutorials tt
         INNER JOIN tutorials tu ON tu.id = tt.tutorial_id
        WHERE tt.task_id = ? AND tu.is_active = 1
        ORDER BY tt.tutorial_id`,
      [row.id],
    );
    const tIds = tutorialRows
      .map((r) => Number(r.tutorial_id))
      .filter((n) => Number.isFinite(n) && n > 0);

    const referentRows = await tx.queryAll(
      'SELECT user_id FROM task_referents WHERE task_id = ? ORDER BY user_id',
      [row.id],
    );
    const refUserIds = referentRows.map((r) => String(r.user_id || '').trim()).filter(Boolean);

    const newId = crypto.randomUUID();
    const seriesId =
      String(row.recurrence_series_id || '').trim() ||
      String(row.id || '').trim() ||
      crypto.randomUUID();
    const completionMode = String(row.completion_mode || 'single_done').trim() || 'single_done';
    const dangerLevelRaw =
      row.danger_level != null ? String(row.danger_level).trim().toLowerCase() : '';
    const dangerLevel = ['safe', 'potential_danger', 'dangerous', 'very_dangerous'].includes(
      dangerLevelRaw,
    )
      ? dangerLevelRaw
      : null;
    const difficultyLevelRaw =
      row.difficulty_level != null ? String(row.difficulty_level).trim().toLowerCase() : '';
    const difficultyLevel = ['easy', 'medium', 'hard', 'very_hard'].includes(difficultyLevelRaw)
      ? difficultyLevelRaw
      : null;
    const importanceLevelRaw =
      row.importance_level != null ? String(row.importance_level).trim().toLowerCase() : '';
    const importanceLevel = ['not_important', 'low', 'medium', 'high', 'absolute'].includes(
      importanceLevelRaw,
    )
      ? importanceLevelRaw
      : null;
    const createdIso = nowDbTimestamp();

    try {
      await tx.execute(
        `INSERT INTO tasks (
          id, title, description, map_id, project_id, group_id, zone_id, marker_id,
          start_date, due_date, required_students, completion_mode, danger_level, difficulty_level, importance_level,
          status, recurrence, created_at, parent_task_id, recurrence_series_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'available', ?, ?, ?, ?)`,
        [
          newId,
          row.title,
          row.description || '',
          row.map_id || null,
          row.project_id || null,
          row.group_id || null,
          zIds[0] || null,
          mIds[0] || null,
          newStartLocked || null,
          newDueLocked,
          Math.max(1, parseInt(row.required_students, 10) || 1),
          completionMode,
          dangerLevel,
          difficultyLevel,
          importanceLevel,
          row.recurrence,
          createdIso,
          row.id,
          seriesId,
        ],
      );
    } catch (err) {
      if (isDuplicateKeyError(err)) {
        // Occurrence déjà créée (script relancé) : marquer quand même la source.
        await tx.execute('UPDATE tasks SET recurrence_spawned_for_due_date = ? WHERE id = ?', [
          dueLocked,
          row.id,
        ]);
        if (!row.recurrence_series_id) {
          await tx.execute(
            'UPDATE tasks SET recurrence_series_id = ? WHERE id = ? AND recurrence_series_id IS NULL',
            [seriesId, row.id],
          );
        }
        return null;
      }
      throw err;
    }

    await tx.execute('DELETE FROM task_zones WHERE task_id = ?', [newId]);
    for (const zid of zIds) {
      await tx.execute('INSERT INTO task_zones (task_id, zone_id) VALUES (?, ?)', [newId, zid]);
    }
    await tx.execute('DELETE FROM task_markers WHERE task_id = ?', [newId]);
    for (const mid of mIds) {
      await tx.execute('INSERT INTO task_markers (task_id, marker_id) VALUES (?, ?)', [newId, mid]);
    }
    await tx.execute('DELETE FROM task_tutorials WHERE task_id = ?', [newId]);
    for (const tid of tIds) {
      await tx.execute('INSERT INTO task_tutorials (task_id, tutorial_id) VALUES (?, ?)', [
        newId,
        tid,
      ]);
    }
    await tx.execute('DELETE FROM task_referents WHERE task_id = ?', [newId]);
    for (const uid of refUserIds) {
      await tx.execute('INSERT INTO task_referents (task_id, user_id) VALUES (?, ?)', [newId, uid]);
    }

    const speciesRows = await tx.queryAll(
      'SELECT plant_id FROM task_species WHERE task_id = ? ORDER BY plant_id',
      [row.id],
    );
    await tx.execute('DELETE FROM task_species WHERE task_id = ?', [newId]);
    for (const sr of speciesRows) {
      await tx.execute('INSERT INTO task_species (task_id, plant_id) VALUES (?, ?)', [
        newId,
        sr.plant_id,
      ]);
    }

    await tx.execute('UPDATE tasks SET recurrence_spawned_for_due_date = ? WHERE id = ?', [
      dueLocked,
      row.id,
    ]);
    if (!row.recurrence_series_id) {
      await tx.execute(
        "UPDATE tasks SET recurrence_series_id = ? WHERE id = ? AND (recurrence_series_id IS NULL OR TRIM(recurrence_series_id) = '')",
        [seriesId, row.id],
      );
    }

    return newId;
  });
}

async function runRecurringTaskSpawnJob(options = {}) {
  const jobStarted = performance.now();
  if (!options.force && shouldSkipRecurringJob()) {
    return {
      skipped: true,
      today: getRecurrenceToday(),
      created: [],
      errors: [],
    };
  }

  if (!options.force) {
    const automationEnabled = await getSettingValue('tasks.recurring_automation_enabled', true);
    if (!automationEnabled) {
      const today = getRecurrenceToday();
      logger.info(
        { today, job: 'recurring_tasks' },
        'Job tâches récurrentes suspendu (réglage global)',
      );
      return {
        skipped: true,
        reason: 'recurring_automation_disabled',
        today,
        created: [],
        errors: [],
      };
    }
  }

  const today = getRecurrenceToday();

  // Calendrier A : pas de création auto un jour fermé (le force admin contourne).
  if (!options.force) {
    const open = await isSchoolOpenDay(today);
    if (!open) {
      logger.info(
        { today, job: 'recurring_tasks' },
        'Job tâches récurrentes suspendu (jour scolaire fermé)',
      );
      return {
        skipped: true,
        reason: 'school_closed',
        today,
        created: [],
        errors: [],
      };
    }
  }

  const candidates = await queryAll(
    `SELECT * FROM tasks
      WHERE recurrence IN ('weekly','biweekly','monthly')
        AND due_date IS NOT NULL AND TRIM(due_date) <> ''
        AND status = 'validated'
        AND archived_at IS NULL
        AND due_date <= ?
        AND (recurrence_spawned_for_due_date IS NULL OR recurrence_spawned_for_due_date <> due_date)`,
    [today],
  );

  const created = [];
  const errors = [];

  for (const task of candidates) {
    try {
      const newId = await spawnSingleRecurringTask(task, today, options);
      if (newId) {
        created.push(newId);
        const mapId = resolveTaskMapId(task);
        await logAudit('recurring_task_spawn', 'task', newId, task.title || '', {
          payload: { source_task_id: task.id },
        });
        emitTasksChanged({
          reason: 'recurring_task_spawn',
          taskId: newId,
          projectId: task.project_id || null,
          mapId,
        });
        await syncTaskProjectCompletionForProjects([task.project_id]);
      }
    } catch (err) {
      logger.warn({ err, taskId: task.id }, 'Echec duplication tache recurrente');
      errors.push({ taskId: task.id, message: err?.message || String(err) });
    }
  }

  const durationMs = Math.round((performance.now() - jobStarted) * 100) / 100;
  if (created.length > 0) {
    logger.info(
      {
        count: created.length,
        today,
        durationMs,
        candidates: candidates.length,
        errors: errors.length,
        job: 'recurring_tasks',
      },
      'Tâches récurrentes : clones créés',
    );
  } else if (candidates.length > 0 || errors.length > 0) {
    logger.info(
      {
        today,
        durationMs,
        candidates: candidates.length,
        created: created.length,
        errors: errors.length,
        job: 'recurring_tasks',
      },
      'Tâches récurrentes : exécution terminée',
    );
  }

  return { skipped: false, today, created, errors };
}

module.exports = {
  runRecurringTaskSpawnJob,
  shouldSkipRecurringJob,
  getRecurrenceToday,
  parseISODateOnly,
  parseTemplateIdArray,
  addDaysToDateString,
  addMonthsToDateString,
  advanceDateByRecurrence,
  computeCloneStartDate,
  computeNextOccurrenceDue,
  computeNextOccurrenceWindow,
  ALLOWED_RECURRENCE,
};
