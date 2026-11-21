'use strict';

// Migration `id_keys_credits_chemins_tutoriels` : crédit des images de propositions, drapeau
// « chemins multiples voulus », table `id_key_tutorials`. Rejouée deux fois : aucune erreur,
// aucun doublon, aucun lien posé. Le fichier est retrouvé par son suffixe, jamais par son
// numéro. Tests BDD partagée : exécution séquentielle.

require('./helpers/setup');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { initSchema, execute, queryAll, queryOne, splitSqlStatements } = require('../database');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');
const SUFFIX_RE = /_id_keys_credits_chemins_tutoriels\.sql$/;
const TRACES_SLUG = 'traces-mammiferes-melah';
const stamp = Date.now();
const otherSlug = `rejeu-autre-${stamp}`;
let createdTraces = false;

function migrationFile() {
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => SUFFIX_RE.test(f));
  assert.equal(files.length, 1, 'un seul fichier porte ce suffixe');
  return path.join(MIGRATIONS_DIR, files[0]);
}

async function replay() {
  const sql = fs.readFileSync(migrationFile(), 'utf8');
  for (const stmt of splitSqlStatements(sql)) await execute(stmt);
}

async function columns(table, names) {
  const rows = await queryAll(
    `SELECT COLUMN_NAME AS name, COLUMN_TYPE AS type, IS_NULLABLE AS nullable,
            COLUMN_DEFAULT AS def
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME IN (${names
        .map(() => '?')
        .join(', ')})
      ORDER BY COLUMN_NAME`,
    [table, ...names],
  );
  return rows.map((r) => ({ ...r, def: r.def == null ? null : String(r.def).replace(/'/g, '') }));
}

async function schemaFingerprint() {
  return {
    leads: await columns('id_key_leads', ['image_credit', 'image_licence']),
    keys: await columns('id_keys', ['allows_multiple_paths']),
    links: await queryAll(
      `SELECT COLUMN_NAME AS name, COLUMN_TYPE AS type, COLUMN_KEY AS col_key
         FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'id_key_tutorials'
        ORDER BY ORDINAL_POSITION`,
    ),
    constraints: await queryAll(
      `SELECT CONSTRAINT_NAME AS name, CONSTRAINT_TYPE AS type
         FROM information_schema.TABLE_CONSTRAINTS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'id_key_tutorials'
        ORDER BY CONSTRAINT_NAME`,
    ),
  };
}

before(async () => {
  await initSchema();
  await execute(`INSERT INTO id_keys (slug, title) VALUES (?, 'Autre clé')`, [otherSlug]);
});

after(async () => {
  await execute('DELETE FROM id_keys WHERE slug = ?', [otherSlug]).catch(() => {});
  if (createdTraces) {
    await execute('DELETE FROM id_keys WHERE slug = ?', [TRACES_SLUG]).catch(() => {});
  }
});

test('le fichier respecte les règles du chantier (en-tête, idempotence, ni vue ni trigger)', () => {
  const sql = fs.readFileSync(migrationFile(), 'utf8');
  assert.match(sql, /^SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;/);
  const code = sql.replace(/--.*$/gm, '');
  assert.doesNotMatch(code, /\b(DEFINER|TRIGGER|DROP)\b/i);
  assert.doesNotMatch(code, /ADD COLUMN (?!IF NOT EXISTS)/i);
  assert.doesNotMatch(code, /CREATE TABLE (?!IF NOT EXISTS)/i);
  assert.doesNotMatch(code, /INSERT\s+INTO/i, 'aucun lien ni contenu posé par la migration');
});

test('schéma posé : colonnes de crédit, drapeau, table de liens avec ses clés étrangères', async () => {
  const fp = await schemaFingerprint();
  assert.deepEqual(fp.leads, [
    { name: 'image_credit', type: 'varchar(255)', nullable: 'YES', def: 'NULL' },
    { name: 'image_licence', type: 'varchar(64)', nullable: 'YES', def: 'NULL' },
  ]);
  assert.deepEqual(fp.keys, [
    { name: 'allows_multiple_paths', type: 'tinyint(1)', nullable: 'NO', def: '0' },
  ]);
  assert.deepEqual(
    fp.links.map((c) => [c.name, c.col_key]),
    [
      ['key_id', 'PRI'],
      ['tutorial_id', 'PRI'],
      ['sort_order', ''],
    ],
    'la paire (clé, tutoriel) est unique',
  );
  assert.deepEqual(
    fp.constraints.map((c) => `${c.type}:${c.name}`),
    [
      'FOREIGN KEY:fk_id_key_tutorials_key',
      'FOREIGN KEY:fk_id_key_tutorials_tutorial',
      'PRIMARY KEY:PRIMARY',
    ],
  );
});

test('rejouée deux fois : même schéma, aucune erreur, aucun lien posé', async () => {
  const before = await schemaFingerprint();
  const linksBefore = Number((await queryOne('SELECT COUNT(*) AS n FROM id_key_tutorials')).n);
  await replay();
  await replay();
  assert.deepEqual(await schemaFingerprint(), before);
  assert.equal(
    Number((await queryOne('SELECT COUNT(*) AS n FROM id_key_tutorials')).n),
    linksBefore,
  );
});

test('drapeau : posé par slug sur la clé des traces, sans effet si elle manque', async () => {
  const flag = async (slug) =>
    queryOne('SELECT allows_multiple_paths AS f FROM id_keys WHERE slug = ?', [slug]);
  if (!(await flag(TRACES_SLUG))) {
    // Clé absente (base fraîche) : la migration passe sans rien écrire.
    await replay();
    assert.equal(await flag(TRACES_SLUG), undefined, 'la migration ne crée pas la clé');
    await execute(`INSERT INTO id_keys (slug, title) VALUES (?, 'Traces de mammifères')`, [
      TRACES_SLUG,
    ]);
    createdTraces = true;
    assert.equal(Number((await flag(TRACES_SLUG)).f), 0, 'valeur par défaut');
  }
  await replay();
  await replay();
  assert.equal(Number((await flag(TRACES_SLUG)).f), 1);
  assert.equal(Number((await flag(otherSlug)).f), 0, 'les autres clés ne sont pas touchées');
  assert.equal(
    Number((await queryOne('SELECT COUNT(*) AS n FROM id_keys WHERE slug = ?', [TRACES_SLUG])).n),
    1,
    'aucun doublon',
  );
});
