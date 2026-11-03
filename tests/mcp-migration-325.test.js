'use strict';

/**
 * Migration 325 (exploitation du connecteur MCP) : tables présentes, rejouable, notes semées
 * techniques uniquement (aucune adresse, aucun secret), clé de sujet identique en SQL et en JS.
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { initSchema, queryAll, pool, splitSqlStatements } = require('../database');
const { subjectKey } = require('../lib/mcp/memory');
const { findSecretLike } = require('../lib/mcp/secretMask');

const FILE = path.join(__dirname, '..', 'migrations', '325_mcp_exploitation.sql');

test.before(async () => {
  await initSchema();
});

test('tables mcp_memory, mcp_health_reports, scheduled_job_runs créées', async () => {
  const rows = await queryAll(
    `SELECT TABLE_NAME AS t FROM information_schema.tables
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME IN ('mcp_memory', 'mcp_health_reports', 'scheduled_job_runs')`,
  );
  assert.equal(rows.length, 3);
});

test('migration rejouable sans doublon de note semée', async () => {
  const before = await queryAll('SELECT COUNT(*) AS n FROM mcp_memory WHERE created_by IS NULL');
  const conn = await pool.getConnection();
  try {
    for (const stmt of splitSqlStatements(fs.readFileSync(FILE, 'utf8'))) await conn.query(stmt);
  } finally {
    conn.release();
  }
  const after = await queryAll('SELECT COUNT(*) AS n FROM mcp_memory WHERE created_by IS NULL');
  assert.equal(Number(after[0].n), Number(before[0].n));
});

test('notes semées : sujets attendus, clé SQL = clé JS, aucun secret ni e-mail', async () => {
  const rows = await queryAll(
    "SELECT subject, subject_key, content, tags FROM mcp_memory WHERE created_by IS NULL AND scope = 'site'",
  );
  const subjects = rows.map((r) => r.subject);
  for (const expected of [
    'Isolement G&L et produits par hôte',
    'Corpus pédagogique semé par les migrations',
    'Convention QCM G&L : feedback de la bonne réponse',
    'Emoji : comparer en BINARY',
    'G&L : 4 chapitres joués, niveau 6e',
    'Liens ressource ↔ question G&L : source de vérité',
    'MariaDB 10.11+ : droits PUBLIC lus à part',
    'Emplacements des journaux et du cron',
  ]) {
    assert.ok(subjects.includes(expected), `note « ${expected} » attendue`);
  }
  for (const r of rows) {
    assert.equal(r.subject_key, subjectKey('site', null, r.subject), r.subject);
    assert.equal(findSecretLike(`${r.subject} ${r.content} ${r.tags}`), null, r.subject);
  }
});

test('colonnes : identifiants de compte seulement, aucune colonne nominative', async () => {
  const cols = await queryAll(
    `SELECT COLUMN_NAME AS c FROM information_schema.columns
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME IN ('mcp_memory', 'mcp_health_reports', 'scheduled_job_runs')`,
  );
  for (const { c } of cols) {
    assert.doesNotMatch(c, /email|pseudo|first_name|last_name|display_name|^ip|password/i, c);
  }
});
