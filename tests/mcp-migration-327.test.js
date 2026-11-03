'use strict';

/**
 * Migration 327 (mode productivité MCP) : table mcp_confirmations, permissions admin.
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { initSchema, queryAll, pool, splitSqlStatements } = require('../database');
const { PERMISSIONS, ROLE_PERMISSION_MATRIX } = require('../lib/rbac');

test.before(async () => {
  await initSchema();
});

test('table mcp_confirmations créée', async () => {
  const rows = await queryAll(
    `SELECT TABLE_NAME AS t FROM information_schema.tables
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'mcp_confirmations'`,
  );
  assert.equal(rows.length, 1);
});

test('migration 327 rejouable (idempotente)', async () => {
  const sql = fs.readFileSync(
    path.join(__dirname, '..', 'migrations', '327_mcp_productivity.sql'),
    'utf8',
  );
  const conn = await pool.getConnection();
  try {
    for (const stmt of splitSqlStatements(sql)) await conn.query(stmt);
  } finally {
    conn.release();
  }
});

test('permissions mcp.sql_execute et mcp.privacy_bypass : admin seulement', async () => {
  const rows = await queryAll(
    `SELECT r.slug, rp.permission_key AS k FROM role_permissions rp
       JOIN roles r ON r.id = rp.role_id
      WHERE rp.permission_key IN ('mcp.sql_execute','mcp.privacy_bypass')`,
  );
  const by = (k) =>
    rows
      .filter((r) => r.k === k)
      .map((r) => r.slug)
      .sort();
  assert.deepEqual(by('mcp.sql_execute'), ['admin']);
  assert.deepEqual(by('mcp.privacy_bypass'), ['admin']);
  const keys = new Set(PERMISSIONS.map((p) => p[0]));
  assert.ok(keys.has('mcp.sql_execute'));
  assert.ok(keys.has('mcp.privacy_bypass'));
  assert.ok(ROLE_PERMISSION_MATRIX.admin.includes('mcp.sql_execute'));
  assert.ok(ROLE_PERMISSION_MATRIX.admin.includes('mcp.privacy_bypass'));
  assert.ok(!ROLE_PERMISSION_MATRIX.prof.includes('mcp.sql_execute'));
  assert.ok(!ROLE_PERMISSION_MATRIX.prof.includes('mcp.privacy_bypass'));
});
