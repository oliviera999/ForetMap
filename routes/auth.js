const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { queryOne, execute } = require('../database');
const { JWT_SECRET } = require('../middleware/requireTeacher');
const { logRouteError } = require('../lib/routeLog');
const { emitStudentsChanged } = require('../lib/realtime');
const { sendPasswordResetEmail } = require('../lib/mailer');

const router = express.Router();
const TEACHER_PIN = process.env.TEACHER_PIN ?? (process.env.NODE_ENV === 'production' ? null : '1234');
const MAX_DESCRIPTION_LEN = 300;
const PSEUDO_RE = /^[A-Za-z0-9_.-]{3,30}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_RESET_MIN_LEN = 4;
const PASSWORD_RESET_TTL_MINUTES = 60;

function normalizeOptionalString(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length > 0 ? s : null;
}

function normalizeEmail(value) {
  const email = normalizeOptionalString(value);
  return email ? email.toLowerCase() : null;
}

function validateProfileInput({ pseudo, email, description }) {
  if (pseudo != null && !PSEUDO_RE.test(pseudo)) {
    return 'Pseudo invalide (3-30 caractères, lettres/chiffres/._-)';
  }
  if (email != null && !EMAIL_RE.test(email)) {
    return 'Email invalide';
  }
  if (description != null && description.length > MAX_DESCRIPTION_LEN) {
    return `Description trop longue (max ${MAX_DESCRIPTION_LEN} caractères)`;
  }
  return null;
}

function hashResetToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function getPasswordResetBaseUrl() {
  return process.env.PASSWORD_RESET_BASE_URL
    || process.env.FRONTEND_ORIGIN
    || 'http://localhost:3000';
}

function makeResetUrl(type, token) {
  const base = getPasswordResetBaseUrl().replace(/\/$/, '');
  return `${base}/?resetType=${encodeURIComponent(type)}&resetToken=${encodeURIComponent(token)}`;
}

function jwtNotConfigured(res) {
  if (!JWT_SECRET) {
    res.status(503).json({ error: 'Mode prof non configuré' });
    return true;
  }
  return false;
}

async function createPasswordResetToken(userType, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashResetToken(token);
  const ttlMs = PASSWORD_RESET_TTL_MINUTES * 60 * 1000;
  const expiresAt = new Date(Date.now() + ttlMs);
  await execute(
    'INSERT INTO password_reset_tokens (id, user_type, user_id, token_hash, expires_at, used_at) VALUES (?, ?, ?, ?, ?, NULL)',
    [uuidv4(), userType, userId, tokenHash, expiresAt]
  );
  return token;
}

async function consumePasswordResetToken(userType, token) {
  const tokenHash = hashResetToken(token);
  const row = await queryOne(
    `SELECT id, user_id
       FROM password_reset_tokens
      WHERE user_type = ?
        AND token_hash = ?
        AND used_at IS NULL
        AND expires_at > NOW()
      LIMIT 1`,
    [userType, tokenHash]
  );
  if (!row) return null;

  const result = await execute(
    'UPDATE password_reset_tokens SET used_at = NOW() WHERE id = ? AND used_at IS NULL',
    [row.id]
  );
  if (!result.affectedRows) return null;
  return row.user_id;
}

let seedTeacherChecked = false;
async function ensureTeacherSeedFromEnv() {
  if (seedTeacherChecked) return;
  seedTeacherChecked = true;
  const email = normalizeEmail(process.env.TEACHER_ADMIN_EMAIL);
  const password = normalizeOptionalString(process.env.TEACHER_ADMIN_PASSWORD);
  const displayName = normalizeOptionalString(process.env.TEACHER_ADMIN_DISPLAY_NAME) || 'Professeur';
  if (!email || !password || password.length < PASSWORD_RESET_MIN_LEN) return;

  const existing = await queryOne('SELECT id FROM teachers WHERE LOWER(email) = LOWER(?) LIMIT 1', [email]);
  if (existing) return;

  const hash = await bcrypt.hash(password, 10);
  const now = new Date().toISOString();
  try {
    await execute(
      'INSERT INTO teachers (id, email, password_hash, display_name, is_active, last_seen, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?, ?)',
      [uuidv4(), email, hash, displayName, now, now, now]
    );
  } catch (err) {
    if (!(err && (err.errno === 1062 || err.code === 'ER_DUP_ENTRY'))) {
      throw err;
    }
  }
}

