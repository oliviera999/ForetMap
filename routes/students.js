const express = require('express');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { buildWorkbookBuffer, jsonRowsToAoa } = require('../lib/spreadsheet');
const { queryAll, queryOne, execute } = require('../database');
const { requireAuth, requirePermission } = require('../middleware/requireTeacher');
const { logRouteError, respondInternalError } = require('../lib/routeLog');
const asyncHandler = require('../lib/asyncHandler');
const { logAudit } = require('./audit');
const { emitStudentsChanged, emitTasksChanged } = require('../lib/realtime');
const { saveBase64ToDisk, deleteFile, getAbsolutePath, ensureDir } = require('../lib/uploads');
const { getPrimaryRoleForUser, setPrimaryRole } = require('../lib/rbac');
const { deleteStudentById } = require('../lib/studentDeletion');
const { getSettingValue, getVisitMascotSettings } = require('../lib/settings');
const logger = require('../lib/logger');
const { resolveStudentAffiliationForPersist } = require('../lib/studentAffiliation');
const {
  MAX_DESCRIPTION_LEN,
  MAX_AVATAR_BYTES,
  MAX_IMPORT_ROWS,
  PSEUDO_RE,
  EMAIL_RE,
  TEMPLATE_COLUMNS,
  normalizeVisitMascotPreference,
  asTrimmedString,
  hasOwn,
  detectAvatarExtension,
  buildImportStudentPayload,
  validateImportStudentPayload,
  resolveImportRows,
  csvEscape,
  buildTemplateWorkbookRows,
} = require('../lib/studentRouteHelpers');

const { z, validate } = require('../lib/validate');

const router = express.Router();

const { normalizeOptionalString } = require('../lib/shared/httpHelpers');

// O7 — `POST /register` : remplace la validation manuelle `if (!studentId) -> 400 'studentId requis'`.
// Le refine est au niveau racine (path vide) pour que `formatZodError` renvoie exactement
// 'studentId requis' (sans préfixe de chemin). On reproduit `if (!studentId)` (rejette
// undefined/null/''/0/false) ; les chaînes d'espaces restent acceptées ici puis sont normalisées
// par `String(studentId || '').trim()` dans le handler (qui mène à un 403, pas un 400).
const registerBodySchema = z
  .object({ studentId: z.unknown().optional() })
  .passthrough()
  .refine((body) => !!(body && body.studentId), { message: 'studentId requis' });

router.get('/import/template', requirePermission('students.import', { needsElevation: true }), asyncHandler(async (req, res) => {
  const format = asTrimmedString(req.query?.format || 'csv').toLowerCase();
  if (format === 'xlsx') {
    const aoa = jsonRowsToAoa(buildTemplateWorkbookRows(), TEMPLATE_COLUMNS);
    const buffer = await buildWorkbookBuffer([{ name: 'n3beurs', aoa }]);
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
}));

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
    });

    const affiliationResolvedRows = [];
    for (const rowItem of validRows) {
      const resolved = await resolveStudentAffiliationForPersist(rowItem.payload.affiliation, queryOne);
      if (!resolved.ok) {
        report.totals.skipped_invalid += 1;
        report.errors.push({ row: rowItem.rowNumber, field: 'affiliation', error: resolved.error });
        continue;
      }
      affiliationResolvedRows.push({
        ...rowItem,
        payload: { ...rowItem.payload, affiliation: resolved.affiliation },
      });
      if (report.preview.length < 20) {
        report.preview.push({
          row: rowItem.rowNumber,
          user_type: rowItem.payload.userType,
          first_name: rowItem.payload.firstName,
          last_name: rowItem.payload.lastName,
          affiliation: resolved.affiliation,
        });
      }
    }

    report.totals.valid = affiliationResolvedRows.length;
    if (dryRun || affiliationResolvedRows.length === 0) {
      return res.json({ report });
    }

    // Rôle primaire des comptes créés : résolu en UNE requête (au lieu d'un getRoleBySlug +
    // getPrimaryRoleForUser + INSERT par ligne via `ensurePrimaryRole`), puis assigné en UNE
    // requête multi-valeurs après la boucle. Les ids sont des UUID neufs → aucun rôle préexistant,
    // donc `INSERT IGNORE … is_primary = 1` équivaut à `ensurePrimaryRole` pour des comptes frais.
    const roleIdBySlug = new Map();
    const roleRows = await queryAll("SELECT slug, id FROM roles WHERE slug IN ('prof', 'eleve_novice')");
    for (const r of roleRows) roleIdBySlug.set(r.slug, r.id);
    const createdRoleAssignments = [];

    for (const rowItem of affiliationResolvedRows) {
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
        report.totals.created += 1;
        const roleId = roleIdBySlug.get(roleSlug);
        if (roleId != null) createdRoleAssignments.push([payload.userType, id, roleId]);
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

    // Assigne le rôle primaire de tous les comptes créés en INSERT multi-valeurs par lots
    // (au lieu d'un INSERT par compte). Le rôle inconnu (slug absent) est ignoré, comme `ensurePrimaryRole`.
    if (createdRoleAssignments.length > 0) {
      const ROLE_CHUNK = 500;
      for (let i = 0; i < createdRoleAssignments.length; i += ROLE_CHUNK) {
        const chunk = createdRoleAssignments.slice(i, i + ROLE_CHUNK);
        const placeholders = chunk.map(() => '(?, ?, ?, 1)').join(', ');
        const params = [];
        for (const [ut, uid, rid] of chunk) params.push(ut, uid, rid);
        await execute(
          `INSERT IGNORE INTO user_roles (user_type, user_id, role_id, is_primary) VALUES ${placeholders}`,
          params
        );
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
    respondInternalError(res, req, e);
  }
});

