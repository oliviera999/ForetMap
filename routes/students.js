const express = require('express');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const crypto = require('node:crypto');
const { buildWorkbookBuffer, jsonRowsToAoa } = require('../lib/spreadsheet');
const { queryOne, execute } = require('../database');
const { requireAuth, requirePermission, signAuthToken } = require('../middleware/requireTeacher');
const { logRouteError } = require('../lib/routeLog');
const asyncHandler = require('../lib/asyncHandler');
const { toPublicUserRow } = require('../lib/publicUser');
const { logAudit } = require('../lib/auditLog');
const { emitStudentsChanged, emitTasksChanged } = require('../lib/realtime');
const { getAbsolutePath, ensureDir } = require('../lib/uploads');
const { getPrimaryRoleForUser } = require('../lib/rbac');
const { checkRoleGrantAllowed } = require('../lib/rbacRoleAssignment');
const { checkGroupJoinAllowedById } = require('../lib/groupDefaultRolePolicy');
const { recomputeUsersRoles } = require('../lib/effectiveRole');
const {
  canBypassGroupScope,
  canAccessStudentId,
  isGroupInManageScope,
} = require('../lib/groupScope');
const { addUserToGroup } = require('../lib/groupMembers');
const { deleteStudentById } = require('../lib/studentDeletion');
const { getPasswordMinLength } = require('../lib/passwordReset');
const logger = require('../lib/logger');
const { importStudentAccounts } = require('../lib/students/studentImportService');
const {
  MAX_DESCRIPTION_LEN,
  PSEUDO_RE,
  PSEUDO_INVALID_MSG,
  EMAIL_RE,
  TEMPLATE_COLUMNS,
  asTrimmedString,
  hasOwn,
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

const {
  emailWillChange,
  checkSelfEmailChangeAllowed,
  applyEmailChangeEffects,
} = require('../lib/accounts/emailChange');
const { buildSessionPayload } = require('../lib/auth/sessionPayload');
const { exposeAuth } = require('../lib/authRouteHelpers');

const router = express.Router();

const { normalizeOptionalString } = require('../lib/shared/httpHelpers');
const { nowDbTimestamp } = require('../lib/shared/isoTimestamp');

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
    const sampleLines = buildTemplateWorkbookRows().map((row) =>
      TEMPLATE_COLUMNS.map((col) => csvEscape(row[col])).join(';'),
    );
    const csv = `${BOM}${line}\r\n${sampleLines.join('\r\n')}\r\n`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="foretmap-modele-n3beurs.csv"');
    res.send(csv);
  }),
);

/**
 * Import de comptes (CSV / XLSX) : HTTP seulement. Lecture du fichier, contrôles, écritures,
 * groupes et rapport vivent dans `lib/students/studentImportService.js`.
 */
router.post(
  '/import',
  requirePermission('students.import'),
  asyncHandler(async (req, res) => {
    const outcome = await importStudentAccounts({
      body: req.body,
      actor: req.auth,
      auditReq: req,
    });
    if (!outcome.ok) return res.status(outcome.status).json({ error: outcome.error });
    res.json({ report: outcome.report });
  }),
);

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
      nowDbTimestamp(),
      askedStudentId,
    ]);
    res.json(toPublicUserRow(s));
  }),
);

