const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { queryAll, queryOne, execute } = require('../database');
const { requirePermission } = require('../middleware/requireTeacher');
const { setPrimaryRole, getPrimaryRoleForUser } = require('../lib/rbac');
const { getSettingValue, setSetting } = require('../lib/settings');
const { emitStudentsChanged } = require('../lib/realtime');

async function emitStudentsWithPrimaryRole(roleId) {
  const rows = await queryAll(
    `SELECT user_id FROM user_roles WHERE role_id = ? AND user_type = 'student' AND is_primary = 1`,
    [roleId]
  );
  for (const row of rows) {
    emitStudentsChanged({ reason: 'role_forum_context_participation', studentId: row.user_id });
  }
}
const { logRouteError } = require('../lib/routeLog');
const { logAudit } = require('./audit');

const router = express.Router();
const MAX_DESCRIPTION_LEN = 300;
const PSEUDO_RE = /^[A-Za-z0-9_.-]{3,30}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALLOWED_STUDENT_AFFILIATIONS = new Set(['n3', 'foret', 'both']);
const STUDENT_ROLE_SLUG_RE = /^eleve_/i;

/** Clés reconnues pour PATCH /profiles/:id (snake + alias camel pour forum / commentaires). */
const PROFILE_PATCH_KEYS = new Set([
  'display_name',
  'rank',
  'emoji',
  'min_done_tasks',
  'display_order',
  'forum_participate',
  'forumParticipate',
  'context_comment_participate',
  'contextCommentParticipate',
]);
/** Profils pour lesquels on règle seuils / tasks.propose / forum côté n3beur (hors admin, n3boss, visiteur). */
function isStaffRoleSlug(slug) {
  const s = String(slug || '').trim().toLowerCase();
  return s === 'admin' || s === 'prof' || s === 'visiteur';
}
/** Slug eleve_* ou palier personnalisé (rang strictement inférieur à celui du profil n3boss, 400) : mêmes réglages que les paliers seedés. */
function canConfigureStudentTierForumContext(slug, rank) {
  if (isStaffRoleSlug(slug)) return false;
  if (STUDENT_ROLE_SLUG_RE.test(slug)) return true;
  const r = Number(rank);
  return Number.isFinite(r) && r < 400;
}

function normalizeOptionalString(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length > 0 ? s : null;
}

function normalizeEmail(value) {
  const email = normalizeOptionalString(value);
  return email ? email.toLowerCase() : null;
}

function normalizeStudentAffiliation(value) {
  const raw = normalizeOptionalString(value);
  if (!raw) return 'both';
  const normalized = raw.toLowerCase();
  if (!ALLOWED_STUDENT_AFFILIATIONS.has(normalized)) return null;
  return normalized;
}

function normalizeRoleEmoji(value) {
  const emoji = String(value || '').trim();
  if (!emoji) return null;
  return emoji.slice(0, 16);
}

function parseOptionalNonNegativeInt(value, fallback = null) {
  if (value == null || value === '') return fallback;
  const n = parseInt(value, 10);
  if (!Number.isFinite(n) || n < 0) return NaN;
  return n;
}

async function getPasswordMinLength() {
  const n = await getSettingValue('security.password_min_length', 4);
  const parsed = parseInt(n, 10);
  if (!Number.isFinite(parsed)) return 4;
  return Math.min(Math.max(parsed, 4), 32);
}