/** POST /api/auth/teacher — vérifie le PIN et renvoie un JWT. */
router.post('/teacher', (req, res) => {
  const pin = req.body && req.body.pin;
  if (!TEACHER_PIN) return res.status(503).json({ error: 'Mode prof non configuré' });
  if (jwtNotConfigured(res)) return;
  if (pin !== TEACHER_PIN) return res.status(401).json({ error: 'PIN incorrect' });
  const token = jwt.sign({ role: 'teacher' }, JWT_SECRET, { expiresIn: '24h' });
  res.json({ token });
});

router.post('/register', async (req, res) => {
  try {
    const { firstName, lastName, password } = req.body;
    const pseudo = normalizeOptionalString(req.body?.pseudo);
    const email = normalizeEmail(req.body?.email ?? req.body?.mail);
    const description = normalizeOptionalString(req.body?.description);
    if (!firstName?.trim() || !lastName?.trim()) return res.status(400).json({ error: 'Prénom et nom requis' });
    if (!password || password.length < 4) return res.status(400).json({ error: 'Mot de passe trop court (min 4 caractères)' });
    const profileError = validateProfileInput({ pseudo, email, description });
    if (profileError) return res.status(400).json({ error: profileError });

    const existing = await queryOne(
      'SELECT * FROM students WHERE LOWER(first_name)=LOWER(?) AND LOWER(last_name)=LOWER(?)',
      [firstName.trim(), lastName.trim()]
    );
    if (existing) return res.status(409).json({ error: 'Un compte avec ce nom existe déjà' });
    if (pseudo) {
      const existingPseudo = await queryOne('SELECT id FROM students WHERE LOWER(pseudo)=LOWER(?)', [pseudo]);
      if (existingPseudo) return res.status(409).json({ error: 'Ce pseudo est déjà utilisé' });
    }
    if (email) {
      const existingEmail = await queryOne('SELECT id FROM students WHERE LOWER(email)=LOWER(?)', [email]);
      if (existingEmail) return res.status(409).json({ error: 'Cet email est déjà utilisé' });
    }

    const hash = await bcrypt.hash(password, 10);
    const id   = uuidv4();
    const now  = new Date().toISOString();
    try {
      await execute(
        'INSERT INTO students (id, first_name, last_name, pseudo, email, description, avatar_path, password, last_seen) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [id, firstName.trim(), lastName.trim(), pseudo, email, description, null, hash, now]
      );
    } catch (err) {
      if (err && (err.errno === 1062 || err.code === 'ER_DUP_ENTRY')) {
        return res.status(409).json({ error: 'Pseudo ou email déjà utilisé' });
      }
      throw err;
    }
    const student = await queryOne('SELECT * FROM students WHERE id = ?', [id]);
    emitStudentsChanged({ reason: 'register', studentId: id });
    res.status(201).json({ ...student, password: undefined });
  } catch (e) {
    logRouteError(e, req);
    res.status(500).json({ error: e.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { firstName, lastName, password } = req.body;
    const identifier = normalizeOptionalString(req.body?.identifier);
    if (!password) return res.status(400).json({ error: 'Champs requis' });

    let student;
    if (identifier) {
      student = await queryOne(
        'SELECT * FROM students WHERE LOWER(pseudo)=LOWER(?) OR LOWER(email)=LOWER(?) LIMIT 1',
        [identifier, identifier]
      );
    } else {
      if (!firstName || !lastName) return res.status(400).json({ error: 'Champs requis' });
      student = await queryOne(
        'SELECT * FROM students WHERE LOWER(first_name)=LOWER(?) AND LOWER(last_name)=LOWER(?)',
        [firstName.trim(), lastName.trim()]
      );
    }

    if (!student) return res.status(401).json({ error: 'Compte introuvable' });
    if (!student.password) return res.status(401).json({ error: 'Ce compte n\'a pas de mot de passe. Contactez le prof.' });

    const ok = await bcrypt.compare(password, student.password);
    if (!ok) return res.status(401).json({ error: 'Mot de passe incorrect' });

    await execute('UPDATE students SET last_seen = ? WHERE id = ?', [new Date().toISOString(), student.id]);
    res.json({ ...student, password: undefined });
  } catch (e) {
    logRouteError(e, req);
    res.status(500).json({ error: e.message });
  }
});

router.post('/forgot-password', async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email ?? req.body?.mail);
    if (!email || !EMAIL_RE.test(email)) {
      return res.json({ ok: true, message: 'Si un compte existe, un email de réinitialisation a été envoyé.' });
    }
    const student = await queryOne(
      'SELECT id, first_name, last_name, email, password FROM students WHERE LOWER(email)=LOWER(?) LIMIT 1',
      [email]
    );
    if (student && student.password) {
      const token = await createPasswordResetToken('student', student.id);
      await sendPasswordResetEmail({
        to: student.email,
        displayName: `${student.first_name || ''} ${student.last_name || ''}`.trim() || 'Élève',
        resetUrl: makeResetUrl('student', token),
        roleLabel: 'élève',
      });
    }
    res.json({ ok: true, message: 'Si un compte existe, un email de réinitialisation a été envoyé.' });
  } catch (e) {
    logRouteError(e, req);
    res.status(500).json({ error: e.message });
  }
});

