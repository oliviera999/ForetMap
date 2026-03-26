const express = require('express');
const { queryAll, queryOne, execute } = require('../database');
const { requireAuth } = require('../middleware/requireTeacher');
const { logRouteError } = require('../lib/routeLog');

const router = express.Router();

function normalizeText(value) {
  if (value == null) return '';
  return String(value).trim();
}

function normalizeContextType(value) {
  const v = normalizeText(value).toLowerCase();
  if (v === 'map' || v === 'project') return v;
  return '';
}

function asBool(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
    if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
  }
  return fallback;
}

function hasCollectivePermission(auth) {
  if (!auth) return false;
  const perms = Array.isArray(auth.permissions) ? auth.permissions : [];
  return perms.includes('teacher.access') && perms.includes('stats.read.all');
}

async function ensureContextExists(contextType, contextId) {
  if (contextType === 'map') {
    const map = await queryOne('SELECT id FROM maps WHERE id = ?', [contextId]);
    return !!map;
  }
  if (contextType === 'project') {
    const project = await queryOne('SELECT id FROM task_projects WHERE id = ?', [contextId]);
    return !!project;
  }
  return false;
}

async function getSessionByContext(contextType, contextId) {
  return queryOne(
    `SELECT id, context_type, context_id, is_active, updated_at, created_at
       FROM collective_sessions
      WHERE context_type = ? AND context_id = ?
      LIMIT 1`,
    [contextType, contextId]
  );
}

async function ensureSession({ contextType, contextId, auth, isActive = true }) {
  await execute(
    `INSERT INTO collective_sessions (context_type, context_id, is_active, updated_by_user_type, updated_by_user_id)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       id = LAST_INSERT_ID(id),
       is_active = VALUES(is_active),
       updated_by_user_type = VALUES(updated_by_user_type),
       updated_by_user_id = VALUES(updated_by_user_id)`,
    [contextType, contextId, isActive ? 1 : 0, auth?.userType || null, auth?.userId || null]
  );
  const idRow = await queryOne('SELECT LAST_INSERT_ID() AS id');
  return Number(idRow?.id || 0);
}

async function getContextTaskIds(contextType, contextId) {
  if (contextType === 'project') {
    const rows = await queryAll('SELECT id FROM tasks WHERE project_id = ? ORDER BY created_at DESC', [contextId]);
    return rows.map((r) => r.id);
  }
  const rows = await queryAll(
    `SELECT DISTINCT t.id
       FROM tasks t
  LEFT JOIN zones z ON z.id = t.zone_id
  LEFT JOIN map_markers m ON m.id = t.marker_id
  LEFT JOIN task_projects tp ON tp.id = t.project_id
  LEFT JOIN task_zones tz ON tz.task_id = t.id
  LEFT JOIN zones z2 ON z2.id = tz.zone_id
  LEFT JOIN task_markers tm ON tm.task_id = t.id
  LEFT JOIN map_markers m2 ON m2.id = tm.marker_id
      WHERE (
        t.map_id = ? OR t.map_id IS NULL
        OR z.map_id = ?
        OR m.map_id = ?
        OR tp.map_id = ?
        OR z2.map_id = ?
        OR m2.map_id = ?
      )
      ORDER BY t.created_at DESC`,
    [contextId, contextId, contextId, contextId, contextId, contextId]
  );
  return rows.map((r) => r.id);
}

async function getAllStudentIds() {
  const rows = await queryAll(
    "SELECT id FROM users WHERE user_type = 'student' AND is_active = 1 ORDER BY last_name ASC, first_name ASC, id ASC"
  );
  return rows.map((r) => r.id);
}

async function preloadSessionSelection(sessionId, contextType, contextId, auth) {
  const taskIds = await getContextTaskIds(contextType, contextId);
  const studentIds = await getAllStudentIds();
  await execute('DELETE FROM collective_session_absences WHERE session_id = ?', [sessionId]);
  await execute('DELETE FROM collective_session_tasks WHERE session_id = ?', [sessionId]);
  await execute('DELETE FROM collective_session_students WHERE session_id = ?', [sessionId]);
  for (const taskId of taskIds) {
    await execute(
      `INSERT INTO collective_session_tasks (session_id, task_id, added_by_user_type, added_by_user_id)
       VALUES (?, ?, ?, ?)`,
      [sessionId, taskId, auth?.userType || null, auth?.userId || null]
    );
  }
  for (const studentId of studentIds) {
    await execute(
      `INSERT INTO collective_session_students (session_id, student_id, added_by_user_type, added_by_user_id)
       VALUES (?, ?, ?, ?)`,
      [sessionId, studentId, auth?.userType || null, auth?.userId || null]
    );
  }
}