router.post(
  '/users',
  requirePermission('users.create', { needsElevation: true }),
  async (req, res) => {
    try {
      const actorRoleSlug = String(req.auth?.roleSlug || '').trim().toLowerCase();
      if (!['prof', 'admin'].includes(actorRoleSlug)) {
        return res.status(403).json({ error: 'Seuls les profils prof/admin peuvent créer des utilisateurs' });
      }

      const roleSlug = String(req.body?.role_slug || '').trim().toLowerCase();
      if (!['eleve_novice', 'prof', 'admin'].includes(roleSlug)) {
        return res.status(400).json({ error: 'role_slug invalide (eleve_novice, prof, admin)' });
      }
      if (actorRoleSlug === 'prof' && roleSlug === 'admin') {
        return res.status(403).json({ error: 'Un profil prof ne peut pas créer un admin' });
      }

      const firstName = normalizeOptionalString(req.body?.first_name);
      const lastName = normalizeOptionalString(req.body?.last_name);
      const password = String(req.body?.password || '');
      const pseudo = normalizeOptionalString(req.body?.pseudo);
      const email = normalizeEmail(req.body?.email);
      const description = normalizeOptionalString(req.body?.description);
      const minPasswordLen = await getPasswordMinLength();
      if (!firstName || !lastName) return res.status(400).json({ error: 'Prénom et nom requis' });
      if (!password || password.length < minPasswordLen) {
        return res.status(400).json({ error: `Mot de passe trop court (min ${minPasswordLen} caractères)` });
      }
      if (pseudo != null && !PSEUDO_RE.test(pseudo)) {
        return res.status(400).json({ error: 'Pseudo invalide (3-30 caractères, lettres/chiffres/._-)' });
      }
      if (email != null && !EMAIL_RE.test(email)) {
        return res.status(400).json({ error: 'Email invalide' });
      }
      if (description != null && description.length > MAX_DESCRIPTION_LEN) {
        return res.status(400).json({ error: `Description trop longue (max ${MAX_DESCRIPTION_LEN} caractères)` });
      }

      const userType = roleSlug === 'eleve_novice' ? 'student' : 'teacher';
      const affiliation = userType === 'student'
        ? normalizeStudentAffiliation(req.body?.affiliation)
        : 'both';
      if (!affiliation) return res.status(400).json({ error: "Affiliation invalide (n3, foret ou both)" });

      if (userType === 'student') {
        const existingByName = await queryOne(
          "SELECT id FROM users WHERE user_type = 'student' AND LOWER(first_name)=LOWER(?) AND LOWER(last_name)=LOWER(?) LIMIT 1",
          [firstName, lastName]
        );
        if (existingByName) return res.status(409).json({ error: 'Un n3beur avec ce nom existe déjà' });
      }
      if (pseudo) {
        const existingPseudo = await queryOne('SELECT id FROM users WHERE LOWER(pseudo)=LOWER(?) LIMIT 1', [pseudo]);
        if (existingPseudo) return res.status(409).json({ error: 'Ce pseudo est déjà utilisé' });
      }
      if (email) {
        const existingEmail = await queryOne('SELECT id FROM users WHERE LOWER(email)=LOWER(?) LIMIT 1', [email]);
        if (existingEmail) return res.status(409).json({ error: 'Cet email est déjà utilisé' });
      }

      const role = await queryOne('SELECT id, slug, display_name FROM roles WHERE slug = ? LIMIT 1', [roleSlug]);
      if (!role) return res.status(404).json({ error: 'Profil introuvable' });

      const hash = await bcrypt.hash(password, 10);
      const id = uuidv4();
      const now = new Date().toISOString();
      try {
        await execute(
          `INSERT INTO users
            (id, user_type, legacy_user_id, email, pseudo, first_name, last_name, display_name, description, avatar_path, affiliation, password_hash, auth_provider, is_active, last_seen, created_at, updated_at)
           VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, NULL, ?, ?, 'local', 1, ?, NOW(), NOW())`,
          [id, userType, email, pseudo, firstName, lastName, `${firstName} ${lastName}`.trim(), description, affiliation, hash, now]
        );
      } catch (err) {
        if (err && (err.errno === 1062 || err.code === 'ER_DUP_ENTRY')) {
          return res.status(409).json({ error: 'Pseudo, email ou identité déjà utilisé(e)' });
        }
        throw err;
      }
      await setPrimaryRole(userType, id, role.id);

      const created = await queryOne('SELECT * FROM users WHERE id = ? LIMIT 1', [id]);
      logAudit('create_user_manual', 'user', id, `${firstName} ${lastName}`, {
        req,
        payload: { user_type: userType, role_slug: role.slug },
      });
      if (userType === 'student') {
        emitStudentsChanged({ reason: 'create_student_manual', studentId: id });
      }
      res.status(201).json({
        ...created,
        password_hash: undefined,
        role_slug: role.slug,
        role_display_name: role.display_name,
      });
    } catch (e) {
      logRouteError(e, req);
      res.status(500).json({ error: e.message });
    }
  }
);

