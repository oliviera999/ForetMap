const express = require('express');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const crypto = require('node:crypto');
const { buildWorkbookBuffer, jsonRowsToAoa } = require('../lib/spreadsheet');
const { queryAll, queryOne, execute } = require('../database');
const { requireAuth, requirePermission } = require('../middleware/requireTeacher');
const { logRouteError, respondInternalError } = require('../lib/routeLog');
const asyncHandler = require('../lib/asyncHandler');
const { logAudit } = require('./audit');
const { emitStudentsChanged, emitTasksChanged } = require('../lib/realtime');
const { getAbsolutePath, ensureDir } = require('../lib/uploads');
const { getPrimaryRoleForUser, setPrimaryRole } = require('../lib/rbac');
const { deleteStudentById } = require('../lib/studentDeletion');
const { getPasswordMinLength } = require('../lib/passwordReset');
const logger = require('../lib/logger');
const { resolveStudentAffiliationForPersist } = require('../lib/studentAffiliation');
const {
  MAX_DESCRIPTION_LEN,
  MAX_IMPORT_ROWS,
  PSEUDO_RE,
  EMAIL_RE,
  TEMPLATE_COLUMNS,
  asTrimmedString,
  hasOwn,
  buildImportStudentPayload,
  validateImportStudentPayload,
  resolveImportRows,
  csvEscape,
  buildTemplateWorkbookRows,
} = require('../lib/studentRouteHelpers');

const { z, validate } = require('../lib/validate');
const {
  readProfileFieldFlags,
  resolveVisitMascotUpdate,
  applyAvatarUpdate,
  findProfileUniquenessConflict,
  isDuplicateEntryError,
} = require('../lib/profileUpdate');

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

// O7 — `GET /import/template` : remplace la validation manuelle du paramètre `format`.
// Reproduit exactement `asTrimmedString(req.query?.format || 'csv').toLowerCase()` (falsy → 'csv',
// trim + lowercase) puis l'aiguillage `xlsx` / `csv` / sinon 400 'Format invalide (csv ou xlsx)'.
// Le refine est au niveau racine pour que `formatZodError` renvoie le message exact sans préfixe
// de chemin (comme l'ancien `res.status(400).json({ error: 'Format invalide (csv ou xlsx)' })`).
const importTemplateQuerySchema = z
  .object({ format: z.unknown().optional() })
  .transform((q) => ({ format: asTrimmedString(q.format || 'csv').toLowerCase() }))
  .refine((q) => q.format === 'csv' || q.format === 'xlsx', {
    message: 'Format invalide (csv ou xlsx)',
  });

router.get(
  '/import/template',
  requirePermission('students.import'),
  validate({ query: importTemplateQuerySchema }),
  asyncHandler(async (req, res) => {
    const format = req.validatedQuery.format;
    if (format === 'xlsx') {
      const aoa = jsonRowsToAoa(buildTemplateWorkbookRows(), TEMPLATE_COLUMNS);
      const buffer = await buildWorkbookBuffer([{ name: 'n3beurs', aoa }]);
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader('Content-Disposition', 'attachment; filename="foretmap-modele-n3beurs.xlsx"');
      return res.send(buffer);
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
    ]
      .map(csvEscape)
      .join(';');
    const csv = `${BOM}${line}\r\n${sampleRow}\r\n`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="foretmap-modele-n3beurs.csv"');
    res.send(csv);
  }),
);

