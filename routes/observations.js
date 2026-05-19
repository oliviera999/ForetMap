const express = require('express');
const { queryAll, queryOne, execute } = require('../database');
const { requireAuth } = require('../middleware/requireTeacher');
const { saveBase64ToDisk, getAbsolutePath, deleteFile } = require('../lib/uploads');
const { logRouteError, respondInternalError } = require('../lib/routeLog');
const { canAccessStudentId, getScopedStudentIds } = require('../lib/groupScope');

const router = express.Router();

function isTeacherRequest(req) {
  const perms = Array.isArray(req.auth?.permissions) ? req.auth.permissions : [];
  return perms.includes('observations.read.all') || perms.includes('observations.read.group');
}

// Observations d'un élève
router.get('/student/:studentId', requireAuth, async (req, res) => {
  try {
    const askedStudentId = String(req.params.studentId || '').trim();
    const teacherRequest = isTeacherRequest(req);
    const auth = req.auth || null;
    const canReadAll = Array.isArray(auth?.permissions) && auth.permissions.includes('observations.read.all');
    const canReadGroup = Array.isArray(auth?.permissions) && auth.permissions.includes('observations.read.group');
    const isOwner = auth?.userType === 'student' && String(auth?.userId || '') === askedStudentId;
    if (!teacherRequest && !isOwner) {
      return res.status(403).json({ error: 'Accès refusé à ce carnet' });
    }
    if (!isOwner && !canReadAll && canReadGroup) {
      const allowed = await canAccessStudentId(auth, askedStudentId);
      if (!allowed) return res.status(403).json({ error: 'Accès refusé à ce carnet' });
    }
    const student = await queryOne("SELECT id FROM users WHERE user_type = 'student' AND id = ?", [askedStudentId]);
    if (!student) return res.status(401).json({ error: 'Compte supprimé', deleted: true });

    const rows = await queryAll(
      `SELECT o.*, z.name as zone_name
       FROM observation_logs o
       LEFT JOIN zones z ON o.zone_id = z.id
       WHERE o.student_id = ?
       ORDER BY o.created_at DESC`,
      [askedStudentId]
    );
    res.json(rows.map(r => ({
      ...r,
      image_url: r.image_path ? `/api/observations/${r.id}/image` : null,
    })));
  } catch (e) {
    respondInternalError(res, req, e);
  }
});

// Toutes les observations (prof)
router.get('/all', requireAuth, async (req, res) => {
  try {
    const perms = Array.isArray(req.auth?.permissions) ? req.auth.permissions : [];
    const canReadAll = perms.includes('observations.read.all');
    const canReadGroup = perms.includes('observations.read.group');
    if (!canReadAll && !canReadGroup) return res.status(403).json({ error: 'Permission insuffisante' });
    const requestedGroupId = String(req.query?.group_id || '').trim();
    const scope = await getScopedStudentIds(req.auth, { groupId: requestedGroupId || null });
    if (scope.unauthorizedGroup) return res.status(403).json({ error: 'Groupe hors périmètre' });
    const rows = await queryAll(
      `SELECT o.*, z.name as zone_name, s.first_name, s.last_name
       FROM observation_logs o
       LEFT JOIN zones z ON o.zone_id = z.id
       LEFT JOIN users s ON o.student_id = s.id AND s.user_type = 'student'
       ${scope.all ? '' : (scope.studentIds.length > 0 ? `WHERE o.student_id IN (${scope.studentIds.map(() => '?').join(',')})` : 'WHERE 1 = 0')}
       ORDER BY o.created_at DESC
       LIMIT 100`,
      scope.all ? [] : scope.studentIds
    );
    res.json(rows.map(r => ({
      ...r,
      image_url: r.image_path ? `/api/observations/${r.id}/image` : null,
    })));
  } catch (e) {
    respondInternalError(res, req, e);
  }
});

