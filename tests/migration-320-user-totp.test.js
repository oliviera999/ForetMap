'use strict';

// Migration 320 : tables de la double authentification (`user_totp`,
// `user_totp_backup_codes`) et vue de statut sans secret (`v_user_totp_status`).
// Rejouée deux fois de suite par `pool.query` (protocole texte, découpage du runner) :
// idempotente, utf8mb4, vue en `SQL SECURITY INVOKER`, suppression en cascade avec le compte.

require('./helpers/setup');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {
  initSchema,
  execute,
  queryOne,
  queryAll,
  pool,
  splitSqlStatements,
} = require('../database');

const MIGRATION_320 = path.join(__dirname, '..', 'migrations', '320_user_totp.sql');

async function runMigration320() {
  const sql = fs.readFileSync(MIGRATION_320, 'utf8');
  for (const stmt of splitSqlStatements(sql)) await pool.query(stmt);
}

const userId = crypto.randomUUID();

before(async () => {
  await initSchema();
  await execute(
    `INSERT INTO users (id, user_type, email, first_name, last_name, display_name, auth_provider, is_active, created_at, updated_at)
     VALUES (?, 'teacher', ?, 'Mig', 'Totp', 'Mig Totp', 'local', 1, NOW(), NOW())`,
    [userId, `mig320_${Date.now()}@example.com`],
  );
});

after(async () => {
  await execute('DELETE FROM users WHERE id = ?', [userId]);
});

test('320 : rejouée deux fois de suite sans erreur', async () => {
  await runMigration320();
  await runMigration320();
});

test('320 : tables en utf8mb4, colonnes attendues', async () => {
  for (const table of ['user_totp', 'user_totp_backup_codes']) {
    const row = await queryOne(
      `SELECT TABLE_COLLATION AS c FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
      [table],
    );
    assert.ok(row, `table ${table} absente`);
    assert.match(String(row.c), /^utf8mb4_/);
  }
  const cols = await queryAll(
    `SELECT COLUMN_NAME AS n FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_totp'`,
  );
  const names = new Set(cols.map((c) => c.n));
  for (const expected of [
    'user_id',
    'secret_enc',
    'secret_key_id',
    'enabled_at',
    'pending_secret_enc',
    'pending_key_id',
    'pending_created_at',
    'last_used_step',
    'last_used_at',
    'failed_attempts',
    'locked_until',
  ]) {
    assert.ok(names.has(expected), `colonne user_totp.${expected} absente`);
  }
});

test('320 : clés étrangères et index posés', async () => {
  const fks = await queryAll(
    `SELECT CONSTRAINT_NAME AS n FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
      WHERE TABLE_SCHEMA = DATABASE() AND CONSTRAINT_TYPE = 'FOREIGN KEY'
        AND TABLE_NAME IN ('user_totp', 'user_totp_backup_codes')`,
  );
  const fkNames = new Set(fks.map((f) => f.n));
  assert.ok(fkNames.has('fk_user_totp_user'));
  assert.ok(fkNames.has('fk_user_totp_backup_codes_user'));
  const idx = await queryOne(
    `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_totp_backup_codes'
        AND INDEX_NAME = 'idx_user_totp_backup_codes_user'`,
  );
  assert.ok(Number(idx.c) > 0);
});

test('320 : vue de statut en SQL SECURITY INVOKER, sans colonne secrète', async () => {
  const view = await queryOne(
    `SELECT SECURITY_TYPE AS s FROM INFORMATION_SCHEMA.VIEWS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'v_user_totp_status'`,
  );
  assert.ok(view, 'vue v_user_totp_status absente');
  assert.equal(view.s, 'INVOKER');
  const cols = await queryAll(
    `SELECT COLUMN_NAME AS n FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'v_user_totp_status'`,
  );
  const names = cols.map((c) => c.n);
  assert.ok(names.includes('backup_codes_remaining'));
  assert.ok(!names.some((n) => /secret|code_hash/.test(n)), `colonnes exposées : ${names}`);
});

test('320 : statut lu par la vue, puis suppression en cascade avec le compte', async () => {
  await execute(
    `INSERT INTO user_totp (user_id, secret_enc, secret_key_id, enabled_at) VALUES (?, 'v1.x.y.z', 'abc', NOW())`,
    [userId],
  );
  await execute(
    `INSERT INTO user_totp_backup_codes (user_id, code_hash) VALUES (?, 'h1'), (?, 'h2')`,
    [userId, userId],
  );
  await execute(
    'UPDATE user_totp_backup_codes SET used_at = NOW() WHERE user_id = ? AND code_hash = ?',
    [userId, 'h1'],
  );
  const status = await queryOne('SELECT * FROM v_user_totp_status WHERE user_id = ?', [userId]);
  assert.ok(status.enabled_at);
  assert.equal(Number(status.backup_codes_remaining), 1);

  await execute('DELETE FROM users WHERE id = ?', [userId]);
  assert.ok(!(await queryOne('SELECT 1 AS x FROM user_totp WHERE user_id = ?', [userId])));
  const left = await queryOne(
    'SELECT COUNT(*) AS c FROM user_totp_backup_codes WHERE user_id = ?',
    [userId],
  );
  assert.equal(Number(left.c), 0);
});
