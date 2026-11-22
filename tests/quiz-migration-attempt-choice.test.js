'use strict';

/**
 * Migration `quiz_attempt_choice` : cinq colonnes NULL sur `user_quiz_attempts` (lettre
 * d'origine du choix, ordre présenté, durée côté serveur, contexte, empreinte de version) et
 * l'index `(question_code, question_empreinte, choix_lettre)`. Idempotente, aucune ligne
 * `app_settings`. Le fichier est trouvé par son suffixe : le numéro peut changer à
 * l'intégration.
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { initSchema, queryAll, pool, splitSqlStatements } = require('../database');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');
const FILE_NAME = fs
  .readdirSync(MIGRATIONS_DIR)
  .find((f) => /^\d+_quiz_attempt_choice\.sql$/.test(f));

test.before(async () => {
  await initSchema();
});

test('le fichier de migration existe, une seule fois', () => {
  const all = fs.readdirSync(MIGRATIONS_DIR).filter((f) => /_quiz_attempt_choice\.sql$/.test(f));
  assert.equal(all.length, 1, `fichiers trouvés : ${all.join(', ')}`);
  assert.ok(FILE_NAME);
});

test('migration rejouable (idempotente) : deux passes sans erreur', async () => {
  const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, FILE_NAME), 'utf8');
  const conn = await pool.getConnection();
  try {
    for (const stmt of splitSqlStatements(sql)) await conn.query(stmt);
    for (const stmt of splitSqlStatements(sql)) await conn.query(stmt);
  } finally {
    conn.release();
  }
});

test('en tête SET NAMES, aucune ligne app_settings, ni DEFINER ni trigger', () => {
  const raw = fs.readFileSync(path.join(MIGRATIONS_DIR, FILE_NAME), 'utf8');
  assert.match(raw.split('\n')[0], /^SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;/);
  const sql = raw.replace(/^--.*$/gm, '');
  assert.doesNotMatch(sql, /app_settings/i);
  assert.doesNotMatch(sql, /DEFINER|CREATE\s+TRIGGER/i);
});

test('les cinq colonnes existent, NULL, avec le type attendu', async () => {
  const rows = await queryAll(
    `SELECT COLUMN_NAME AS name, COLUMN_TYPE AS type, IS_NULLABLE AS nullable,
            COLUMN_DEFAULT AS dflt
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_quiz_attempts'
        AND COLUMN_NAME IN ('choix_lettre','ordre_presente','duree_ms','contexte','question_empreinte')`,
  );
  const by = Object.fromEntries(rows.map((r) => [r.name, r]));
  assert.equal(rows.length, 5);
  assert.equal(by.choix_lettre.type, "enum('A','B','C','D','E')");
  assert.equal(by.ordre_presente.type, 'varchar(5)');
  assert.equal(by.duree_ms.type, 'int(10) unsigned');
  assert.equal(by.contexte.type, "enum('libre','tirage','validation','seance')");
  assert.equal(by.question_empreinte.type, 'char(12)');
  for (const r of rows) {
    assert.equal(r.nullable, 'YES', `${r.name} doit accepter NULL`);
    assert.ok(r.dflt == null || r.dflt === 'NULL', `${r.name} : défaut NULL`);
  }
});

test('index (question_code, question_empreinte, choix_lettre)', async () => {
  const rows = await queryAll(
    `SELECT COLUMN_NAME AS col, SEQ_IN_INDEX AS seq
       FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_quiz_attempts'
        AND INDEX_NAME = 'idx_uqa_question_version_choice'
      ORDER BY SEQ_IN_INDEX`,
  );
  assert.deepEqual(
    rows.map((r) => r.col),
    ['question_code', 'question_empreinte', 'choix_lettre'],
  );
});
