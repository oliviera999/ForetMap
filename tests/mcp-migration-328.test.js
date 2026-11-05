'use strict';

/**
 * Migration 328 (connecteur Claude, accès complet) : permissions `mcp.ops` (admin) et
 * `notifications.send` (admin, prof), idempotente, aucune ligne `app_settings`.
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { initSchema, queryAll, pool, splitSqlStatements } = require('../database');
const { PERMISSIONS, ROLE_PERMISSION_MATRIX } = require('../lib/rbac');

const FILE = path.join(__dirname, '..', 'migrations', '328_mcp_acces_complet.sql');

test.before(async () => {
  await initSchema();
});

test('migration 328 rejouable (idempotente)', async () => {
  const sql = fs.readFileSync(FILE, 'utf8');
  const conn = await pool.getConnection();
  try {
    for (const stmt of splitSqlStatements(sql)) await conn.query(stmt);
    for (const stmt of splitSqlStatements(sql)) await conn.query(stmt);
  } finally {
    conn.release();
  }
});

test('aucune ligne app_settings semée', () => {
  const sql = fs.readFileSync(FILE, 'utf8').replace(/^--.*$/gm, '');
  assert.doesNotMatch(sql, /app_settings/i);
});

test('mcp.ops : admin seulement ; notifications.send : admin et prof', async () => {
  const rows = await queryAll(
    `SELECT r.slug, rp.permission_key AS k FROM role_permissions rp
       JOIN roles r ON r.id = rp.role_id
      WHERE rp.permission_key IN ('mcp.ops', 'notifications.send')`,
  );
  const by = (k) =>
    rows
      .filter((r) => r.k === k)
      .map((r) => r.slug)
      .sort();
  assert.deepEqual(by('mcp.ops'), ['admin']);
  assert.deepEqual(by('notifications.send'), ['admin', 'prof']);
  const keys = new Set(PERMISSIONS.map((p) => p[0]));
  assert.ok(keys.has('mcp.ops'));
  assert.ok(keys.has('notifications.send'));
  assert.ok(ROLE_PERMISSION_MATRIX.admin.includes('mcp.ops'));
  assert.ok(!ROLE_PERMISSION_MATRIX.prof.includes('mcp.ops'));
  assert.ok(ROLE_PERMISSION_MATRIX.prof.includes('notifications.send'));
});
