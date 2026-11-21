'use strict';

// Nature des fiches du catalogue : migration `plants_entity_kind`.
//
// Ce que ce fichier protège :
// - la colonne a exactement le type, la valeur par défaut et l'index de la production (elle y
//   existait avant d'entrer dans le dépôt : un type différent rendrait `ADD COLUMN IF NOT
//   EXISTS` trompeur) ;
// - rejouée deux fois, la migration ne lève aucune erreur et ne change plus rien ;
// - une valeur déjà posée n'est jamais écrasée (garde `<=>` : sans effet en production) ;
// - une fiche est désignée par son nom, et une fiche absente est sautée sans rien créer.
//
// Le fichier est retrouvé par son suffixe : son numéro peut changer à l'intégration.

require('./helpers/setup');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { initSchema, execute, queryOne, queryAll, splitSqlStatements } = require('../database');
const { ENTITY_KIND_ENUM, ENTITY_KIND_DEFAULT } = require('../lib/shared/biodivEnums');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');
const SUFFIX = /_plants_entity_kind\.sql$/;

/** Fiches désignées par la migration (relevé de la production, lecture seule). */
const EXPECTED = Object.freeze({
  ressource: [
    'Litière de feuilles',
    'Compost et épluchures',
    'Bois mort',
    'Fruits et légumes tombés',
    'Carton de lombricompost',
    'Crottes et fientes',
  ],
  groupe_fonctionnel: [
    'Champignons de litière',
    'Ciliés et amibes du compost',
    'Phytoplancton',
    'Zooplancton',
  ],
  consortium: [
    'Biofilm',
    'Mycorhizes à Glomus',
    'Lichen noir des rochers',
    'Xanthorie des murailles',
  ],
});
const ALL_NAMES = Object.values(EXPECTED).flat();

const createdPlantIds = [];

function migrationFile() {
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => SUFFIX.test(f));
  assert.equal(files.length, 1, 'une seule migration plants_entity_kind');
  return path.join(MIGRATIONS_DIR, files[0]);
}

async function replayMigration() {
  const sql = fs.readFileSync(migrationFile(), 'utf8');
  for (const stmt of splitSqlStatements(sql)) await execute(stmt);
}

async function snapshot() {
  return queryAll('SELECT id, entity_kind FROM plants ORDER BY id');
}

async function kindOf(id) {
  return (await queryOne('SELECT entity_kind FROM plants WHERE id = ?', [id])).entity_kind;
}

before(async () => {
  await initSchema();
});

after(async () => {
  for (const id of createdPlantIds) await execute('DELETE FROM plants WHERE id = ?', [id]);
});

test('le fichier de migration : jeu de caractères en tête, ni trigger ni DEFINER ni DROP', () => {
  const sql = fs.readFileSync(migrationFile(), 'utf8');
  assert.match(sql, /^SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;/);
  const code = sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
  assert.doesNotMatch(code, /\bTRIGGER\b/i);
  assert.doesNotMatch(code, /\bDEFINER\b/i);
  assert.doesNotMatch(code, /\bDROP\b/i);
  assert.doesNotMatch(code, /\bgl_/i, 'aucune table Gnomes & Licornes');
  assert.match(code, /ADD COLUMN IF NOT EXISTS entity_kind/);
  assert.match(code, /CREATE INDEX IF NOT EXISTS idx_plants_entity_kind/);
});

test('plants.entity_kind : type, valeur par défaut et index identiques à la production', async () => {
  const col = await queryOne(
    `SELECT COLUMN_TYPE AS type, IS_NULLABLE AS nullable, COLUMN_DEFAULT AS dflt
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'plants' AND COLUMN_NAME = 'entity_kind'`,
  );
  assert.ok(col, 'la colonne existe sur une base construite par les migrations');
  assert.equal(col.type, "enum('taxon','groupe_fonctionnel','consortium','ressource')");
  assert.equal(col.nullable, 'NO');
  assert.equal(String(col.dflt).replace(/'/g, ''), ENTITY_KIND_DEFAULT);
  assert.equal(
    col.type,
    `enum(${ENTITY_KIND_ENUM.values.map((v) => `'${v}'`).join(',')})`,
    'le référentiel suit l’ENUM SQL, dans le même ordre',
  );
  const index = await queryAll(
    `SELECT COLUMN_NAME AS col FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'plants'
        AND INDEX_NAME = 'idx_plants_entity_kind'`,
  );
  assert.deepEqual(
    index.map((r) => r.col),
    ['entity_kind'],
  );
});

test('les fiches désignées par leur nom portent la bonne nature', async () => {
  const rows = await queryAll(
    `SELECT name, entity_kind FROM plants WHERE name IN (${ALL_NAMES.map(() => '?').join(', ')})`,
    ALL_NAMES,
  );
  assert.ok(rows.length > 0, 'le catalogue semé contient au moins une de ces fiches');
  for (const row of rows) {
    const expected = Object.keys(EXPECTED).find((kind) => EXPECTED[kind].includes(row.name));
    assert.equal(row.entity_kind, expected, row.name);
  }
});

test('rejouée deux fois : aucune erreur, aucun changement, aucun doublon', async () => {
  const countBefore = (await queryOne('SELECT COUNT(*) AS n FROM plants')).n;
  await replayMigration();
  const first = await snapshot();
  await replayMigration();
  const second = await snapshot();
  assert.deepEqual(second, first);
  assert.equal((await queryOne('SELECT COUNT(*) AS n FROM plants')).n, countBefore);
  const indexes = await queryAll(
    `SELECT DISTINCT INDEX_NAME AS name FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'plants' AND COLUMN_NAME = 'entity_kind'`,
  );
  assert.equal(indexes.length, 1, 'un seul index sur la colonne');
});

test('garde <=> : une nature déjà posée n’est pas écrasée, une fiche neuve est classée par son nom', async () => {
  // Fiche portant un nom visé, mais déjà classée autrement (choix d'un enseignant, ou valeur
  // de la production) : la migration n'y touche pas.
  const kept = await execute(
    "INSERT INTO plants (name, emoji, entity_kind) VALUES ('Bois mort', '🪵', 'consortium')",
  );
  createdPlantIds.push(kept.insertId);
  // Fiche portant un nom visé, encore à la valeur par défaut : elle est classée.
  const fresh = await execute("INSERT INTO plants (name, emoji) VALUES ('Zooplancton', '🦐')");
  createdPlantIds.push(fresh.insertId);
  // Fiche ordinaire : jamais touchée.
  const plain = await execute(
    "INSERT INTO plants (name, emoji) VALUES ('Bois mort de chêne', '🌳')",
  );
  createdPlantIds.push(plain.insertId);

  await replayMigration();
  assert.equal(await kindOf(kept.insertId), 'consortium');
  assert.equal(await kindOf(fresh.insertId), 'groupe_fonctionnel');
  assert.equal(await kindOf(plain.insertId), 'taxon');
});