async function loadSessionPayload(contextType, contextId) {
  const session = await getSessionByContext(contextType, contextId);
  if (!session) {
    return {
      session: {
        id: null,
        context_type: contextType,
        context_id: contextId,
        is_active: 0,
        updated_at: null,
        created_at: null,
      },
      absent_student_ids: [],
      selected_task_ids: [],
      selected_student_ids: [],
    };
  }

  const absences = await queryAll(
    `SELECT a.student_id
       FROM collective_session_absences a
       INNER JOIN users u ON u.id = a.student_id
      WHERE a.session_id = ?
        AND u.user_type = 'student'
      ORDER BY a.marked_at DESC`,
    [session.id]
  );
  const selectedTasks = await queryAll(
    `SELECT task_id
       FROM collective_session_tasks
      WHERE session_id = ?
      ORDER BY added_at ASC`,
    [session.id]
  );
  const selectedStudents = await queryAll(
    `SELECT student_id
       FROM collective_session_students
      WHERE session_id = ?
      ORDER BY added_at ASC`,
    [session.id]
  );
  return {
    session,
    absent_student_ids: absences.map((row) => row.student_id),
    selected_task_ids: selectedTasks.map((row) => row.task_id),
    selected_student_ids: selectedStudents.map((row) => row.student_id),
  };
}

router.use(requireAuth);
router.use((req, res, next) => {
  if (!hasCollectivePermission(req.auth)) {
    return res.status(403).json({ error: 'Permission insuffisante' });
  }
  return next();
});

router.get('/session', async (req, res) => {
  try {
    const contextType = normalizeContextType(req.query.contextType);
    const contextId = normalizeText(req.query.contextId);
    if (!contextType) return res.status(400).json({ error: 'contextType invalide (map|project)' });
    if (!contextId) return res.status(400).json({ error: 'contextId requis' });
    if (!(await ensureContextExists(contextType, contextId))) {
      return res.status(404).json({ error: 'Contexte introuvable' });
    }
    const payload = await loadSessionPayload(contextType, contextId);
    return res.json(payload);
  } catch (err) {
    logRouteError(err, req, 'Erreur lecture session collectif');
    return res.status(500).json({ error: err.message });
  }
});

router.put('/session', async (req, res) => {
  try {
    const contextType = normalizeContextType(req.body?.contextType);
    const contextId = normalizeText(req.body?.contextId);
    if (!contextType) return res.status(400).json({ error: 'contextType invalide (map|project)' });
    if (!contextId) return res.status(400).json({ error: 'contextId requis' });
    if (!(await ensureContextExists(contextType, contextId))) {
      return res.status(404).json({ error: 'Contexte introuvable' });
    }
    const isActive = asBool(req.body?.isActive, true);
    const previous = await getSessionByContext(contextType, contextId);
    const sessionId = await ensureSession({ contextType, contextId, auth: req.auth, isActive });
    const shouldPreload = isActive && (!previous || !previous.is_active);
    if (shouldPreload) {
      await preloadSessionSelection(sessionId, contextType, contextId, req.auth);
    }
    const payload = await loadSessionPayload(contextType, contextId);
    return res.json(payload);
  } catch (err) {
    logRouteError(err, req, 'Erreur mise à jour session collectif');
    return res.status(500).json({ error: err.message });
  }
});

router.put('/session/attendance', async (req, res) => {
  try {
    const contextType = normalizeContextType(req.body?.contextType);
    const contextId = normalizeText(req.body?.contextId);
    const studentId = normalizeText(req.body?.studentId);
    if (!contextType) return res.status(400).json({ error: 'contextType invalide (map|project)' });
    if (!contextId) return res.status(400).json({ error: 'contextId requis' });
    if (!studentId) return res.status(400).json({ error: 'studentId requis' });
    if (!(await ensureContextExists(contextType, contextId))) {
      return res.status(404).json({ error: 'Contexte introuvable' });
    }
    const student = await queryOne("SELECT id FROM users WHERE user_type = 'student' AND id = ?", [studentId]);
    if (!student) return res.status(404).json({ error: 'Élève introuvable' });

    const absent = asBool(req.body?.absent, false);
    const sessionId = await ensureSession({ contextType, contextId, auth: req.auth, isActive: true });
    const selected = await queryOne(
      'SELECT student_id FROM collective_session_students WHERE session_id = ? AND student_id = ? LIMIT 1',
      [sessionId, studentId]
    );
    if (!selected) {
      return res.status(400).json({ error: 'Élève non présent dans la sélection de session' });
    }
    if (absent) {
      await execute(
        `INSERT INTO collective_session_absences (session_id, student_id, marked_by_user_type, marked_by_user_id)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           marked_by_user_type = VALUES(marked_by_user_type),
           marked_by_user_id = VALUES(marked_by_user_id),
           marked_at = CURRENT_TIMESTAMP`,
        [sessionId, studentId, req.auth?.userType || null, req.auth?.userId || null]
      );
    } else {
      await execute('DELETE FROM collective_session_absences WHERE session_id = ? AND student_id = ?', [sessionId, studentId]);
    }
    await execute(
      'UPDATE collective_sessions SET updated_by_user_type = ?, updated_by_user_id = ? WHERE id = ?',
      [req.auth?.userType || null, req.auth?.userId || null, sessionId]
    );
    const payload = await loadSessionPayload(contextType, contextId);
    return res.json(payload);
  } catch (err) {
    logRouteError(err, req, 'Erreur présence/absence session collectif');
    return res.status(500).json({ error: err.message });
  }
});

