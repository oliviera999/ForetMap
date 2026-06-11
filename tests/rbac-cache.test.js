'use strict';

const test = require('node:test');
const assert = require('node:assert');
const cache = require('../lib/rbacCache');

test('sqlTouchesRbacWrite: détecte les écritures sur tables RBAC', () => {
  assert.equal(cache.sqlTouchesRbacWrite('INSERT INTO role_permissions (role_id) VALUES (1)'), true);
  assert.equal(cache.sqlTouchesRbacWrite('insert ignore into role_permissions (role_id, permission_key) values (?,?)'), true);
  assert.equal(cache.sqlTouchesRbacWrite('UPDATE user_roles SET is_primary = 0 WHERE user_id = 1'), true);
  assert.equal(cache.sqlTouchesRbacWrite('DELETE FROM role_scopes WHERE role_id = 2'), true);
  assert.equal(cache.sqlTouchesRbacWrite('INSERT INTO permissions (`key`) VALUES (?)'), true);
  assert.equal(cache.sqlTouchesRbacWrite('REPLACE INTO roles (id, slug) VALUES (1, "admin")'), true);
});

test('sqlTouchesRbacWrite: ignore les lectures et les écritures hors RBAC', () => {
  // Une SELECT (lecture) ne doit JAMAIS invalider, même sur une table RBAC.
  assert.equal(cache.sqlTouchesRbacWrite('SELECT permission_key FROM role_permissions WHERE role_id = ?'), false);
  // Écriture sur une table non RBAC.
  assert.equal(cache.sqlTouchesRbacWrite('INSERT INTO tasks (title) VALUES (?)'), false);
  assert.equal(cache.sqlTouchesRbacWrite('UPDATE users SET name = ? WHERE id = ?'), false);
  assert.equal(cache.sqlTouchesRbacWrite(''), false);
  assert.equal(cache.sqlTouchesRbacWrite(null), false);
});

test('getCachedRolePermissions: sert depuis le cache puis recharge après invalidation', async () => {
  cache.clearRbacCache();
  let calls = 0;
  const loader = async () => { calls += 1; return [{ permission_key: `p${calls}` }]; };

  const a = await cache.getCachedRolePermissions(7, loader);
  assert.deepEqual(a, [{ permission_key: 'p1' }]);
  assert.equal(calls, 1);

  // Hit cache : loader non rappelé, même référence retournée.
  const b = await cache.getCachedRolePermissions(7, loader);
  assert.strictEqual(b, a);
  assert.equal(calls, 1);

  // Une écriture RBAC bumpe la version → rechargement.
  cache.maybeInvalidateFromSql('DELETE FROM role_permissions WHERE role_id = 7');
  const c = await cache.getCachedRolePermissions(7, loader);
  assert.deepEqual(c, [{ permission_key: 'p2' }]);
  assert.equal(calls, 2);
});

test('getCachedRolePermissions: clés distinctes par roleId', async () => {
  cache.clearRbacCache();
  let calls = 0;
  const loader = async (id) => { calls += 1; return [{ role: id }]; };
  await cache.getCachedRolePermissions(1, () => loader(1));
  await cache.getCachedRolePermissions(2, () => loader(2));
  await cache.getCachedRolePermissions(1, () => loader(1)); // hit
  assert.equal(calls, 2);
});

test('getCachedRolePermissions: ne mémorise pas une valeur lue pendant une écriture concurrente', async () => {
  cache.clearRbacCache();
  let calls = 0;
  const loader = async () => {
    calls += 1;
    // Simule une écriture RBAC survenue pendant la lecture (bump de version).
    cache.maybeInvalidateFromSql('UPDATE role_permissions SET requires_elevation = 1 WHERE role_id = 9');
    return [{ permission_key: 'maybe-stale' }];
  };
  await cache.getCachedRolePermissions(9, loader);
  // La lecture suivante NE doit PAS servir la valeur potentiellement périmée → recharge.
  await cache.getCachedRolePermissions(9, async () => { calls += 1; return [{ permission_key: 'fresh' }]; });
  assert.equal(calls, 2);
});
