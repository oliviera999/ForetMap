'use strict';

// Migration 302 (temps 3 des retraits de schéma, audit du 25/09/2026, § 3.5) :
// `v_visit_coverage` (migration 269) n'a jamais eu de lecteur ; elle est supprimée, et
// `sync_conflicts.kind` perd la valeur `both_changed`, jamais écrite.

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { initSchema, queryAll, queryOne, pool, splitSqlStatements } = require('../database');

const MIGRATION_302 = path.join(
  __dirname,
  '..',
  'migrations',
  '302_schema_retraits_t3_sans_dependance.sql',
);

/** Rejoue la migration comme le runner : protocole texte (`PREPARE` n'est pas préparable). */
async function runMigration302() {
  for (const stmt of splitSqlStatements(fs.readFileSync(MIGRATION_302, 'utf8'))) {
    await pool.query(stmt);
  }
}

async function kindColumnType() {
  const row = await queryOne(
    `SELECT column_type FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = 'sync_conflicts' AND column_name = 'kind'`,
  );
  return String(row?.column_type || row?.COLUMN_TYPE || '');
}

before(async () => {
  await initSchema();
});

test('migration 302 : la vue v_visit_coverage n’existe plus', async () => {
  const viewRows = await queryAll(
    `SELECT table_name FROM information_schema.views
     WHERE table_schema = DATABASE() AND table_name = 'v_visit_coverage'`,
  );
  assert.strictEqual(viewRows.length, 0, 'vue v_visit_coverage encore présente');
});

test('migration 302 : sync_conflicts.kind sans both_changed, les autres valeurs gardées', async () => {
  const type = await kindColumnType();
  assert.ok(!type.includes("'both_changed'"), type);
  for (const value of ['member_added_on_mirror', 'member_removed_on_mirror', 'name_changed']) {
    assert.ok(type.includes(`'${value}'`), `${value} absent de ${type}`);
  }
});

test('migration 302 : idempotente (second passage sans erreur ni changement)', async () => {
  const before302 = await kindColumnType();
  await runMigration302();
  await runMigration302();
  assert.strictEqual(await kindColumnType(), before302);
});
