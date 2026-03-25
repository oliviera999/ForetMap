const express = require('express');
const { queryAll, queryOne, execute } = require('../database');
const { requirePermission } = require('../middleware/requireTeacher');
const { hashPin, setPrimaryRole } = require('../lib/rbac');
const { logRouteError } = require('../lib/routeLog');

const router = express.Router();

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
      const students = await queryAll(
        `SELECT s.id, 'student' AS user_type, CONCAT(s.first_name, ' ', s.last_name) AS display_name, s.email,
                ur.role_id, r.slug AS role_slug, r.display_name AS role_display_name
           FROM students s
      LEFT JOIN user_roles ur ON ur.user_type = 'student' AND ur.user_id = s.id AND ur.is_primary = 1
      LEFT JOIN roles r ON r.id = ur.role_id
       ORDER BY s.first_name, s.last_name`
      );
      const teachers = await queryAll(
        `SELECT t.id, 'teacher' AS user_type, COALESCE(NULLIF(t.display_name, ''), t.email) AS display_name, t.email,
                ur.role_id, r.slug AS role_slug, r.display_name AS role_display_name
           FROM teachers t
      LEFT JOIN user_roles ur ON ur.user_type = 'teacher' AND ur.user_id = t.id AND ur.is_primary = 1
      LEFT JOIN roles r ON r.id = ur.role_id
       ORDER BY display_name`
      );
      res.json([...teachers, ...students]);
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
      if (!['teacher', 'student'].includes(userType)) return res.status(400).json({ error: 'userType invalide' });
      const roleId = parseInt(req.body?.role_id, 10);
      if (!Number.isFinite(roleId) || roleId <= 0) return res.status(400).json({ error: 'role_id invalide' });
      const role = await queryOne('SELECT id FROM roles WHERE id = ?', [roleId]);
      if (!role) return res.status(404).json({ error: 'Profil introuvable' });
      await setPrimaryRole(userType, req.params.userId, roleId);
      res.json({ ok: true });
    } catch (e) {
      logRouteError(e, req);
      res.status(500).json({ error: e.message });
    }
  }
);

module.exports = router;
