const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { queryOne, execute } = require('../database');
const { JWT_SECRET } = require('../middleware/requireTeacher');
const { logRouteError } = require('../lib/routeLog');
const { emitStudentsChanged } = require('../lib/realtime');

const router = express.Router();
const TEACHER_PIN = process.env.TEACHER_PIN ?? (process.env.NODE_ENV === 'production' ? null : '1234');
const MAX_DESCRIPTION_LEN = 300;
const PSEUDO_RE = /^[A-Za-z0-9_.-]{3,30}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeOptionalString(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length > 0 ? s : null;
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

/** POST /api/auth/teacher — vérifie le PIN et renvoie un JWT. */
router.post('/teacher', (req, res) => {
  const pin = req.body && req.body.pin;
  if (!TEACHER_PIN) return res.status(503).json({ error: 'Mode prof non configuré' });
  if (!JWT_SECRET) return res.status(503).json({ error: 'Mode prof non configuré' });
  if (pin !== TEACHER_PIN) return res.status(401).json({ error: 'PIN incorrect' });
  const token = jwt.sign({ role: 'teacher' }, JWT_SECRET, { expiresIn: '24h' });
  res.json({ token });
});

router.post('/register', async (req, res) => {
  try {
    const { firstName, lastName, password } = req.body;
    const pseudo = normalizeOptionalString(req.body?.pseudo);
    const email = normalizeOptionalString(req.body?.email ?? req.body?.mail);
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
    if (!firstName || !lastName || !password) return res.status(400).json({ error: 'Champs requis' });

    const student = await queryOne(
      'SELECT * FROM students WHERE LOWER(first_name)=LOWER(?) AND LOWER(last_name)=LOWER(?)',
      [firstName.trim(), lastName.trim()]
    );

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

module.exports = router;