router.post(
  '/:id/duplicate',
  requirePermission('users.create'),
  asyncHandler(async (req, res) => {
    const sourceId = req.params.id;
    const source = await queryOne("SELECT * FROM users WHERE id = ? AND user_type = 'student'", [
      sourceId,
    ]);
    if (!source) return res.status(404).json({ error: 'n3beur introuvable' });
    // Même périmètre que la création unitaire : hors vue globale, la source doit être un
    // élève de ses groupes et la copie rejoint un groupe de son périmètre (CDG-11).
    const bypassScope = canBypassGroupScope(req.auth);
    const targetGroupId = String(req.body?.group_id || '').trim() || null;
    if (!bypassScope) {
      if (!(await canAccessStudentId(req.auth, source.id))) {
        return res.status(403).json({ error: 'n3beur hors périmètre de groupe' });
      }
      if (!targetGroupId) {
        return res
          .status(400)
          .json({ error: 'group_id requis : rattachez la copie à un groupe de votre périmètre' });
      }
      if (!(await isGroupInManageScope(req.auth, targetGroupId))) {
        return res.status(403).json({ error: 'Groupe hors périmètre' });
      }
    }

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
      return res.status(400).json({ error: PSEUDO_INVALID_MSG });
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

    // La copie reçoit le profil **attribué** de la source (le profil effectif suivra ses groupes).
    const primary = await getPrimaryRoleForUser('student', source.id);
    let roleId = source.assigned_role_id || primary?.id;
    if (!roleId) {
      const novice = await queryOne("SELECT id FROM roles WHERE slug = 'eleve_novice' LIMIT 1");
      roleId = novice?.id;
    }
    if (!roleId) {
      logRouteError(new Error('Profil RBAC introuvable (eleve_novice)'), req);
      return res.status(500).json({ error: 'Profil RBAC introuvable' });
    }
    // Dupliquer un compte, c'est attribuer son profil à la copie : même garde « acteur →
    // profil » que la création unitaire et l'import (rang strictement inférieur hors admin).
    const copiedRole = await queryOne('SELECT id, slug, `rank` FROM roles WHERE id = ? LIMIT 1', [
      roleId,
    ]);
    const grant = checkRoleGrantAllowed(req.auth, copiedRole);
    if (!grant.ok) return res.status(grant.status).json({ error: grant.error });
    // Le groupe de la copie confère son profil par défaut : même garde, avant toute écriture.
    if (targetGroupId) {
      const joinAllowed = await checkGroupJoinAllowedById(req.auth, targetGroupId);
      if (!joinAllowed.ok && joinAllowed.status === 403) {
        return res.status(403).json({ error: joinAllowed.error });
      }
    }

    const description = normalizeOptionalString(source.description);

    const newId = crypto.randomUUID();
    const hash = await bcrypt.hash(password, 10);
    const now = nowDbTimestamp();
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
          (id, user_type, assigned_role_id, legacy_user_id, email, pseudo, first_name, last_name, display_name, description, avatar_path, password_hash, auth_provider, is_active, last_seen, created_at, updated_at)
         VALUES (?, 'student', ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, 'local', 1, ?, NOW(), NOW())`,
        [
          newId,
          roleId,
          email,
          pseudo,
          firstName,
          lastName,
          `${firstName} ${lastName}`.trim(),
          description,
          avatarPath,
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

    await recomputeUsersRoles([newId]);
    if (targetGroupId) await addUserToGroup(newId, targetGroupId, { actor: req.auth });

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
      ...toPublicUserRow(created),
      role_slug: roleRow?.slug,
      role_display_name: roleRow?.display_name,
      source_student_id: sourceId,
    });
  }),
);

router.patch(
  '/:id/profile',
  requireAuth,
  asyncHandler(async (req, res) => {
    const askedStudentId = String(req.params.id || '').trim();
    const auth = req.auth || null;
    const isOwner = auth?.userType === 'student' && String(auth?.userId || '') === askedStudentId;
    if (!isOwner) {
      return res.status(403).json({ error: 'Modification de profil non autorisée' });
    }
    const body = req.body || {};
    const student = await queryOne("SELECT * FROM users WHERE id = ? AND user_type = 'student'", [
      askedStudentId,
    ]);
    if (!student) return res.status(404).json({ error: 'n3beur introuvable' });

    // Blocs communs avec PATCH /api/auth/me/profile extraits dans lib/profileUpdate.js
    // (drapeaux, mascotte visite, avatar, unicité) — mêmes gardes et messages.
    const flags = readProfileFieldFlags(body);
    const {
      hasPseudo,
      hasEmail,
      hasDescription,
      hasVisitMascotCatalogId,
      hasBiodivPedagoLevel,
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
    const mascotRes = await resolveVisitMascotUpdate(
      hasVisitMascotCatalogId,
      body.visit_mascot_catalog_id,
      student.visit_mascot_catalog_id,
    );
    if (!mascotRes.ok) return res.status(400).json({ error: mascotRes.error });
    const visitMascotCatalogId = mascotRes.value;

    const { normalizePedagoLevel } = require('../lib/biodivPedagoLevel');
    let biodivPedagoLevel = normalizePedagoLevel(student.biodiv_pedago_level);
    if (hasBiodivPedagoLevel) {
      if (body.biodiv_pedago_level == null || String(body.biodiv_pedago_level).trim() === '') {
        biodivPedagoLevel = null;
      } else {
        biodivPedagoLevel = normalizePedagoLevel(body.biodiv_pedago_level);
        if (!biodivPedagoLevel) {
          return res
            .status(400)
            .json({ error: 'biodiv_pedago_level invalide (college|lycee|universite)' });
        }
      }
    }

    if (pseudo != null && !PSEUDO_RE.test(pseudo)) {
      return res.status(400).json({ error: PSEUDO_INVALID_MSG });
    }
    if (email != null && !EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'Email invalide' });
    }
    if (description != null && description.length > MAX_DESCRIPTION_LEN) {
      return res
        .status(400)
        .json({ error: `Description trop longue (max ${MAX_DESCRIPTION_LEN} caractères)` });
    }
    // Changer son adresse e-mail : mot de passe actuel exigé, jamais en prise de contrôle
    // (AC3, audit 2026-09-30) — l'e-mail ouvre « mot de passe oublié ».
    const emailChanges = hasEmail && emailWillChange(student.email, email);
    if (emailChanges) {
      const reauth = await checkSelfEmailChangeAllowed(student, body, auth);
      if (!reauth.ok) {
        return res
          .status(reauth.status)
          .json({ error: reauth.error, ...(reauth.code ? { code: reauth.code } : {}) });
      }
    }
    const avatarRes = await applyAvatarUpdate({
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
        `UPDATE users
            SET pseudo = ?, email = ?, description = ?, avatar_path = ?,
                visit_mascot_catalog_id = ?, biodiv_pedago_level = ?,
                display_name = TRIM(CONCAT(COALESCE(first_name,''), ' ', COALESCE(last_name,'')))
          WHERE id = ? AND user_type = 'student'`,
        [
          pseudo,
          email,
          description,
          avatarPath,
          visitMascotCatalogId,
          biodivPedagoLevel,
          student.id,
        ],
      );
    } catch (err) {
      if (err && (err.errno === 1054 || err.code === 'ER_BAD_FIELD_ERROR')) {
        await execute(
          "UPDATE users SET pseudo = ?, email = ?, description = ?, avatar_path = ?, visit_mascot_catalog_id = ?, display_name = TRIM(CONCAT(COALESCE(first_name,''), ' ', COALESCE(last_name,''))) WHERE id = ? AND user_type = 'student'",
          [pseudo, email, description, avatarPath, visitMascotCatalogId, student.id],
        );
      } else if (isDuplicateEntryError(err)) {
        return res.status(409).json({ error: 'Pseudo ou email déjà utilisé' });
      } else {
        throw err;
      }
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
          visit_mascot_catalog_id: !!hasVisitMascotCatalogId,
          biodiv_pedago_level: !!hasBiodivPedagoLevel,
          avatar: !!(hasAvatarData || removeAvatar),
        },
      },
    );
    emitStudentsChanged({ reason: 'student_profile_update', studentId: student.id });
    let freshSession = null;
    if (emailChanges) {
      // Sessions révoquées, liens de réinitialisation consommés, ancienne adresse avertie ;
      // la session courante reçoit un jeton neuf (même contrat que `POST /api/auth/me/password`).
      await applyEmailChangeEffects({
        userId: student.id,
        previousEmail: student.email,
        nextEmail: updated?.email ?? email,
        displayName: `${student.first_name || ''} ${student.last_name || ''}`.trim(),
        changedBy: 'self',
      });
      const session = await buildSessionPayload(auth.userType, student.id);
      if (session) {
        freshSession = {
          authToken: await signAuthToken(session.tokenPayload),
          auth: exposeAuth(session.tokenPayload),
        };
      }
    }
    res.json({ ...toPublicUserRow(updated), ...(freshSession || {}) });
  }),
);

router.delete(
  '/:id',
  requirePermission('students.delete'),
  asyncHandler(async (req, res) => {
    // Hors vue globale, on ne supprime qu'un élève de ses groupes (CDG-11).
    if (!canBypassGroupScope(req.auth) && !(await canAccessStudentId(req.auth, req.params.id))) {
      return res.status(403).json({ error: 'n3beur hors périmètre de groupe' });
    }
    const result = await deleteStudentById(req.params.id);
    if (!result.ok) {
      if (result.reason === 'not_found' || result.reason === 'missing_id') {
        return res.status(404).json({ error: 'n3beur introuvable' });
      }
      // Le joueur Gnomes & Licornes lié à ce compte est retenu par une partie.
      if (result.reason === 'gl_player_in_active_game') {
        return res.status(409).json({
          error:
            'Suppression refusée : ce compte est joueur Gnomes & Licornes dans une partie en cours. Terminez la partie ou retirez-le de son équipe.',
        });
      }
      if (result.reason === 'gl_player_referenced') {
        return res.status(409).json({
          error:
            'Suppression refusée : ce compte a contribué à un sortilège dans une partie Gnomes & Licornes terminée. Supprimez d’abord cette partie.',
        });
      }
      return res.status(400).json({ error: 'Suppression impossible' });
    }
    // Identifiant seulement : le nom d'une personne effacée n'a rien à faire dans le journal
    // qui trace son effacement (RG3, audit RGPD du 30/09/2026).
    await logAudit('delete_student', 'student', result.studentId, result.studentId, {
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
