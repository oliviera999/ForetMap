'use strict';

require('./helpers/setup');
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { initSchema, execute, queryOne, queryAll } = require('../database');
const {
  ensureRbacBootstrap,
  resetRbacBootstrapForTests,
  getRoleBySlug,
  ROLE_PERMISSION_MATRIX,
} = require('../lib/rbac');

describe('Semis RBAC durable', () => {
  before(async () => {
    await initSchema();
    resetRbacBootstrapForTests();
    await ensureRbacBootstrap();
  });

  it('une révocation sur profil système survit à un re-bootstrap', async () => {
    const role = await getRoleBySlug('prof');
    assert.ok(role);
    await execute('DELETE FROM role_permissions WHERE role_id = ? AND permission_key = ?', [
      role.id,
      'audit.read',
    ]);
    let row = await queryOne(
      'SELECT permission_key FROM role_permissions WHERE role_id = ? AND permission_key = ?',
      [role.id, 'audit.read'],
    );
    assert.ok(!row);

    resetRbacBootstrapForTests();
    await ensureRbacBootstrap();

    row = await queryOne(
      'SELECT permission_key FROM role_permissions WHERE role_id = ? AND permission_key = ?',
      [role.id, 'audit.read'],
    );
    assert.ok(!row, 'audit.read ne doit pas être réinséré');

    // Restaurer pour ne pas polluer la suite de tests partagée.
    await execute('INSERT IGNORE INTO role_permissions (role_id, permission_key) VALUES (?, ?)', [
      role.id,
      'audit.read',
    ]);
  });

  it('prof_classe existe avec sa matrice minimale si neuf', async () => {
    const role = await getRoleBySlug('prof_classe');
    assert.ok(role);
    const rows = await queryAll(
      'SELECT permission_key FROM role_permissions WHERE role_id = ? ORDER BY permission_key',
      [role.id],
    );
    const keys = rows.map((r) => r.permission_key);
    for (const expected of ROLE_PERMISSION_MATRIX.prof_classe) {
      assert.ok(keys.includes(expected), `manque ${expected}`);
    }
    assert.ok(!keys.includes('users.create'));
    assert.ok(!keys.includes('stats.read.all'));
  });
});
