/**
 * Duplication automatique des taches recurrentes validees (job quotidien).
 */
const { v4: uuidv4 } = require("uuid");
const { queryAll, withTransaction } = require("../database");
const logger = require("./logger");
const { logAudit } = require("../routes/audit");
const { emitTasksChanged } = require("./realtime");

const ALLOWED_RECURRENCE = new Set(["weekly", "biweekly", "monthly"]);

function shouldSkipRecurringJob() {
  if (String(process.env.NODE_ENV || "").trim().toLowerCase() === "test") return true;
  if (String(process.env.FORETMAP_DISABLE_RECURRING_TASK_JOB || "").trim() === "1") return true;
  return false;
}

function getRecurrenceToday() {
  const tz = String(process.env.FORETMAP_RECURRENCE_TZ || "Europe/Paris").trim() || "Europe/Paris";
  try {
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const parts = fmt.formatToParts(new Date());
    const y = parts.find((p) => p.type === "year")?.value;
    const m = parts.find((p) => p.type === "month")?.value;
    const d = parts.find((p) => p.type === "day")?.value;
    if (y && m && d) return `${y}-${m}-${d}`;
  } catch (err) {
    logger.warn({ err, tz }, "FORETMAP_RECURRENCE_TZ invalide, repli UTC");
  }
  return new Date().toISOString().slice(0, 10);
}

function parseISODateOnly(value) {
  if (value == null) return null;
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return null;
}

