const express = require('express');
const bcrypt = require('bcryptjs');
const { queryAll, queryOne, execute } = require('../database');
const { requireTeacher } = require('../middleware/requireTeacher');
const { logRouteError } = require('../lib/routeLog');
const { logAudit } = require('./audit');
const { emitStudentsChanged, emitTasksChanged } = require('../lib/realtime');
const { saveBase64ToDisk, deleteFile } = require('../lib/uploads');

const router = express.Router();
const MAX_DESCRIPTION_LEN = 300;
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const PSEUDO_RE = /^[A-Za-z0-9_.-]{3,30}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeOptionalString(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length > 0 ? s : null;
}

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj || {}, key);
}

function detectAvatarExtension(dataUrl) {
  const m = /^data:image\/(png|jpe?g|webp);base64,/i.exec(dataUrl || '');
  if (!m) return null;
  const raw = String(m[1]).toLowerCase();
  return raw === 'jpeg' ? 'jpg' : raw;
}

router.post('/register', async (req, res) => {
  try {
    const { studentId } = req.body;
    if (!studentId) return res.status(400).json({ error: 'studentId requis' });
    const s = await queryOne('SELECT * FROM students WHERE id = ?', [studentId]);
    if (!s) return res.status(401).json({ error: 'Compte supprimé', deleted: true });
    await execute('UPDATE students SET last_seen = ? WHERE id = ?', [new Date().toISOString(), studentId]);
    res.json({ ...s, password: undefined });
  } catch (e) {
    logRouteError(e, req);
    res.status(500).json({ error: e.message });
  }
});

