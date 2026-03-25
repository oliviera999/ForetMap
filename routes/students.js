const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const XLSX = require('xlsx');
const { queryAll, queryOne, execute } = require('../database');
const { requirePermission } = require('../middleware/requireTeacher');
const { logRouteError } = require('../lib/routeLog');
const { logAudit } = require('./audit');
const { emitStudentsChanged, emitTasksChanged } = require('../lib/realtime');
const { saveBase64ToDisk, deleteFile } = require('../lib/uploads');

const router = express.Router();
const MAX_DESCRIPTION_LEN = 300;
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const MAX_IMPORT_FILE_BYTES = 8 * 1024 * 1024;
const MAX_IMPORT_ROWS = 1000;
const PSEUDO_RE = /^[A-Za-z0-9_.-]{3,30}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALLOWED_STUDENT_AFFILIATIONS = new Set(['n3', 'foret', 'both']);
const TEMPLATE_COLUMNS = [
  'Prénom',
  'Nom',
  'Mot de passe',
  'Pseudo (optionnel)',
  'Email (optionnel)',
  'Description (optionnel)',
];

const IMPORT_HEADER_ALIASES = new Map([
  ['prenom', 'firstName'],
  ['prénom', 'firstName'],
  ['first_name', 'firstName'],
  ['firstname', 'firstName'],
  ['first', 'firstName'],
  ['nom', 'lastName'],
  ['last_name', 'lastName'],
  ['lastname', 'lastName'],
  ['last', 'lastName'],
  ['mot_de_passe', 'password'],
  ['motdepasse', 'password'],
  ['mdp', 'password'],
  ['password', 'password'],
  ['pass', 'password'],
  ['pseudo', 'pseudo'],
  ['pseudo_optionnel', 'pseudo'],
  ['email', 'email'],
  ['mail', 'email'],
  ['email_optionnel', 'email'],
  ['description', 'description'],
  ['description_optionnel', 'description'],
]);

function normalizeOptionalString(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length > 0 ? s : null;
}

function asTrimmedString(value) {
  if (value == null) return '';
  return String(value).trim();
}

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj || {}, key);
}

function normalizeStudentAffiliation(value) {
  const raw = normalizeOptionalString(value);
  if (!raw) return 'both';
  const normalized = raw.toLowerCase();
  if (!ALLOWED_STUDENT_AFFILIATIONS.has(normalized)) return null;
  return normalized;
}

function detectAvatarExtension(dataUrl) {
  const m = /^data:image\/(png|jpe?g|webp);base64,/i.exec(dataUrl || '');
  if (!m) return null;
  const raw = String(m[1]).toLowerCase();
  return raw === 'jpeg' ? 'jpg' : raw;
}

