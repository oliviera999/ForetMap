'use strict';

/**
 * Rappels d'échéance envoyés par le job quotidien aux n3beurs inscrits :
 *  - « à rendre aujourd'hui / demain » pour une échéance imminente ;
 *  - « en retard depuis le JJ/MM » pour une échéance dépassée depuis 7 jours au plus.
 *
 * Seules les tâches encore à faire sont concernées (`available`, `in_progress`) : une tâche
 * marquée faite attend une validation, pas un rappel. Chaque rappel porte une `dedupe_key`
 * (tâche + échéance + nature) : relancé plusieurs fois, le job ne répète jamais le même avis,
 * mais une échéance repoussée produit un nouveau rappel.
 */

const { queryAll } = require('../database');
const logger = require('./logger');
const { notifyUsers, truncate, formatDayMonth } = require('./notifications');

const OVERDUE_WINDOW_DAYS = 7;

function isoDay(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDays(date, days) {
  const copy = new Date(date.getTime());
  copy.setDate(copy.getDate() + days);
  return copy;
}

/**
 * @param {{ db?: { queryAll: Function, execute: Function }, now?: Date }} [opts]
 * @returns {Promise<{ tasks: number, notified: number }>}
 */
async function runTaskDeadlineRemindersJob(opts = {}) {
  const db = opts.db || { queryAll };
  const now = opts.now instanceof Date ? opts.now : new Date();
  const today = isoDay(now);
  const tomorrow = isoDay(addDays(now, 1));
  const oldest = isoDay(addDays(now, -OVERDUE_WINDOW_DAYS));

  const tasks = await db.queryAll(
    `SELECT t.id, t.title, LEFT(t.due_date, 10) AS due_day,
            COALESCE(t.map_id, z.map_id, m.map_id) AS map_id,
            COALESCE(z.name, m.label) AS place_label
       FROM tasks t
       LEFT JOIN zones z ON z.id = t.zone_id
       LEFT JOIN map_markers m ON m.id = t.marker_id
      WHERE t.archived_at IS NULL
        AND t.status IN ('available', 'in_progress')
        AND t.due_date IS NOT NULL AND t.due_date <> ''
        AND LEFT(t.due_date, 10) BETWEEN ? AND ?`,
    [oldest, tomorrow],
  );
  if (!tasks.length) return { tasks: 0, notified: 0 };

  const placeholders = tasks.map(() => '?').join(', ');
  const assignments = await db.queryAll(
    `SELECT task_id, student_id FROM task_assignments
      WHERE student_id IS NOT NULL AND done_at IS NULL AND task_id IN (${placeholders})`,
    tasks.map((t) => t.id),
  );
  const byTask = new Map();
  for (const row of assignments) {
    const key = String(row.task_id);
    if (!byTask.has(key)) byTask.set(key, []);
    byTask.get(key).push(String(row.student_id));
  }

  let notified = 0;
  for (const task of tasks) {
    const studentIds = byTask.get(String(task.id)) || [];
    if (!studentIds.length) continue;
    const due = String(task.due_day);
    const overdue = due < today;
    const name = `« ${truncate(task.title || 'Sans titre', 80)} »`;
    let title;
    if (overdue) title = `${name} est en retard depuis le ${formatDayMonth(due)}`;
    else if (due === today) title = `${name} est à rendre aujourd’hui`;
    else title = `${name} est à rendre demain`;
    const place = task.place_label ? `${task.place_label} — ` : '';
    try {
      const { inserted } = await notifyUsers({
        db: opts.db,
        userIds: studentIds,
        kind: overdue ? 'task_overdue' : 'task_deadline_soon',
        title,
        body: `${place}Pensez à la marquer faite une fois terminée.`,
        target: {
          type: 'task',
          id: String(task.id),
          mapId: task.map_id ? String(task.map_id) : null,
          ...(overdue ? { filter: 'overdue' } : {}),
        },
        dedupeKey: `${overdue ? 'overdue' : 'due_soon'}:${task.id}:${due}`,
      });
      notified += inserted;
    } catch (err) {
      logger.warn({ err, taskId: task.id }, 'Rappel d’échéance non créé');
    }
  }
  if (notified > 0) logger.info({ notified }, 'Rappels d’échéance envoyés');
  return { tasks: tasks.length, notified };
}

module.exports = { runTaskDeadlineRemindersJob, OVERDUE_WINDOW_DAYS };
