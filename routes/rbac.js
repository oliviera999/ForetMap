const express = require('express');
const { bumpUserTokenEpoch } = require('../lib/auth/tokenEpoch');
const bcrypt = require('bcryptjs');
const crypto = require('node:crypto');
const { queryAll, queryOne, execute, withTransaction } = require('../database');
const { nowDbTimestamp } = require('../lib/shared/isoTimestamp');
const { requirePermission, requireAuth, hasPermission } = require('../middleware/requireTeacher');
const { getPrimaryRoleForUser } = require('../lib/rbac');
const { setAssignedRole, describeUserRoles } = require('../lib/effectiveRole');
const {
  canBypassGroupScope,
  isGroupInManageScope,
  getUserAccessibleGroupIds,
} = require('../lib/groupScope');
const {
  isGlRoleSlug,
  isReservedRoleSlug,
  normalizeRoleSlug,
} = require('../lib/shared/n3beurRolesCore');
const { recomputeStudentProfilesFromValidatedTasks } = require('../lib/studentProgressionSync');
const { getSettingValue, setSetting } = require('../lib/settings');
const { getPasswordMinLengthFor } = require('../lib/passwordReset');
const { emitStudentsChanged } = require('../lib/realtime');
const { resolveGroupVisibility, fetchGroupsByUserId } = require('../lib/rbacUserGroups');
const {
  assignRole,
  checkRoleGrantAllowed,
  countPrimaryAdmins,
} = require('../lib/rbacRoleAssignment');

async function emitStudentsWithPrimaryRole(roleId) {
  const rows = await queryAll(
    `SELECT user_id FROM user_roles WHERE role_id = ? AND user_type = 'student' AND is_primary = 1`,
    [roleId],
  );
  for (const row of rows) {
    emitStudentsChanged({ reason: 'role_forum_context_participation', studentId: row.user_id });
  }
}
const { logRouteError } = require('../lib/routeLog');
const asyncHandler = require('../lib/asyncHandler');
const { toPublicUserRow } = require('../lib/publicUser');
const { rethrowSlugConflict } = require('../lib/slugConflict');
const { logAudit } = require('../lib/auditLog');
const {
  MAX_DESCRIPTION_LEN,
  PSEUDO_RE,
  PSEUDO_INVALID_MSG,
  EMAIL_RE,
  STUDENT_ROLE_SLUG_RE,
  reservedRoleSlugError,
  rankChangeError,
  teacherAccessLockError,
  PROFILE_PATCH_KEYS,
  canConfigureStudentTierForumContext,
  normalizeEmail,
  jsonTextField,
  normalizeRoleEmoji,
  parseOptionalNonNegativeInt,
  parseOptionalMaxConcurrentTasks,
} = require('../lib/rbacRouteHelpers');

const router = express.Router();

const { normalizeOptionalString } = require('../lib/shared/httpHelpers');
const { z, validate } = require('../lib/validate');

// O7 — Schéma zod du corps de PUT /users/:userType/:userId/role. Reproduit exactement
// l'ancienne validation manuelle `const roleId = parseInt(req.body?.role_id, 10);
// if (!Number.isFinite(roleId) || roleId <= 0) ... 400 'role_id invalide'`.
// La vérification est portée au niveau racine (path vide) pour que `formatZodError` renvoie le
// message tel quel (sans préfixe de chemin) et pour tolérer un corps null/undefined comme
// l'opérateur `?.` d'origine (parseInt(undefined, 10) → NaN → 400). Le corps n'est PAS
// transformé : le handler continue de lire/parser `req.body?.role_id`.
const assignRoleBodySchema = z.unknown().superRefine((b, ctx) => {
  const roleId = parseInt(b && b.role_id, 10);
  if (!Number.isFinite(roleId) || roleId <= 0) {
    ctx.addIssue({ code: 'custom', message: 'role_id invalide', path: [] });
  }
});

/** Résout teacher/student (ou alias user → type réel) pour les routes RBAC sur un compte. */
async function resolveRbacSubjectForMutation(userTypeParam, userIdParam) {
  const rawType = String(userTypeParam || '').trim();
  if (!['teacher', 'student', 'user'].includes(rawType)) {
    return { ok: false, status: 400, error: 'userType invalide' };
  }
  let resolvedUserType = rawType;
  let resolvedUserId = userIdParam;
  if (rawType === 'user') {
    const row = await queryOne('SELECT id, user_type FROM users WHERE id = ? LIMIT 1', [
      userIdParam,
    ]);
    if (!row) return { ok: false, status: 404, error: 'Utilisateur introuvable' };
    resolvedUserType = row.user_type;
    resolvedUserId = row.id;
  }
  if (!['teacher', 'student'].includes(resolvedUserType)) {
    return { ok: false, status: 400, error: 'Type de compte non pris en charge' };
  }
  const user = await queryOne('SELECT * FROM users WHERE id = ? AND user_type = ? LIMIT 1', [
    resolvedUserId,
    resolvedUserType,
  ]);
  if (!user) return { ok: false, status: 404, error: 'Utilisateur introuvable' };
  return { ok: true, user, resolvedUserType, resolvedUserId };
}

const { userTypeForRole } = require('../lib/studentRouteHelpers');

/**
 * Lecture des comptes : ouverte à l'attribution des profils **et** à la gestion des groupes.
 * Un prof de classe (`groups.manage`, sans vue globale) ne voit que les comptes de ses
 * groupes — c'est ce qui rend son onglet « Classe » utilisable (CDG-20).
 */
async function requireUsersRead(req, res, next) {
  await requireAuth(req, res, async () => {
    if (
      hasPermission(req.auth, 'admin.users.assign_roles') ||
      hasPermission(req.auth, 'groups.manage')
    ) {
      return next();
    }
    return res.status(403).json({ error: 'Permission insuffisante' });
  });
}

/** Comptes visibles : tous avec la vue globale, sinon les membres des groupes du périmètre. */
async function visibleUserIdsForActor(auth) {
  if (canBypassGroupScope(auth)) return null;
  const groupIds = await getUserAccessibleGroupIds(auth, { includeDescendants: true });
  if (groupIds.length === 0) return new Set();
  const rows = await queryAll(
    `SELECT DISTINCT user_id FROM group_members WHERE group_id IN (${groupIds.map(() => '?').join(',')})`,
    groupIds,
  );
  return new Set(rows.map((row) => String(row.user_id)));
}

/** Rôle attribué + rôle effectif d'un compte, pour la liste et la fiche. */
function roleFieldsFor(u) {
  return {
    role_id: u.role_id ?? null,
    role_slug: u.role_slug ?? null,
    role_display_name: u.role_display_name ?? null,
    assigned_role_id: u.assigned_role_id ?? null,
    assigned_role_slug: u.assigned_role_slug ?? null,
    assigned_role_display_name: u.assigned_role_display_name ?? null,
  };
}

