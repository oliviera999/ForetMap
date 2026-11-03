'use strict';

/**
 * Migration 324 (connecteur MCP) : tables présentes, rejouable sans erreur, permissions
 * semées pour les bons profils (mcp.write et mcp.sql : admin seulement), catalogue RBAC aligné.
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

test('tables du connecteur créées', async () => {
  const rows = await queryAll(
    `SELECT TABLE_NAME AS t FROM information_schema.tables
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME LIKE 'mcp\\_%' ORDER BY TABLE_NAME`,
  );
  // Tables de la migration 324 (la 325 en ajoute d'autres : `tests/mcp-migration-325.test.js`).
  const names = rows.map((r) => r.t);
  for (const t of [
    'mcp_content_plans',
    'mcp_oauth_auth_codes',
    'mcp_oauth_clients',
    'mcp_oauth_tokens',
  ]) {
    assert.ok(names.includes(t), `${t} attendue`);
  }
});

test('migration rejouable (idempotente)', async () => {
  const sql = fs.readFileSync(
    path.join(__dirname, '..', 'migrations', '324_mcp_oauth.sql'),
    'utf8',
  );
  const conn = await pool.getConnection();
  try {
    for (const stmt of splitSqlStatements(sql)) await conn.query(stmt);
  } finally {
    conn.release();
  }
});

test('permissions semées : mcp.use (admin, prof), mcp.write et mcp.sql (admin seulement)', async () => {
  const rows = await queryAll(
    `SELECT r.slug, rp.permission_key AS k FROM role_permissions rp
       JOIN roles r ON r.id = rp.role_id WHERE rp.permission_key LIKE 'mcp.%'`,
  );
  const by = (k) =>
    rows
      .filter((r) => r.k === k)
      .map((r) => r.slug)
      .sort();
  assert.deepEqual(by('mcp.use'), ['admin', 'prof']);
  assert.deepEqual(by('mcp.write'), ['admin']);
  assert.deepEqual(by('mcp.sql'), ['admin']);
  const keys = new Set(PERMISSIONS.map((p) => p[0]));
  for (const k of ['mcp.use', 'mcp.write', 'mcp.sql']) assert.ok(keys.has(k));
  assert.ok(!ROLE_PERMISSION_MATRIX.prof.includes('mcp.write'));
  assert.ok(!ROLE_PERMISSION_MATRIX.prof_classe.includes('mcp.use'));
});

test('aucune colonne nominative hors identifiant de compte', async () => {
  const cols = await queryAll(
    `SELECT COLUMN_NAME AS c FROM information_schema.columns
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME LIKE 'mcp\\_%'`,
  );
  // `client_name` : nom de l'application cliente (« Claude »), pas d'une personne.
  for (const { c } of cols) {
    assert.doesNotMatch(c, /email|pseudo|first_name|last_name|display_name|^ip|password/i, c);
  }
});