router.patch('/:id/profile', async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.currentPassword) return res.status(400).json({ error: 'Mot de passe actuel requis' });

    const student = await queryOne('SELECT * FROM students WHERE id = ?', [req.params.id]);
    if (!student) return res.status(404).json({ error: 'Élève introuvable' });
    if (!student.password) return res.status(401).json({ error: 'Ce compte n\'a pas de mot de passe. Contactez le prof.' });

    const passwordOk = await bcrypt.compare(String(body.currentPassword), student.password);
    if (!passwordOk) return res.status(401).json({ error: 'Mot de passe actuel incorrect' });

    const hasPseudo = hasOwn(body, 'pseudo');
    const hasEmail = hasOwn(body, 'email') || hasOwn(body, 'mail');
    const hasDescription = hasOwn(body, 'description');
    const hasAvatarData = hasOwn(body, 'avatarData');
    const removeAvatar = !!body.removeAvatar;
    if (!hasPseudo && !hasEmail && !hasDescription && !hasAvatarData && !removeAvatar) {
      return res.status(400).json({ error: 'Aucun champ de profil à mettre à jour' });
    }

    const pseudo = hasPseudo ? normalizeOptionalString(body.pseudo) : student.pseudo;
    const email = hasEmail ? normalizeOptionalString(body.email ?? body.mail) : student.email;
    const description = hasDescription ? normalizeOptionalString(body.description) : student.description;
    let avatarPath = student.avatar_path || null;

    if (pseudo != null && !PSEUDO_RE.test(pseudo)) {
      return res.status(400).json({ error: 'Pseudo invalide (3-30 caractères, lettres/chiffres/._-)' });
    }
    if (email != null && !EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'Email invalide' });
    }
    if (description != null && description.length > MAX_DESCRIPTION_LEN) {
      return res.status(400).json({ error: `Description trop longue (max ${MAX_DESCRIPTION_LEN} caractères)` });
    }
    if (hasAvatarData) {
      const avatarData = normalizeOptionalString(body.avatarData);
      if (!avatarData) {
        return res.status(400).json({ error: 'Image de profil invalide' });
      }
      const ext = detectAvatarExtension(avatarData);
      if (!ext) return res.status(400).json({ error: 'Format image invalide (png/jpg/webp)' });
      const base64Payload = avatarData.includes(',') ? avatarData.split(',')[1] : avatarData;
      const bytes = Buffer.byteLength(base64Payload, 'base64');
      if (bytes > MAX_AVATAR_BYTES) {
        return res.status(400).json({ error: 'Image trop lourde (max 2 Mo)' });
      }
      const relativePath = `students/${student.id}/avatar-${Date.now()}.${ext}`;
      saveBase64ToDisk(relativePath, avatarData);
      if (student.avatar_path && student.avatar_path !== relativePath) {
        deleteFile(student.avatar_path);
      }
      avatarPath = relativePath;
    } else if (removeAvatar) {
      if (student.avatar_path) deleteFile(student.avatar_path);
      avatarPath = null;
    }

    if (pseudo) {
      const existingPseudo = await queryOne(
        'SELECT id FROM students WHERE LOWER(pseudo)=LOWER(?) AND id <> ?',
        [pseudo, student.id]
      );
      if (existingPseudo) return res.status(409).json({ error: 'Ce pseudo est déjà utilisé' });
    }
    if (email) {
      const existingEmail = await queryOne(
        'SELECT id FROM students WHERE LOWER(email)=LOWER(?) AND id <> ?',
        [email, student.id]
      );
      if (existingEmail) return res.status(409).json({ error: 'Cet email est déjà utilisé' });
    }

    try {
      await execute(
        'UPDATE students SET pseudo = ?, email = ?, description = ?, avatar_path = ? WHERE id = ?',
        [pseudo, email, description, avatarPath, student.id]
      );
    } catch (err) {
      if (err && (err.errno === 1062 || err.code === 'ER_DUP_ENTRY')) {
        return res.status(409).json({ error: 'Pseudo ou email déjà utilisé' });
      }
      throw err;
    }
    const updated = await queryOne('SELECT * FROM students WHERE id = ?', [student.id]);
    emitStudentsChanged({ reason: 'student_profile_update', studentId: student.id });
    res.json({ ...updated, password: undefined });
  } catch (e) {
    logRouteError(e, req);
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', requireTeacher, async (req, res) => {
  try {
    const s = await queryOne('SELECT * FROM students WHERE id = ?', [req.params.id]);
    if (!s) return res.status(404).json({ error: 'Élève introuvable' });

    const affectedRows = await queryAll(
      'SELECT DISTINCT task_id FROM task_assignments WHERE student_first_name = ? AND student_last_name = ?',
      [s.first_name, s.last_name]
    );
    const affectedTasks = affectedRows.map(r => r.task_id);

    await execute(
      'DELETE FROM task_assignments WHERE student_first_name = ? AND student_last_name = ?',
      [s.first_name, s.last_name]
    );
    await execute(
      'DELETE FROM task_logs WHERE student_first_name = ? AND student_last_name = ?',
      [s.first_name, s.last_name]
    );

    for (const taskId of affectedTasks) {
      const task = await queryOne('SELECT * FROM tasks WHERE id = ?', [taskId]);
      if (!task) continue;
      if (task.status === 'validated') continue;

      const remainingRow = await queryOne('SELECT COUNT(*) AS c FROM task_assignments WHERE task_id = ?', [taskId]);
      const remaining = remainingRow ? Number(remainingRow.c) : 0;

      let newStatus;
      if (remaining === 0) {
        newStatus = 'available';
      } else if (remaining >= task.required_students) {
        newStatus = task.status === 'done' ? 'done' : 'in_progress';
      } else {
        newStatus = 'available';
      }
      await execute('UPDATE tasks SET status = ? WHERE id = ?', [newStatus, taskId]);
    }

    await execute('DELETE FROM students WHERE id = ?', [req.params.id]);
    logAudit('delete_student', 'student', req.params.id, `${s.first_name} ${s.last_name}`);
    emitStudentsChanged({ reason: 'delete_student', studentId: req.params.id });
    emitTasksChanged({ reason: 'delete_student_assignments' });
    res.json({ success: true });
  } catch (e) {
    logRouteError(e, req);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
