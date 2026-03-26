const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { queryAll, queryOne, execute } = require('../database');
const { requirePermission } = require('../middleware/requireTeacher');
const { hashPin, setPrimaryRole } = require('../lib/rbac');
const { getSettingValue } = require('../lib/settings');
const { emitStudentsChanged } = require('../lib/realtime');
const { logRouteError } = require('../lib/routeLog');
const { logAudit } = require('./audit');

const router = express.Router();
const MAX_DESCRIPTION_LEN = 300;
const PSEUDO_RE = /^[A-Za-z0-9_.-]{3,30}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALLOWED_STUDENT_AFFILIATIONS = new Set(['n3', 'foret', 'both']);

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
        if (existingByName) return res.status(409).json({ error: 'Un élève avec ce nom existe déjà' });
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
      const roles = await queryAll('SELECT id, slug, display_name, rank, is_system FROM roles ORDER BY rank DESC, id ASC');
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
      res.json(roles.map((r) => ({ ...r, permissions: map.get(r.id) || [] })).map((r) => ({ ...r, catalog: perms })));
    } catch (e) {
      logRouteError(e, req);
      res.status(500).json({ error: e.message });
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
      if (!slug || !displayName) return res.status(400).json({ error: 'slug et display_name requis' });
      await execute('INSERT INTO roles (slug, display_name, rank, is_system) VALUES (?, ?, ?, 0)', [slug, displayName, rank]);
      const role = await queryOne('SELECT id, slug, display_name, rank, is_system FROM roles WHERE slug = ? LIMIT 1', [slug]);
      logAudit('rbac_create_profile', 'role', role?.id || null, slug, { req });
      res.status(201).json(role);
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
      const displayName = String(req.body?.display_name || '').trim();
      const rank = Number.isFinite(parseInt(req.body?.rank, 10)) ? parseInt(req.body.rank, 10) : null;
      if (!displayName) return res.status(400).json({ error: 'display_name requis' });
      await execute('UPDATE roles SET display_name = ?, rank = COALESCE(?, rank), updated_at = NOW() WHERE id = ?', [displayName, rank, role.id]);
      const updated = await queryOne('SELECT id, slug, display_name, rank, is_system FROM roles WHERE id = ?', [role.id]);
      logAudit('rbac_update_profile', 'role', role.id, updated?.slug || String(role.id), { req });
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
      await execute(
        'INSERT INTO role_pin_secrets (role_id, pin_hash) VALUES (?, ?) ON DUPLICATE KEY UPDATE pin_hash = VALUES(pin_hash), updated_at = NOW()',
        [role.id, hashPin(pin)]
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
                u.email, ur.role_id, r.slug AS role_slug, r.display_name AS role_display_name
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

      const currentRole = await queryOne(
        `SELECT r.slug
           FROM user_roles ur
           INNER JOIN roles r ON r.id = ur.role_id
          WHERE ur.user_type = ? AND ur.user_id = ? AND ur.is_primary = 1
          LIMIT 1`,
        [resolvedUserType, resolvedLegacyUserId]
      );
      const nextRole = await queryOne('SELECT slug FROM roles WHERE id = ? LIMIT 1', [roleId]);
      const leavingAdmin = currentRole?.slug === 'admin' && nextRole?.slug !== 'admin';
      if (leavingAdmin) {
        const adminCountRow = await queryOne(
          `SELECT COUNT(*) AS c
             FROM user_roles ur
             INNER JOIN roles r ON r.id = ur.role_id
            WHERE ur.is_primary = 1 AND r.slug = 'admin'`
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
