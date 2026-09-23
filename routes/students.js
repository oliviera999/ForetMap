const express = require('express');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const crypto = require('node:crypto');
const { buildWorkbookBuffer, jsonRowsToAoa } = require('../lib/spreadsheet');
const { queryAll, queryOne, execute } = require('../database');
const { requireAuth, requirePermission } = require('../middleware/requireTeacher');
const { logRouteError } = require('../lib/routeLog');
const asyncHandler = require('../lib/asyncHandler');
const { toPublicUserRow } = require('../lib/publicUser');
const { logAudit } = require('../lib/auditLog');
const { emitStudentsChanged, emitTasksChanged } = require('../lib/realtime');
const { getAbsolutePath, ensureDir } = require('../lib/uploads');
const { getPrimaryRoleForUser } = require('../lib/rbac');
const { setAssignedRole, recomputeUserRole, recomputeUsersRoles } = require('../lib/effectiveRole');
const { checkRoleGrantAllowed, checkRoleAssignmentAllowed } = require('../lib/rbacRoleAssignment');
const {
  canBypassGroupScope,
  canAccessStudentId,
  isGroupInManageScope,
} = require('../lib/groupScope');
const { addUserToGroup } = require('../lib/groupMembers');
const { deleteStudentById } = require('../lib/studentDeletion');
const { getPasswordMinLength, getPasswordMinLengthFor } = require('../lib/passwordReset');
const { getSettingValue } = require('../lib/settings');
const { bumpUserTokenEpoch } = require('../lib/auth/tokenEpoch');
const logger = require('../lib/logger');
const { loadGroupsIndex, attachUserToGroupRefs, previewGroupRefs } = require('../lib/groupImport');
const {
  MAX_DESCRIPTION_LEN,
  MAX_IMPORT_ROWS,
  PSEUDO_RE,
  PSEUDO_INVALID_MSG,
  EMAIL_RE,
  TEMPLATE_COLUMNS,
  asTrimmedString,
  hasOwn,
  buildImportStudentPayload,
  validateImportStudentPayload,
  mergeDuplicateStudentImportItems,
  resolveImportRows,
  csvEscape,
  buildTemplateWorkbookRows,
  hasImportScalarValue,
  buildRoleAliasesFromDbRows,
} = require('../lib/studentRouteHelpers');

const { z, validate } = require('../lib/validate');
const {
  readProfileFieldFlags,
  resolveVisitMascotUpdate,
  applyAvatarUpdate,
  findProfileUniquenessConflict,
  isDuplicateEntryError,
  verifyCurrentPassword,
} = require('../lib/profileUpdate');

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

