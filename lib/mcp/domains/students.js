'use strict';

/**
 * Lectures agrégées du domaine « élèves » pour `foretmap_students` (lot D2) — SQL écrit ici,
 * paramétré, exécuté en transaction READ ONLY (`withReadOnly`).
 *
 * Ces lectures sont **nominatives** (activité d'un élève nommé) : l'outil les déclare
 * `nominative: true` et ne les appelle qu'après avoir vérifié, par la route
 * `GET /api/rbac/users/student/:id` (ou la liste `GET /api/rbac/users`), que l'élève est dans
 * le périmètre de la personne connectée. Le SQL ne contourne donc pas le RBAC.
 *
 * Jamais de contenu personnel libre : le carnet de bord n'est que **compté**, les
 * observations sont décrites par leur statut et leur espèce.
 */

const { withReadOnly } = require('../readDb');
const { questionNotionJoin } = require('./curriculum');

const TRUSTED = { astValidated: true };
const READ_OPTS = { appPool: true };
const IN_CHUNK = 500;

function num(v) {
  return Number(v || 0);
}

function rate(correct, attempts) {
  return attempts ? Math.round((num(correct) * 1000) / num(attempts)) / 10 : null;
}

/** Date (Date, DATETIME ou VARCHAR ISO) → ISO, ou `null`. */
function toIso(v) {
  if (v == null || v === '') return null;
  const d = v instanceof Date ? v : new Date(String(v).replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function maxIso(values) {
  return values.map(toIso).filter(Boolean).sort().pop() || null;
}

function placeholders(list) {
  return list.map(() => '?').join(', ');
}

function chunks(list, size = IN_CHUNK) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/**
 * Activité détaillée d'un élève : tâches par statut, quiz par catégorie et par notion,
 * tutoriels lus, observations, carnet (nombre), récompenses, séances, dernière activité.
 * @param {string} studentId
 */
async function studentActivity(studentId) {
  const id = String(studentId);
  return withReadOnly(async (db) => {
    const q = (sql, params) => db.raw(sql, params, TRUSTED);
    const tasksByStatus = await q(
      `SELECT t.status, COUNT(*) AS n, SUM(ta.done_at IS NOT NULL) AS marked_done
         FROM task_assignments ta
         JOIN tasks t ON t.id = ta.task_id
        WHERE ta.student_id = ? AND t.archived_at IS NULL
        GROUP BY t.status ORDER BY n DESC`,
      [id],
    );
    const [overdue] = await q(
      `SELECT COUNT(*) AS n
         FROM task_assignments ta
         JOIN tasks t ON t.id = ta.task_id
        WHERE ta.student_id = ? AND t.archived_at IS NULL AND ta.done_at IS NULL
          AND t.due_date IS NOT NULL AND LEFT(t.due_date, 10) < CURDATE()
          AND t.status NOT IN ('validated', 'done')`,
      [id],
    );
    const recentTasks = await q(
      `SELECT ta.task_id, t.title, t.status, t.due_date, ta.assigned_at, ta.done_at
         FROM task_assignments ta
         JOIN tasks t ON t.id = ta.task_id
        WHERE ta.student_id = ?
        ORDER BY COALESCE(ta.done_at, ta.assigned_at) DESC
        LIMIT 20`,
      [id],
    );
    const quizByCategory = await q(
      `SELECT uqa.categorie_slug, c.nom AS categorie_nom, COUNT(*) AS attempts,
              SUM(uqa.is_correct = 1) AS correct, MAX(uqa.answered_at) AS last_at
         FROM user_quiz_attempts uqa
         LEFT JOIN quiz_categories c ON c.slug = uqa.categorie_slug
        WHERE uqa.user_id = ?
        GROUP BY uqa.categorie_slug, c.nom
        ORDER BY attempts DESC`,
      [id],
    );
    const nj = questionNotionJoin('q');
    const quizByNotion = await q(
      `SELECT n.id AS notion_id, n.niveau, n.notion, COUNT(*) AS attempts,
              SUM(uqa.is_correct = 1) AS correct
         FROM user_quiz_attempts uqa
         JOIN quiz_questions q ON q.question_code = uqa.question_code
         JOIN curriculum_notions n ON ${nj.sql}
        WHERE uqa.user_id = ?
        GROUP BY n.id, n.niveau, n.notion
        ORDER BY n.sort_order ASC`,
      [...nj.params, id],
    );
    const reads = await q(
      `SELECT r.tutorial_id, t.title, r.acknowledged_at
         FROM user_tutorial_reads r
         LEFT JOIN tutorials t ON t.id = r.tutorial_id
        WHERE r.user_id = ?
        ORDER BY r.acknowledged_at DESC
        LIMIT 200`,
      [id],
    );
    const obsByStatus = await q(
      `SELECT status, COUNT(*) AS n, MAX(created_at) AS last_at
         FROM species_observations WHERE observer_user_id = ?
        GROUP BY status`,
      [id],
    );
    const recentObs = await q(
      `SELECT o.id, o.plant_id, p.name AS plant_name, o.status, o.observed_at, o.map_id
         FROM species_observations o
         LEFT JOIN plants p ON p.id = o.plant_id
        WHERE o.observer_user_id = ?
        ORDER BY o.created_at DESC
        LIMIT 10`,
      [id],
    );
    const [journal] = await q(
      `SELECT COUNT(*) AS n, MAX(created_at) AS last_at
         FROM user_journal_articles WHERE user_id = ?`,
      [id],
    );
    const rewards = await q(
      `SELECT reward_key, source_type, source_ref, awarded_at
         FROM user_rewards WHERE user_id = ?
        ORDER BY awarded_at DESC
        LIMIT 100`,
      [id],
    );
    const [sessions] = await q(
      `SELECT COUNT(*) AS started, SUM(completion_count > 0) AS completed,
              MAX(last_started_at) AS started_at, MAX(last_completed_at) AS completed_at
         FROM pedago_session_runs WHERE user_id = ?`,
      [id],
    );
    const [last] = await q(
      `SELECT u.last_seen,
              (SELECT MAX(answered_at) FROM user_quiz_attempts WHERE user_id = u.id) AS quiz_at,
              (SELECT MAX(acknowledged_at) FROM user_tutorial_reads WHERE user_id = u.id) AS read_at,
              (SELECT MAX(COALESCE(done_at, assigned_at)) FROM task_assignments
                WHERE student_id = u.id) AS task_at,
              (SELECT MAX(created_at) FROM species_observations
                WHERE observer_user_id = u.id) AS obs_at
         FROM users u WHERE u.id = ?`,
      [id],
    );
    return {
      tasks: {
        by_status: tasksByStatus.map((r) => ({
          status: r.status,
          n: num(r.n),
          marked_done: num(r.marked_done),
        })),
        overdue: num(overdue?.n),
        recent: recentTasks.map((r) => ({
          task_id: r.task_id,
          title: r.title,
          status: r.status,
          due_date: r.due_date ? String(r.due_date).slice(0, 10) : null,
          assigned_at: toIso(r.assigned_at),
          done_at: toIso(r.done_at),
        })),
      },
      quiz: {
        attempts: quizByCategory.reduce((s, r) => s + num(r.attempts), 0),
        correct: quizByCategory.reduce((s, r) => s + num(r.correct), 0),
        by_category: quizByCategory.map((r) => ({
          categorie_slug: r.categorie_slug,
          categorie_nom: r.categorie_nom,
          attempts: num(r.attempts),
          correct: num(r.correct),
          success_rate_percent: rate(r.correct, r.attempts),
        })),
        by_notion: quizByNotion.map((r) => ({
          notion_id: r.notion_id,
          niveau: r.niveau,
          notion: r.notion,
          attempts: num(r.attempts),
          correct: num(r.correct),
          success_rate_percent: rate(r.correct, r.attempts),
        })),
      },
      tutorials_read: {
        count: reads.length,
        items: reads.map((r) => ({
          tutorial_id: num(r.tutorial_id),
          title: r.title,
          acknowledged_at: toIso(r.acknowledged_at),
        })),
      },
      observations: {
        by_status: obsByStatus.map((r) => ({ status: r.status, n: num(r.n) })),
        recent: recentObs.map((r) => ({
          id: num(r.id),
          plant_id: r.plant_id == null ? null : num(r.plant_id),
          plant_name: r.plant_name || null,
          status: r.status,
          observed_at: r.observed_at ? String(r.observed_at).slice(0, 10) : null,
          map_id: r.map_id,
        })),
      },
      journal_articles: { count: num(journal?.n) },
      rewards: rewards.map((r) => ({
        reward_key: r.reward_key,
        source_type: r.source_type,
        source_ref: r.source_ref,
        awarded_at: toIso(r.awarded_at),
      })),
      pedago_sessions: { started: num(sessions?.started), completed: num(sessions?.completed) },
      last_activity_at: maxIso([
        last?.last_seen,
        last?.quiz_at,
        last?.read_at,
        last?.task_at,
        last?.obs_at,
        journal?.last_at,
        sessions?.started_at,
        sessions?.completed_at,
      ]),
      last_seen: toIso(last?.last_seen),
    };
  }, READ_OPTS);
}

/**
 * Journal chronologique d'un élève (plus récent d'abord) : inscriptions et rendus de tâches,
 * quiz (regroupés par jour), lectures de tutoriels, observations, articles de carnet (date
 * seulement), récompenses, séances.
 * @param {string} studentId
 * @param {{ limit?: number, since?: string }} [opts]
 */
async function studentTimeline(studentId, { limit = 100, since } = {}) {
  const id = String(studentId);
  const cap = Math.min(1000, Math.max(1, Number(limit) || 100));
  return withReadOnly(async (db) => {
    const q = (sql, params) => db.raw(sql, params, TRUSTED);
    const events = [];
    const push = (at, type, data) => {
      const iso = toIso(at);
      if (iso && (!since || iso >= since)) events.push({ at: iso, type, ...data });
    };
    for (const r of await q(
      `SELECT ta.task_id, t.title, ta.assigned_at, ta.done_at, t.status, t.validated_at
         FROM task_assignments ta JOIN tasks t ON t.id = ta.task_id
        WHERE ta.student_id = ?
        ORDER BY COALESCE(ta.done_at, ta.assigned_at) DESC LIMIT ${cap}`,
      [id],
    )) {
      push(r.assigned_at, 'task_assigned', { task_id: r.task_id, title: r.title });
      push(r.done_at, 'task_done', { task_id: r.task_id, title: r.title });
      if (r.status === 'validated') {
        push(r.validated_at, 'task_validated', { task_id: r.task_id, title: r.title });
      }
    }
    for (const r of await q(
      `SELECT DATE(answered_at) AS day, MAX(answered_at) AS at, COUNT(*) AS attempts,
              SUM(is_correct = 1) AS correct
         FROM user_quiz_attempts WHERE user_id = ?
        GROUP BY DATE(answered_at) ORDER BY day DESC LIMIT ${cap}`,
      [id],
    )) {
      push(r.at, 'quiz', { attempts: num(r.attempts), correct: num(r.correct) });
    }
    for (const r of await q(
      `SELECT r.tutorial_id, t.title, r.acknowledged_at
         FROM user_tutorial_reads r LEFT JOIN tutorials t ON t.id = r.tutorial_id
        WHERE r.user_id = ? ORDER BY r.acknowledged_at DESC LIMIT ${cap}`,
      [id],
    )) {
      push(r.acknowledged_at, 'tutorial_read', {
        tutorial_id: num(r.tutorial_id),
        title: r.title,
      });
    }
    for (const r of await q(
      `SELECT o.id, o.status, o.created_at, p.name AS plant_name
         FROM species_observations o LEFT JOIN plants p ON p.id = o.plant_id
        WHERE o.observer_user_id = ? ORDER BY o.created_at DESC LIMIT ${cap}`,
      [id],
    )) {
      push(r.created_at, 'observation', {
        observation_id: num(r.id),
        status: r.status,
        plant_name: r.plant_name || null,
      });
    }
    for (const r of await q(
      `SELECT created_at FROM user_journal_articles WHERE user_id = ?
        ORDER BY created_at DESC LIMIT ${cap}`,
      [id],
    )) {
      push(r.created_at, 'journal_article', {});
    }
    for (const r of await q(
      `SELECT reward_key, awarded_at FROM user_rewards WHERE user_id = ?
        ORDER BY awarded_at DESC LIMIT ${cap}`,
      [id],
    )) {
      push(r.awarded_at, 'reward', { reward_key: r.reward_key });
    }
    for (const r of await q(
      `SELECT pr.session_id, ps.title, pr.first_started_at, pr.last_completed_at
         FROM pedago_session_runs pr LEFT JOIN pedago_sessions ps ON ps.id = pr.session_id
        WHERE pr.user_id = ? LIMIT ${cap}`,
      [id],
    )) {
      push(r.first_started_at, 'session_started', { session_id: r.session_id, title: r.title });
      push(r.last_completed_at, 'session_completed', {
        session_id: r.session_id,
        title: r.title,
      });
    }
    events.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
    return { student_id: id, count: Math.min(cap, events.length), events: events.slice(0, cap) };
  }, READ_OPTS);
}

/**
 * Indicateurs de décrochage pour une liste d'élèves (déjà filtrée sur le périmètre de la
 * personne connectée) : dernière activité, tâches en retard, réussite au quiz.
 * @param {string[]} studentIds
 * @returns {Promise<Map<string, { last_activity_at: string|null, overdue_tasks: number,
 *   quiz_attempts: number, quiz_correct: number }>>}
 */
async function studentRiskSignals(studentIds) {
  const ids = [...new Set((studentIds || []).map(String))];
  const out = new Map(
    ids.map((id) => [id, { last: [], overdue_tasks: 0, quiz_attempts: 0, quiz_correct: 0 }]),
  );
  if (!ids.length) return new Map();
  await withReadOnly(async (db) => {
    const q = (sql, params) => db.raw(sql, params, TRUSTED);
    for (const part of chunks(ids)) {
      const ph = placeholders(part);
      for (const r of await q(`SELECT id, last_seen FROM users WHERE id IN (${ph})`, part)) {
        out.get(String(r.id))?.last.push(r.last_seen);
      }
      for (const r of await q(
        `SELECT user_id, COUNT(*) AS attempts, SUM(is_correct = 1) AS correct,
                MAX(answered_at) AS last_at
           FROM user_quiz_attempts WHERE user_id IN (${ph}) GROUP BY user_id`,
        part,
      )) {
        const o = out.get(String(r.user_id));
        if (!o) continue;
        o.quiz_attempts = num(r.attempts);
        o.quiz_correct = num(r.correct);
        o.last.push(r.last_at);
      }
      for (const r of await q(
        `SELECT ta.student_id,
                SUM(ta.done_at IS NULL AND t.archived_at IS NULL AND t.due_date IS NOT NULL
                    AND LEFT(t.due_date, 10) < CURDATE()
                    AND t.status NOT IN ('validated', 'done')) AS overdue,
                MAX(COALESCE(ta.done_at, ta.assigned_at)) AS last_at
           FROM task_assignments ta JOIN tasks t ON t.id = ta.task_id
          WHERE ta.student_id IN (${ph}) GROUP BY ta.student_id`,
        part,
      )) {
        const o = out.get(String(r.student_id));
        if (!o) continue;
        o.overdue_tasks = num(r.overdue);
        o.last.push(r.last_at);
      }
      for (const r of await q(
        `SELECT user_id, MAX(acknowledged_at) AS last_at
           FROM user_tutorial_reads WHERE user_id IN (${ph}) GROUP BY user_id`,
        part,
      )) {
        out.get(String(r.user_id))?.last.push(r.last_at);
      }
      for (const r of await q(
        `SELECT observer_user_id, MAX(created_at) AS last_at
           FROM species_observations WHERE observer_user_id IN (${ph})
          GROUP BY observer_user_id`,
        part,
      )) {
        out.get(String(r.observer_user_id))?.last.push(r.last_at);
      }
    }
  }, READ_OPTS);
  const result = new Map();
  for (const [id, o] of out) {
    result.set(id, {
      last_activity_at: maxIso(o.last),
      overdue_tasks: o.overdue_tasks,
      quiz_attempts: o.quiz_attempts,
      quiz_correct: o.quiz_correct,
    });
  }
  return result;
}

module.exports = { studentActivity, studentTimeline, studentRiskSignals, toIso, rate };
