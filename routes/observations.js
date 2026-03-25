const express = require('express');
const jwt = require('jsonwebtoken');
const { queryAll, queryOne, execute } = require('../database');
const { requirePermission, JWT_SECRET } = require('../middleware/requireTeacher');
const { saveBase64ToDisk, getAbsolutePath, deleteFile } = require('../lib/uploads');
const { logRouteError } = require('../lib/routeLog');

const router = express.Router();

function isTeacherRequest(req) {
  try {
    if (!JWT_SECRET) return false;
    const auth = req.headers.authorization;
    const token = auth && auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return false;
    const payload = jwt.verify(token, JWT_SECRET);
    const perms = Array.isArray(payload?.permissions) ? payload.permissions : [];
    return perms.includes('observations.read.all');
  } catch (_) {
    return false;
  }
}

// Observations d'un élève
router.get('/student/:studentId', async (req, res) => {
  try {
    const askedStudentId = String(req.params.studentId || '').trim();
    const teacherRequest = isTeacherRequest(req);
    const requesterStudentId = String(req.query.studentId || '').trim();
    if (!teacherRequest && requesterStudentId !== askedStudentId) {
      return res.status(403).json({ error: 'Accès refusé à ce carnet' });
    }
    const student = await queryOne('SELECT id FROM students WHERE id = ?', [askedStudentId]);
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
    logRouteError(e, req);
    res.status(500).json({ error: e.message });
  }
});

// Toutes les observations (prof)
router.get('/all', requirePermission('observations.read.all', { needsElevation: true }), async (req, res) => {
  try {
    const rows = await queryAll(
      `SELECT o.*, z.name as zone_name, s.first_name, s.last_name
       FROM observation_logs o
       LEFT JOIN zones z ON o.zone_id = z.id
       LEFT JOIN students s ON o.student_id = s.id
       ORDER BY o.created_at DESC
       LIMIT 100`
    );
    res.json(rows.map(r => ({
      ...r,
      image_url: r.image_path ? `/api/observations/${r.id}/image` : null,
    })));
  } catch (e) {
    logRouteError(e, req);
    res.status(500).json({ error: e.message });
  }
});

// Créer une observation
router.post('/', async (req, res) => {
  try {
    const { studentId, zone_id, content, imageData } = req.body;
    if (!studentId || !content?.trim()) {
      return res.status(400).json({ error: 'Contenu et identifiant élève requis' });
    }
    const student = await queryOne('SELECT id FROM students WHERE id = ?', [studentId]);
    if (!student) return res.status(401).json({ error: 'Compte supprimé', deleted: true });

    const result = await execute(
      'INSERT INTO observation_logs (student_id, zone_id, content, image_path, created_at) VALUES (?, ?, ?, ?, ?)',
      [studentId, zone_id || null, content.trim(), null, new Date().toISOString()]
    );
    const logId = result.insertId;

    if (imageData) {
      const relativePath = `observations/${studentId}_${logId}.jpg`;
      saveBase64ToDisk(relativePath, imageData);
      await execute('UPDATE observation_logs SET image_path = ? WHERE id = ?', [relativePath, logId]);
    }

    const obs = await queryOne('SELECT * FROM observation_logs WHERE id = ?', [logId]);
    res.status(201).json(obs);
  } catch (e) {
    logRouteError(e, req);
    res.status(500).json({ error: e.message });
  }
});

// Image d'une observation
router.get('/:id/image', async (req, res) => {
  try {
    const obs = await queryOne('SELECT image_path FROM observation_logs WHERE id = ?', [req.params.id]);
    if (!obs || !obs.image_path) return res.status(404).json({ error: 'Image introuvable' });
    const absolutePath = getAbsolutePath(obs.image_path);
    res.sendFile(absolutePath, (err) => {
      if (err && !res.headersSent) res.status(404).json({ error: 'Fichier introuvable' });
    });
  } catch (e) {
    logRouteError(e, req);
    res.status(500).json({ error: e.message });
  }
});

// Supprimer une observation (prof ou élève propriétaire)
router.delete('/:id', async (req, res) => {
  try {
    const obs = await queryOne('SELECT * FROM observation_logs WHERE id = ?', [req.params.id]);
    if (!obs) return res.status(404).json({ error: 'Observation introuvable' });
    const teacherRequest = isTeacherRequest(req);
    if (!teacherRequest) {
      const studentId = String(req.body?.studentId || '').trim();
      if (!studentId || studentId !== String(obs.student_id)) {
        return res.status(403).json({ error: 'Suppression non autorisée' });
      }
      const student = await queryOne('SELECT id FROM students WHERE id = ?', [studentId]);
      if (!student) return res.status(401).json({ error: 'Compte supprimé', deleted: true });
    }

    if (obs.image_path) deleteFile(obs.image_path);
    await execute('DELETE FROM observation_logs WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (e) {
    logRouteError(e, req);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