router.get(
  '/profiles',
  requirePermission('admin.roles.manage', { needsElevation: true }),
  async (req, res) => {
    try {
      const rolesWithProgression = await queryAll(
        'SELECT id, slug, display_name, emoji, min_done_tasks, display_order, `rank` AS `rank`, is_system, forum_participate, context_comment_participate FROM roles ORDER BY display_order ASC, `rank` DESC, id ASC'
      );
      const perms = await queryAll('SELECT `key`, label, description FROM permissions ORDER BY `key` ASC');
      const rolePerms = await queryAll(
        'SELECT role_id, permission_key, requires_elevation FROM role_permissions ORDER BY role_id ASC, permission_key ASC'
      );
      const map = new Map();
      for (const row of rolePerms) {
        if (!map.has(row.role_id)) map.set(row.role_id, []);
        map.get(row.role_id).push({
          key: row.permission_key,
          requires_elevation: !!row.requires_elevation,
        });
      }
      const rolesPayload = rolesWithProgression
        .map((r) => ({ ...r, permissions: map.get(r.id) || [] }))
        .map((r) => ({ ...r, catalog: perms }));
      const progressionByValidatedTasksEnabled = await getSettingValue('rbac.progression_by_validated_tasks', true);
      res.json({
        roles: rolesPayload,
        progressionByValidatedTasksEnabled: !!progressionByValidatedTasksEnabled,
      });
    } catch (e) {
      logRouteError(e, req);
      res.status(500).json({ error: e.message });
    }
  }
);

router.patch(
  '/progression-by-validated-tasks',
  requirePermission('admin.roles.manage', { needsElevation: true }),
  async (req, res) => {
    try {
      const raw = req.body?.enabled;
      if (typeof raw !== 'boolean') {
        return res.status(400).json({ error: 'Champ « enabled » booléen requis' });
      }
      const updated = await setSetting('rbac.progression_by_validated_tasks', raw, {
        userType: req.auth?.userType,
        userId: req.auth?.userId,
      });
      logAudit('rbac_progression_by_tasks', 'setting', null, 'rbac.progression_by_validated_tasks', {
        req,
        payload: { enabled: updated },
      });
      res.json({ ok: true, progressionByValidatedTasksEnabled: updated });
    } catch (e) {
      logRouteError(e, req);
      res.status(400).json({ error: e.message });
    }
  }
);

router.post(
  '/profiles',
  requirePermission('admin.roles.manage', { needsElevation: true }),
  async (req, res) => {
    try {
      const slug = String(req.body?.slug || '').trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
      const displayName = String(req.body?.display_name || '').trim();
      const rank = Number.isFinite(parseInt(req.body?.rank, 10)) ? parseInt(req.body.rank, 10) : 100;
      const emoji = normalizeRoleEmoji(req.body?.emoji);
      const minDoneTasks = parseOptionalNonNegativeInt(req.body?.min_done_tasks, null);
      const displayOrder = parseOptionalNonNegativeInt(req.body?.display_order, 0);
      if (!slug || !displayName) return res.status(400).json({ error: 'slug et display_name requis' });
      if (Number.isNaN(minDoneTasks)) return res.status(400).json({ error: 'min_done_tasks invalide (entier >= 0)' });
      if (Number.isNaN(displayOrder)) return res.status(400).json({ error: 'display_order invalide (entier >= 0)' });
      if (STUDENT_ROLE_SLUG_RE.test(slug) && (emoji == null || minDoneTasks == null)) {
        return res.status(400).json({ error: 'Un profil n3beur doit définir emoji et min_done_tasks' });
      }
      await execute(
        'INSERT INTO roles (slug, display_name, emoji, min_done_tasks, display_order, `rank`, is_system) VALUES (?, ?, ?, ?, ?, ?, 0)',
        [slug, displayName, emoji, minDoneTasks, displayOrder ?? 0, rank]
      );
      const role = await queryOne(
        'SELECT id, slug, display_name, emoji, min_done_tasks, display_order, `rank` AS `rank`, is_system, forum_participate, context_comment_participate FROM roles WHERE slug = ? LIMIT 1',
        [slug]
      );
      logAudit('rbac_create_profile', 'role', role?.id || null, slug, { req });
      res.status(201).json(role);
    } catch (e) {
      logRouteError(e, req);
      if (e && (e.errno === 1062 || e.code === 'ER_DUP_ENTRY')) return res.status(409).json({ error: 'Slug déjà utilisé' });
      res.status(500).json({ error: e.message });
    }
  }
);