router.post(
  '/import',
  requirePermission('students.import'),
  asyncHandler(async (req, res) => {
    const dryRun = !!req.body?.dryRun;
    const rawRows = await resolveImportRows(req.body || {});
    if (!Array.isArray(rawRows) || rawRows.length === 0) {
      return res.status(400).json({ error: 'Aucune ligne importable détectée' });
    }
    if (rawRows.length > MAX_IMPORT_ROWS) {
      return res.status(400).json({ error: `Import limité à ${MAX_IMPORT_ROWS} lignes` });
    }

    const existingStrategyRaw = await getSettingValue(
      'students.import.existing_strategy',
      'update',
    );
    const existingStrategy =
      String(existingStrategyRaw || '').toLowerCase() === 'skip' ? 'skip' : 'update';
    const allowWeakPasswords = !!(await getSettingValue(
      'students.import.allow_weak_passwords',
      false,
    ));

    const report = {
      dryRun,
      options: { existingStrategy, allowWeakPasswords },
      totals: {
        received: rawRows.length,
        valid: 0,
        created: 0,
        updated: 0,
        skipped_existing: 0,
        skipped_invalid: 0,
        merged_duplicates: 0,
      },
      preview: [],
      errors: [],
      infos: [],
      // Contrat explicite : pas de filtre domaines OAuth / Moodle sur les e-mails du fichier.
      emailDomainRestrictionsApplied: false,
    };

    const existingUsers = await queryAll(
      `SELECT u.id, u.user_type, u.first_name, u.last_name, u.pseudo, u.email, r.slug AS role_slug
         FROM users u
         LEFT JOIN user_roles ur
           ON ur.user_type = u.user_type AND ur.user_id = u.id AND ur.is_primary = 1
         LEFT JOIN roles r ON r.id = ur.role_id
        WHERE u.user_type IN ('student', 'teacher')`,
    );
    // Périmètre de l'acteur : sans vue globale, seuls les comptes de ses groupes sont
    // modifiables par le fichier (CDG-02) ; un compte enseignant existant ne l'est que par un
    // administrateur (CDG-03).
    const bypassScope = canBypassGroupScope(req.auth);
    const actorIsAdmin = String(req.auth?.roleSlug || '').toLowerCase() === 'admin';
    const existingByName = new Map(
      existingUsers.map((u) => [
        `${asTrimmedString(u.user_type).toLowerCase()}|${asTrimmedString(u.first_name).toLowerCase()}|${asTrimmedString(u.last_name).toLowerCase()}`,
        u,
      ]),
    );
    /*
     * Index « prénom + nom », tous types de compte confondus. L'appariement, lui, reste sur
     * `type|prénom|nom` — deux personnes distinctes peuvent être homonymes de part et d'autre.
     * Cet index sert uniquement à **signaler** une création qui ressemble à un doublon : c'est
     * la forme qu'avait prise la bascule des personnels en compte enseignant (le fichier les
     * décrivait comme élèves, plus aucune ligne ne retrouvait son compte, et l'import repartait
     * en création). Un signalement, pas un refus : bloquer priverait un vrai homonyme de compte.
     */
    const existingByNameAnyType = new Map();
    for (const u of existingUsers) {
      const key = `${asTrimmedString(u.first_name).toLowerCase()}|${asTrimmedString(u.last_name).toLowerCase()}`;
      if (!existingByNameAnyType.has(key)) existingByNameAnyType.set(key, []);
      existingByNameAnyType.get(key).push(u);
    }
    /** Lignes créées alors qu'un homonyme existe sous l'autre type de compte. */
    const crossTypeHomonymRows = [];
    const pseudoOwner = new Map();
    const emailOwner = new Map();
    for (const u of existingUsers) {
      const p = asTrimmedString(u.pseudo).toLowerCase();
      const e = asTrimmedString(u.email).toLowerCase();
      if (p) pseudoOwner.set(p, u.id);
      if (e) emailOwner.set(e, u.id);
    }

    // Profils importables : tous les profils ForetMap (système et sur mesure), hors jeu G&L ;
    // chargés avant la validation des lignes pour que la colonne Rôle accepte aussi le **nom
    // affiché** du profil — renommable par un administrateur — et pas seulement son slug.
    const roleRows = await queryAll(
      "SELECT slug, id, display_name, `rank` FROM roles WHERE slug NOT LIKE 'gl\\_%'",
    );
    const roleIdBySlug = new Map();
    const roleLabelBySlug = new Map();
    const rolesBySlug = new Map();
    for (const r of roleRows) {
      roleIdBySlug.set(r.slug, r.id);
      rolesBySlug.set(r.slug, r);
      if (asTrimmedString(r.display_name))
        roleLabelBySlug.set(r.slug, asTrimmedString(r.display_name));
    }
    const roleAliases = buildRoleAliasesFromDbRows(roleRows);
    const knownRoleSlugs = new Set(roleIdBySlug.keys());

    const minPasswordStudent = await getPasswordMinLengthFor('student');
    const minPasswordTeacher = await getPasswordMinLengthFor('teacher');
    const passwordOpts = {
      minPasswordStudent,
      minPasswordTeacher,
      allowWeakPasswords,
      // Mot de passe requis seulement à la création ; vide à la mise à jour = inchangé.
      passwordRequired: false,
      knownRoleSlugs,
    };

    const candidateRows = [];
    /** Lignes acceptées dont la colonne Rôle était vide → profil par défaut. */
    const defaultedRoleRows = [];
    rawRows.forEach((row, idx) => {
      const rowNumber = idx + 2;
      const payload = buildImportStudentPayload(row, { roleAliases, rolesBySlug });
      const errors = validateImportStudentPayload(payload, rowNumber, passwordOpts);

      if (!errors.length && payload.roleSlug) {
        const grant = checkRoleGrantAllowed(req.auth, rolesBySlug.get(payload.roleSlug));
        if (!grant.ok) errors.push({ row: rowNumber, field: 'role', error: grant.error });
      }

      if (errors.length > 0) {
        report.totals.skipped_invalid += 1;
        report.errors.push(...errors);
        return;
      }

      if (!payload.roleInput) defaultedRoleRows.push(rowNumber);
      candidateRows.push({ payload, rowNumber });
    });

    if (defaultedRoleRows.length > 0) {
      const defaultLabel = roleLabelBySlug.get('eleve_novice') || 'eleve_novice';
      const prefix = defaultedRoleRows.length > 1 ? 'Lignes' : 'Ligne';
      report.infos.push({
        code: 'role_defaulted',
        rows: [...defaultedRoleRows],
        message: `${prefix} ${defaultedRoleRows.join(', ')} : colonne Rôle vide → profil « ${defaultLabel} » (eleve_novice) par défaut.`,
      });
    }

    const { items: mergedRows, infos: mergeInfos } =
      mergeDuplicateStudentImportItems(candidateRows);
    report.infos.push(...mergeInfos);
    report.totals.merged_duplicates = mergeInfos.reduce(
      (acc, info) => acc + Math.max(0, (info.rows?.length || 0) - 1),
      0,
    );

    const validRows = [];
    for (const rowItem of mergedRows) {
      const { payload, rowNumber } = rowItem;
      const keyByName = `${payload.userType}|${payload.firstName.toLowerCase()}|${payload.lastName.toLowerCase()}`;
      const existing = existingByName.get(keyByName) || null;

      if (existing && existingStrategy === 'skip') {
        report.totals.skipped_existing += 1;
        report.errors.push({
          row: rowNumber,
          field: 'name',
          error: 'Utilisateur déjà existant (type de compte + prénom + nom)',
        });
        continue;
      }

      if (!existing && !payload.password) {
        report.totals.skipped_invalid += 1;
        report.errors.push({
          row: rowNumber,
          field: 'password',
          error: 'Mot de passe requis',
        });
        continue;
      }

      /*
       * Un compte enseignant existant ne se modifie que par un administrateur (CDG-03) —
       * **sauf** s'il porte le profil « Personnel ». Ce profil est un compte enseignant depuis
       * le réalignement du 22/09/2026, mais il n'a aucun droit d'encadrement : réserver la
       * tenue du fichier des personnels au seul administrateur reviendrait à protéger un agent
       * d'entretien comme on protège un n3boss. Un changement de profil reste soumis à
       * `checkRoleAssignmentAllowed` un peu plus bas.
       */
      const existingIsProtectedTeacher =
        existing &&
        existing.user_type === 'teacher' &&
        String(existing.role_slug || '').toLowerCase() !== 'personnel';
      if (existingIsProtectedTeacher && !actorIsAdmin) {
        report.totals.skipped_invalid += 1;
        report.errors.push({
          row: rowNumber,
          field: 'name',
          error: 'Seul un administrateur peut modifier un compte enseignant existant',
        });
        continue;
      }
      if (
        existing &&
        existing.user_type === 'student' &&
        !bypassScope &&
        !(await canAccessStudentId(req.auth, existing.id))
      ) {
        report.totals.skipped_invalid += 1;
        report.errors.push({
          row: rowNumber,
          field: 'name',
          error: 'Compte hors de votre périmètre (élève d’une autre classe)',
        });
        continue;
      }
      if (existing && String(existing.id) === String(req.auth?.userId)) {
        report.totals.skipped_invalid += 1;
        report.errors.push({
          row: rowNumber,
          field: 'name',
          error: 'Votre propre compte ne se modifie pas par import',
        });
        continue;
      }
      // Cellule Rôle vide sur un compte existant = profil inchangé (CDG-23).
      const roleChangeRequested = !!payload.roleInput;
      if (existing && roleChangeRequested) {
        const roleCheck = await checkRoleAssignmentAllowed({
          actor: req.auth,
          userType: existing.user_type,
          userId: existing.id,
          nextRole: rolesBySlug.get(payload.roleSlug),
        });
        if (!roleCheck.ok) {
          report.totals.skipped_invalid += 1;
          report.errors.push({ row: rowNumber, field: 'role', error: roleCheck.error });
          continue;
        }
      }

      const uniquenessErrors = [];
      if (payload.pseudo) {
        const ownerId = pseudoOwner.get(payload.pseudo.toLowerCase());
        if (ownerId && (!existing || ownerId !== existing.id)) {
          uniquenessErrors.push({ row: rowNumber, field: 'pseudo', error: 'Pseudo déjà utilisé' });
        }
      }
      if (payload.email) {
        const ownerId = emailOwner.get(payload.email.toLowerCase());
        if (ownerId && (!existing || ownerId !== existing.id)) {
          uniquenessErrors.push({ row: rowNumber, field: 'email', error: 'Email déjà utilisé' });
        }
      }
      if (uniquenessErrors.length > 0) {
        report.totals.skipped_invalid += 1;
        report.errors.push(...uniquenessErrors);
        continue;
      }

      if (payload.pseudo) {
        pseudoOwner.set(payload.pseudo.toLowerCase(), existing?.id || '__pending__');
      }
      if (payload.email) {
        emailOwner.set(payload.email.toLowerCase(), existing?.id || '__pending__');
      }

      if (!existing) {
        const homonyms = existingByNameAnyType.get(
          `${payload.firstName.toLowerCase()}|${payload.lastName.toLowerCase()}`,
        );
        if (Array.isArray(homonyms) && homonyms.length > 0) crossTypeHomonymRows.push(rowNumber);
      }

      validRows.push({
        ...rowItem,
        existing,
        action: existing ? 'update' : 'create',
        roleChangeRequested,
      });
      if (report.preview.length < 20) {
        report.preview.push({
          row: rowItem.rowNumber,
          action: existing ? 'update' : 'create',
          role_slug:
            existing && !roleChangeRequested ? existing.role_slug || null : payload.roleSlug,
          user_type: payload.userType,
          first_name: payload.firstName,
          last_name: payload.lastName,
          groups: (payload.groupRefs || []).map((r) => r.path.join(' > ')).join(' | ') || null,
        });
      }
    }

    if (crossTypeHomonymRows.length > 0) {
      const prefix = crossTypeHomonymRows.length > 1 ? 'Lignes' : 'Ligne';
      report.infos.push({
        code: 'cross_type_homonym',
        rows: [...crossTypeHomonymRows],
        message:
          `${prefix} ${crossTypeHomonymRows.join(', ')} : un compte du même prénom et nom existe ` +
          'déjà sous l’autre type de compte. L’import va créer un compte séparé. S’il s’agit ' +
          'de la même personne, corrigez la colonne Rôle du fichier (le type de compte en ' +
          'découle) plutôt que de créer un doublon.',
      });
    }

    report.totals.valid = validRows.length;
    report.totals.groups_created = 0;
    report.totals.groups_attached = 0;

    if (dryRun && validRows.length > 0) {
      // L'aperçu simule aussi les groupes : ceux qui seraient créés, et les références qui
      // seraient refusées (hors périmètre, groupe inactif) — sans rien écrire (CDG-51).
      const groupsIndex = await loadGroupsIndex();
      const toCreate = new Set();
      for (const rowItem of validRows) {
        const refs = rowItem.payload.groupRefs || [];
        if (refs.length === 0) continue;
        const preview = await previewGroupRefs(req.auth, refs, groupsIndex);
        for (const path of preview.toCreate) toCreate.add(path);
        for (const errMsg of preview.errors) {
          report.errors.push({ row: rowItem.rowNumber, field: 'groups', error: errMsg });
        }
      }
      report.totals.groups_to_create = toCreate.size;
      if (toCreate.size > 0) {
        report.infos.push({
          code: 'groups_to_create',
          message: `Groupes qui seraient créés : ${[...toCreate].join(', ')}.`,
        });
      }
    }
    if (dryRun || validRows.length === 0) {
      return res.json({ report });
    }

    const usersForGroups = [];

    for (const rowItem of validRows) {
      const { payload, rowNumber, action, existing, roleChangeRequested } = rowItem;
      const roleSlug = payload.roleSlug;
      const roleId = roleIdBySlug.get(roleSlug);
      const displayName = `${payload.firstName} ${payload.lastName}`.trim();

      try {
        if (action === 'update' && existing?.id) {
          const sets = ['display_name = ?', 'updated_at = NOW()'];
          const params = [displayName];
          if (hasImportScalarValue(payload.email)) {
            sets.push('email = ?');
            params.push(payload.email);
          }
          if (hasImportScalarValue(payload.pseudo)) {
            sets.push('pseudo = ?');
            params.push(payload.pseudo);
          }
          if (hasImportScalarValue(payload.description)) {
            sets.push('description = ?');
            params.push(payload.description);
          }
          let passwordChanged = false;
          if (payload.password) {
            const hash = await bcrypt.hash(payload.password, 10);
            sets.push('password_hash = ?');
            params.push(hash);
            passwordChanged = true;
          }
          params.push(existing.id);
          await execute(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, params);
          if (passwordChanged) {
            await bumpUserTokenEpoch(existing.id);
          }
          if (roleChangeRequested && roleId != null) {
            await setAssignedRole(existing.id, roleId);
          }
          report.totals.updated += 1;
          if (Array.isArray(payload.groupRefs) && payload.groupRefs.length > 0) {
            usersForGroups.push({
              id: existing.id,
              userType: payload.userType,
              groupRefs: payload.groupRefs,
              rowNumber,
            });
          }
          continue;
        }

        const hash = await bcrypt.hash(payload.password, 10);
        const id = crypto.randomUUID();
        const now = nowDbTimestamp();
        await execute(
          `INSERT INTO users
            (id, user_type, assigned_role_id, legacy_user_id, email, pseudo, first_name, last_name, display_name, description, avatar_path, password_hash, auth_provider, is_active, last_seen, created_at, updated_at)
           VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, NULL, ?, 'local', 1, ?, NOW(), NOW())`,
          [
            id,
            payload.userType,
            roleId ?? null,
            payload.email,
            payload.pseudo,
            payload.firstName,
            payload.lastName,
            displayName,
            payload.description,
            hash,
            now,
          ],
        );
        // Profil effectif posé aussitôt : une panne plus loin dans la boucle ne laisse pas de
        // compte sans profil (CDG-51) ; le rattachement aux groupes, plus bas, recalcule.
        await recomputeUserRole(id);
        report.totals.created += 1;
        if (Array.isArray(payload.groupRefs) && payload.groupRefs.length > 0) {
          usersForGroups.push({
            id,
            userType: payload.userType,
            groupRefs: payload.groupRefs,
            rowNumber,
          });
        }
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

    if (usersForGroups.length > 0) {
      const groupsIndex = await loadGroupsIndex();
      for (const item of usersForGroups) {
        const attach = await attachUserToGroupRefs(
          req.auth,
          item.id,
          item.userType,
          item.groupRefs,
          groupsIndex,
        );
        report.totals.groups_created += attach.created.length;
        report.totals.groups_attached += attach.attached.length;
        for (const errMsg of attach.errors) {
          report.errors.push({
            row: item.rowNumber,
            field: 'groups',
            error: errMsg,
          });
        }
      }
    }

    if (report.totals.created > 0 || report.totals.updated > 0) {
      logAudit(
        'students_import',
        'user',
        null,
        `Import de ${report.totals.created} compte(s) créé(s), ${report.totals.updated} mis à jour`,
        {
          req,
          payload: { report: report.totals, options: report.options },
        },
      );
      emitStudentsChanged({
        reason: 'students_import',
        created: report.totals.created,
        updated: report.totals.updated,
      });
    }
    res.json({ report });
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
    if (targetGroupId) await addUserToGroup(newId, targetGroupId);

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
    const reauth = await verifyCurrentPassword(student, body);
    if (!reauth.ok) return res.status(reauth.status).json({ error: reauth.error });

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
    res.json(toPublicUserRow(updated));
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