router.post('/import', requirePermission('students.import'), async (req, res) => {
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

    const existingUsers = await queryAll(
      "SELECT id, user_type, first_name, last_name, pseudo, email FROM users WHERE user_type IN ('student', 'teacher')",
    );
    const existingByName = new Map(
      existingUsers.map((u) => [
        `${asTrimmedString(u.user_type).toLowerCase()}|${asTrimmedString(u.first_name).toLowerCase()}|${asTrimmedString(u.last_name).toLowerCase()}`,
        u,
      ]),
    );
    const pseudoSet = new Set(
      existingUsers.map((u) => asTrimmedString(u.pseudo).toLowerCase()).filter(Boolean),
    );
    const emailSet = new Set(
      existingUsers.map((u) => asTrimmedString(u.email).toLowerCase()).filter(Boolean),
    );
    const seenName = new Set();

    const validRows = [];
    rawRows.forEach((row, idx) => {
      const rowNumber = idx + 2;
      const payload = buildImportStudentPayload(row);
      const errors = validateImportStudentPayload(payload, rowNumber);

      const keyByName = `${payload.userType}|${payload.firstName.toLowerCase()}|${payload.lastName.toLowerCase()}`;
      if (!errors.length && seenName.has(keyByName)) {
        errors.push({
          row: rowNumber,
          field: 'name',
          error: 'Doublon dans le fichier (rôle + prénom + nom)',
        });
      }
      if (!errors.length && existingByName.has(keyByName)) {
        report.totals.skipped_existing += 1;
        report.errors.push({
          row: rowNumber,
          field: 'name',
          error: 'Utilisateur déjà existant (rôle + prénom + nom)',
        });
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
      const resolved = await resolveStudentAffiliationForPersist(
        rowItem.payload.affiliation,
        queryOne,
      );
      if (!resolved.ok) {
        report.totals.skipped_invalid += 1;
        report.errors.push({
          row: rowItem.rowNumber,
          field: 'affiliation',
          error: resolved.error,
        });
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
    const roleRows = await queryAll(
      "SELECT slug, id FROM roles WHERE slug IN ('prof', 'eleve_novice')",
    );
    for (const r of roleRows) roleIdBySlug.set(r.slug, r.id);
    const createdRoleAssignments = [];

    for (const rowItem of affiliationResolvedRows) {
      const { payload, rowNumber } = rowItem;
      const hash = await bcrypt.hash(payload.password, 10);
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const roleSlug = payload.userType === 'teacher' ? 'prof' : 'eleve_novice';
      try {
        await execute(
          `INSERT INTO users
            (id, user_type, legacy_user_id, email, pseudo, first_name, last_name, display_name, description, avatar_path, affiliation, password_hash, auth_provider, is_active, last_seen, created_at, updated_at)
           VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, NULL, ?, ?, 'local', 1, ?, NOW(), NOW())`,
          [
            id,
            payload.userType,
            payload.email,
            payload.pseudo,
            payload.firstName,
            payload.lastName,
            `${payload.firstName} ${payload.lastName}`.trim(),
            payload.description,
            payload.affiliation,
            hash,
            now,
          ],
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
          params,
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

router.post(
  '/register',
  requireAuth,
  validate({ body: registerBodySchema }),
  asyncHandler(async (req, res) => {
    const { studentId } = req.body;
    const askedStudentId = String(studentId || '').trim();
    const authStudentId = String(req.auth?.userType === 'student' ? req.auth.userId : '').trim();
    if (!authStudentId || authStudentId !== askedStudentId) {
      return res.status(403).json({ error: 'Session n3beur non autorisée' });
    }
    const s = await queryOne("SELECT * FROM users WHERE id = ? AND user_type = 'student'", [
      askedStudentId,
    ]);
    if (!s) return res.status(401).json({ error: 'Compte supprimé', deleted: true });
    await execute("UPDATE users SET last_seen = ? WHERE id = ? AND user_type = 'student'", [
      new Date().toISOString(),
      askedStudentId,
    ]);
    res.json({ ...s, password_hash: undefined });
  }),
);

router.post('/:id/duplicate', requirePermission('users.create'), async (req, res) => {
  try {
    const sourceId = req.params.id;
    const source = await queryOne("SELECT * FROM users WHERE id = ? AND user_type = 'student'", [
      sourceId,
    ]);
    if (!source) return res.status(404).json({ error: 'n3beur introuvable' });

    const body = req.body || {};
    const firstName = normalizeOptionalString(body.first_name);
    const lastName = normalizeOptionalString(body.last_name);
    const password = String(body.password || '');
    const pseudo = hasOwn(body, 'pseudo') ? normalizeOptionalString(body.pseudo) : null;
    const email =
      hasOwn(body, 'email') || hasOwn(body, 'mail')
        ? normalizeOptionalString(body.email ?? body.mail)
        : null;
    const copyAvatar = body.copy_avatar !== false;

    if (!firstName || !lastName) {
      return res.status(400).json({ error: 'Prénom et nom du nouveau compte requis' });
    }
    const minPasswordLen = await getPasswordMinLength();
    if (!password || password.length < minPasswordLen) {
      return res
        .status(400)
        .json({ error: `Mot de passe trop court (min ${minPasswordLen} caractères)` });
    }
    if (pseudo != null && !PSEUDO_RE.test(pseudo)) {
      return res
        .status(400)
        .json({ error: 'Pseudo invalide (3-30 caractères, lettres/chiffres/._-)' });
    }
    if (email != null && !EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'Email invalide' });
    }

    const existingByName = await queryOne(
      "SELECT id FROM users WHERE user_type = 'student' AND first_name = ? AND last_name = ? LIMIT 1",
      [firstName, lastName],
    );
    if (existingByName) return res.status(409).json({ error: 'Un n3beur avec ce nom existe déjà' });
    if (pseudo) {
      const existingPseudo = await queryOne('SELECT id FROM users WHERE pseudo = ? LIMIT 1', [
        pseudo,
      ]);
      if (existingPseudo) return res.status(409).json({ error: 'Ce pseudo est déjà utilisé' });
    }
    if (email) {
      const existingEmail = await queryOne('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);
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

    const newId = crypto.randomUUID();
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
        [
          newId,
          email,
          pseudo,
          firstName,
          lastName,
          `${firstName} ${lastName}`.trim(),
          description,
          avatarPath,
          affiliation,
          hash,
          now,
        ],
      );
    } catch (err) {
      if (err && (err.errno === 1062 || err.code === 'ER_DUP_ENTRY')) {
        return res.status(409).json({ error: 'Pseudo, email ou identité déjà utilisé(e)' });
      }
      throw err;
    }

    await setPrimaryRole('student', newId, roleId);

    const created = await queryOne("SELECT * FROM users WHERE id = ? AND user_type = 'student'", [
      newId,
    ]);
    const roleRow = await queryOne('SELECT slug, display_name FROM roles WHERE id = ? LIMIT 1', [
      roleId,
    ]);
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

    const student = await queryOne("SELECT * FROM users WHERE id = ? AND user_type = 'student'", [
      askedStudentId,
    ]);
    if (!student) return res.status(404).json({ error: 'n3beur introuvable' });
    if (!student.password_hash)
      return res
        .status(401)
        .json({ error: "Ce compte n'a pas de mot de passe. Contactez le prof." });

    const passwordOk = await bcrypt.compare(String(body.currentPassword), student.password_hash);
    if (!passwordOk) return res.status(401).json({ error: 'Mot de passe actuel incorrect' });

    // Blocs communs avec PATCH /api/auth/me/profile extraits dans lib/profileUpdate.js
    // (drapeaux, mascotte visite, avatar, unicité) — mêmes gardes et messages.
    const flags = readProfileFieldFlags(body);
    const {
      hasPseudo,
      hasEmail,
      hasDescription,
      hasAffiliation,
      hasVisitMascotCatalogId,
      hasAvatarData,
      removeAvatar,
    } = flags;
    if (!flags.hasAny) {
      return res.status(400).json({ error: 'Aucun champ de profil à mettre à jour' });
    }

    const pseudo = hasPseudo ? normalizeOptionalString(body.pseudo) : student.pseudo;
    const email = hasEmail ? normalizeOptionalString(body.email ?? body.mail) : student.email;
    const description = hasDescription
      ? normalizeOptionalString(body.description)
      : student.description;
    let affiliation;
    if (hasAffiliation) {
      const affRes = await resolveStudentAffiliationForPersist(body.affiliation, queryOne);
      if (!affRes.ok) return res.status(400).json({ error: affRes.error });
      affiliation = affRes.affiliation;
    } else {
      affiliation = student.affiliation || 'both';
    }
    const mascotRes = await resolveVisitMascotUpdate(
      hasVisitMascotCatalogId,
      body.visit_mascot_catalog_id,
      student.visit_mascot_catalog_id,
    );
    if (!mascotRes.ok) return res.status(400).json({ error: mascotRes.error });
    const visitMascotCatalogId = mascotRes.value;

    if (pseudo != null && !PSEUDO_RE.test(pseudo)) {
      return res
        .status(400)
        .json({ error: 'Pseudo invalide (3-30 caractères, lettres/chiffres/._-)' });
    }
    if (email != null && !EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'Email invalide' });
    }
    if (description != null && description.length > MAX_DESCRIPTION_LEN) {
      return res
        .status(400)
        .json({ error: `Description trop longue (max ${MAX_DESCRIPTION_LEN} caractères)` });
    }
    const avatarRes = applyAvatarUpdate({
      hasAvatarData,
      avatarDataRaw: body.avatarData,
      removeAvatar,
      currentPath: student.avatar_path,
      folder: 'students',
      userId: student.id,
    });
    if (!avatarRes.ok) return res.status(400).json({ error: avatarRes.error });
    const avatarPath = avatarRes.avatarPath;

    const conflict = await findProfileUniquenessConflict(pseudo, email, student.id);
    if (conflict) return res.status(409).json({ error: conflict });

    try {
      await execute(
        "UPDATE users SET pseudo = ?, email = ?, description = ?, avatar_path = ?, affiliation = ?, visit_mascot_catalog_id = ?, display_name = TRIM(CONCAT(COALESCE(first_name,''), ' ', COALESCE(last_name,''))) WHERE id = ? AND user_type = 'student'",
        [pseudo, email, description, avatarPath, affiliation, visitMascotCatalogId, student.id],
      );
    } catch (err) {
      if (isDuplicateEntryError(err)) {
        return res.status(409).json({ error: 'Pseudo ou email déjà utilisé' });
      }
      throw err;
    }
    const updated = await queryOne("SELECT * FROM users WHERE id = ? AND user_type = 'student'", [
      student.id,
    ]);
    logAudit(
      'update_student_profile',
      'student',
      student.id,
      `${student.first_name} ${student.last_name}`,
      {
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
      },
    );
    emitStudentsChanged({ reason: 'student_profile_update', studentId: student.id });
    res.json({ ...updated, password_hash: undefined });
  } catch (e) {
    respondInternalError(res, req, e);
  }
});

router.delete(
  '/:id',
  requirePermission('students.delete'),
  asyncHandler(async (req, res) => {
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
  }),
);

module.exports = router;
// Exporté pour le test no-DB du contrat de validation O7.
module.exports.registerBodySchema = registerBodySchema;
module.exports.importTemplateQuerySchema = importTemplateQuerySchema;