router.put('/session/tasks', async (req, res) => {
  try {
    const contextType = normalizeContextType(req.body?.contextType);
    const contextId = normalizeText(req.body?.contextId);
    const taskId = normalizeText(req.body?.taskId);
    const selected = asBool(req.body?.selected, true);
    if (!contextType) return res.status(400).json({ error: 'contextType invalide (map|project)' });
    if (!contextId) return res.status(400).json({ error: 'contextId requis' });
    if (!taskId) return res.status(400).json({ error: 'taskId requis' });
    if (!(await ensureContextExists(contextType, contextId))) {
      return res.status(404).json({ error: 'Contexte introuvable' });
    }
    const task = await queryOne('SELECT id FROM tasks WHERE id = ? LIMIT 1', [taskId]);
    if (!task) return res.status(404).json({ error: 'Tâche introuvable' });
    const sessionId = await ensureSession({ contextType, contextId, auth: req.auth, isActive: true });
    if (selected) {
      await execute(
        `INSERT INTO collective_session_tasks (session_id, task_id, added_by_user_type, added_by_user_id)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           added_by_user_type = VALUES(added_by_user_type),
           added_by_user_id = VALUES(added_by_user_id),
           added_at = CURRENT_TIMESTAMP`,
        [sessionId, taskId, req.auth?.userType || null, req.auth?.userId || null]
      );
    } else {
      await execute('DELETE FROM collective_session_tasks WHERE session_id = ? AND task_id = ?', [sessionId, taskId]);
    }
    const payload = await loadSessionPayload(contextType, contextId);
    return res.json(payload);
  } catch (err) {
    logRouteError(err, req, 'Erreur sélection tâches session collectif');
    return res.status(500).json({ error: err.message });
  }
});

router.put('/session/students', async (req, res) => {
  try {
    const contextType = normalizeContextType(req.body?.contextType);
    const contextId = normalizeText(req.body?.contextId);
    const studentId = normalizeText(req.body?.studentId);
    const selected = asBool(req.body?.selected, true);
    if (!contextType) return res.status(400).json({ error: 'contextType invalide (map|project)' });
    if (!contextId) return res.status(400).json({ error: 'contextId requis' });
    if (!studentId) return res.status(400).json({ error: 'studentId requis' });
    if (!(await ensureContextExists(contextType, contextId))) {
      return res.status(404).json({ error: 'Contexte introuvable' });
    }
    const student = await queryOne("SELECT id FROM users WHERE user_type = 'student' AND id = ?", [studentId]);
    if (!student) return res.status(404).json({ error: 'Élève introuvable' });
    const sessionId = await ensureSession({ contextType, contextId, auth: req.auth, isActive: true });
    if (selected) {
      await execute(
        `INSERT INTO collective_session_students (session_id, student_id, added_by_user_type, added_by_user_id)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           added_by_user_type = VALUES(added_by_user_type),
           added_by_user_id = VALUES(added_by_user_id),
           added_at = CURRENT_TIMESTAMP`,
        [sessionId, studentId, req.auth?.userType || null, req.auth?.userId || null]
      );
    } else {
      await execute('DELETE FROM collective_session_students WHERE session_id = ? AND student_id = ?', [sessionId, studentId]);
      await execute('DELETE FROM collective_session_absences WHERE session_id = ? AND student_id = ?', [sessionId, studentId]);
    }
    const payload = await loadSessionPayload(contextType, contextId);
    return res.json(payload);
  } catch (err) {
    logRouteError(err, req, 'Erreur sélection élèves session collectif');
    return res.status(500).json({ error: err.message });
  }
});

router.post('/session/reset', async (req, res) => {
  try {
    const contextType = normalizeContextType(req.body?.contextType);
    const contextId = normalizeText(req.body?.contextId);
    if (!contextType) return res.status(400).json({ error: 'contextType invalide (map|project)' });
    if (!contextId) return res.status(400).json({ error: 'contextId requis' });
    if (!(await ensureContextExists(contextType, contextId))) {
      return res.status(404).json({ error: 'Contexte introuvable' });
    }
    const session = await queryOne(
      'SELECT id FROM collective_sessions WHERE context_type = ? AND context_id = ? LIMIT 1',
      [contextType, contextId]
    );
    if (session?.id) {
      await execute('DELETE FROM collective_session_absences WHERE session_id = ?', [session.id]);
      await execute('DELETE FROM collective_session_tasks WHERE session_id = ?', [session.id]);
      await execute('DELETE FROM collective_session_students WHERE session_id = ?', [session.id]);
      await execute(
        'UPDATE collective_sessions SET is_active = 0, updated_by_user_type = ?, updated_by_user_id = ? WHERE id = ?',
        [req.auth?.userType || null, req.auth?.userId || null, session.id]
      );
    }
    const payload = await loadSessionPayload(contextType, contextId);
    return res.json(payload);
  } catch (err) {
    logRouteError(err, req, 'Erreur reset session collectif');
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
