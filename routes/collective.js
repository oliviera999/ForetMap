const express = require('express');
const { queryAll, queryOne, execute, withTransaction } = require('../database');
const { requireAuth } = require('../middleware/requireTeacher');
const { logRouteError } = require('../lib/routeLog');
const { emitCollectiveChanged } = require('../lib/realtime');

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
    `SELECT id, context_type, context_id, is_active, version, updated_at, created_at
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

function normalizeExpectedVersion(value) {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) return null;
  return parsed;
}

async function bumpSessionVersion(sessionId, auth) {
  if (!sessionId) return;
  await execute(
    `UPDATE collective_sessions
        SET version = version + 1,
            updated_by_user_type = ?,
            updated_by_user_id = ?
      WHERE id = ?`,
    [auth?.userType || null, auth?.userId || null, sessionId]
  );
}

async function bumpSessionVersionTx(tx, sessionId, auth) {
  if (!sessionId) return;
  await tx.execute(
    `UPDATE collective_sessions
        SET version = version + 1,
            updated_by_user_type = ?,
            updated_by_user_id = ?
      WHERE id = ?`,
    [auth?.userType || null, auth?.userId || null, sessionId]
  );
}

function buildInClauseParams(values = []) {
  if (!Array.isArray(values) || values.length === 0) {
    return { clause: '(NULL)', params: [] };
  }
  return {
    clause: `(${values.map(() => '?').join(',')})`,
    params: values,
  };
}

function normalizeIdArray(values, { max = 300 } = {}) {
  if (!Array.isArray(values)) return [];
  const unique = [];
  const seen = new Set();
  for (const raw of values) {
    const id = normalizeText(raw);
    if (!id) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    unique.push(id);
    if (unique.length >= max) break;
  }
  return unique;
}

async function reconcileSessionSelection(session, contextType, contextId) {
  if (!session?.id) return false;
  const sessionId = session.id;
  const [selectedTasks, selectedStudents, selectedAbsences, validTaskIds, activeStudentIds] = await Promise.all([
    queryAll('SELECT task_id FROM collective_session_tasks WHERE session_id = ?', [sessionId]),
    queryAll('SELECT student_id FROM collective_session_students WHERE session_id = ?', [sessionId]),
    queryAll('SELECT student_id FROM collective_session_absences WHERE session_id = ?', [sessionId]),
    getContextTaskIds(contextType, contextId),
    getAllStudentIds(),
  ]);
  const selectedTaskIds = selectedTasks.map((row) => row.task_id);
  const selectedStudentIds = selectedStudents.map((row) => row.student_id);
  const absenceStudentIds = selectedAbsences.map((row) => row.student_id);
  const validTaskSet = new Set(validTaskIds);
  const activeStudentSet = new Set(activeStudentIds);
  const selectedStudentSet = new Set(selectedStudentIds);

  const invalidTaskIds = selectedTaskIds.filter((taskId) => !validTaskSet.has(taskId));
  const inactiveStudentIds = selectedStudentIds.filter((studentId) => !activeStudentSet.has(studentId));
  const orphanAbsenceIds = absenceStudentIds.filter((studentId) => !selectedStudentSet.has(studentId));
  const obsoleteAbsenceIds = [...new Set([...inactiveStudentIds, ...orphanAbsenceIds])];

  let changed = false;
  if (invalidTaskIds.length > 0) {
    const inClause = buildInClauseParams(invalidTaskIds);
    await execute(
      `DELETE FROM collective_session_tasks
        WHERE session_id = ?
          AND task_id IN ${inClause.clause}`,
      [sessionId, ...inClause.params]
    );
    changed = true;
  }
  if (inactiveStudentIds.length > 0) {
    const inClause = buildInClauseParams(inactiveStudentIds);
    await execute(
      `DELETE FROM collective_session_students
        WHERE session_id = ?
          AND student_id IN ${inClause.clause}`,
      [sessionId, ...inClause.params]
    );
    changed = true;
  }
  if (obsoleteAbsenceIds.length > 0) {
    const inClause = buildInClauseParams(obsoleteAbsenceIds);
    await execute(
      `DELETE FROM collective_session_absences
        WHERE session_id = ?
          AND student_id IN ${inClause.clause}`,
      [sessionId, ...inClause.params]
    );
    changed = true;
  }
  if (changed) {
    await execute(
      `UPDATE collective_sessions
          SET version = version + 1,
              updated_by_user_type = NULL,
              updated_by_user_id = NULL
        WHERE id = ?`,
      [sessionId]
    );
  }
  return changed;
}

async function enforceExpectedVersion({ contextType, contextId, expectedVersion, res }) {
  if (!Number.isInteger(expectedVersion) || expectedVersion < 0) {
    res.status(400).json({ error: 'expectedVersion requis (entier >= 0)' });
    return { ok: false, current: null };
  }
  const current = await getSessionByContext(contextType, contextId);
  const currentVersion = Number(current?.version || 0);
  if (expectedVersion !== currentVersion) {
    const currentPayload = await loadSessionPayload(contextType, contextId);
    res.status(409).json({
      error: 'Session collectif modifiée ailleurs',
      expected_version: expectedVersion,
      current_version: currentVersion,
      current: currentPayload,
    });
    return { ok: false, current: null };
  }
  return { ok: true, current };
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

async function taskBelongsToContext(taskId, contextType, contextId) {
  if (contextType === 'project') {
    const row = await queryOne('SELECT id FROM tasks WHERE id = ? AND project_id = ? LIMIT 1', [taskId, contextId]);
    return !!row;
  }
  const row = await queryOne(
    `SELECT DISTINCT t.id
       FROM tasks t
  LEFT JOIN zones z ON z.id = t.zone_id
  LEFT JOIN map_markers m ON m.id = t.marker_id
  LEFT JOIN task_projects tp ON tp.id = t.project_id
  LEFT JOIN task_zones tz ON tz.task_id = t.id
  LEFT JOIN zones z2 ON z2.id = tz.zone_id
  LEFT JOIN task_markers tm ON tm.task_id = t.id
  LEFT JOIN map_markers m2 ON m2.id = tm.marker_id
      WHERE t.id = ?
        AND (
          t.map_id = ? OR t.map_id IS NULL
          OR z.map_id = ?
          OR m.map_id = ?
          OR tp.map_id = ?
          OR z2.map_id = ?
          OR m2.map_id = ?
        )
      LIMIT 1`,
    [taskId, contextId, contextId, contextId, contextId, contextId, contextId]
  );
  return !!row;
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
  let session = await getSessionByContext(contextType, contextId);
  if (!session) {
    return {
      session: {
        id: null,
        context_type: contextType,
        context_id: contextId,
        is_active: 0,
        version: 0,
        updated_at: null,
        created_at: null,
      },
      absent_student_ids: [],
      selected_task_ids: [],
      selected_student_ids: [],
    };
  }
  const reconciled = await reconcileSessionSelection(session, contextType, contextId);
  if (reconciled) {
    session = await getSessionByContext(contextType, contextId);
    emitCollectiveChanged({
      reason: 'reconcile',
      contextType,
      contextId,
      sessionId: session?.id || null,
      version: Number(session?.version || 0),
    });
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
    return res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

router.put('/session', async (req, res) => {
  try {
    const contextType = normalizeContextType(req.body?.contextType);
    const contextId = normalizeText(req.body?.contextId);
    const expectedVersion = normalizeExpectedVersion(req.body?.expectedVersion);
    if (!contextType) return res.status(400).json({ error: 'contextType invalide (map|project)' });
    if (!contextId) return res.status(400).json({ error: 'contextId requis' });
    if (!(await ensureContextExists(contextType, contextId))) {
      return res.status(404).json({ error: 'Contexte introuvable' });
    }
    const versionCheck = await enforceExpectedVersion({ contextType, contextId, expectedVersion, res });
    if (!versionCheck.ok) return;
    const previous = versionCheck.current;
    const isActive = asBool(req.body?.isActive, true);
    const sessionId = await ensureSession({ contextType, contextId, auth: req.auth, isActive });
    const shouldPreload = isActive && (!previous || !previous.is_active);
    if (shouldPreload) {
      await preloadSessionSelection(sessionId, contextType, contextId, req.auth);
    }
    if (previous?.id) await bumpSessionVersion(sessionId, req.auth);
    const payload = await loadSessionPayload(contextType, contextId);
    emitCollectiveChanged({
      reason: 'session_toggle',
      contextType,
      contextId,
      sessionId: payload?.session?.id || sessionId,
      version: Number(payload?.session?.version || 0),
    });
    return res.json(payload);
  } catch (err) {
    logRouteError(err, req, 'Erreur mise à jour session collectif');
    return res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

router.put('/session/attendance', async (req, res) => {
  try {
    const contextType = normalizeContextType(req.body?.contextType);
    const contextId = normalizeText(req.body?.contextId);
    const studentId = normalizeText(req.body?.studentId);
    const expectedVersion = normalizeExpectedVersion(req.body?.expectedVersion);
    if (!contextType) return res.status(400).json({ error: 'contextType invalide (map|project)' });
    if (!contextId) return res.status(400).json({ error: 'contextId requis' });
    if (!studentId) return res.status(400).json({ error: 'studentId requis' });
    if (!(await ensureContextExists(contextType, contextId))) {
      return res.status(404).json({ error: 'Contexte introuvable' });
    }
    const versionCheck = await enforceExpectedVersion({ contextType, contextId, expectedVersion, res });
    if (!versionCheck.ok) return;
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
    await bumpSessionVersion(sessionId, req.auth);
    const payload = await loadSessionPayload(contextType, contextId);
    emitCollectiveChanged({
      reason: absent ? 'attendance_absent' : 'attendance_present',
      contextType,
      contextId,
      studentId,
      sessionId: payload?.session?.id || sessionId,
      version: Number(payload?.session?.version || 0),
    });
    return res.json(payload);
  } catch (err) {
    logRouteError(err, req, 'Erreur présence/absence session collectif');
    return res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

router.put('/session/tasks', async (req, res) => {
  try {
    const contextType = normalizeContextType(req.body?.contextType);
    const contextId = normalizeText(req.body?.contextId);
    const taskId = normalizeText(req.body?.taskId);
    const expectedVersion = normalizeExpectedVersion(req.body?.expectedVersion);
    const selected = asBool(req.body?.selected, true);
    if (!contextType) return res.status(400).json({ error: 'contextType invalide (map|project)' });
    if (!contextId) return res.status(400).json({ error: 'contextId requis' });
    if (!taskId) return res.status(400).json({ error: 'taskId requis' });
    if (!(await ensureContextExists(contextType, contextId))) {
      return res.status(404).json({ error: 'Contexte introuvable' });
    }
    const versionCheck = await enforceExpectedVersion({ contextType, contextId, expectedVersion, res });
    if (!versionCheck.ok) return;
    const task = await queryOne('SELECT id FROM tasks WHERE id = ? LIMIT 1', [taskId]);
    if (!task) return res.status(404).json({ error: 'Tâche introuvable' });
    const inContext = await taskBelongsToContext(taskId, contextType, contextId);
    if (!inContext) return res.status(400).json({ error: 'Tâche hors contexte' });
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
    await bumpSessionVersion(sessionId, req.auth);
    const payload = await loadSessionPayload(contextType, contextId);
    emitCollectiveChanged({
      reason: selected ? 'task_selected' : 'task_unselected',
      contextType,
      contextId,
      taskId,
      sessionId: payload?.session?.id || sessionId,
      version: Number(payload?.session?.version || 0),
    });
    return res.json(payload);
  } catch (err) {
    logRouteError(err, req, 'Erreur sélection tâches session collectif');
    return res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

router.put('/session/students', async (req, res) => {
  try {
    const contextType = normalizeContextType(req.body?.contextType);
    const contextId = normalizeText(req.body?.contextId);
    const studentId = normalizeText(req.body?.studentId);
    const expectedVersion = normalizeExpectedVersion(req.body?.expectedVersion);
    const selected = asBool(req.body?.selected, true);
    if (!contextType) return res.status(400).json({ error: 'contextType invalide (map|project)' });
    if (!contextId) return res.status(400).json({ error: 'contextId requis' });
    if (!studentId) return res.status(400).json({ error: 'studentId requis' });
    if (!(await ensureContextExists(contextType, contextId))) {
      return res.status(404).json({ error: 'Contexte introuvable' });
    }
    const versionCheck = await enforceExpectedVersion({ contextType, contextId, expectedVersion, res });
    if (!versionCheck.ok) return;
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
    await bumpSessionVersion(sessionId, req.auth);
    const payload = await loadSessionPayload(contextType, contextId);
    emitCollectiveChanged({
      reason: selected ? 'student_selected' : 'student_unselected',
      contextType,
      contextId,
      studentId,
      sessionId: payload?.session?.id || sessionId,
      version: Number(payload?.session?.version || 0),
    });
    return res.json(payload);
  } catch (err) {
    logRouteError(err, req, 'Erreur sélection élèves session collectif');
    return res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

router.put('/session/students/bulk', async (req, res) => {
  try {
    const contextType = normalizeContextType(req.body?.contextType);
    const contextId = normalizeText(req.body?.contextId);
    const expectedVersion = normalizeExpectedVersion(req.body?.expectedVersion);
    const selected = asBool(req.body?.selected, true);
    const studentIds = normalizeIdArray(req.body?.studentIds);
    if (!contextType) return res.status(400).json({ error: 'contextType invalide (map|project)' });
    if (!contextId) return res.status(400).json({ error: 'contextId requis' });
    if (studentIds.length === 0) return res.status(400).json({ error: 'studentIds requis (tableau non vide)' });
    if (!(await ensureContextExists(contextType, contextId))) {
      return res.status(404).json({ error: 'Contexte introuvable' });
    }
    const versionCheck = await enforceExpectedVersion({ contextType, contextId, expectedVersion, res });
    if (!versionCheck.ok) return;

    const studentInClause = buildInClauseParams(studentIds);
    const existingStudents = await queryAll(
      `SELECT id
         FROM users
        WHERE user_type = 'student'
          AND is_active = 1
          AND id IN ${studentInClause.clause}`,
      studentInClause.params
    );
    const existingSet = new Set(existingStudents.map((row) => row.id));
    const validStudentIds = studentIds.filter((id) => existingSet.has(id));
    const invalidStudentIds = studentIds.filter((id) => !existingSet.has(id));
    if (validStudentIds.length === 0) {
      return res.status(404).json({ error: 'Aucun élève valide dans studentIds' });
    }

    const sessionId = await ensureSession({ contextType, contextId, auth: req.auth, isActive: true });
    await withTransaction(async (tx) => {
      if (selected) {
        for (const studentId of validStudentIds) {
          await tx.execute(
            `INSERT INTO collective_session_students (session_id, student_id, added_by_user_type, added_by_user_id)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
               added_by_user_type = VALUES(added_by_user_type),
               added_by_user_id = VALUES(added_by_user_id),
               added_at = CURRENT_TIMESTAMP`,
            [sessionId, studentId, req.auth?.userType || null, req.auth?.userId || null]
          );
        }
      } else {
        const validInClause = buildInClauseParams(validStudentIds);
        await tx.execute(
          `DELETE FROM collective_session_students
            WHERE session_id = ?
              AND student_id IN ${validInClause.clause}`,
          [sessionId, ...validInClause.params]
        );
        await tx.execute(
          `DELETE FROM collective_session_absences
            WHERE session_id = ?
              AND student_id IN ${validInClause.clause}`,
          [sessionId, ...validInClause.params]
        );
      }
      await bumpSessionVersionTx(tx, sessionId, req.auth);
    });
    const payload = await loadSessionPayload(contextType, contextId);
    emitCollectiveChanged({
      reason: selected ? 'students_bulk_selected' : 'students_bulk_unselected',
      contextType,
      contextId,
      sessionId: payload?.session?.id || sessionId,
      version: Number(payload?.session?.version || 0),
      count: validStudentIds.length,
    });
    return res.json({
      ...payload,
      bulk: {
        requested: studentIds.length,
        applied: validStudentIds,
        invalid: invalidStudentIds,
      },
    });
  } catch (err) {
    logRouteError(err, req, 'Erreur sélection bulk élèves session collectif');
    return res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

router.put('/session/tasks/bulk', async (req, res) => {
  try {
    const contextType = normalizeContextType(req.body?.contextType);
    const contextId = normalizeText(req.body?.contextId);
    const expectedVersion = normalizeExpectedVersion(req.body?.expectedVersion);
    const selected = asBool(req.body?.selected, true);
    const taskIds = normalizeIdArray(req.body?.taskIds);
    if (!contextType) return res.status(400).json({ error: 'contextType invalide (map|project)' });
    if (!contextId) return res.status(400).json({ error: 'contextId requis' });
    if (taskIds.length === 0) return res.status(400).json({ error: 'taskIds requis (tableau non vide)' });
    if (!(await ensureContextExists(contextType, contextId))) {
      return res.status(404).json({ error: 'Contexte introuvable' });
    }
    const versionCheck = await enforceExpectedVersion({ contextType, contextId, expectedVersion, res });
    if (!versionCheck.ok) return;

    const taskInClause = buildInClauseParams(taskIds);
    const existingTasks = await queryAll(
      `SELECT id
         FROM tasks
        WHERE id IN ${taskInClause.clause}`,
      taskInClause.params
    );
    const existingSet = new Set(existingTasks.map((row) => row.id));
    const contextTaskIds = await getContextTaskIds(contextType, contextId);
    const contextTaskSet = new Set(contextTaskIds);
    const validTaskIds = taskIds.filter((id) => existingSet.has(id) && contextTaskSet.has(id));
    const invalidTaskIds = taskIds.filter((id) => !existingSet.has(id));
    const outOfContextTaskIds = taskIds.filter((id) => existingSet.has(id) && !contextTaskSet.has(id));
    if (validTaskIds.length === 0) {
      return res.status(400).json({ error: 'Aucune tâche valide dans le contexte' });
    }

    const sessionId = await ensureSession({ contextType, contextId, auth: req.auth, isActive: true });
    await withTransaction(async (tx) => {
      if (selected) {
        for (const taskId of validTaskIds) {
          await tx.execute(
            `INSERT INTO collective_session_tasks (session_id, task_id, added_by_user_type, added_by_user_id)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
               added_by_user_type = VALUES(added_by_user_type),
               added_by_user_id = VALUES(added_by_user_id),
               added_at = CURRENT_TIMESTAMP`,
            [sessionId, taskId, req.auth?.userType || null, req.auth?.userId || null]
          );
        }
      } else {
        const validInClause = buildInClauseParams(validTaskIds);
        await tx.execute(
          `DELETE FROM collective_session_tasks
            WHERE session_id = ?
              AND task_id IN ${validInClause.clause}`,
          [sessionId, ...validInClause.params]
        );
      }
      await bumpSessionVersionTx(tx, sessionId, req.auth);
    });
    const payload = await loadSessionPayload(contextType, contextId);
    emitCollectiveChanged({
      reason: selected ? 'tasks_bulk_selected' : 'tasks_bulk_unselected',
      contextType,
      contextId,
      sessionId: payload?.session?.id || sessionId,
      version: Number(payload?.session?.version || 0),
      count: validTaskIds.length,
    });
    return res.json({
      ...payload,
      bulk: {
        requested: taskIds.length,
        applied: validTaskIds,
        invalid: invalidTaskIds,
        out_of_context: outOfContextTaskIds,
      },
    });
  } catch (err) {
    logRouteError(err, req, 'Erreur sélection bulk tâches session collectif');
    return res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

router.put('/session/attendance/bulk', async (req, res) => {
  try {
    const contextType = normalizeContextType(req.body?.contextType);
    const contextId = normalizeText(req.body?.contextId);
    const expectedVersion = normalizeExpectedVersion(req.body?.expectedVersion);
    const absent = asBool(req.body?.absent, false);
    const studentIds = normalizeIdArray(req.body?.studentIds);
    if (!contextType) return res.status(400).json({ error: 'contextType invalide (map|project)' });
    if (!contextId) return res.status(400).json({ error: 'contextId requis' });
    if (studentIds.length === 0) return res.status(400).json({ error: 'studentIds requis (tableau non vide)' });
    if (!(await ensureContextExists(contextType, contextId))) {
      return res.status(404).json({ error: 'Contexte introuvable' });
    }
    const versionCheck = await enforceExpectedVersion({ contextType, contextId, expectedVersion, res });
    if (!versionCheck.ok) return;

    const sessionId = await ensureSession({ contextType, contextId, auth: req.auth, isActive: true });
    const inClause = buildInClauseParams(studentIds);
    const existingStudents = await queryAll(
      `SELECT id
         FROM users
        WHERE user_type = 'student'
          AND is_active = 1
          AND id IN ${inClause.clause}`,
      inClause.params
    );
    const existingSet = new Set(existingStudents.map((row) => row.id));
    const validStudentIds = studentIds.filter((id) => existingSet.has(id));
    const invalidStudentIds = studentIds.filter((id) => !existingSet.has(id));
    if (validStudentIds.length === 0) {
      return res.status(404).json({ error: 'Aucun élève valide dans studentIds' });
    }

    const validInClause = buildInClauseParams(validStudentIds);
    const selectedRows = await queryAll(
      `SELECT student_id
         FROM collective_session_students
        WHERE session_id = ?
          AND student_id IN ${validInClause.clause}`,
      [sessionId, ...validInClause.params]
    );
    const selectedSet = new Set(selectedRows.map((row) => row.student_id));
    const applicableStudentIds = validStudentIds.filter((id) => selectedSet.has(id));
    const notSelectedStudentIds = validStudentIds.filter((id) => !selectedSet.has(id));
    if (applicableStudentIds.length === 0) {
      return res.status(400).json({ error: 'Aucun élève sélectionné dans la session' });
    }

    await withTransaction(async (tx) => {
      if (absent) {
        for (const studentId of applicableStudentIds) {
          await tx.execute(
            `INSERT INTO collective_session_absences (session_id, student_id, marked_by_user_type, marked_by_user_id)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
               marked_by_user_type = VALUES(marked_by_user_type),
               marked_by_user_id = VALUES(marked_by_user_id),
               marked_at = CURRENT_TIMESTAMP`,
            [sessionId, studentId, req.auth?.userType || null, req.auth?.userId || null]
          );
        }
      } else {
        const applicableInClause = buildInClauseParams(applicableStudentIds);
        await tx.execute(
          `DELETE FROM collective_session_absences
            WHERE session_id = ?
              AND student_id IN ${applicableInClause.clause}`,
          [sessionId, ...applicableInClause.params]
        );
      }
      await bumpSessionVersionTx(tx, sessionId, req.auth);
    });
    const payload = await loadSessionPayload(contextType, contextId);
    emitCollectiveChanged({
      reason: absent ? 'attendance_bulk_absent' : 'attendance_bulk_present',
      contextType,
      contextId,
      sessionId: payload?.session?.id || sessionId,
      version: Number(payload?.session?.version || 0),
      count: applicableStudentIds.length,
    });
    return res.json({
      ...payload,
      bulk: {
        requested: studentIds.length,
        applied: applicableStudentIds,
        invalid: invalidStudentIds,
        not_selected: notSelectedStudentIds,
      },
    });
  } catch (err) {
    logRouteError(err, req, 'Erreur présence/absence bulk session collectif');
    return res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

router.post('/session/reset', async (req, res) => {
  try {
    const contextType = normalizeContextType(req.body?.contextType);
    const contextId = normalizeText(req.body?.contextId);
    const expectedVersion = normalizeExpectedVersion(req.body?.expectedVersion);
    if (!contextType) return res.status(400).json({ error: 'contextType invalide (map|project)' });
    if (!contextId) return res.status(400).json({ error: 'contextId requis' });
    if (!(await ensureContextExists(contextType, contextId))) {
      return res.status(404).json({ error: 'Contexte introuvable' });
    }
    const versionCheck = await enforceExpectedVersion({ contextType, contextId, expectedVersion, res });
    if (!versionCheck.ok) return;
    const session = versionCheck.current;
    if (session?.id) {
      await execute('DELETE FROM collective_session_absences WHERE session_id = ?', [session.id]);
      await execute('DELETE FROM collective_session_tasks WHERE session_id = ?', [session.id]);
      await execute('DELETE FROM collective_session_students WHERE session_id = ?', [session.id]);
      await execute(
        `UPDATE collective_sessions
            SET is_active = 0,
                version = version + 1,
                updated_by_user_type = ?,
                updated_by_user_id = ?
          WHERE id = ?`,
        [req.auth?.userType || null, req.auth?.userId || null, session.id]
      );
    }
    const payload = await loadSessionPayload(contextType, contextId);
    emitCollectiveChanged({
      reason: 'session_reset',
      contextType,
      contextId,
      sessionId: payload?.session?.id || session?.id || null,
      version: Number(payload?.session?.version || 0),
    });
    return res.json(payload);
  } catch (err) {
    logRouteError(err, req, 'Erreur reset session collectif');
    return res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

module.exports = router;
