'use strict';

// O3 — vérifie SANS DB la détection des écritures RBAC (`isRbacWriteSql`), pierre angulaire de
// l'invalidation du cache RBAC : toute écriture réelle des tables `roles`/`user_roles`/
// `role_permissions` DOIT être détectée (un faux négatif servirait des permissions périmées) ;
// les lectures et écritures non-RBAC ne doivent PAS l'être (un faux positif ne fait que rater le
// cache, sans risque). Les cas ci-dessous sont des requêtes réellement présentes dans le code.
const test = require('node:test');
const assert = require('node:assert');
const { isRbacWriteSql } = require('../database');

// Écritures RBAC réelles (routes/rbac.js, lib/rbac.js, lib/studentDeletion.js, tests) — DOIVENT matcher.
const RBAC_WRITES = [
  'INSERT INTO roles (slug, display_name, emoji) VALUES (?, ?, ?)',
  'INSERT IGNORE INTO roles (slug, display_name) VALUES (?, ?)',
  'UPDATE roles SET display_name = ?, `rank` = ? WHERE id = ?',
  "UPDATE roles SET min_done_tasks = 0 WHERE slug = 'eleve_novice'",
  'DELETE FROM roles WHERE is_system = 0 AND id = ?',
  'INSERT INTO role_permissions (role_id, permission_key, requires_elevation) VALUES (?, ?, ?)',
  'INSERT IGNORE INTO role_permissions (role_id, permission_key, requires_elevation) VALUES (?, ?, ?)',
  'INSERT INTO role_permissions (role_id, permission_key, requires_elevation) VALUES (?, ?, ?), (?, ?, ?)',
  'DELETE FROM role_permissions WHERE role_id = ?',
  'INSERT INTO user_roles (user_type, user_id, role_id, is_primary) VALUES (?, ?, ?, 1)',
  'INSERT IGNORE INTO user_roles (user_type, user_id, role_id, is_primary) VALUES (?, ?, ?, 1)',
  'INSERT INTO user_roles (user_type, user_id, role_id, is_primary) VALUES (?, ?, ?, 1) ON DUPLICATE KEY UPDATE is_primary = 1',
  'UPDATE user_roles SET is_primary = 0 WHERE user_type = ? AND user_id = ?',
  "DELETE FROM user_roles WHERE user_type = 'student' AND user_id = ?",
  // jointures multi-lignes (rbac-progression.test.js)
  'DELETE ur FROM user_roles ur\n      INNER JOIN roles r ON r.id = ur.role_id\n     WHERE r.slug = ?',
  'DELETE rp FROM role_permissions rp\n      INNER JOIN roles r ON r.id = rp.role_id\n     WHERE r.is_system = 0',
  // INSERT multi-lignes (routes/rbac.js:413)
  'INSERT INTO roles\n  (slug, display_name, emoji)\n  VALUES (?, ?, ?)',
];

// Lectures RBAC — NE doivent PAS matcher (sinon le cache se viderait à chaque lecture).
const RBAC_READS = [
  'SELECT r.id FROM user_roles ur INNER JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = ?',
  'SELECT rp.permission_key FROM role_permissions rp WHERE rp.role_id = ?',
  'SELECT * FROM roles WHERE slug = ? LIMIT 1',
];

// Écritures non-RBAC — NE doivent PAS matcher (ne touchent pas roles/user_roles/role_permissions).
const NON_RBAC_WRITES = [
  'INSERT INTO tasks (id, title) VALUES (?, ?)',
  'UPDATE users SET display_name = ? WHERE id = ?',
  'DELETE FROM plants',
  'INSERT INTO group_members (group_id, user_id) VALUES (?, ?)',
  'UPDATE gl_players SET health_points = ? WHERE id = ?',
];

test('isRbacWriteSql détecte TOUTES les écritures RBAC réelles', () => {
  for (const sql of RBAC_WRITES) {
    assert.strictEqual(isRbacWriteSql(sql), true, `doit matcher (faux négatif = stale) : ${sql}`);
  }
});

test('isRbacWriteSql ignore les lectures RBAC', () => {
  for (const sql of RBAC_READS) {
    assert.strictEqual(isRbacWriteSql(sql), false, `ne doit pas matcher (lecture) : ${sql}`);
  }
});

test('isRbacWriteSql ignore les écritures non-RBAC', () => {
  for (const sql of NON_RBAC_WRITES) {
    assert.strictEqual(isRbacWriteSql(sql), false, `ne doit pas matcher (hors RBAC) : ${sql}`);
  }
});

test('isRbacWriteSql tolère les entrées non-chaîne', () => {
  for (const v of [null, undefined, 42, {}]) {
    assert.strictEqual(isRbacWriteSql(v), false);
  }
});
