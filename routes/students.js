const express = require('express');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const XLSX = require('xlsx');
const { queryAll, queryOne, execute } = require('../database');
const { requirePermission } = require('../middleware/requireTeacher');
const { logRouteError } = require('../lib/routeLog');
const { logAudit } = require('./audit');
const { emitStudentsChanged, emitTasksChanged } = require('../lib/realtime');
const { saveBase64ToDisk, deleteFile, getAbsolutePath, ensureDir } = require('../lib/uploads');
const { ensurePrimaryRole, getPrimaryRoleForUser, setPrimaryRole } = require('../lib/rbac');
const { deleteStudentById } = require('../lib/studentDeletion');
const { getSettingValue } = require('../lib/settings');
const logger = require('../lib/logger');

const router = express.Router();
const MAX_DESCRIPTION_LEN = 300;
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const MAX_IMPORT_FILE_BYTES = 8 * 1024 * 1024;
const MAX_IMPORT_ROWS = 1000;
const PSEUDO_RE = /^[A-Za-z0-9_.-]{3,30}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALLOWED_STUDENT_AFFILIATIONS = new Set(['n3', 'foret', 'both']);
const TEMPLATE_COLUMNS = [
  'Rôle',
  'Prénom',
  'Nom',
  'Mot de passe',
  'Affiliation (n3|foret|both)',
  'Pseudo (optionnel)',
  'Email (optionnel)',
  'Description (optionnel)',
];

const ALLOWED_IMPORT_USER_TYPES = new Set(['student', 'teacher']);

const IMPORT_HEADER_ALIASES = new Map([
  ['role', 'userType'],
  ['rôle', 'userType'],
  ['profil', 'userType'],
  ['type', 'userType'],
  ['user_type', 'userType'],
  ['utilisateur_type', 'userType'],
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
  ['affiliation', 'affiliation'],
  ['affiliation_n3_foret_both', 'affiliation'],
  ['espace', 'affiliation'],
  ['mon_espace', 'affiliation'],
  ['zone', 'affiliation'],
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

function normalizeImportUserType(value) {
  const raw = normalizeOptionalString(value);
  if (!raw) return 'student';
  const normalized = raw.toLowerCase();
  if (['eleve', 'élève', 'n3beur', 'n3beurs', 'student', 'students'].includes(normalized)) return 'student';
  if (['prof', 'professeur', 'n3boss', 'teacher', 'teachers'].includes(normalized)) return 'teacher';
  return null;
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
    userType: normalizeImportUserType(mapped.userType),
    firstName: asTrimmedString(mapped.firstName),
    lastName: asTrimmedString(mapped.lastName),
    password: asTrimmedString(mapped.password),
    affiliation: normalizeStudentAffiliation(mapped.affiliation),
    pseudo: normalizeOptionalString(mapped.pseudo),
    email: normalizeOptionalString(mapped.email),
    description: normalizeOptionalString(mapped.description),
  };
}

function validateImportStudentPayload(payload, rowNumber) {
  const errors = [];
  if (!payload.userType || !ALLOWED_IMPORT_USER_TYPES.has(payload.userType)) {
    errors.push({ row: rowNumber, field: 'userType', error: "Rôle invalide (n3beur/n3boss)" });
  }
  if (!payload.firstName) errors.push({ row: rowNumber, field: 'firstName', error: 'Prénom requis' });
  if (!payload.lastName) errors.push({ row: rowNumber, field: 'lastName', error: 'Nom requis' });
  if (!payload.password) {
    errors.push({ row: rowNumber, field: 'password', error: 'Mot de passe requis' });
  } else if (payload.password.length < 4) {
    errors.push({ row: rowNumber, field: 'password', error: 'Mot de passe trop court (min 4 caractères)' });
  }
  if (!payload.affiliation) {
    errors.push({ row: rowNumber, field: 'affiliation', error: "Affiliation invalide (n3, foret ou both)" });
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
    [TEMPLATE_COLUMNS[0]]: 'eleve',
    [TEMPLATE_COLUMNS[1]]: 'Exemple',
    [TEMPLATE_COLUMNS[2]]: 'Eleve',
    [TEMPLATE_COLUMNS[3]]: 'azerty123',
    [TEMPLATE_COLUMNS[4]]: 'both',
    [TEMPLATE_COLUMNS[5]]: 'exemple_eleve',
    [TEMPLATE_COLUMNS[6]]: 'exemple.eleve@lyautey.ma',
    [TEMPLATE_COLUMNS[7]]: 'Remplacer ou supprimer cette ligne avant import.',
  }];
}

