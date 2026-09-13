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

  /**
   * Le garde-fou qui manquait. Les tests d'alignement existants comparent la matrice JS au
   * catalogue JS — ils ne voient donc rien quand le semis n'écrit pas en base. C'est ce trou
   * qui a laissé passer une base neuve où `admin` n'avait pas `forum.group.moderate` :
   * personne ne pouvait modérer le forum, et `npm test` ne tombait que sur un test de forum,
   * loin de la cause. On affirme ici la propriété directement : ce que la matrice déclare,
   * la base le porte.
   */
  it('toute la matrice des profils système est réellement posée en base', async () => {
    for (const [slug, expectedKeys] of Object.entries(ROLE_PERMISSION_MATRIX)) {
      const role = await getRoleBySlug(slug);
      if (!role) continue;
      const rows = await queryAll('SELECT permission_key FROM role_permissions WHERE role_id = ?', [
        role.id,
      ]);
      const granted = new Set(rows.map((r) => r.permission_key));
      const missing = expectedKeys.filter((key) => !granted.has(key));
      assert.deepEqual(missing, [], `${slug} : permissions déclarées mais jamais posées`);
    }
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

  it('personnel existe, calqué sur visiteur (aucune permission)', async () => {
    const role = await getRoleBySlug('personnel');
    assert.ok(role);
    assert.equal(role.display_name, 'Personnel');
    assert.equal(Number(role.rank), 50);
    const rows = await queryAll('SELECT permission_key FROM role_permissions WHERE role_id = ?', [
      role.id,
    ]);
    assert.equal(rows.length, 0);
    const visitor = await getRoleBySlug('visiteur');
    assert.ok(visitor);
    assert.equal(Number(visitor.rank), Number(role.rank));
  });
});
