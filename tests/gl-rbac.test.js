'use strict';

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert');
const { initSchema, queryOne, queryAll } = require('../database');
const { ensureRbacBootstrap } = require('../lib/rbac');

before(async () => {
  await initSchema();
  await ensureRbacBootstrap();
});

test('permissions gl.* sont bootstrappées', async () => {
  const permission = await queryOne(
    "SELECT `key` FROM permissions WHERE `key` = 'gl.game.manage' LIMIT 1",
  );
  assert.ok(permission);
});

test('rôle gl_admin existe', async () => {
  const role = await queryOne("SELECT slug FROM roles WHERE slug = 'gl_admin' LIMIT 1");
  assert.ok(role);
});

test('rôle gl_player possède gl.read et gl.action.request', async () => {
  const rows = await queryAll(
    `SELECT rp.permission_key
       FROM role_permissions rp
  INNER JOIN roles r ON r.id = rp.role_id
      WHERE r.slug = 'gl_player'
      ORDER BY rp.permission_key ASC`,
  );
  assert.deepStrictEqual(
    rows.map((row) => row.permission_key),
    ['gl.action.request', 'gl.read'],
  );
});