router.post('/register', requireAuth, validate({ body: registerBodySchema }), asyncHandler(async (req, res) => {
  const { studentId } = req.body;
  const askedStudentId = String(studentId || '').trim();
  const authStudentId = String(req.auth?.userType === 'student' ? req.auth.userId : '').trim();
  if (!authStudentId || authStudentId !== askedStudentId) {
    return res.status(403).json({ error: 'Session n3beur non autorisée' });
  }
  const s = await queryOne("SELECT * FROM users WHERE id = ? AND user_type = 'student'", [askedStudentId]);
  if (!s) return res.status(401).json({ error: 'Compte supprimé', deleted: true });
  await execute("UPDATE users SET last_seen = ? WHERE id = ? AND user_type = 'student'", [new Date().toISOString(), askedStudentId]);
  res.json({ ...s, password_hash: undefined });
}));

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

    const affiliation = source.affiliation || 'both';
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
    respondInternalError(res, req, e);
  }
});

router.patch('/:id/profile', requireAuth, async (req, res) => {
  try {
    const askedStudentId = String(req.params.id || '').trim();
    const auth = req.auth || null;
    const isOwner = auth?.userType === 'student' && String(auth?.userId || '') === askedStudentId;
    if (!isOwner) {
      return res.status(403).json({ error: 'Modification de profil non autorisée' });
    }
    const body = req.body || {};
    if (!body.currentPassword) return res.status(400).json({ error: 'Mot de passe actuel requis' });

    const student = await queryOne("SELECT * FROM users WHERE id = ? AND user_type = 'student'", [askedStudentId]);
    if (!student) return res.status(404).json({ error: 'n3beur introuvable' });
    if (!student.password_hash) return res.status(401).json({ error: 'Ce compte n\'a pas de mot de passe. Contactez le prof.' });

    const passwordOk = await bcrypt.compare(String(body.currentPassword), student.password_hash);
    if (!passwordOk) return res.status(401).json({ error: 'Mot de passe actuel incorrect' });

    const hasPseudo = hasOwn(body, 'pseudo');
    const hasEmail = hasOwn(body, 'email') || hasOwn(body, 'mail');
    const hasDescription = hasOwn(body, 'description');
    const hasAffiliation = hasOwn(body, 'affiliation');
    const hasVisitMascotCatalogId = hasOwn(body, 'visit_mascot_catalog_id');
    const hasAvatarData = hasOwn(body, 'avatarData');
    const removeAvatar = !!body.removeAvatar;
    if (!hasPseudo && !hasEmail && !hasDescription && !hasAffiliation && !hasVisitMascotCatalogId && !hasAvatarData && !removeAvatar) {
      return res.status(400).json({ error: 'Aucun champ de profil à mettre à jour' });
    }

    const pseudo = hasPseudo ? normalizeOptionalString(body.pseudo) : student.pseudo;
    const email = hasEmail ? normalizeOptionalString(body.email ?? body.mail) : student.email;
    const description = hasDescription ? normalizeOptionalString(body.description) : student.description;
    let affiliation;
    if (hasAffiliation) {
      const affRes = await resolveStudentAffiliationForPersist(body.affiliation, queryOne);
      if (!affRes.ok) return res.status(400).json({ error: affRes.error });
      affiliation = affRes.affiliation;
    } else {
      affiliation = student.affiliation || 'both';
    }
    let visitMascotCatalogId = hasVisitMascotCatalogId
      ? normalizeVisitMascotPreference(body.visit_mascot_catalog_id)
      : normalizeVisitMascotPreference(student.visit_mascot_catalog_id);
    if (hasVisitMascotCatalogId && visitMascotCatalogId) {
      const { allowedIds } = await getVisitMascotSettings();
      if (!allowedIds.includes(visitMascotCatalogId)) {
        return res.status(400).json({ error: 'Mascotte indisponible pour la visite' });
      }
    }
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
        "UPDATE users SET pseudo = ?, email = ?, description = ?, avatar_path = ?, affiliation = ?, visit_mascot_catalog_id = ?, display_name = TRIM(CONCAT(COALESCE(first_name,''), ' ', COALESCE(last_name,''))) WHERE id = ? AND user_type = 'student'",
        [pseudo, email, description, avatarPath, affiliation, visitMascotCatalogId, student.id]
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
      payload: {
        pseudo: !!hasPseudo,
        email: !!hasEmail,
        description: !!hasDescription,
        affiliation: !!hasAffiliation,
        visit_mascot_catalog_id: !!hasVisitMascotCatalogId,
        avatar: !!(hasAvatarData || removeAvatar),
      },
    });
    emitStudentsChanged({ reason: 'student_profile_update', studentId: student.id });
    res.json({ ...updated, password_hash: undefined });
  } catch (e) {
    respondInternalError(res, req, e);
  }
});

router.delete('/:id', requirePermission('students.delete', { needsElevation: true }), asyncHandler(async (req, res) => {
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
}));

module.exports = router;
// Exporté pour le test no-DB du contrat de validation O7.
module.exports.registerBodySchema = registerBodySchema;