function addDaysToDateString(dateStr, days) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function addMonthsToDateString(dateStr, monthsToAdd = 1) {
  const [y0, m0, d0] = dateStr.split("-").map(Number);
  let monthIndex = m0 - 1 + monthsToAdd;
  let year = y0 + Math.floor(monthIndex / 12);
  monthIndex = ((monthIndex % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const day = Math.min(d0, lastDay);
  const mm = String(monthIndex + 1).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

function advanceDateByRecurrence(dateStr, recurrence) {
  if (recurrence === "weekly") return addDaysToDateString(dateStr, 7);
  if (recurrence === "biweekly") return addDaysToDateString(dateStr, 14);
  if (recurrence === "monthly") return addMonthsToDateString(dateStr, 1);
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

function computeCloneStartDate(taskRow, newDueDate, recurrence) {
  const startSrc = parseISODateOnly(taskRow.start_date);
  let start;
  if (startSrc) {
    start = advanceDateByRecurrence(startSrc, recurrence);
  } else {
    const created = dateFromCreatedAt(taskRow.created_at);
    if (!created) return null;
    start = advanceDateByRecurrence(created, recurrence);
    if (start && newDueDate && start > newDueDate) start = newDueDate;
  }
  if (start && newDueDate && start > newDueDate) start = newDueDate;
  return start;
}

function resolveTaskMapId(taskRow) {
  return taskRow.map_id || null;
}

async function spawnSingleRecurringTask(taskRow, today) {
  const recurrence = String(taskRow.recurrence || "").trim();
  if (!ALLOWED_RECURRENCE.has(recurrence)) return null;
  const dueSrc = parseISODateOnly(taskRow.due_date);
  if (!dueSrc || dueSrc > today) return null;
  if (String(taskRow.status || "").trim() !== "validated") return null;

  return withTransaction(async (tx) => {
    const row = await tx.queryOne(
      `SELECT * FROM tasks WHERE id = ?
         AND recurrence IN ('weekly','biweekly','monthly')
         AND due_date IS NOT NULL AND TRIM(due_date) <> ''
         AND status = 'validated'
         AND due_date <= ?
         AND (recurrence_spawned_for_due_date IS NULL OR recurrence_spawned_for_due_date <> due_date)
       FOR UPDATE`,
      [taskRow.id, today]
    );
    if (!row) return null;

    const dueLocked = parseISODateOnly(row.due_date);
    if (!dueLocked || dueLocked > today) return null;

    const newDueLocked = advanceDateByRecurrence(dueLocked, recurrence);
    if (!newDueLocked) return null;
    const newStartLocked = computeCloneStartDate(row, newDueLocked, recurrence);

    const zoneRows = await tx.queryAll(
      "SELECT zone_id FROM task_zones WHERE task_id = ? ORDER BY zone_id",
      [row.id]
    );
    const markerRows = await tx.queryAll(
      "SELECT marker_id FROM task_markers WHERE task_id = ? ORDER BY marker_id",
      [row.id]
    );
    const zIds = zoneRows.map((r) => r.zone_id).filter(Boolean);
    const mIds = markerRows.map((r) => r.marker_id).filter(Boolean);
    const tutorialRows = await tx.queryAll(
      `SELECT tt.tutorial_id
         FROM task_tutorials tt
         INNER JOIN tutorials tu ON tu.id = tt.tutorial_id
        WHERE tt.task_id = ? AND tu.is_active = 1
        ORDER BY tt.tutorial_id`,
      [row.id]
    );
    const tIds = tutorialRows
      .map((r) => Number(r.tutorial_id))
      .filter((n) => Number.isFinite(n) && n > 0);

    const newId = uuidv4();
    const completionMode = String(row.completion_mode || "single_done").trim() || "single_done";
    const createdIso = new Date().toISOString();

    await tx.execute(
      `INSERT INTO tasks (
        id, title, description, map_id, project_id, zone_id, marker_id,
        start_date, due_date, required_students, completion_mode, status, recurrence, created_at, parent_task_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'available', ?, ?, ?)`,
      [
        newId,
        row.title,
        row.description || "",
        row.map_id || null,
        row.project_id || null,
        zIds[0] || null,
        mIds[0] || null,
        newStartLocked || null,
        newDueLocked,
        Math.max(1, parseInt(row.required_students, 10) || 1),
        completionMode,
        row.recurrence,
        createdIso,
        row.id,
      ]
    );

    await tx.execute("DELETE FROM task_zones WHERE task_id = ?", [newId]);
    for (const zid of zIds) {
      await tx.execute("INSERT INTO task_zones (task_id, zone_id) VALUES (?, ?)", [newId, zid]);
    }
    await tx.execute("DELETE FROM task_markers WHERE task_id = ?", [newId]);
    for (const mid of mIds) {
      await tx.execute("INSERT INTO task_markers (task_id, marker_id) VALUES (?, ?)", [newId, mid]);
    }
    await tx.execute("DELETE FROM task_tutorials WHERE task_id = ?", [newId]);
    for (const tid of tIds) {
      await tx.execute("INSERT INTO task_tutorials (task_id, tutorial_id) VALUES (?, ?)", [newId, tid]);
    }

    await tx.execute("UPDATE tasks SET recurrence_spawned_for_due_date = ? WHERE id = ?", [
      dueLocked,
      row.id,
    ]);

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

  const today = getRecurrenceToday();
  const candidates = await queryAll(
    `SELECT * FROM tasks
      WHERE recurrence IN ('weekly','biweekly','monthly')
        AND due_date IS NOT NULL AND TRIM(due_date) <> ''
        AND status = 'validated'
        AND due_date <= ?
        AND (recurrence_spawned_for_due_date IS NULL OR recurrence_spawned_for_due_date <> due_date)`,
    [today]
  );

  const created = [];
  const errors = [];

  for (const task of candidates) {
    try {
      const newId = await spawnSingleRecurringTask(task, today);
      if (newId) {
        created.push(newId);
        const mapId = resolveTaskMapId(task);
        await logAudit("recurring_task_spawn", "task", newId, task.title || "", {
          payload: { source_task_id: task.id },
        });
        emitTasksChanged({
          reason: "recurring_task_spawn",
          taskId: newId,
          projectId: task.project_id || null,
          mapId,
        });
      }
    } catch (err) {
      logger.warn({ err, taskId: task.id }, "Echec duplication tache recurrente");
      errors.push({ taskId: task.id, message: err?.message || String(err) });
    }
  }

  const durationMs = Math.round((performance.now() - jobStarted) * 100) / 100;
  if (created.length > 0) {
    logger.info(
      { count: created.length, today, durationMs, candidates: candidates.length, errors: errors.length, job: 'recurring_tasks' },
      'Tâches récurrentes : clones créés'
    );
  } else if (candidates.length > 0 || errors.length > 0) {
    logger.info(
      { today, durationMs, candidates: candidates.length, created: created.length, errors: errors.length, job: 'recurring_tasks' },
      'Tâches récurrentes : exécution terminée'
    );
  }

  return { skipped: false, today, created, errors };
}

module.exports = {
  runRecurringTaskSpawnJob,
  shouldSkipRecurringJob,
  getRecurrenceToday,
  parseISODateOnly,
  addDaysToDateString,
  addMonthsToDateString,
  advanceDateByRecurrence,
  computeCloneStartDate,
};
