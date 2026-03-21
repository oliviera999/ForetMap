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

/** POST /api/auth/teacher — vérifie le PIN et renvoie un JWT. */
router.post('/teacher', (req, res) => {
  const pin = req.body && req.body.pin;
  if (!TEACHER_PIN) return res.status(503).json({ error: 'Mode prof non configuré' });
  if (pin !== TEACHER_PIN) return res.status(401).json({ error: 'PIN incorrect' });
  const token = jwt.sign({ role: 'teacher' }, JWT_SECRET, { expiresIn: '24h' });
  res.json({ token });
});

router.post('/register', async (req, res) => {
  try {
    const { firstName, lastName, password } = req.body;
    if (!firstName?.trim() || !lastName?.trim()) return res.status(400).json({ error: 'Prénom et nom requis' });
    if (!password || password.length < 4) return res.status(400).json({ error: 'Mot de passe trop court (min 4 caractères)' });

    const existing = await queryOne(
      'SELECT * FROM students WHERE LOWER(first_name)=LOWER(?) AND LOWER(last_name)=LOWER(?)',
      [firstName.trim(), lastName.trim()]
    );
    if (existing) return res.status(409).json({ error: 'Un compte avec ce nom existe déjà' });

    const hash = await bcrypt.hash(password, 10);
    const id   = uuidv4();
    const now  = new Date().toISOString();
    await execute(
      'INSERT INTO students (id, first_name, last_name, password, last_seen) VALUES (?, ?, ?, ?, ?)',
      [id, firstName.trim(), lastName.trim(), hash, now]
    );
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