// Créer une observation
router.post('/', requireAuth, async (req, res) => {
  try {
    const { studentId, zone_id, content, imageData } = req.body;
    const auth = req.auth || null;
    const teacherRequest = isTeacherRequest(req);
    const resolvedStudentId = teacherRequest
      ? String(studentId || '').trim()
      : String(auth?.userType === 'student' ? auth.userId : '').trim();
    if (!resolvedStudentId || !content?.trim()) {
      return res.status(400).json({ error: 'Contenu et identifiant n3beur requis' });
    }
    const student = await queryOne("SELECT id FROM users WHERE user_type = 'student' AND id = ?", [resolvedStudentId]);
    if (!student) return res.status(401).json({ error: 'Compte supprimé', deleted: true });
    if (teacherRequest) {
      const perms = Array.isArray(auth?.permissions) ? auth.permissions : [];
      const canReadAll = perms.includes('observations.read.all');
      if (!canReadAll) {
        const allowed = await canAccessStudentId(auth, resolvedStudentId);
        if (!allowed) return res.status(403).json({ error: 'n3beur hors périmètre de groupe' });
      }
    }

    const result = await execute(
      'INSERT INTO observation_logs (student_id, zone_id, content, image_path, created_at) VALUES (?, ?, ?, ?, ?)',
      [resolvedStudentId, zone_id || null, content.trim(), null, new Date().toISOString()]
    );
    const logId = result.insertId;

    if (imageData) {
      const relativePath = `observations/${resolvedStudentId}_${logId}.jpg`;
      try {
        saveBase64ToDisk(relativePath, imageData);
        await execute('UPDATE observation_logs SET image_path = ? WHERE id = ?', [relativePath, logId]);
      } catch (err) {
        try {
          deleteFile(relativePath);
        } catch (_) {
          /* ignore */
        }
        await execute('DELETE FROM observation_logs WHERE id = ?', [logId]);
        throw err;
      }
    }

    const obs = await queryOne('SELECT * FROM observation_logs WHERE id = ?', [logId]);
    res.status(201).json(obs);
  } catch (e) {
    respondInternalError(res, req, e);
  }
});

// Image d'une observation
router.get('/:id/image', requireAuth, async (req, res) => {
  try {
    const obs = await queryOne('SELECT student_id, image_path FROM observation_logs WHERE id = ?', [req.params.id]);
    if (!obs || !obs.image_path) return res.status(404).json({ error: 'Image introuvable' });
    const teacherRequest = isTeacherRequest(req);
    const auth = req.auth || null;
    const canReadAll = Array.isArray(auth?.permissions) && auth.permissions.includes('observations.read.all');
    const isOwner = auth?.userType === 'student' && String(auth?.userId || '') === String(obs.student_id || '');
    if (!teacherRequest && !isOwner) {
      return res.status(403).json({ error: 'Accès refusé à cette image' });
    }
    if (teacherRequest && !isOwner && !canReadAll) {
      const allowed = await canAccessStudentId(auth, obs.student_id);
      if (!allowed) return res.status(403).json({ error: 'Accès refusé à cette image' });
    }
    const absolutePath = getAbsolutePath(obs.image_path);
    res.sendFile(absolutePath, (err) => {
      if (err && !res.headersSent) res.status(404).json({ error: 'Fichier introuvable' });
    });
  } catch (e) {
    respondInternalError(res, req, e);
  }
});

// Supprimer une observation (prof ou élève propriétaire)
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const obs = await queryOne('SELECT * FROM observation_logs WHERE id = ?', [req.params.id]);
    if (!obs) return res.status(404).json({ error: 'Observation introuvable' });
    const teacherRequest = isTeacherRequest(req);
    if (!teacherRequest) {
      const auth = req.auth || null;
      const studentId = String(auth?.userType === 'student' ? auth.userId : '').trim();
      if (!studentId || studentId !== String(obs.student_id)) {
        return res.status(403).json({ error: 'Suppression non autorisée' });
      }
      const student = await queryOne("SELECT id FROM users WHERE user_type = 'student' AND id = ?", [studentId]);
      if (!student) return res.status(401).json({ error: 'Compte supprimé', deleted: true });
    } else {
      const auth = req.auth || null;
      const perms = Array.isArray(auth?.permissions) ? auth.permissions : [];
      const canReadAll = perms.includes('observations.read.all');
      if (!canReadAll) {
        const allowed = await canAccessStudentId(auth, obs.student_id);
        if (!allowed) return res.status(403).json({ error: 'Suppression non autorisée' });
      }
    }

    if (obs.image_path) deleteFile(obs.image_path);
    await execute('DELETE FROM observation_logs WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (e) {
    respondInternalError(res, req, e);
  }
});

module.exports = router;
