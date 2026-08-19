'use strict';

// Garde-fou contre la « résurrection » d'objets supprimés (audit docs/AUDIT_BDD_2026-08.md §3.3).
//
// `initSchema()` exécute sql/schema_foretmap.sql AVANT runMigrations(), à chaque démarrage.
// Un objet supprimé par une migration numérotée mais toujours déclaré dans le fichier de
// schéma est donc recréé au démarrage suivant — et la migration, déjà passée d'après
// schema_version, ne le supprimera plus jamais. C'est ce qui est arrivé à
// role_pin_secrets et elevation_audit, supprimées par la migration 164 et pourtant
// présentes dans l'export de production du 18/08/2026.
//
// Deux issues acceptables pour un objet supprimé par une migration :
//   1. il ne figure plus dans sql/schema_foretmap.sql ;
//   2. il y figure encore (les migrations historiques en ont besoin sur une base neuve)
//      ET il est déclaré comme échafaudage dans lib/legacySchemaCleanup.js, qui le
//      supprime après CHAQUE passage de migrations.
//
// Test purement statique : aucune base de données requise.

const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const assert = require('node:assert');

const {
  LEGACY_SCAFFOLDING_TABLES,
  LEGACY_SCAFFOLDING_COLUMNS,
} = require('../lib/legacySchemaCleanup');

const ROOT = path.join(__dirname, '..');
const SCHEMA_PATH = path.join(ROOT, 'sql', 'schema_foretmap.sql');
const MIGRATIONS_DIR = path.join(ROOT, 'migrations');

function readMigrations() {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d{3}_.*\.sql$/.test(f))
    .sort()
    .map((file) => ({ file, sql: fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8') }));
}

/** Retire les commentaires SQL pour ne raisonner que sur les instructions réelles. */
function stripComments(sql) {
  return sql.replace(/--[^\n]*/g, '');
}

const schemaSql = stripComments(fs.readFileSync(SCHEMA_PATH, 'utf8'));

function schemaDeclaresTable(table) {
  return new RegExp(`CREATE TABLE (?:IF NOT EXISTS )?\`?${table}\`?\\s*\\(`, 'i').test(schemaSql);
}

/** Vrai si `column` apparaît dans le bloc CREATE TABLE de `table` du fichier de schéma. */
function schemaDeclaresColumn(table, column) {
  const block = new RegExp(
    `CREATE TABLE (?:IF NOT EXISTS )?\`?${table}\`?\\s*\\(([\\s\\S]*?)\\n\\)`,
    'i',
  ).exec(schemaSql);
  if (!block) return false;
  return new RegExp(`^\\s*\`?${column}\`?\\s`, 'im').test(block[1]);
}

test('aucune table supprimée par une migration ne reste déclarée sans échafaudage', () => {
  const scaffolding = new Set(LEGACY_SCAFFOLDING_TABLES);
  const offenders = [];
  for (const { file, sql } of readMigrations()) {
    for (const m of stripComments(sql).matchAll(/DROP TABLE (?:IF EXISTS )?`?(\w+)`?/gi)) {
      const table = m[1];
      if (!schemaDeclaresTable(table)) continue;
      if (scaffolding.has(table)) continue;
      offenders.push(
        `${table} (supprimée par ${file}, toujours déclarée dans schema_foretmap.sql)`,
      );
    }
  }
  assert.deepStrictEqual(
    [...new Set(offenders)],
    [],
    'objets voués à ressusciter au prochain démarrage — les retirer du schéma, ou les ajouter à LEGACY_SCAFFOLDING_TABLES',
  );
});

test('aucune colonne supprimée par une migration ne reste déclarée sans échafaudage', () => {
  const scaffolding = new Set(
    LEGACY_SCAFFOLDING_COLUMNS.map((c) => `${c.table}.${c.column}`.toLowerCase()),
  );
  const offenders = [];
  for (const { file, sql } of readMigrations()) {
    const clean = stripComments(sql);
    for (const m of clean.matchAll(
      /ALTER TABLE\s+`?(\w+)`?\s+DROP COLUMN (?:IF EXISTS )?`?(\w+)`?/gi,
    )) {
      const [table, column] = [m[1], m[2]];
      if (!schemaDeclaresColumn(table, column)) continue;
      if (scaffolding.has(`${table}.${column}`.toLowerCase())) continue;
      offenders.push(`${table}.${column} (supprimée par ${file})`);
    }
  }
  assert.deepStrictEqual(
    [...new Set(offenders)],
    [],
    'colonnes vouées à ressusciter — les retirer du schéma, ou les ajouter à LEGACY_SCAFFOLDING_COLUMNS',
  );
});

test('aucun index supprimé par une migration ne reste déclaré dans le schéma', () => {
  const offenders = [];
  for (const { file, sql } of readMigrations()) {
    const clean = stripComments(sql);
    for (const m of clean.matchAll(/DROP INDEX (?:IF EXISTS )?`?(\w+)`?/gi)) {
      const index = m[1];
      if (!new RegExp(`(?:INDEX|KEY)\\s+\`?${index}\`?\\s*\\(`, 'i').test(schemaSql)) continue;
      offenders.push(`${index} (supprimé par ${file}, toujours déclaré dans schema_foretmap.sql)`);
    }
  }
  assert.deepStrictEqual(
    [...new Set(offenders)],
    [],
    'index voués à ressusciter au prochain démarrage — les retirer de sql/schema_foretmap.sql',
  );
});

test("l'échafaudage déclaré est bien présent dans le fichier de schéma", () => {
  // Un échafaudage qui a disparu du schéma n'a plus lieu d'être nettoyé : la liste doit
  // rester le reflet exact de ce que le fichier déclare encore.
  for (const table of LEGACY_SCAFFOLDING_TABLES) {
    assert.ok(
      schemaDeclaresTable(table),
      `${table} est listée comme échafaudage mais n'est plus déclarée dans schema_foretmap.sql — retirer l'entrée`,
    );
  }
  for (const { table, column } of LEGACY_SCAFFOLDING_COLUMNS) {
    assert.ok(
      schemaDeclaresColumn(table, column),
      `${table}.${column} est listée comme échafaudage mais n'est plus déclarée — retirer l'entrée`,
    );
  }
});
