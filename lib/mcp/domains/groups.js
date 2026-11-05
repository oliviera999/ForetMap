'use strict';

/**
 * Lectures agrégées du domaine « groupes » pour `foretmap_groups class_report` (lot D2) —
 * SQL écrit ici, paramétré, exécuté en transaction READ ONLY (`withReadOnly`).
 *
 * Le périmètre (les élèves du groupe) est fourni par l'outil **après** passage par la route
 * `GET /api/groups/:id/members`, qui vérifie que le groupe est dans le périmètre de gestion
 * de la personne connectée : le SQL ne contourne pas le RBAC. Seule la liste des élèves
 * inactifs est nominative (l'outil déclare l'action `nominative`).
 */

const { withReadOnly } = require('../readDb');
const { questionNotionJoin } = require('./curriculum');
const { toIso, rate } = require('./students');

const TRUSTED = { astValidated: true };
const READ_OPTS = { appPool: true };

function num(v) {
  return Number(v || 0);
}

/**
 * Bilan d'une classe : tâches (inscriptions des élèves, tâches du groupe), quiz par notion,
 * tutoriels lus, élèves inactifs depuis `inactiveDays` jours.
 * @param {{ groupId: string, students: Array<{ user_id: string, user_label?: string,
 *   is_active?: boolean }>, inactiveDays?: number }} params
 */
async function classReport({ groupId, students, inactiveDays = 14 }) {
  const ids = [...new Set((students || []).map((s) => String(s.user_id)))].slice(0, 2000);
  const size = ids.length;
  const days = Math.min(365, Math.max(1, Number(inactiveDays) || 14));
  return withReadOnly(async (db) => {
    const q = (sql, params) => db.raw(sql, params, TRUSTED);
    const groupTasks = await q(
      `SELECT t.status, COUNT(*) AS n,
              SUM(t.due_date IS NOT NULL AND LEFT(t.due_date, 10) < CURDATE()
                  AND t.status NOT IN ('validated', 'done')) AS overdue
         FROM tasks t
        WHERE t.group_id = ? AND t.archived_at IS NULL
        GROUP BY t.status ORDER BY n DESC`,
      [String(groupId)],
    );
    let assignments = { total: 0, done: 0, validated: 0, overdue: 0, students_with_task: 0 };
    let quizByNotion = [];
    let quizTotals = { attempts: 0, correct: 0, students: 0 };
    let tutorials = [];
    let lastByStudent = new Map();
    if (size) {
      const ph = ids.map(() => '?').join(', ');
      const [a] = await q(
        `SELECT COUNT(*) AS total, SUM(ta.done_at IS NOT NULL) AS done,
                SUM(t.status = 'validated') AS validated,
                SUM(ta.done_at IS NULL AND t.due_date IS NOT NULL
                    AND LEFT(t.due_date, 10) < CURDATE()
                    AND t.status NOT IN ('validated', 'done')) AS overdue,
                COUNT(DISTINCT ta.student_id) AS students_with_task
           FROM task_assignments ta JOIN tasks t ON t.id = ta.task_id
          WHERE ta.student_id IN (${ph}) AND t.archived_at IS NULL`,
        ids,
      );
      assignments = {
        total: num(a?.total),
        done: num(a?.done),
        validated: num(a?.validated),
        overdue: num(a?.overdue),
        students_with_task: num(a?.students_with_task),
      };
      const nj = questionNotionJoin('q');
      quizByNotion = await q(
        `SELECT n.id AS notion_id, n.niveau, n.notion, COUNT(*) AS attempts,
                SUM(uqa.is_correct = 1) AS correct, COUNT(DISTINCT uqa.user_id) AS students
           FROM user_quiz_attempts uqa
           JOIN quiz_questions q ON q.question_code = uqa.question_code
           JOIN curriculum_notions n ON ${nj.sql}
          WHERE uqa.user_id IN (${ph})
          GROUP BY n.id, n.niveau, n.notion
          ORDER BY n.sort_order ASC`,
        [...nj.params, ...ids],
      );
      const [qt] = await q(
        `SELECT COUNT(*) AS attempts, SUM(is_correct = 1) AS correct,
                COUNT(DISTINCT user_id) AS students
           FROM user_quiz_attempts WHERE user_id IN (${ph})`,
        ids,
      );
      quizTotals = {
        attempts: num(qt?.attempts),
        correct: num(qt?.correct),
        students: num(qt?.students),
      };
      tutorials = await q(
        `SELECT r.tutorial_id, t.title, COUNT(DISTINCT r.user_id) AS readers
           FROM user_tutorial_reads r JOIN tutorials t ON t.id = r.tutorial_id
          WHERE r.user_id IN (${ph})
          GROUP BY r.tutorial_id, t.title
          ORDER BY readers DESC, t.title ASC
          LIMIT 200`,
        ids,
      );
      const last = await q(
        `SELECT u.id, u.last_seen,
                (SELECT MAX(answered_at) FROM user_quiz_attempts WHERE user_id = u.id) AS quiz_at,
                (SELECT MAX(acknowledged_at) FROM user_tutorial_reads
                  WHERE user_id = u.id) AS read_at,
                (SELECT MAX(COALESCE(done_at, assigned_at)) FROM task_assignments
                  WHERE student_id = u.id) AS task_at
           FROM users u WHERE u.id IN (${ph})`,
        ids,
      );
      lastByStudent = new Map(
        last.map((r) => [
          String(r.id),
          [r.last_seen, r.quiz_at, r.read_at, r.task_at].map(toIso).filter(Boolean).sort().pop() ||
            null,
        ]),
      );
    }
    const threshold = new Date(Date.now() - days * 86400000).toISOString();
    const inactive = (students || [])
      .map((s) => ({
        user_id: String(s.user_id),
        user_label: s.user_label || null,
        last_activity_at: lastByStudent.get(String(s.user_id)) || null,
      }))
      .filter((s) => !s.last_activity_at || s.last_activity_at < threshold)
      .sort((x, y) =>
        String(x.last_activity_at || '').localeCompare(String(y.last_activity_at || '')),
      );
    return {
      group_id: String(groupId),
      students: size,
      tasks: {
        group_tasks_by_status: groupTasks.map((r) => ({
          status: r.status,
          n: num(r.n),
          overdue: num(r.overdue),
        })),
        assignments_of_students: assignments,
      },
      quiz: {
        ...quizTotals,
        success_rate_percent: rate(quizTotals.correct, quizTotals.attempts),
        by_notion: quizByNotion.map((r) => ({
          notion_id: r.notion_id,
          niveau: r.niveau,
          notion: r.notion,
          attempts: num(r.attempts),
          correct: num(r.correct),
          students: num(r.students),
          success_rate_percent: rate(r.correct, r.attempts),
        })),
      },
      tutorials: tutorials.map((r) => ({
        tutorial_id: num(r.tutorial_id),
        title: r.title,
        readers: num(r.readers),
        read_rate_percent: size ? Math.round((num(r.readers) * 1000) / size) / 10 : 0,
      })),
      inactive_students: { days, count: inactive.length, items: inactive },
    };
  }, READ_OPTS);
}

module.exports = { classReport };