router.post(
  '/profiles/:id/duplicate',
  requirePermission('admin.roles.manage', { needsElevation: true }),
  async (req, res) => {
    try {
      const sourceId = parseInt(req.params.id, 10);
      if (!Number.isFinite(sourceId) || sourceId <= 0) {
        return res.status(400).json({ error: 'id de profil invalide' });
      }
      const source = await queryOne(
        `SELECT id, slug, display_name, emoji, min_done_tasks, display_order, \`rank\` AS \`rank\`,
                COALESCE(forum_participate, 1) AS forum_participate,
                COALESCE(context_comment_participate, 1) AS context_comment_participate
           FROM roles WHERE id = ?`,
        [sourceId]
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

      if (!slug || !displayName) return res.status(400).json({ error: 'slug requis ; display_name ne peut pas être vide' });
      if (Number.isNaN(minDoneTasks)) return res.status(400).json({ error: 'min_done_tasks source invalide' });
      if (Number.isNaN(displayOrder)) return res.status(400).json({ error: 'display_order source invalide' });
      if (STUDENT_ROLE_SLUG_RE.test(slug) && (emoji == null || minDoneTasks == null)) {
        return res.status(400).json({ error: 'Un profil n3beur doit définir emoji et min_done_tasks (source incompatible ou slug eleve_* sans données)' });
      }

      await execute(
        `INSERT INTO roles (slug, display_name, emoji, min_done_tasks, display_order, \`rank\`, is_system, forum_participate, context_comment_participate)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
        [slug, displayName, emoji, minDoneTasks, displayOrder ?? 0, rank, forumParticipate, contextCommentParticipate]
      );
      const newRole = await queryOne(
        'SELECT id, slug, display_name, emoji, min_done_tasks, display_order, `rank` AS `rank`, is_system, forum_participate, context_comment_participate FROM roles WHERE slug = ? LIMIT 1',
        [slug]
      );
      if (!newRole?.id) {
        return res.status(500).json({ error: 'Profil dupliqué introuvable après insertion' });
      }

      const sourcePerms = await queryAll(
        'SELECT permission_key, requires_elevation FROM role_permissions WHERE role_id = ? ORDER BY permission_key ASC',
        [sourceId]
      );
      for (const row of sourcePerms) {
        const p = await queryOne('SELECT `key` FROM permissions WHERE `key` = ? LIMIT 1', [row.permission_key]);
        if (!p) continue;
        await execute(
          'INSERT INTO role_permissions (role_id, permission_key, requires_elevation) VALUES (?, ?, ?)',
          [newRole.id, row.permission_key, row.requires_elevation ? 1 : 0]
        );
      }
      logAudit('rbac_duplicate_profile', 'role', newRole.id, `from=${sourceId} slug=${slug}`, { req });
      res.status(201).json(newRole);
    } catch (e) {
      logRouteError(e, req);
      if (e && (e.errno === 1062 || e.code === 'ER_DUP_ENTRY')) return res.status(409).json({ error: 'Slug déjà utilisé' });
      res.status(500).json({ error: e.message });
    }
  }
);

router.patch(
  '/profiles/:id',
  requirePermission('admin.roles.manage', { needsElevation: true }),
  async (req, res) => {
    try {
      const role = await queryOne('SELECT id FROM roles WHERE id = ?', [req.params.id]);
      if (!role) return res.status(404).json({ error: 'Profil introuvable' });
      const existing = await queryOne(
        'SELECT slug, display_name, emoji, min_done_tasks, display_order, `rank` AS `rank`, COALESCE(forum_participate, 1) AS forum_participate, COALESCE(context_comment_participate, 1) AS context_comment_participate FROM roles WHERE id = ?',
        [role.id]
      );
      const b = req.body != null && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
      const hasAnyPatchField = Object.keys(b).some((k) => PROFILE_PATCH_KEYS.has(k));
      const hasDisplayName = Object.prototype.hasOwnProperty.call(b, 'display_name');
      const hasRank = Object.prototype.hasOwnProperty.call(b, 'rank');
      const hasEmoji = Object.prototype.hasOwnProperty.call(b, 'emoji');
      const hasMinDoneTasks = Object.prototype.hasOwnProperty.call(b, 'min_done_tasks');
      const hasDisplayOrder = Object.prototype.hasOwnProperty.call(b, 'display_order');
      const hasForumParticipate =
        Object.prototype.hasOwnProperty.call(b, 'forum_participate')
        || Object.prototype.hasOwnProperty.call(b, 'forumParticipate');
      const hasContextCommentParticipate =
        Object.prototype.hasOwnProperty.call(b, 'context_comment_participate')
        || Object.prototype.hasOwnProperty.call(b, 'contextCommentParticipate');
      const isStudentRole = STUDENT_ROLE_SLUG_RE.test(existing.slug);
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
      const displayName = hasDisplayName ? String(b.display_name || '').trim() : existing.display_name;
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
        const v = Object.prototype.hasOwnProperty.call(b, 'forum_participate') ? b.forum_participate : b.forumParticipate;
        forumParticipate = v ? 1 : 0;
      }
      if (hasContextCommentParticipate) {
        const v = Object.prototype.hasOwnProperty.call(b, 'context_comment_participate')
          ? b.context_comment_participate
          : b.contextCommentParticipate;
        contextCommentParticipate = v ? 1 : 0;
      }
      if (!displayName) return res.status(400).json({ error: 'display_name requis' });
      if (!Number.isFinite(rank)) return res.status(400).json({ error: 'rank invalide' });
      if (Number.isNaN(minDoneTasks)) return res.status(400).json({ error: 'min_done_tasks invalide (entier >= 0)' });
      if (Number.isNaN(displayOrder)) return res.status(400).json({ error: 'display_order invalide (entier >= 0)' });
      if (STUDENT_ROLE_SLUG_RE.test(existing.slug) && (emoji == null || minDoneTasks == null)) {
        return res.status(400).json({ error: 'Un profil n3beur doit définir emoji et min_done_tasks' });
      }
      await execute(
        'UPDATE roles SET display_name = ?, emoji = ?, min_done_tasks = ?, display_order = ?, `rank` = ?, forum_participate = ?, context_comment_participate = ?, updated_at = NOW() WHERE id = ?',
        [displayName, emoji, minDoneTasks, displayOrder, rank, forumParticipate, contextCommentParticipate, role.id]
      );
      const updated = await queryOne(
        'SELECT id, slug, display_name, emoji, min_done_tasks, display_order, `rank` AS `rank`, is_system, forum_participate, context_comment_participate FROM roles WHERE id = ?',
        [role.id]
      );
      logAudit('rbac_update_profile', 'role', role.id, updated?.slug || String(role.id), { req });
      if (canForumContext && (hasForumParticipate || hasContextCommentParticipate)) {
        await emitStudentsWithPrimaryRole(role.id);
      }
      res.json(updated);
    } catch (e) {
      logRouteError(e, req);
      res.status(500).json({ error: e.message });
    }
  }
);

router.put(
  '/profiles/:id/permissions',
  requirePermission('admin.roles.manage', { needsElevation: true }),
  async (req, res) => {
    try {
      const role = await queryOne('SELECT id FROM roles WHERE id = ?', [req.params.id]);
      if (!role) return res.status(404).json({ error: 'Profil introuvable' });
      const entries = Array.isArray(req.body?.permissions) ? req.body.permissions : [];
      await execute('DELETE FROM role_permissions WHERE role_id = ?', [role.id]);
      for (const item of entries) {
        const key = String(item?.key || '').trim();
        if (!key) continue;
        const p = await queryOne('SELECT `key` FROM permissions WHERE `key` = ? LIMIT 1', [key]);
        if (!p) continue;
        await execute(
          'INSERT INTO role_permissions (role_id, permission_key, requires_elevation) VALUES (?, ?, ?)',
          [role.id, key, item?.requires_elevation ? 1 : 0]
        );
      }
      logAudit('rbac_update_profile_permissions', 'role', role.id, `permissions=${entries.length}`, { req });
      res.json({ ok: true });
    } catch (e) {
      logRouteError(e, req);
      res.status(500).json({ error: e.message });
    }
  }
);

router.put(
  '/profiles/:id/pin',
  requirePermission('admin.roles.manage', { needsElevation: true }),
  async (req, res) => {
    try {
      const role = await queryOne('SELECT id FROM roles WHERE id = ?', [req.params.id]);
      if (!role) return res.status(404).json({ error: 'Profil introuvable' });
      const pin = String(req.body?.pin || '').trim();
      if (!/^\d{4,12}$/.test(pin)) return res.status(400).json({ error: 'PIN invalide (4 à 12 chiffres)' });
      const pinHash = await bcrypt.hash(pin, 10);
      await execute(
        'INSERT INTO role_pin_secrets (role_id, pin_hash) VALUES (?, ?) ON DUPLICATE KEY UPDATE pin_hash = VALUES(pin_hash), updated_at = NOW()',
        [role.id, pinHash]
      );
      logAudit('rbac_update_profile_pin', 'role', role.id, 'PIN mis à jour', { req });
      res.json({ ok: true });
    } catch (e) {
      logRouteError(e, req);
      res.status(500).json({ error: e.message });
    }
  }
);

router.get(
  '/users',
  requirePermission('admin.users.assign_roles', { needsElevation: true }),
  async (req, res) => {
    try {
      const users = await queryAll(
        `SELECT u.id, u.user_type,
                COALESCE(NULLIF(u.display_name, ''), NULLIF(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')), ''), u.email, u.pseudo, u.id) AS display_name,
                u.email, ur.role_id, r.slug AS role_slug, r.display_name AS role_display_name,
                COALESCE(r.forum_participate, 1) AS forum_participate,
                COALESCE(r.context_comment_participate, 1) AS context_comment_participate
           FROM users u
      LEFT JOIN user_roles ur ON ur.user_type = u.user_type AND ur.user_id = u.id AND ur.is_primary = 1
      LEFT JOIN roles r ON r.id = ur.role_id
       ORDER BY u.user_type ASC, display_name ASC`
      );
      res.json(
        users.map((u) => ({
          id: u.id,
          user_type: u.user_type,
          display_name: u.display_name,
          email: u.email,
          role_id: u.role_id,
          role_slug: u.role_slug,
          role_display_name: u.role_display_name,
          forum_participate: u.user_type === 'student' ? Number(u.forum_participate) !== 0 : true,
          context_comment_participate: u.user_type === 'student' ? Number(u.context_comment_participate) !== 0 : true,
        }))
      );
    } catch (e) {
      logRouteError(e, req);
      res.status(500).json({ error: e.message });
    }
  }
);

router.put(
  '/users/:userType/:userId/role',
  requirePermission('admin.users.assign_roles', { needsElevation: true }),
  async (req, res) => {
    try {
      const userType = String(req.params.userType || '').trim();
      if (!['teacher', 'student', 'user'].includes(userType)) return res.status(400).json({ error: 'userType invalide' });
      const roleId = parseInt(req.body?.role_id, 10);
      if (!Number.isFinite(roleId) || roleId <= 0) return res.status(400).json({ error: 'role_id invalide' });
      const role = await queryOne('SELECT id FROM roles WHERE id = ?', [roleId]);
      if (!role) return res.status(404).json({ error: 'Profil introuvable' });
      let resolvedUserType = userType;
      let resolvedLegacyUserId = req.params.userId;
      if (userType === 'user') {
        const user = await queryOne('SELECT id, user_type FROM users WHERE id = ? LIMIT 1', [req.params.userId]);
        if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
        resolvedUserType = user.user_type;
        resolvedLegacyUserId = user.id;
      }

      const currentRole = await getPrimaryRoleForUser(resolvedUserType, resolvedLegacyUserId);
      const nextRole = await queryOne('SELECT slug FROM roles WHERE id = ? LIMIT 1', [roleId]);
      const leavingAdmin = currentRole?.slug === 'admin' && nextRole?.slug !== 'admin';
      if (leavingAdmin) {
        const adminCountRow = await queryOne(
          `SELECT COUNT(*) AS c
             FROM user_roles ur
             INNER JOIN roles r ON r.id = ur.role_id
            WHERE ur.is_primary = 1 AND ur.user_type = 'teacher' AND r.slug = 'admin'`
        );
        const adminCount = Number(adminCountRow?.c || 0);
        if (adminCount <= 1) {
          return res.status(409).json({ error: 'Action refusée: dernier administrateur actif' });
        }
      }
      await setPrimaryRole(resolvedUserType, resolvedLegacyUserId, roleId);
      logAudit('rbac_assign_role', 'role', String(roleId), `${resolvedUserType}:${resolvedLegacyUserId}`, {
        req,
        payload: { user_type: resolvedUserType, user_id: resolvedLegacyUserId, role_id: roleId },
      });
      res.json({ ok: true });
    } catch (e) {
      logRouteError(e, req);
      res.status(500).json({ error: e.message });
    }
  }
);

module.exports = router;