router.get('/import/template', requirePermission('students.import', { needsElevation: true }), async (req, res) => {
  try {
    const format = asTrimmedString(req.query?.format || 'csv').toLowerCase();
    if (format === 'xlsx') {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(buildTemplateWorkbookRows(), { header: TEMPLATE_COLUMNS });
      XLSX.utils.book_append_sheet(wb, ws, 'n3beurs');
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="foretmap-modele-n3beurs.xlsx"');
      return res.send(buffer);
    }
    if (format !== 'csv') {
      return res.status(400).json({ error: 'Format invalide (csv ou xlsx)' });
    }

    const BOM = '\uFEFF';
    const line = TEMPLATE_COLUMNS.map(csvEscape).join(';');
    const sampleRow = [
      'eleve',
      'Exemple',
      'Eleve',
      'azerty123',
      'both',
      'exemple_eleve',
      'exemple.eleve@lyautey.ma',
      'Remplacer ou supprimer cette ligne avant import.',
    ].map(csvEscape).join(';');
    const csv = `${BOM}${line}\r\n${sampleRow}\r\n`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="foretmap-modele-n3beurs.csv"');
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

    const existingUsers = await queryAll("SELECT id, user_type, first_name, last_name, pseudo, email FROM users WHERE user_type IN ('student', 'teacher')");
    const existingByName = new Map(existingUsers.map((u) => [`${asTrimmedString(u.user_type).toLowerCase()}|${asTrimmedString(u.first_name).toLowerCase()}|${asTrimmedString(u.last_name).toLowerCase()}`, u]));
    const pseudoSet = new Set(existingUsers.map((u) => asTrimmedString(u.pseudo).toLowerCase()).filter(Boolean));
    const emailSet = new Set(existingUsers.map((u) => asTrimmedString(u.email).toLowerCase()).filter(Boolean));
    const seenName = new Set();

    const validRows = [];
    rawRows.forEach((row, idx) => {
      const rowNumber = idx + 2;
      const payload = buildImportStudentPayload(row);
      const errors = validateImportStudentPayload(payload, rowNumber);

      const keyByName = `${payload.userType}|${payload.firstName.toLowerCase()}|${payload.lastName.toLowerCase()}`;
      if (!errors.length && seenName.has(keyByName)) {
        errors.push({ row: rowNumber, field: 'name', error: 'Doublon dans le fichier (rôle + prénom + nom)' });
      }
      if (!errors.length && existingByName.has(keyByName)) {
        report.totals.skipped_existing += 1;
        report.errors.push({ row: rowNumber, field: 'name', error: 'Utilisateur déjà existant (rôle + prénom + nom)' });
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
          user_type: payload.userType,
          first_name: payload.firstName,
          last_name: payload.lastName,
          affiliation: payload.affiliation,
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
      const roleSlug = payload.userType === 'teacher' ? 'prof' : 'eleve_novice';
      try {
        await execute(
          `INSERT INTO users
            (id, user_type, legacy_user_id, email, pseudo, first_name, last_name, display_name, description, avatar_path, affiliation, password_hash, auth_provider, is_active, last_seen, created_at, updated_at)
           VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, NULL, ?, ?, 'local', 1, ?, NOW(), NOW())`,
          [id, payload.userType, payload.email, payload.pseudo, payload.firstName, payload.lastName, `${payload.firstName} ${payload.lastName}`.trim(), payload.description, payload.affiliation, hash, now]
        );
        await ensurePrimaryRole(payload.userType, id, roleSlug);
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
      logAudit('students_import', 'student', null, `Import de ${report.totals.created} n3beur(s)`, {
        req,
        payload: { report: report.totals },
      });
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
    const s = await queryOne("SELECT * FROM users WHERE id = ? AND user_type = 'student'", [studentId]);
    if (!s) return res.status(401).json({ error: 'Compte supprimé', deleted: true });
    await execute("UPDATE users SET last_seen = ? WHERE id = ? AND user_type = 'student'", [new Date().toISOString(), studentId]);
    res.json({ ...s, password_hash: undefined });
  } catch (e) {
    logRouteError(e, req);
    res.status(500).json({ error: e.message });
  }
});

async function getPasswordMinLength() {
  const n = await getSettingValue('security.password_min_length', 4);
  const parsed = parseInt(n, 10);
  if (!Number.isFinite(parsed)) return 4;
  return Math.min(Math.max(parsed, 4), 32);
}

router.post('/:id/duplicate', requirePermission('users.create', { needsElevation: true }), async (req, res) => {
  try {
    const sourceId = req.params.id;
    const source = await queryOne("SELECT * FROM users WHERE id = ? AND user_type = 'student'", [sourceId]);
    if (!source) return res.status(404).json({ error: 'n3beur introuvable' });

    const body = req.body || {};
    const firstName = normalizeOptionalString(body.first_name);
    const lastName = normalizeOptionalString(body.last_name);
    const password = String(body.password || '');
    const pseudo = hasOwn(body, 'pseudo') ? normalizeOptionalString(body.pseudo) : null;
    const email = hasOwn(body, 'email') || hasOwn(body, 'mail')
      ? normalizeOptionalString(body.email ?? body.mail)
      : null;
    const copyAvatar = body.copy_avatar !== false;

    if (!firstName || !lastName) {
      return res.status(400).json({ error: 'Prénom et nom du nouveau compte requis' });
    }
    const minPasswordLen = await getPasswordMinLength();
    if (!password || password.length < minPasswordLen) {
      return res.status(400).json({ error: `Mot de passe trop court (min ${minPasswordLen} caractères)` });
    }
    if (pseudo != null && !PSEUDO_RE.test(pseudo)) {
      return res.status(400).json({ error: 'Pseudo invalide (3-30 caractères, lettres/chiffres/._-)' });
    }
    if (email != null && !EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'Email invalide' });
    }

    const existingByName = await queryOne(
      "SELECT id FROM users WHERE user_type = 'student' AND LOWER(first_name)=LOWER(?) AND LOWER(last_name)=LOWER(?) LIMIT 1",
      [firstName, lastName]
    );
    if (existingByName) return res.status(409).json({ error: 'Un n3beur avec ce nom existe déjà' });
    if (pseudo) {
      const existingPseudo = await queryOne('SELECT id FROM users WHERE LOWER(pseudo)=LOWER(?) LIMIT 1', [pseudo]);
      if (existingPseudo) return res.status(409).json({ error: 'Ce pseudo est déjà utilisé' });
    }
    if (email) {
      const existingEmail = await queryOne('SELECT id FROM users WHERE LOWER(email)=LOWER(?) LIMIT 1', [email]);
      if (existingEmail) return res.status(409).json({ error: 'Cet email est déjà utilisé' });
    }

    const primary = await getPrimaryRoleForUser('student', source.id);
    let roleId = primary?.id;
    if (!roleId) {
      const novice = await queryOne("SELECT id FROM roles WHERE slug = 'eleve_novice' LIMIT 1");
      roleId = novice?.id;
    }
    if (!roleId) {
      logRouteError(new Error('Profil RBAC introuvable (eleve_novice)'), req);
      return res.status(500).json({ error: 'Profil RBAC introuvable' });
    }

    const affiliation = normalizeStudentAffiliation(source.affiliation) || 'both';
    const description = normalizeOptionalString(source.description);

    const newId = uuidv4();
    const hash = await bcrypt.hash(password, 10);
    const now = new Date().toISOString();
    let avatarPath = null;

    if (copyAvatar && source.avatar_path) {
      try {
        const srcAbs = getAbsolutePath(source.avatar_path);
        if (fs.existsSync(srcAbs)) {
          const ext = path.extname(source.avatar_path) || '.jpg';
          const relativePath = `students/${newId}/avatar-${Date.now()}${ext}`;
          const destAbs = getAbsolutePath(relativePath);
          ensureDir(path.dirname(destAbs));
          fs.copyFileSync(srcAbs, destAbs);
          avatarPath = relativePath;
        }
      } catch (err) {
        logger.warn({ err, sourceId, newId }, 'Duplication avatar élève ignorée');
      }
    }

    try {
      await execute(
        `INSERT INTO users
          (id, user_type, legacy_user_id, email, pseudo, first_name, last_name, display_name, description, avatar_path, affiliation, password_hash, auth_provider, is_active, last_seen, created_at, updated_at)
         VALUES (?, 'student', NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'local', 1, ?, NOW(), NOW())`,
        [newId, email, pseudo, firstName, lastName, `${firstName} ${lastName}`.trim(), description, avatarPath, affiliation, hash, now]
      );
    } catch (err) {
      if (err && (err.errno === 1062 || err.code === 'ER_DUP_ENTRY')) {
        return res.status(409).json({ error: 'Pseudo, email ou identité déjà utilisé(e)' });
      }
      throw err;
    }

    await setPrimaryRole('student', newId, roleId);

    const created = await queryOne("SELECT * FROM users WHERE id = ? AND user_type = 'student'", [newId]);
    const roleRow = await queryOne('SELECT slug, display_name FROM roles WHERE id = ? LIMIT 1', [roleId]);
    logAudit('duplicate_student', 'student', newId, `${firstName} ${lastName}`, {
      req,
      payload: { source_student_id: sourceId, role_slug: roleRow?.slug },
    });
    emitStudentsChanged({ reason: 'duplicate_student', studentId: newId });
    res.status(201).json({
      ...created,
      password_hash: undefined,
      role_slug: roleRow?.slug,
      role_display_name: roleRow?.display_name,
      source_student_id: sourceId,
    });
  } catch (e) {
    logRouteError(e, req);
    res.status(500).json({ error: e.message });
  }
});

router.patch('/:id/profile', async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.currentPassword) return res.status(400).json({ error: 'Mot de passe actuel requis' });

    const student = await queryOne("SELECT * FROM users WHERE id = ? AND user_type = 'student'", [req.params.id]);
    if (!student) return res.status(404).json({ error: 'n3beur introuvable' });
    if (!student.password_hash) return res.status(401).json({ error: 'Ce compte n\'a pas de mot de passe. Contactez le prof.' });

    const passwordOk = await bcrypt.compare(String(body.currentPassword), student.password_hash);
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
        "SELECT id FROM users WHERE user_type = 'student' AND LOWER(pseudo)=LOWER(?) AND id <> ?",
        [pseudo, student.id]
      );
      if (existingPseudo) return res.status(409).json({ error: 'Ce pseudo est déjà utilisé' });
    }
    if (email) {
      const existingEmail = await queryOne(
        "SELECT id FROM users WHERE user_type = 'student' AND LOWER(email)=LOWER(?) AND id <> ?",
        [email, student.id]
      );
      if (existingEmail) return res.status(409).json({ error: 'Cet email est déjà utilisé' });
    }

    try {
      await execute(
        "UPDATE users SET pseudo = ?, email = ?, description = ?, avatar_path = ?, affiliation = ?, display_name = TRIM(CONCAT(COALESCE(first_name,''), ' ', COALESCE(last_name,''))) WHERE id = ? AND user_type = 'student'",
        [pseudo, email, description, avatarPath, affiliation, student.id]
      );
    } catch (err) {
      if (err && (err.errno === 1062 || err.code === 'ER_DUP_ENTRY')) {
        return res.status(409).json({ error: 'Pseudo ou email déjà utilisé' });
      }
      throw err;
    }
    const updated = await queryOne("SELECT * FROM users WHERE id = ? AND user_type = 'student'", [student.id]);
    logAudit('update_student_profile', 'student', student.id, `${student.first_name} ${student.last_name}`, {
      req,
      actorUserType: 'student',
      actorUserId: student.id,
      payload: { pseudo: !!hasPseudo, email: !!hasEmail, description: !!hasDescription, affiliation: !!hasAffiliation, avatar: !!(hasAvatarData || removeAvatar) },
    });
    emitStudentsChanged({ reason: 'student_profile_update', studentId: student.id });
    res.json({ ...updated, password_hash: undefined });
  } catch (e) {
    logRouteError(e, req);
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', requirePermission('students.delete', { needsElevation: true }), async (req, res) => {
  try {
    const result = await deleteStudentById(req.params.id);
    if (!result.ok) {
      if (result.reason === 'not_found' || result.reason === 'missing_id') {
        return res.status(404).json({ error: 'n3beur introuvable' });
      }
      return res.status(400).json({ error: 'Suppression impossible' });
    }
    logAudit('delete_student', 'student', result.studentId, result.displayName, {
      req,
      payload: { affected_tasks: result.affectedTaskIds.length },
    });
    emitStudentsChanged({ reason: 'delete_student', studentId: result.studentId });
    if (result.affectedTaskIds && result.affectedTaskIds.length > 0) {
      const mapIds = Array.isArray(result.affectedMapIds) ? result.affectedMapIds : [];
      if (mapIds.length > 0) {
        for (const mapId of mapIds) {
          emitTasksChanged({
            reason: 'delete_student_assignments',
            studentId: result.studentId,
            mapId,
          });
        }
      } else {
        emitTasksChanged({ reason: 'delete_student_assignments', studentId: result.studentId });
      }
    }
    res.json({ success: true });
  } catch (e) {
    logRouteError(e, req);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