router.post('/reset-password', async (req, res) => {
  try {
    const token = normalizeOptionalString(req.body?.token);
    const password = req.body?.password;
    if (!token || !password) return res.status(400).json({ error: 'Champs requis' });
    if (String(password).length < PASSWORD_RESET_MIN_LEN) {
      return res.status(400).json({ error: `Mot de passe trop court (min ${PASSWORD_RESET_MIN_LEN} caractères)` });
    }
    const studentId = await consumePasswordResetToken('student', token);
    if (!studentId) return res.status(400).json({ error: 'Token invalide ou expiré' });
    const hash = await bcrypt.hash(password, 10);
    await execute('UPDATE students SET password = ? WHERE id = ?', [hash, studentId]);
    res.json({ ok: true });
  } catch (e) {
    logRouteError(e, req);
    res.status(500).json({ error: e.message });
  }
});

router.post('/teacher/login', async (req, res) => {
  try {
    if (jwtNotConfigured(res)) return;
    await ensureTeacherSeedFromEnv();
    const email = normalizeEmail(req.body?.email);
    const password = req.body?.password;
    if (!email || !password) return res.status(400).json({ error: 'Champs requis' });

    const teacher = await queryOne(
      'SELECT id, email, password_hash, is_active FROM teachers WHERE LOWER(email)=LOWER(?) LIMIT 1',
      [email]
    );
    if (!teacher || !teacher.is_active) return res.status(401).json({ error: 'Compte professeur introuvable' });
    const ok = await bcrypt.compare(password, teacher.password_hash);
    if (!ok) return res.status(401).json({ error: 'Mot de passe incorrect' });

    await execute('UPDATE teachers SET last_seen = ?, updated_at = ? WHERE id = ?', [new Date().toISOString(), new Date().toISOString(), teacher.id]);
    const token = jwt.sign({ role: 'teacher', teacherId: teacher.id, auth: 'email' }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token });
  } catch (e) {
    logRouteError(e, req);
    res.status(500).json({ error: e.message });
  }
});

router.post('/teacher/forgot-password', async (req, res) => {
  try {
    await ensureTeacherSeedFromEnv();
    const email = normalizeEmail(req.body?.email);
    if (!email || !EMAIL_RE.test(email)) {
      return res.json({ ok: true, message: 'Si un compte existe, un email de réinitialisation a été envoyé.' });
    }
    const teacher = await queryOne(
      'SELECT id, email, is_active FROM teachers WHERE LOWER(email)=LOWER(?) LIMIT 1',
      [email]
    );
    if (teacher && teacher.is_active) {
      const token = await createPasswordResetToken('teacher', teacher.id);
      await sendPasswordResetEmail({
        to: teacher.email,
        displayName: 'Professeur',
        resetUrl: makeResetUrl('teacher', token),
        roleLabel: 'professeur',
      });
    }
    res.json({ ok: true, message: 'Si un compte existe, un email de réinitialisation a été envoyé.' });
  } catch (e) {
    logRouteError(e, req);
    res.status(500).json({ error: e.message });
  }
});

router.post('/teacher/reset-password', async (req, res) => {
  try {
    const token = normalizeOptionalString(req.body?.token);
    const password = req.body?.password;
    if (!token || !password) return res.status(400).json({ error: 'Champs requis' });
    if (String(password).length < PASSWORD_RESET_MIN_LEN) {
      return res.status(400).json({ error: `Mot de passe trop court (min ${PASSWORD_RESET_MIN_LEN} caractères)` });
    }
    const teacherId = await consumePasswordResetToken('teacher', token);
    if (!teacherId) return res.status(400).json({ error: 'Token invalide ou expiré' });
    const hash = await bcrypt.hash(password, 10);
    const now = new Date().toISOString();
    await execute('UPDATE teachers SET password_hash = ?, updated_at = ? WHERE id = ?', [hash, now, teacherId]);
    res.json({ ok: true });
  } catch (e) {
    logRouteError(e, req);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