router.post(
  '/users',
  requirePermission('users.create'),
  asyncHandler(async (req, res) => {
    const roleSlug = normalizeRoleSlug(req.body?.role_slug);
    const role = roleSlug
      ? await queryOne('SELECT id, slug, display_name, `rank` FROM roles WHERE slug = ? LIMIT 1', [
          roleSlug,
        ])
      : null;
    if (!role) return res.status(400).json({ error: 'role_slug invalide ou profil introuvable' });
    const grant = checkRoleGrantAllowed(req.auth, role);
    if (!grant.ok) return res.status(grant.status).json({ error: grant.error });

    const firstName = normalizeOptionalString(req.body?.first_name);
    const lastName = normalizeOptionalString(req.body?.last_name);
    const password = String(req.body?.password || '');
    const pseudo = normalizeOptionalString(req.body?.pseudo);
    const email = normalizeEmail(req.body?.email);
    const description = normalizeOptionalString(req.body?.description);
    // Le type de compte se déduit du profil demandé (surchargeable pour un profil sur mesure),
    // et il décide du plancher de mot de passe : 4 caractères conviennent à un élève de
    // sixième, pas à un compte qui porte des droits d'encadrement.
    const requestedType = String(req.body?.user_type || '')
      .trim()
      .toLowerCase();
    const userType = ['student', 'teacher'].includes(requestedType)
      ? requestedType
      : userTypeForRole(role);
    const minPasswordLen = await getPasswordMinLengthFor(userType);
    if (!firstName || !lastName) return res.status(400).json({ error: 'Prénom et nom requis' });
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
    if (description != null && description.length > MAX_DESCRIPTION_LEN) {
      return res
        .status(400)
        .json({ error: `Description trop longue (max ${MAX_DESCRIPTION_LEN} caractères)` });
    }

    if (userType === 'student') {
      const existingByName = await queryOne(
        "SELECT id FROM users WHERE user_type = 'student' AND LOWER(first_name)=LOWER(?) AND LOWER(last_name)=LOWER(?) LIMIT 1",
        [firstName, lastName],
      );
      if (existingByName)
        return res.status(409).json({ error: 'Un n3beur avec ce nom existe déjà' });
    }
    if (pseudo) {
      const existingPseudo = await queryOne(
        'SELECT id FROM users WHERE LOWER(pseudo)=LOWER(?) LIMIT 1',
        [pseudo],
      );
      if (existingPseudo) return res.status(409).json({ error: 'Ce pseudo est déjà utilisé' });
    }
    if (email) {
      const existingEmail = await queryOne(
        'SELECT id FROM users WHERE LOWER(email)=LOWER(?) LIMIT 1',
        [email],
      );
      if (existingEmail) return res.status(409).json({ error: 'Cet email est déjà utilisé' });
    }

    const hash = await bcrypt.hash(password, 10);
    const id = crypto.randomUUID();
    const now = nowDbTimestamp();
    try {
      await execute(
        `INSERT INTO users
            (id, user_type, assigned_role_id, legacy_user_id, email, pseudo, first_name, last_name, display_name, description, avatar_path, password_hash, auth_provider, is_active, last_seen, created_at, updated_at)
           VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, NULL, ?, 'local', 1, ?, NOW(), NOW())`,
        [
          id,
          userType,
          role.id,
          email,
          pseudo,
          firstName,
          lastName,
          `${firstName} ${lastName}`.trim(),
          description,
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
    let effective = await setAssignedRole(id, role.id);

    {
      const { addUserToGroup } = require('../lib/groupMembers');
      const groupId = String(req.body?.group_id || '').trim() || null;
      if (!canBypassGroupScope(req.auth)) {
        if (!groupId) {
          await execute('DELETE FROM users WHERE id = ?', [id]);
          return res.status(400).json({
            error: 'group_id requis : rattachez l’élève à un groupe de votre périmètre',
          });
        }
        if (!(await isGroupInManageScope(req.auth, groupId))) {
          await execute('DELETE FROM users WHERE id = ?', [id]);
          return res.status(403).json({ error: 'Groupe hors périmètre' });
        }
        const attach = await addUserToGroup(id, groupId);
        if (!attach.ok) {
          await execute('DELETE FROM users WHERE id = ?', [id]);
          return res
            .status(attach.status || 400)
            .json({ error: attach.error || 'Rattachement impossible' });
        }
        effective = attach.role;
      } else if (groupId) {
        const attach = await addUserToGroup(id, groupId);
        if (attach.ok) effective = attach.role;
      }
    }

    const created = await queryOne('SELECT * FROM users WHERE id = ? LIMIT 1', [id]);
    logAudit('create_user_manual', 'user', id, `${firstName} ${lastName}`, {
      req,
      payload: { user_type: userType, role_slug: role.slug, group_id: req.body?.group_id || null },
    });
    if (userType === 'student') {
      emitStudentsChanged({ reason: 'create_student_manual', studentId: id });
    }
    res.status(201).json({
      ...toPublicUserRow(created),
      assigned_role_slug: role.slug,
      // Profil effectif (le groupe peut conférer un profil plus élevé que celui demandé).
      role_slug: effective?.roleSlug || role.slug,
      role_display_name: effective?.roleDisplayName || role.display_name,
    });
  }),
);

router.get(
  '/profiles',
  requirePermission('admin.roles.manage'),
  asyncHandler(async (req, res) => {
    const rolesWithProgression = await queryAll(
      'SELECT id, slug, display_name, emoji, min_done_tasks, display_order, `rank` AS `rank`, is_system, forum_participate, context_comment_participate, max_concurrent_tasks FROM roles ORDER BY display_order ASC, `rank` DESC, id ASC',
    );
    const perms = await queryAll(
      'SELECT `key`, label, description FROM permissions ORDER BY `key` ASC',
    );
    const rolePerms = await queryAll(
      'SELECT role_id, permission_key FROM role_permissions ORDER BY role_id ASC, permission_key ASC',
    );
    const map = new Map();
    for (const row of rolePerms) {
      if (!map.has(row.role_id)) map.set(row.role_id, []);
      map.get(row.role_id).push({
        key: row.permission_key,
      });
    }
    // `group_default_allowed` : ce profil peut-il servir de profil par défaut d'un groupe,
    // **pour l'acteur courant** ? Tous les profils sauf ceux du jeu G&L ; hors administrateur,
    // pas de profil de rang supérieur au sien (même règle que `lib/groupDefaultRolePolicy.js`).
    const actorIsAdmin = normalizeRoleSlug(req.auth?.roleSlug) === 'admin';
    const actorRank = Number(req.auth?.roleRank || 0);
    const rolesPayload = rolesWithProgression
      .map((r) => ({ ...r, permissions: map.get(r.id) || [] }))
      .map((r) => ({
        ...r,
        catalog: perms,
        group_default_allowed:
          !isGlRoleSlug(r.slug) && (actorIsAdmin || Number(r.rank) <= actorRank),
      }));
    const progressionByValidatedTasksEnabled = await getSettingValue(
      'rbac.progression_by_validated_tasks',
      true,
    );
    res.json({
      roles: rolesPayload,
      progressionByValidatedTasksEnabled: !!progressionByValidatedTasksEnabled,
    });
  }),
);

router.patch(
  '/progression-by-validated-tasks',
  requirePermission('admin.roles.manage'),
  asyncHandler(async (req, res) => {
    const raw = req.body?.enabled;
    if (typeof raw !== 'boolean') {
      return res.status(400).json({ error: 'Champ « enabled » booléen requis' });
    }
    // La valeur est un booléen déjà validé : une erreur ici est une panne interne (500),
    // pas une erreur de saisie — ne pas la renvoyer en 400 avec le message brut.
    const updated = await setSetting('rbac.progression_by_validated_tasks', raw, {
      userType: req.auth?.userType,
      userId: req.auth?.userId,
    });
    logAudit('rbac_progression_by_tasks', 'setting', null, 'rbac.progression_by_validated_tasks', {
      req,
      payload: { enabled: updated },
    });
    res.json({ ok: true, progressionByValidatedTasksEnabled: updated });
  }),
);

/**
 * Recalcul du profil n3beur d'après les tâches validées — en masse (tous / un groupe) ou pour
 * un compte. `dry_run` renvoie l'aperçu sans rien écrire ; `allow_demotion` autorise
 * l'alignement strict (le palier peut redescendre), sinon montée seule.
 */
router.post(
  '/progression/recompute',
  requirePermission('admin.roles.manage'),
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const result = await recomputeStudentProfilesFromValidatedTasks({
      scope: body.scope ?? 'all',
      groupId: body.group_id ?? body.groupId ?? null,
      userId: body.user_id ?? body.userId ?? null,
      allowDemotion: body.allow_demotion === true || body.allowDemotion === true,
      dryRun: body.dry_run === true || body.dryRun === true,
    });
    if (!result.ok) return res.status(result.status).json({ error: result.error });
    if (!result.dryRun && result.changed > 0) {
      logAudit('rbac_progression_recompute', 'role', null, `scope=${result.scope}`, {
        req,
        payload: {
          scope: result.scope,
          group_id: body.group_id ?? body.groupId ?? null,
          user_id: body.user_id ?? body.userId ?? null,
          allow_demotion: result.allowDemotion,
          scanned: result.scanned,
          changed: result.changed,
        },
      });
      for (const row of result.results) {
        if (row.changed)
          emitStudentsChanged({ reason: 'progression_recompute', studentId: row.userId });
      }
    }
    res.json(result);
  }),
);

router.post(
  '/profiles',
  requirePermission('admin.roles.manage'),
  asyncHandler(async (req, res) => {
    const slug = String(req.body?.slug || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, '_')
      .replace(/^_+|_+$/g, '');
    const displayName = String(req.body?.display_name || '').trim();
    const rank = Number.isFinite(parseInt(req.body?.rank, 10)) ? parseInt(req.body.rank, 10) : 100;
    const emoji = normalizeRoleEmoji(req.body?.emoji);
    const minDoneTasks = parseOptionalNonNegativeInt(req.body?.min_done_tasks, null);
    const displayOrder = parseOptionalNonNegativeInt(req.body?.display_order, 0);
    let maxConcurrentTasks = null;
    if (
      Object.prototype.hasOwnProperty.call(req.body || {}, 'max_concurrent_tasks') ||
      Object.prototype.hasOwnProperty.call(req.body || {}, 'maxConcurrentTasks')
    ) {
      if (!canConfigureStudentTierForumContext(slug, rank)) {
        return res.status(400).json({
          error:
            'max_concurrent_tasks : réservé aux profils n3beur (slug eleve_* ou rang strictement inférieur à celui du n3boss, hors admin, prof, visiteur, personnel)',
        });
      }
      const rawMct = Object.prototype.hasOwnProperty.call(req.body || {}, 'max_concurrent_tasks')
        ? req.body.max_concurrent_tasks
        : req.body.maxConcurrentTasks;
      const parsed = rawMct === undefined ? null : parseOptionalMaxConcurrentTasks(rawMct);
      if (Number.isNaN(parsed)) {
        return res.status(400).json({
          error:
            'max_concurrent_tasks invalide (0–99, vide ou null pour hériter du réglage global)',
        });
      }
      maxConcurrentTasks = parsed;
    }
    if (!slug || !displayName)
      return res.status(400).json({ error: 'slug et display_name requis' });
    const reservedCreate = reservedRoleSlugError(slug);
    if (reservedCreate) return res.status(400).json({ error: reservedCreate });
    const rankErr = rankChangeError({ actor: req.auth, isSystemProfile: false, nextRank: rank });
    if (rankErr) return res.status(rankErr.status).json({ error: rankErr.error });
    if (Number.isNaN(minDoneTasks))
      return res.status(400).json({ error: 'min_done_tasks invalide (entier >= 0)' });
    if (Number.isNaN(displayOrder))
      return res.status(400).json({ error: 'display_order invalide (entier >= 0)' });
    if (STUDENT_ROLE_SLUG_RE.test(slug) && (emoji == null || minDoneTasks == null)) {
      return res
        .status(400)
        .json({ error: 'Un profil n3beur doit définir emoji et min_done_tasks' });
    }
    try {
      await execute(
        'INSERT INTO roles (slug, display_name, emoji, min_done_tasks, display_order, `rank`, is_system, max_concurrent_tasks) VALUES (?, ?, ?, ?, ?, ?, 0, ?)',
        [slug, displayName, emoji, minDoneTasks, displayOrder ?? 0, rank, maxConcurrentTasks],
      );
    } catch (e) {
      rethrowSlugConflict(e);
    }
    const role = await queryOne(
      'SELECT id, slug, display_name, emoji, min_done_tasks, display_order, `rank` AS `rank`, is_system, forum_participate, context_comment_participate, max_concurrent_tasks FROM roles WHERE slug = ? LIMIT 1',
      [slug],
    );
    logAudit('rbac_create_profile', 'role', role?.id || null, slug, { req });
    res.status(201).json(role);
  }),
);

router.post(
  '/profiles/:id/duplicate',
  requirePermission('admin.roles.manage'),
  asyncHandler(async (req, res) => {
    const sourceId = parseInt(req.params.id, 10);
    if (!Number.isFinite(sourceId) || sourceId <= 0) {
      return res.status(400).json({ error: 'id de profil invalide' });
    }
    const source = await queryOne(
      `SELECT id, slug, display_name, emoji, min_done_tasks, display_order, \`rank\` AS \`rank\`,
              COALESCE(forum_participate, 1) AS forum_participate,
              COALESCE(context_comment_participate, 1) AS context_comment_participate,
              max_concurrent_tasks
         FROM roles WHERE id = ?`,
      [sourceId],
    );
    if (!source) return res.status(404).json({ error: 'Profil introuvable' });

    const slug = String(req.body?.slug || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, '_')
      .replace(/^_+|_+$/g, '');
    const displayNameRaw = req.body?.display_name;
    const displayName =
      displayNameRaw != null && String(displayNameRaw).trim()
        ? String(displayNameRaw).trim()
        : `${source.display_name} (copie)`;
    const rank = Number.isFinite(parseInt(source.rank, 10)) ? parseInt(source.rank, 10) : 100;
    const emoji = normalizeRoleEmoji(source.emoji);
    const minDoneTasks = parseOptionalNonNegativeInt(source.min_done_tasks, null);
    const displayOrder = parseOptionalNonNegativeInt(source.display_order, 0);
    const forumParticipate = Number(source.forum_participate) !== 0 ? 1 : 0;
    const contextCommentParticipate = Number(source.context_comment_participate) !== 0 ? 1 : 0;
    const maxConcurrentTasks =
      source.max_concurrent_tasks != null && source.max_concurrent_tasks !== ''
        ? source.max_concurrent_tasks
        : null;

    if (!slug || !displayName)
      return res.status(400).json({ error: 'slug requis ; display_name ne peut pas être vide' });
    const reservedDup = reservedRoleSlugError(slug);
    if (reservedDup) return res.status(400).json({ error: reservedDup });
    const rankErrDup = rankChangeError({ actor: req.auth, isSystemProfile: false, nextRank: rank });
    if (rankErrDup) return res.status(rankErrDup.status).json({ error: rankErrDup.error });
    if (Number.isNaN(minDoneTasks))
      return res.status(400).json({ error: 'min_done_tasks source invalide' });
    if (Number.isNaN(displayOrder))
      return res.status(400).json({ error: 'display_order source invalide' });
    if (STUDENT_ROLE_SLUG_RE.test(slug) && (emoji == null || minDoneTasks == null)) {
      return res.status(400).json({
        error:
          'Un profil n3beur doit définir emoji et min_done_tasks (source incompatible ou slug eleve_* sans données)',
      });
    }

    // Catch SCOPÉ sur le seul INSERT dup-prone du handler (roles.slug UNIQUE) : un conflit
    // d'unicité est relancé en erreur `.status=409` rendue telle quelle par le handler central.
    try {
      await execute(
        `INSERT INTO roles (slug, display_name, emoji, min_done_tasks, display_order, \`rank\`, is_system, forum_participate, context_comment_participate, max_concurrent_tasks)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
        [
          slug,
          displayName,
          emoji,
          minDoneTasks,
          displayOrder ?? 0,
          rank,
          forumParticipate,
          contextCommentParticipate,
          maxConcurrentTasks,
        ],
      );
    } catch (e) {
      rethrowSlugConflict(e);
    }
    const newRole = await queryOne(
      'SELECT id, slug, display_name, emoji, min_done_tasks, display_order, `rank` AS `rank`, is_system, forum_participate, context_comment_participate, max_concurrent_tasks FROM roles WHERE slug = ? LIMIT 1',
      [slug],
    );
    if (!newRole?.id) {
      logRouteError(new Error('Profil dupliqué introuvable après insertion'), req);
      return res.status(500).json({ error: 'Profil dupliqué introuvable après insertion' });
    }

    const sourcePerms = await queryAll(
      'SELECT permission_key FROM role_permissions WHERE role_id = ? ORDER BY permission_key ASC',
      [sourceId],
    );
    // Ne conserve que les permissions encore presentes au catalogue (resolues en UNE requete au
    // lieu d'un SELECT par cle), puis les copie en UNE requete multi-valeurs (au lieu d'une boucle N+1).
    // NB : cette copie n'est PAS dup-prone — PRIMARY KEY (role_id, permission_key), lignes sources
    // uniques par construction et role_id fraîchement créé (aucune ligne existante).
    const sourceKeys = sourcePerms.map((row) => row.permission_key);
    const validKeys = new Set();
    if (sourceKeys.length > 0) {
      const catalogRows = await queryAll(
        `SELECT \`key\` FROM permissions WHERE \`key\` IN (${sourceKeys.map(() => '?').join(',')})`,
        sourceKeys,
      );
      for (const row of catalogRows) validKeys.add(row.key);
    }
    const permsToCopy = sourcePerms.filter((row) => validKeys.has(row.permission_key));
    if (permsToCopy.length > 0) {
      const placeholders = permsToCopy.map(() => '(?, ?)').join(', ');
      const params = [];
      for (const row of permsToCopy) params.push(newRole.id, row.permission_key);
      await execute(
        `INSERT INTO role_permissions (role_id, permission_key) VALUES ${placeholders}`,
        params,
      );
    }
    logAudit('rbac_duplicate_profile', 'role', newRole.id, `from=${sourceId} slug=${slug}`, {
      req,
    });
    res.status(201).json(newRole);
  }),
);

router.patch(
  '/profiles/:id',
  requirePermission('admin.roles.manage'),
  asyncHandler(async (req, res) => {
    const role = await queryOne('SELECT id FROM roles WHERE id = ?', [req.params.id]);
    if (!role) return res.status(404).json({ error: 'Profil introuvable' });
    const existing = await queryOne(
      'SELECT slug, display_name, emoji, min_done_tasks, display_order, `rank` AS `rank`, is_system, COALESCE(forum_participate, 1) AS forum_participate, COALESCE(context_comment_participate, 1) AS context_comment_participate, max_concurrent_tasks FROM roles WHERE id = ?',
      [role.id],
    );
    if (
      normalizeRoleSlug(existing.slug) === 'admin' &&
      normalizeRoleSlug(req.auth?.roleSlug) !== 'admin'
    ) {
      return res
        .status(403)
        .json({ error: 'Seul un administrateur peut modifier le profil admin' });
    }
    const b =
      req.body != null && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    const hasAnyPatchField = Object.keys(b).some((k) => PROFILE_PATCH_KEYS.has(k));
    const hasDisplayName = Object.prototype.hasOwnProperty.call(b, 'display_name');
    const hasRank = Object.prototype.hasOwnProperty.call(b, 'rank');
    const hasEmoji = Object.prototype.hasOwnProperty.call(b, 'emoji');
    const hasMinDoneTasks = Object.prototype.hasOwnProperty.call(b, 'min_done_tasks');
    const hasDisplayOrder = Object.prototype.hasOwnProperty.call(b, 'display_order');
    const hasForumParticipate =
      Object.prototype.hasOwnProperty.call(b, 'forum_participate') ||
      Object.prototype.hasOwnProperty.call(b, 'forumParticipate');
    const hasContextCommentParticipate =
      Object.prototype.hasOwnProperty.call(b, 'context_comment_participate') ||
      Object.prototype.hasOwnProperty.call(b, 'contextCommentParticipate');
    const hasMaxConcurrentTasks =
      Object.prototype.hasOwnProperty.call(b, 'max_concurrent_tasks') ||
      Object.prototype.hasOwnProperty.call(b, 'maxConcurrentTasks');
    const canForumContext = canConfigureStudentTierForumContext(existing.slug, existing.rank);
    if (!hasAnyPatchField) {
      return res.status(400).json({ error: 'Aucun champ de profil fourni' });
    }
    if ((hasForumParticipate || hasContextCommentParticipate) && !canForumContext) {
      return res.status(400).json({
        error:
          'Forum et commentaires contextuels ne s’appliquent qu’aux profils n3beur (slug eleve_* ou palier avec rang inférieur à celui du n3boss)',
      });
    }
    if (hasMaxConcurrentTasks && !canForumContext) {
      return res.status(400).json({
        error:
          'Le plafond d’inscriptions aux tâches ne s’applique qu’aux profils n3beur (slug eleve_* ou palier avec rang inférieur à celui du n3boss)',
      });
    }
    // Un seuil de tâches validées ferait entrer le profil dans l'échelle de progression : il
    // est réservé aux paliers n3beur, jamais à un profil d'encadrement (CDG-09).
    if (
      hasMinDoneTasks &&
      b.min_done_tasks != null &&
      b.min_done_tasks !== '' &&
      !canForumContext
    ) {
      return res.status(400).json({
        error: 'Le seuil de tâches validées ne s’applique qu’aux profils n3beur',
      });
    }
    const displayName = hasDisplayName
      ? String(b.display_name || '').trim()
      : existing.display_name;
    const rank = hasRank ? parseInt(b.rank, 10) : existing.rank;
    const emoji = hasEmoji ? normalizeRoleEmoji(b.emoji) : existing.emoji;
    const minDoneTasks = hasMinDoneTasks
      ? parseOptionalNonNegativeInt(b.min_done_tasks, null)
      : existing.min_done_tasks;
    const displayOrder = hasDisplayOrder
      ? parseOptionalNonNegativeInt(b.display_order, existing.display_order ?? 0)
      : (existing.display_order ?? 0);
    let forumParticipate = Number(existing.forum_participate) !== 0 ? 1 : 0;
    let contextCommentParticipate = Number(existing.context_comment_participate) !== 0 ? 1 : 0;
    if (hasForumParticipate) {
      const v = Object.prototype.hasOwnProperty.call(b, 'forum_participate')
        ? b.forum_participate
        : b.forumParticipate;
      forumParticipate = v ? 1 : 0;
    }
    if (hasContextCommentParticipate) {
      const v = Object.prototype.hasOwnProperty.call(b, 'context_comment_participate')
        ? b.context_comment_participate
        : b.contextCommentParticipate;
      contextCommentParticipate = v ? 1 : 0;
    }
    let maxConcurrentTasksVal = existing.max_concurrent_tasks;
    if (hasMaxConcurrentTasks) {
      const rawMct = Object.prototype.hasOwnProperty.call(b, 'max_concurrent_tasks')
        ? b.max_concurrent_tasks
        : b.maxConcurrentTasks;
      maxConcurrentTasksVal = parseOptionalMaxConcurrentTasks(rawMct);
      if (Number.isNaN(maxConcurrentTasksVal)) {
        return res.status(400).json({
          error:
            'max_concurrent_tasks invalide (0–99, vide ou null pour hériter du réglage global)',
        });
      }
    }
    if (!displayName) return res.status(400).json({ error: 'display_name requis' });
    if (!Number.isFinite(rank)) return res.status(400).json({ error: 'rank invalide' });
    if (hasRank) {
      const rankErr = rankChangeError({
        actor: req.auth,
        isSystemProfile: Number(existing.is_system) === 1 || isReservedRoleSlug(existing.slug),
        currentRank: existing.rank,
        nextRank: rank,
      });
      if (rankErr) return res.status(rankErr.status).json({ error: rankErr.error });
    }
    if (Number.isNaN(minDoneTasks))
      return res.status(400).json({ error: 'min_done_tasks invalide (entier >= 0)' });
    if (Number.isNaN(displayOrder))
      return res.status(400).json({ error: 'display_order invalide (entier >= 0)' });
    if (STUDENT_ROLE_SLUG_RE.test(existing.slug) && (emoji == null || minDoneTasks == null)) {
      return res
        .status(400)
        .json({ error: 'Un profil n3beur doit définir emoji et min_done_tasks' });
    }
    await execute(
      'UPDATE roles SET display_name = ?, emoji = ?, min_done_tasks = ?, display_order = ?, `rank` = ?, forum_participate = ?, context_comment_participate = ?, max_concurrent_tasks = ?, updated_at = NOW() WHERE id = ?',
      [
        displayName,
        emoji,
        minDoneTasks,
        displayOrder,
        rank,
        forumParticipate,
        contextCommentParticipate,
        maxConcurrentTasksVal,
        role.id,
      ],
    );
    const updated = await queryOne(
      'SELECT id, slug, display_name, emoji, min_done_tasks, display_order, `rank` AS `rank`, is_system, forum_participate, context_comment_participate, max_concurrent_tasks FROM roles WHERE id = ?',
      [role.id],
    );
    logAudit('rbac_update_profile', 'role', role.id, updated?.slug || String(role.id), { req });
    if (canForumContext && (hasForumParticipate || hasContextCommentParticipate)) {
      await emitStudentsWithPrimaryRole(role.id);
    }
    res.json(updated);
  }),
);

/**
 * Suppression d'un profil **sur mesure** (CDG-53). Un profil système ou réservé ne se supprime
 * pas ; un profil encore attribué (profil attribué ou effectif d'un compte) ou posé comme
 * profil par défaut d'un groupe est refusé en 409 : on ne fait pas disparaître des droits en
 * silence. Hors administrateur, rang ≤ au sien.
 */
router.delete(
  '/profiles/:id',
  requirePermission('admin.roles.manage'),
  asyncHandler(async (req, res) => {
    const role = await queryOne('SELECT id, slug, `rank`, is_system FROM roles WHERE id = ?', [
      req.params.id,
    ]);
    if (!role) return res.status(404).json({ error: 'Profil introuvable' });
    if (Number(role.is_system) === 1 || isReservedRoleSlug(role.slug)) {
      return res.status(400).json({ error: 'Un profil système ne se supprime pas' });
    }
    const rankErr = rankChangeError({
      actor: req.auth,
      isSystemProfile: false,
      nextRank: role.rank,
    });
    if (rankErr) return res.status(rankErr.status).json({ error: rankErr.error });
    const usage = await queryOne(
      `SELECT
         (SELECT COUNT(*) FROM users WHERE assigned_role_id = ?) +
         (SELECT COUNT(*) FROM user_roles WHERE role_id = ? AND is_primary = 1) AS accounts,
         (SELECT COUNT(*) FROM \`groups\` WHERE default_role_id = ?) AS groups_count`,
      [role.id, role.id, role.id],
    );
    if (Number(usage?.accounts || 0) > 0 || Number(usage?.groups_count || 0) > 0) {
      return res.status(409).json({
        error:
          'Ce profil est encore utilisé : réattribuez les comptes et retirez-le des groupes avant de le supprimer',
        accounts: Number(usage?.accounts || 0),
        groups: Number(usage?.groups_count || 0),
      });
    }
    await execute('DELETE FROM roles WHERE id = ?', [role.id]);
    logAudit('rbac_delete_profile', 'role', role.id, role.slug, { req });
    res.json({ ok: true, deleted: role.id });
  }),
);

router.put(
  '/profiles/:id/permissions',
  requirePermission('admin.roles.manage'),
  asyncHandler(async (req, res) => {
    const role = await queryOne('SELECT id, slug FROM roles WHERE id = ?', [req.params.id]);
    if (!role) return res.status(404).json({ error: 'Profil introuvable' });
    const actorRoleSlug = String(req.auth?.roleSlug || '')
      .trim()
      .toLowerCase();
    const actorPerms = Array.isArray(req.auth?.permissions) ? req.auth.permissions : [];
    if (String(role.slug || '').toLowerCase() === 'admin' && actorRoleSlug !== 'admin') {
      return res
        .status(403)
        .json({ error: 'Seul un administrateur peut modifier le profil admin' });
    }
    const entries = Array.isArray(req.body?.permissions) ? req.body.permissions : [];
    // Garde « porte d'entrée » : un profil système d'enseignant ne peut pas perdre
    // `teacher.access` ici. La révocation est durable depuis la migration 241 et le
    // libellé du catalogue (« Accès interface n3boss ») invite à la décocher sur
    // « Prof de classe », dont c'est pourtant le seul droit d'accès à l'API.
    const doorLockError = teacherAccessLockError(
      role.slug,
      entries.map((item) => item?.key),
    );
    if (doorLockError) return res.status(400).json({ error: doorLockError });
    if (actorRoleSlug !== 'admin') {
      for (const item of entries) {
        const key = String(item?.key || '').trim();
        if (!key) continue;
        if (!actorPerms.includes(key)) {
          return res.status(403).json({
            error: `Vous ne pouvez pas accorder une permission que vous ne détenez pas (${key})`,
          });
        }
      }
    }
    await withTransaction(async (tx) => {
      await tx.execute('DELETE FROM role_permissions WHERE role_id = ?', [role.id]);
      for (const item of entries) {
        const key = String(item?.key || '').trim();
        if (!key) continue;
        const p = await tx.queryOne('SELECT `key` FROM permissions WHERE `key` = ? LIMIT 1', [key]);
        if (!p) continue;
        await tx.execute('INSERT INTO role_permissions (role_id, permission_key) VALUES (?, ?)', [
          role.id,
          key,
        ]);
      }
    });
    logAudit('rbac_update_profile_permissions', 'role', role.id, `permissions=${entries.length}`, {
      req,
    });
    res.json({ ok: true });
  }),
);

router.get(
  '/users',
  requireUsersRead,
  asyncHandler(async (req, res) => {
    const allUsers = await queryAll(
      `SELECT u.id, u.user_type, u.is_active, u.auth_provider,
              u.first_name, u.last_name, u.pseudo, u.description,
              COALESCE(NULLIF(u.display_name, ''), NULLIF(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')), ''), u.email, u.pseudo, u.id) AS display_name,
              u.email, ur.role_id, r.slug AS role_slug, r.display_name AS role_display_name,
              u.assigned_role_id, ar.slug AS assigned_role_slug, ar.display_name AS assigned_role_display_name,
              COALESCE(r.forum_participate, 1) AS forum_participate,
              COALESCE(r.context_comment_participate, 1) AS context_comment_participate
         FROM users u
    LEFT JOIN user_roles ur ON ur.user_type = u.user_type AND ur.user_id = u.id AND ur.is_primary = 1
    LEFT JOIN roles r ON r.id = ur.role_id
    LEFT JOIN roles ar ON ar.id = u.assigned_role_id
     ORDER BY u.user_type ASC, display_name ASC`,
    );
    const visibleIds = await visibleUserIdsForActor(req.auth);
    const users = visibleIds ? allUsers.filter((u) => visibleIds.has(String(u.id))) : allUsers;
    const visibility = await resolveGroupVisibility(req.auth);
    const groupsByUserId = await fetchGroupsByUserId(
      users.map((u) => u.id),
      visibility,
    );
    res.json(
      users.map((u) => ({
        id: u.id,
        user_type: u.user_type,
        is_active: Number(u.is_active) !== 0,
        auth_provider: jsonTextField(u.auth_provider) || 'local',
        display_name: u.display_name,
        first_name: jsonTextField(u.first_name),
        last_name: jsonTextField(u.last_name),
        pseudo: jsonTextField(u.pseudo),
        email: jsonTextField(u.email),
        description: jsonTextField(u.description),
        ...roleFieldsFor(u),
        forum_participate: u.user_type === 'student' ? Number(u.forum_participate) !== 0 : true,
        context_comment_participate:
          u.user_type === 'student' ? Number(u.context_comment_participate) !== 0 : true,
        groups: groupsByUserId.get(String(u.id)) || [],
      })),
    );
  }),
);

router.get(
  '/users/:userType/:userId',
  requireUsersRead,
  asyncHandler(async (req, res) => {
    const resolved = await resolveRbacSubjectForMutation(req.params.userType, req.params.userId);
    if (!resolved.ok) return res.status(resolved.status).json({ error: resolved.error });
    const { user: u, resolvedUserType, resolvedUserId } = resolved;
    const visibleIds = await visibleUserIdsForActor(req.auth);
    if (visibleIds && !visibleIds.has(String(resolvedUserId))) {
      return res.status(403).json({ error: 'Compte hors de votre périmètre' });
    }
    const roles = await describeUserRoles(resolvedUserId);
    const rj = await queryOne(
      `SELECT ur.role_id, r.slug AS role_slug, r.display_name AS role_display_name,
              COALESCE(r.forum_participate, 1) AS forum_participate,
              COALESCE(r.context_comment_participate, 1) AS context_comment_participate
         FROM user_roles ur
         LEFT JOIN roles r ON r.id = ur.role_id
        WHERE ur.user_type = ? AND ur.user_id = ? AND ur.is_primary = 1 LIMIT 1`,
      [resolvedUserType, resolvedUserId],
    );
    const visibility = await resolveGroupVisibility(req.auth);
    const groupsByUserId = await fetchGroupsByUserId([resolvedUserId], visibility);
    const displayName =
      (u.display_name && String(u.display_name).trim()) ||
      `${u.first_name || ''} ${u.last_name || ''}`.trim() ||
      u.email ||
      u.pseudo ||
      u.id;
    res.json({
      id: u.id,
      user_type: u.user_type,
      display_name: displayName,
      first_name: jsonTextField(u.first_name),
      last_name: jsonTextField(u.last_name),
      pseudo: jsonTextField(u.pseudo),
      email: jsonTextField(u.email),
      description: jsonTextField(u.description),
      role_id: rj?.role_id ?? null,
      role_slug: rj?.role_slug ?? null,
      role_display_name: rj?.role_display_name ?? null,
      // Profil attribué, profil effectif (avec son origine) et groupes qui confèrent un profil.
      assigned_role_id: roles?.assigned?.id ?? null,
      assigned_role_slug: roles?.assigned?.slug ?? null,
      assigned_role_display_name: roles?.assigned?.displayName ?? null,
      effective_role: roles?.effective ?? null,
      conferring_groups: roles?.conferring ?? [],
      forum_participate:
        resolvedUserType === 'student' ? Number(rj?.forum_participate) !== 0 : true,
      context_comment_participate:
        resolvedUserType === 'student' ? Number(rj?.context_comment_participate) !== 0 : true,
      groups: groupsByUserId.get(String(resolvedUserId)) || [],
      // Métadonnées de support (P13 de l'audit UX) : les questions posées quand « il ne peut
      // pas se connecter » — compte actif ? créé quand ? venu d'où ? vu pour la dernière fois ?
      is_active: Number(u.is_active) !== 0,
      auth_provider: jsonTextField(u.auth_provider) || 'local',
      created_at: u.created_at ? new Date(u.created_at).toISOString() : null,
      last_seen: jsonTextField(u.last_seen) || null,
    });
  }),
);

/**
 * Attribution du profil principal **en lot** (P2 de l'audit UX).
 *
 * Déclarée avant `/users/:userType/:userId` : `bulk-role` est un segment littéral, la
 * route paramétrée ne doit pas l'absorber.
 *
 * Chaque compte passe par la **même garde** que l'attribution unitaire
 * (`lib/rbacRoleAssignment.js`) : un lot ne peut pas accorder un rôle qu'une action unitaire
 * refuserait. L'échec d'un compte n'annule pas les autres — la réponse détaille chaque ligne
 * pour que l'interface dise exactement qui a été refusé et pourquoi.
 */
const BULK_ROLE_MAX_USERS = 200;

const bulkRoleBodySchema = z.unknown().superRefine((b, ctx) => {
  const roleId = parseInt(b && b.role_id, 10);
  if (!Number.isFinite(roleId) || roleId <= 0) {
    ctx.addIssue({ code: 'custom', message: 'role_id invalide', path: [] });
  }
  const users = b && b.users;
  if (!Array.isArray(users) || users.length === 0) {
    ctx.addIssue({ code: 'custom', message: 'users[] requis (non vide)', path: [] });
    return;
  }
  if (users.length > BULK_ROLE_MAX_USERS) {
    ctx.addIssue({
      code: 'custom',
      message: `users[] limité à ${BULK_ROLE_MAX_USERS} comptes par appel`,
      path: [],
    });
  }
});

router.post(
  '/users/bulk-role',
  requirePermission('admin.users.assign_roles'),
  validate({ body: bulkRoleBodySchema }),
  asyncHandler(async (req, res) => {
    const roleId = parseInt(req.body.role_id, 10);
    const role = await queryOne('SELECT id, slug, `rank` FROM roles WHERE id = ? LIMIT 1', [
      roleId,
    ]);
    if (!role) return res.status(404).json({ error: 'Profil introuvable' });

    const results = [];
    for (const entry of req.body.users) {
      const userType = String(entry?.user_type ?? entry?.userType ?? '').trim();
      const userId = entry?.id ?? entry?.user_id;
      const resolved = await resolveRbacSubjectForMutation(userType, userId);
      if (!resolved.ok) {
        results.push({
          user_type: userType,
          id: String(userId ?? ''),
          ok: false,
          error: resolved.error,
        });
        continue;
      }
      const applied = await assignRole({
        actor: req.auth,
        userType: resolved.resolvedUserType,
        userId: resolved.resolvedUserId,
        roleId,
        nextRole: role,
      });
      results.push({
        user_type: resolved.resolvedUserType,
        id: String(resolved.resolvedUserId),
        ok: applied.ok,
        ...(applied.ok ? {} : { error: applied.error }),
      });
    }

    const updated = results.filter((r) => r.ok).length;
    logAudit('rbac_assign_role_bulk', 'role', String(roleId), `${updated}/${results.length}`, {
      req,
      payload: { role_id: roleId, requested: results.length, updated },
    });
    res.json({ ok: true, role_id: roleId, updated, failed: results.length - updated, results });
  }),
);

router.patch(
  '/users/:userType/:userId',
  requirePermission('admin.users.assign_roles'),
  asyncHandler(async (req, res) => {
    const resolved = await resolveRbacSubjectForMutation(req.params.userType, req.params.userId);
    if (!resolved.ok) return res.status(resolved.status).json({ error: resolved.error });
    const { user, resolvedUserType, resolvedUserId } = resolved;

    const actorRoleSlug = String(req.auth?.roleSlug || '')
      .trim()
      .toLowerCase();
    const targetPrimary = await getPrimaryRoleForUser(resolvedUserType, resolvedUserId);
    if (targetPrimary?.slug === 'admin' && actorRoleSlug !== 'admin') {
      return res
        .status(403)
        .json({ error: 'Seul un administrateur peut modifier un autre administrateur' });
    }

    const body = req.body || {};
    const hasFirst = Object.prototype.hasOwnProperty.call(body, 'first_name');
    const hasLast = Object.prototype.hasOwnProperty.call(body, 'last_name');
    const hasPseudo = Object.prototype.hasOwnProperty.call(body, 'pseudo');
    const hasEmail = Object.prototype.hasOwnProperty.call(body, 'email');
    const hasDescription = Object.prototype.hasOwnProperty.call(body, 'description');
    const hasPassword = Object.prototype.hasOwnProperty.call(body, 'password');
    const hasIsActive = Object.prototype.hasOwnProperty.call(body, 'is_active');
    const passwordRaw = hasPassword ? String(body.password ?? '') : '';

    const passwordWillChange = hasPassword && passwordRaw.trim() !== '';
    const nextIsActive = hasIsActive
      ? body.is_active
        ? 1
        : 0
      : Number(user.is_active) !== 0
        ? 1
        : 0;
    const activeWillChange = hasIsActive && nextIsActive !== (Number(user.is_active) !== 0 ? 1 : 0);
    if (
      !hasFirst &&
      !hasLast &&
      !hasPseudo &&
      !hasEmail &&
      !hasDescription &&
      !passwordWillChange &&
      !activeWillChange
    ) {
      return res.status(400).json({ error: 'Aucun champ à mettre à jour' });
    }

    // Mot de passe et désactivation : jamais sur soi-même, ni sur un profil de rang égal ou
    // supérieur au sien (hors administrateur). `admin.users.assign_roles` ne vaut pas prise
    // de contrôle d'un pair (CDG-07, CDG-40).
    if (passwordWillChange || activeWillChange) {
      if (String(req.auth?.userId) === String(resolvedUserId)) {
        return res
          .status(403)
          .json({ error: 'Utilisez votre profil pour modifier votre propre compte' });
      }
      if (
        actorRoleSlug !== 'admin' &&
        Number(targetPrimary?.rank || 0) >= Number(req.auth?.roleRank || 0)
      ) {
        return res.status(403).json({
          error: 'Réservé à un profil de rang supérieur à celui du compte visé',
        });
      }
    }
    if (activeWillChange && nextIsActive === 0 && targetPrimary?.slug === 'admin') {
      if ((await countPrimaryAdmins()) <= 1) {
        return res.status(409).json({ error: 'Action refusée: dernier administrateur actif' });
      }
    }

    let firstName = user.first_name;
    let lastName = user.last_name;
    if (hasFirst) {
      firstName = normalizeOptionalString(body.first_name);
      if (!firstName) return res.status(400).json({ error: 'Prénom invalide' });
    }
    if (hasLast) {
      lastName = normalizeOptionalString(body.last_name);
      if (!lastName) return res.status(400).json({ error: 'Nom invalide' });
    }

    let pseudo = user.pseudo;
    if (hasPseudo) {
      pseudo = normalizeOptionalString(body.pseudo);
      if (pseudo != null && !PSEUDO_RE.test(pseudo)) {
        return res.status(400).json({ error: PSEUDO_INVALID_MSG });
      }
    }

    let email = user.email;
    if (hasEmail) {
      email = normalizeEmail(body.email);
      if (email != null && !EMAIL_RE.test(email)) {
        return res.status(400).json({ error: 'Email invalide' });
      }
    }

    let description = user.description;
    if (hasDescription) {
      description = normalizeOptionalString(body.description);
      if (description != null && description.length > MAX_DESCRIPTION_LEN) {
        return res
          .status(400)
          .json({ error: `Description trop longue (max ${MAX_DESCRIPTION_LEN} caractères)` });
      }
    }

    if (resolvedUserType === 'student' && (hasFirst || hasLast)) {
      const dup = await queryOne(
        `SELECT id FROM users WHERE user_type = 'student' AND LOWER(first_name)=LOWER(?) AND LOWER(last_name)=LOWER(?) AND id <> ? LIMIT 1`,
        [firstName, lastName, resolvedUserId],
      );
      if (dup) return res.status(409).json({ error: 'Un n3beur avec ce nom existe déjà' });
    }

    if (pseudo) {
      const existingPseudo = await queryOne(
        'SELECT id FROM users WHERE LOWER(pseudo)=LOWER(?) AND id <> ? LIMIT 1',
        [pseudo, resolvedUserId],
      );
      if (existingPseudo) return res.status(409).json({ error: 'Ce pseudo est déjà utilisé' });
    }
    if (email) {
      const existingEmail = await queryOne(
        'SELECT id FROM users WHERE LOWER(email)=LOWER(?) AND id <> ? LIMIT 1',
        [email, resolvedUserId],
      );
      if (existingEmail) return res.status(409).json({ error: 'Cet email est déjà utilisé' });
    }

    let passwordHash = user.password_hash;
    if (passwordWillChange) {
      const minPasswordLen = await getPasswordMinLengthFor(resolvedUserType);
      if (passwordRaw.length < minPasswordLen) {
        return res
          .status(400)
          .json({ error: `Mot de passe trop court (min ${minPasswordLen} caractères)` });
      }
      passwordHash = await bcrypt.hash(passwordRaw, 10);
    }

    const displayName = `${firstName || ''} ${lastName || ''}`.trim() || user.display_name || null;

    try {
      await execute(
        `UPDATE users
             SET first_name = ?, last_name = ?, display_name = ?, pseudo = ?, email = ?, description = ?,
                 password_hash = ?, is_active = ?, updated_at = NOW()
           WHERE id = ? AND user_type = ?`,
        [
          firstName,
          lastName,
          displayName,
          pseudo,
          email,
          description,
          passwordHash,
          nextIsActive,
          resolvedUserId,
          resolvedUserType,
        ],
      );
    } catch (err) {
      if (err && (err.errno === 1062 || err.code === 'ER_DUP_ENTRY')) {
        return res.status(409).json({ error: 'Pseudo ou email déjà utilisé' });
      }
      throw err;
    }
    if (passwordWillChange || (activeWillChange && nextIsActive === 0)) {
      // Révoque les sessions en cours du compte (ForetMap et GL) : nouveau mot de passe ou
      // désactivation — la coupure est immédiate, pas à l'expiration du jeton.
      await bumpUserTokenEpoch(resolvedUserId);
    }
    if (activeWillChange) {
      logAudit(
        nextIsActive ? 'user_reactivate' : 'user_deactivate',
        'user',
        resolvedUserId,
        displayName,
        {
          req,
          payload: { user_type: resolvedUserType },
        },
      );
    }

    if (resolvedUserType === 'student' && (hasFirst || hasLast)) {
      await execute(
        'UPDATE task_assignments SET student_first_name = ?, student_last_name = ? WHERE student_id = ?',
        [firstName, lastName, resolvedUserId],
      );
      await execute(
        'UPDATE task_logs SET student_first_name = ?, student_last_name = ? WHERE student_id = ?',
        [firstName, lastName, resolvedUserId],
      );
    }

    logAudit(
      'rbac_update_user',
      'user',
      resolvedUserId,
      `${firstName || ''} ${lastName || ''}`.trim() || displayName || resolvedUserId,
      {
        req,
        payload: {
          user_type: resolvedUserType,
          fields: {
            first_name: hasFirst,
            last_name: hasLast,
            pseudo: hasPseudo,
            email: hasEmail,
            description: hasDescription,
            password: passwordWillChange,
            is_active: activeWillChange,
          },
        },
      },
    );

    if (resolvedUserType === 'student') {
      emitStudentsChanged({ reason: 'admin_user_profile_update', studentId: resolvedUserId });
    }

    const roleJoin = await queryOne(
      `SELECT ur.role_id, r.slug AS role_slug, r.display_name AS role_display_name,
                COALESCE(r.forum_participate, 1) AS forum_participate,
                COALESCE(r.context_comment_participate, 1) AS context_comment_participate
           FROM user_roles ur
           LEFT JOIN roles r ON r.id = ur.role_id
          WHERE ur.user_type = ? AND ur.user_id = ? AND ur.is_primary = 1 LIMIT 1`,
      [resolvedUserType, resolvedUserId],
    );
    const updated = await queryOne('SELECT * FROM users WHERE id = ? AND user_type = ? LIMIT 1', [
      resolvedUserId,
      resolvedUserType,
    ]);
    const disp =
      updated.display_name ||
      `${updated.first_name || ''} ${updated.last_name || ''}`.trim() ||
      updated.email ||
      updated.pseudo ||
      updated.id;

    res.json({
      id: updated.id,
      user_type: updated.user_type,
      display_name: disp,
      first_name: updated.first_name ?? null,
      last_name: updated.last_name ?? null,
      pseudo: updated.pseudo ?? null,
      email: updated.email,
      description: updated.description ?? null,
      is_active: Number(updated.is_active) !== 0,
      role_id: roleJoin?.role_id ?? null,
      role_slug: roleJoin?.role_slug ?? null,
      role_display_name: roleJoin?.role_display_name ?? null,
      forum_participate:
        resolvedUserType === 'student' ? Number(roleJoin?.forum_participate) !== 0 : true,
      context_comment_participate:
        resolvedUserType === 'student' ? Number(roleJoin?.context_comment_participate) !== 0 : true,
    });
  }),
);

router.put(
  '/users/:userType/:userId/role',
  requirePermission('admin.users.assign_roles'),
  validate({ body: assignRoleBodySchema }),
  asyncHandler(async (req, res) => {
    const roleId = parseInt(req.body?.role_id, 10);
    const role = await queryOne('SELECT id FROM roles WHERE id = ?', [roleId]);
    if (!role) return res.status(404).json({ error: 'Profil introuvable' });
    const resolved = await resolveRbacSubjectForMutation(req.params.userType, req.params.userId);
    if (!resolved.ok) return res.status(resolved.status).json({ error: resolved.error });
    const { resolvedUserType, resolvedUserId: resolvedLegacyUserId } = resolved;

    // Garde anti-escalade partagée avec l'attribution en lot (lib/rbacRoleAssignment.js) :
    // une action groupée ne peut pas contourner ce qu'une action unitaire refuse.
    const applied = await assignRole({
      actor: req.auth,
      userType: resolvedUserType,
      userId: resolvedLegacyUserId,
      roleId,
    });
    if (!applied.ok) return res.status(applied.status).json({ error: applied.error });
    if (resolvedUserType === 'student') {
      emitStudentsChanged({ reason: 'rbac_assign_role', studentId: resolvedLegacyUserId });
    }
    logAudit(
      'rbac_assign_role',
      'role',
      String(roleId),
      `${resolvedUserType}:${resolvedLegacyUserId}`,
      {
        req,
        payload: { user_type: resolvedUserType, user_id: resolvedLegacyUserId, role_id: roleId },
      },
    );
    res.json({ ok: true, effective: applied.effective });
  }),
);

/**
 * Suppression d'un compte **enseignant** — administrateur seulement (CDG-40). Les contenus
 * créés restent (les clés étrangères passent à NULL, les journaux gardent l'identifiant) ;
 * jamais soi-même, jamais le dernier administrateur actif. Les comptes élèves passent par
 * `DELETE /api/students/:id`, qui purge aussi leurs affectations.
 */
router.delete(
  '/users/teacher/:userId',
  requirePermission('admin.users.assign_roles'),
  asyncHandler(async (req, res) => {
    if (normalizeRoleSlug(req.auth?.roleSlug) !== 'admin') {
      return res
        .status(403)
        .json({ error: 'Seul un administrateur peut supprimer un compte enseignant' });
    }
    const userId = String(req.params.userId || '').trim();
    if (String(req.auth.userId) === userId) {
      return res.status(403).json({ error: 'Vous ne pouvez pas supprimer votre propre compte' });
    }
    const teacher = await queryOne(
      "SELECT id, first_name, last_name, display_name, email FROM users WHERE id = ? AND user_type = 'teacher' LIMIT 1",
      [userId],
    );
    if (!teacher) return res.status(404).json({ error: 'Enseignant introuvable' });
    const role = await getPrimaryRoleForUser('teacher', userId);
    if (role?.slug === 'admin' && (await countPrimaryAdmins()) <= 1) {
      return res.status(409).json({ error: 'Action refusée: dernier administrateur actif' });
    }
    const label =
      teacher.display_name ||
      `${teacher.first_name || ''} ${teacher.last_name || ''}`.trim() ||
      teacher.email ||
      userId;
    await withTransaction(async (tx) => {
      await tx.execute('DELETE FROM password_reset_tokens WHERE user_id = ?', [userId]);
      await tx.execute("DELETE FROM users WHERE id = ? AND user_type = 'teacher'", [userId]);
    });
    logAudit('delete_teacher', 'user', userId, label, { req, payload: { email: teacher.email } });
    res.json({ ok: true, deleted: userId });
  }),
);

module.exports = router;

module.exports.assignRoleBodySchema = assignRoleBodySchema;
