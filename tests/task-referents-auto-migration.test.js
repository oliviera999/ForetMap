'use strict';

// Élèves référents automatiques : migration `task_referents_auto` (structure seule).
//
// Ce que ce fichier protège :
// - `task_referents.source` (ENUM manual/auto, défaut manual) et `added_at` existent ;
// - `task_series_referent_vetoes` a sa clé primaire (série, élève), son index et ses clés
//   étrangères (élève : cascade ; auteur : SET NULL) ;
// - rejouée deux fois, la migration ne lève aucune erreur et ne modifie aucun lien existant.
//
// Le fichier est retrouvé par son suffixe : son numéro peut changer à l'intégration.

require('./helpers/setup');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const { initSchema, execute, queryOne, queryAll, splitSqlStatements } = require('../database');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');
const SUFFIX = /_task_referents_auto\.sql$/;
const STAMP = crypto.randomUUID().slice(0, 8);
const USER_ID = `ram-u-${STAMP}`;
const TASK_ID = `ram-t-${STAMP}`;

function migrationFile() {
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => SUFFIX.test(f));
  assert.equal(files.length, 1, 'une seule migration task_referents_auto');
  return path.join(MIGRATIONS_DIR, files[0]);
}

async function replayMigration() {
  const sql = fs.readFileSync(migrationFile(), 'utf8');
  for (const stmt of splitSqlStatements(sql)) await execute(stmt);
}

before(async () => {
  await initSchema();
  await execute(
    `INSERT INTO users (id, user_type, first_name, last_name, is_active)
     VALUES (?, 'student', 'Migr', ?, 1)`,
    [USER_ID, `Ref${STAMP}`],
  );
  await execute(
    "INSERT INTO tasks (id, title, status) VALUES (?, 'Tâche migration', 'available')",
    [TASK_ID],
  );
  await execute('INSERT INTO task_referents (task_id, user_id) VALUES (?, ?)', [TASK_ID, USER_ID]);
});

after(async () => {
  await execute('DELETE FROM tasks WHERE id = ?', [TASK_ID]);
  await execute('DELETE FROM users WHERE id = ?', [USER_ID]);
});

test('migration task_referents_auto : sans données, sans trigger ni DEFINER', () => {
  const sql = fs.readFileSync(migrationFile(), 'utf8');
  assert.match(sql, /^SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;/);
  const code = sql.replace(/^\s*--.*$/gm, '');
  assert.doesNotMatch(code, /\bTRIGGER\b|\bDEFINER\b/i);
  const statements = splitSqlStatements(sql);
  for (const stmt of statements) {
    assert.doesNotMatch(stmt, /^\s*(INSERT|UPDATE|DELETE|DROP|REPLACE)\b/i, stmt.slice(0, 60));
  }
});

test('task_referents : colonnes source et added_at', async () => {
  const cols = await queryAll(
    `SELECT COLUMN_NAME AS name, COLUMN_TYPE AS type, IS_NULLABLE AS nullable,
            COLUMN_DEFAULT AS def
       FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'task_referents'`,
  );
  const byName = Object.fromEntries(cols.map((c) => [c.name, c]));
  assert.equal(byName.source.type, "enum('manual','auto')");
  assert.equal(byName.source.nullable, 'NO');
  assert.match(String(byName.source.def), /manual/);
  assert.equal(byName.added_at.type, 'datetime');
  assert.equal(byName.added_at.nullable, 'YES');
});

test('task_series_referent_vetoes : clé primaire, index et clés étrangères', async () => {
  const row = await queryOne('SHOW CREATE TABLE task_series_referent_vetoes');
  const ddl = row['Create Table'];
  assert.match(ddl, /PRIMARY KEY \(`series_id`,`user_id`\)/);
  assert.match(ddl, /KEY `idx_task_series_referent_vetoes_user` \(`user_id`\)/);
  assert.match(
    ddl,
    /FOREIGN KEY \(`user_id`\) REFERENCES `users` \(`id`\) ON DELETE CASCADE/,
    'le refus suit le compte',
  );
  assert.match(ddl, /FOREIGN KEY \(`created_by`\) REFERENCES `users` \(`id`\) ON DELETE SET NULL/);
  assert.match(ddl, /CHARSET=utf8mb4/);
});

test('rejouée deux fois : aucune erreur, lien existant inchangé (manual)', async () => {
  const before = await queryOne(
    'SELECT source, added_at FROM task_referents WHERE task_id = ? AND user_id = ?',
    [TASK_ID, USER_ID],
  );
  assert.equal(before.source, 'manual');
  await replayMigration();
  await replayMigration();
  const after = await queryOne(
    'SELECT source, added_at FROM task_referents WHERE task_id = ? AND user_id = ?',
    [TASK_ID, USER_ID],
  );
  assert.deepEqual(after, before);
  const fks = await queryAll(
    `SELECT CONSTRAINT_NAME AS name FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS
      WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'task_series_referent_vetoes'`,
  );
  assert.equal(fks.length, 2, 'pas de clé étrangère en double');
});

test('suppression du compte : ses refus disparaissent (cascade)', async () => {
  const uid = `ram-v-${STAMP}`;
  await execute(
    `INSERT INTO users (id, user_type, first_name, last_name, is_active)
     VALUES (?, 'student', 'Veto', ?, 1)`,
    [uid, `Ref${STAMP}`],
  );
  await execute(
    'INSERT INTO task_series_referent_vetoes (series_id, user_id, created_by, created_at) VALUES (?, ?, ?, NOW())',
    [TASK_ID, uid, USER_ID],
  );
  await execute('DELETE FROM users WHERE id = ?', [uid]);
  const left = await queryOne(
    'SELECT COUNT(*) AS n FROM task_series_referent_vetoes WHERE user_id = ?',
    [uid],
  );
  assert.equal(Number(left.n), 0);
});