function normalizeImportHeader(value) {
  return asTrimmedString(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function parseWorkbookRowsFromBuffer(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer', raw: false, cellDates: false });
  const first = wb.SheetNames[0];
  if (!first) return [];
  const ws = wb.Sheets[first];
  return XLSX.utils.sheet_to_json(ws, { defval: '', raw: false, blankrows: false });
}

function parseCsvLine(line, delimiter) {
  const cells = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (!inQuotes && char === delimiter) {
      cells.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  cells.push(current);
  return cells;
}

function parseCsvRowsFromBuffer(buffer) {
  const text = buffer.toString('utf8').replace(/^\uFEFF/, '').replace(/\r/g, '');
  const lines = text.split('\n').filter((line) => line.trim().length > 0);
  if (lines.length < 2) return [];

  const delimiter = (lines[0].split(';').length >= lines[0].split(',').length) ? ';' : ',';
  const headers = parseCsvLine(lines[0], delimiter).map((h) => asTrimmedString(h));
  const rows = [];

  for (let i = 1; i < lines.length; i += 1) {
    const cells = parseCsvLine(lines[i], delimiter);
    const row = {};
    headers.forEach((header, idx) => {
      row[header] = idx < cells.length ? cells[idx] : '';
    });
    rows.push(row);
  }
  return rows;
}

function mapImportRowToStudentShape(row = {}) {
  const mapped = {};
  for (const [key, value] of Object.entries(row)) {
    const normalized = normalizeImportHeader(key);
    const target = IMPORT_HEADER_ALIASES.get(normalized);
    if (!target) continue;
    mapped[target] = value;
  }
  return mapped;
}

function buildImportStudentPayload(row = {}) {
  const mapped = mapImportRowToStudentShape(row);
  return {
    firstName: asTrimmedString(mapped.firstName),
    lastName: asTrimmedString(mapped.lastName),
    password: asTrimmedString(mapped.password),
    pseudo: normalizeOptionalString(mapped.pseudo),
    email: normalizeOptionalString(mapped.email),
    description: normalizeOptionalString(mapped.description),
  };
}

function validateImportStudentPayload(payload, rowNumber) {
  const errors = [];
  if (!payload.firstName) errors.push({ row: rowNumber, field: 'firstName', error: 'Prénom requis' });
  if (!payload.lastName) errors.push({ row: rowNumber, field: 'lastName', error: 'Nom requis' });
  if (!payload.password) {
    errors.push({ row: rowNumber, field: 'password', error: 'Mot de passe requis' });
  } else if (payload.password.length < 4) {
    errors.push({ row: rowNumber, field: 'password', error: 'Mot de passe trop court (min 4 caractères)' });
  }
  if (payload.pseudo != null && !PSEUDO_RE.test(payload.pseudo)) {
    errors.push({ row: rowNumber, field: 'pseudo', error: 'Pseudo invalide (3-30 caractères, lettres/chiffres/._-)' });
  }
  if (payload.email != null && !EMAIL_RE.test(payload.email)) {
    errors.push({ row: rowNumber, field: 'email', error: 'Email invalide' });
  }
  if (payload.description != null && payload.description.length > MAX_DESCRIPTION_LEN) {
    errors.push({ row: rowNumber, field: 'description', error: `Description trop longue (max ${MAX_DESCRIPTION_LEN} caractères)` });
  }
  return errors;
}

async function resolveImportRows(body = {}) {
  const fileDataBase64 = asTrimmedString(body.fileDataBase64);
  if (!fileDataBase64) throw new Error('Fichier requis');
  const raw = fileDataBase64.includes(',') ? fileDataBase64.split(',')[1] : fileDataBase64;
  const buffer = Buffer.from(raw, 'base64');
  if (!buffer || buffer.length === 0) throw new Error('Fichier import vide');
  if (buffer.length > MAX_IMPORT_FILE_BYTES) throw new Error('Fichier import trop volumineux (max 8 Mo)');

  const fileName = asTrimmedString(body.fileName).toLowerCase();
  if (fileName.endsWith('.csv')) return parseCsvRowsFromBuffer(buffer);
  return parseWorkbookRowsFromBuffer(buffer);
}

function csvEscape(value) {
  const s = String(value ?? '');
  return s.includes(';') || s.includes('"') || s.includes('\n')
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}

function buildTemplateWorkbookRows() {
  return [{
    [TEMPLATE_COLUMNS[0]]: 'Exemple',
    [TEMPLATE_COLUMNS[1]]: 'Eleve',
    [TEMPLATE_COLUMNS[2]]: 'azerty123',
    [TEMPLATE_COLUMNS[3]]: 'exemple_eleve',
    [TEMPLATE_COLUMNS[4]]: 'exemple.eleve@lyautey.ma',
    [TEMPLATE_COLUMNS[5]]: 'Remplacer ou supprimer cette ligne avant import.',
  }];
}

router.get('/import/template', requirePermission('students.import', { needsElevation: true }), async (req, res) => {
  try {
    const format = asTrimmedString(req.query?.format || 'csv').toLowerCase();
    if (format === 'xlsx') {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(buildTemplateWorkbookRows(), { header: TEMPLATE_COLUMNS });
      XLSX.utils.book_append_sheet(wb, ws, 'eleves');
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="foretmap-modele-eleves.xlsx"');
      return res.send(buffer);
    }
    if (format !== 'csv') {
      return res.status(400).json({ error: 'Format invalide (csv ou xlsx)' });
    }

    const BOM = '\uFEFF';
    const line = TEMPLATE_COLUMNS.map(csvEscape).join(';');
    const sampleRow = [
      'Exemple',
      'Eleve',
      'azerty123',
      'exemple_eleve',
      'exemple.eleve@lyautey.ma',
      'Remplacer ou supprimer cette ligne avant import.',
    ].map(csvEscape).join(';');
    const csv = `${BOM}${line}\r\n${sampleRow}\r\n`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="foretmap-modele-eleves.csv"');
    res.send(csv);
  } catch (e) {
    logRouteError(e, req);
    res.status(500).json({ error: e.message });
  }
});

router.post('/import', requirePermission('students.import', { needsElevation: true }), async (req, res) => {
  try {
    const dryRun = !!req.body?.dryRun;
    const rawRows = await resolveImportRows(req.body || {});
    if (!Array.isArray(rawRows) || rawRows.length === 0) {
      return res.status(400).json({ error: 'Aucune ligne importable détectée' });
    }
    if (rawRows.length > MAX_IMPORT_ROWS) {
      return res.status(400).json({ error: `Import limité à ${MAX_IMPORT_ROWS} lignes` });
    }

    const report = {
      dryRun,
      totals: {
        received: rawRows.length,
        valid: 0,
        created: 0,
        skipped_existing: 0,
        skipped_invalid: 0,
      },
      preview: [],
      errors: [],
    };

    const existingStudents = await queryAll('SELECT id, first_name, last_name, pseudo, email FROM students');
    const existingByName = new Map(existingStudents.map((s) => [`${asTrimmedString(s.first_name).toLowerCase()}|${asTrimmedString(s.last_name).toLowerCase()}`, s]));
    const pseudoSet = new Set(existingStudents.map((s) => asTrimmedString(s.pseudo).toLowerCase()).filter(Boolean));
    const emailSet = new Set(existingStudents.map((s) => asTrimmedString(s.email).toLowerCase()).filter(Boolean));
    const seenName = new Set();

    const validRows = [];
    rawRows.forEach((row, idx) => {
      const rowNumber = idx + 2;
      const payload = buildImportStudentPayload(row);
      const errors = validateImportStudentPayload(payload, rowNumber);

      const keyByName = `${payload.firstName.toLowerCase()}|${payload.lastName.toLowerCase()}`;
      if (!errors.length && seenName.has(keyByName)) {
        errors.push({ row: rowNumber, field: 'name', error: 'Doublon dans le fichier (prénom + nom)' });
      }
      if (!errors.length && existingByName.has(keyByName)) {
        report.totals.skipped_existing += 1;
        report.errors.push({ row: rowNumber, field: 'name', error: 'Élève déjà existant (prénom + nom)' });
        return;
      }

      if (!errors.length && payload.pseudo && pseudoSet.has(payload.pseudo.toLowerCase())) {
        errors.push({ row: rowNumber, field: 'pseudo', error: 'Pseudo déjà utilisé' });
      }
      if (!errors.length && payload.email && emailSet.has(payload.email.toLowerCase())) {
        errors.push({ row: rowNumber, field: 'email', error: 'Email déjà utilisé' });
      }

      if (errors.length > 0) {
        report.totals.skipped_invalid += 1;
        report.errors.push(...errors);
        return;
      }

      seenName.add(keyByName);
      if (payload.pseudo) pseudoSet.add(payload.pseudo.toLowerCase());
      if (payload.email) emailSet.add(payload.email.toLowerCase());

      validRows.push({ payload, rowNumber });
      if (report.preview.length < 20) {
        report.preview.push({
          row: rowNumber,
          first_name: payload.firstName,
          last_name: payload.lastName,
        });
      }
    });

    report.totals.valid = validRows.length;
    if (dryRun || validRows.length === 0) {
      return res.json({ report });
    }

    for (const rowItem of validRows) {
      const { payload, rowNumber } = rowItem;
      const hash = await bcrypt.hash(payload.password, 10);
      const id = uuidv4();
      const now = new Date().toISOString();
      try {
        await execute(
          'INSERT INTO students (id, first_name, last_name, pseudo, email, description, avatar_path, password, last_seen) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [id, payload.firstName, payload.lastName, payload.pseudo, payload.email, payload.description, null, hash, now]
        );
        report.totals.created += 1;
      } catch (err) {
        if (err && (err.errno === 1062 || err.code === 'ER_DUP_ENTRY')) {
          report.totals.skipped_existing += 1;
          report.errors.push({
            row: rowNumber,
            field: 'unique',
            error: `Conflit d'unicité pour ${payload.firstName} ${payload.lastName}`,
          });
          continue;
        }
        throw err;
      }
    }

    if (report.totals.created > 0) {
      emitStudentsChanged({ reason: 'students_import', created: report.totals.created });
    }
    res.json({ report });
  } catch (e) {
    logRouteError(e, req);
    res.status(500).json({ error: e.message });
  }
});

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
    const hasAffiliation = hasOwn(body, 'affiliation');
    const hasAvatarData = hasOwn(body, 'avatarData');
    const removeAvatar = !!body.removeAvatar;
    if (!hasPseudo && !hasEmail && !hasDescription && !hasAffiliation && !hasAvatarData && !removeAvatar) {
      return res.status(400).json({ error: 'Aucun champ de profil à mettre à jour' });
    }

    const pseudo = hasPseudo ? normalizeOptionalString(body.pseudo) : student.pseudo;
    const email = hasEmail ? normalizeOptionalString(body.email ?? body.mail) : student.email;
    const description = hasDescription ? normalizeOptionalString(body.description) : student.description;
    const affiliation = hasAffiliation
      ? normalizeStudentAffiliation(body.affiliation)
      : (normalizeStudentAffiliation(student.affiliation) || 'both');
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
    if (!affiliation) {
      return res.status(400).json({ error: "Affiliation invalide (n3, foret ou both)" });
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
        'UPDATE students SET pseudo = ?, email = ?, description = ?, avatar_path = ?, affiliation = ? WHERE id = ?',
        [pseudo, email, description, avatarPath, affiliation, student.id]
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

router.delete('/:id', requirePermission('students.delete', { needsElevation: true }), async (req, res) => {
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
