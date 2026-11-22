'use strict';

/**
 * Migration `reprise_derive_schema` (flux F7) : amène une base fraîche au schéma de la prod
 * (colonnes `plants.domestication` / `wild_ancestor*`, 7 valeurs de `plants.health_risk`,
 * `curriculum_notions.programme_ref` / `valide_jusqu_a`, table `id_key_runs`, défauts, noms de
 * clés du glossaire, index propres à la prod, vue `v_id_key_integrity`). Schéma seulement,
 * idempotente. Le fichier est trouvé par son suffixe : le numéro peut changer à l'intégration.
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { initSchema, queryAll, queryOne, pool, splitSqlStatements } = require('../database');
const { readSchemaFingerprint } = require('../lib/schemaFingerprint');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');
const FILE_NAME = fs
  .readdirSync(MIGRATIONS_DIR)
  .find((f) => /^\d+_reprise_derive_schema\.sql$/.test(f));

async function column(table, name) {
  return queryOne(
    `SELECT COLUMN_TYPE AS type, IS_NULLABLE AS nullable, COLUMN_DEFAULT AS dflt
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, name],
  );
}

async function indexColumns(table, name) {
  const rows = await queryAll(
    `SELECT COLUMN_NAME AS c FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?
      ORDER BY SEQ_IN_INDEX`,
    [table, name],
  );
  return rows.map((r) => r.c);
}

async function foreignKeys(table) {
  const rows = await queryAll(
    `SELECT CONSTRAINT_NAME AS name, DELETE_RULE AS del, REFERENCED_TABLE_NAME AS ref
       FROM information_schema.REFERENTIAL_CONSTRAINTS
      WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table],
  );
  return Object.fromEntries(rows.map((r) => [r.name, r]));
}

test.before(async () => {
  await initSchema();
});

test('le fichier de migration existe, une seule fois', () => {
  const all = fs.readdirSync(MIGRATIONS_DIR).filter((f) => /_reprise_derive_schema\.sql$/.test(f));
  assert.equal(all.length, 1, `fichiers trouvés : ${all.join(', ')}`);
  assert.ok(FILE_NAME);
});

test('en tête SET NAMES ; ni DEFINER, ni trigger, ni écriture de données', () => {
  const raw = fs.readFileSync(path.join(MIGRATIONS_DIR, FILE_NAME), 'utf8');
  assert.match(raw.split('\n')[0], /^SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;/);
  const sql = raw.replace(/^--.*$/gm, '');
  assert.doesNotMatch(sql, /DEFINER|CREATE\s+TRIGGER/i);
  // Schéma seulement : aucune valeur reprise de la prod.
  assert.doesNotMatch(sql, /^\s*(INSERT|UPDATE|DELETE|REPLACE)\b/im);
  assert.match(sql, /CREATE OR REPLACE SQL SECURITY INVOKER VIEW v_id_key_integrity/);
});

test('rejouée deux fois : aucune erreur, empreinte du schéma inchangée', async () => {
  const before = await readSchemaFingerprint({ queryAll });
  const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, FILE_NAME), 'utf8');
  const conn = await pool.getConnection();
  try {
    for (let pass = 0; pass < 2; pass += 1) {
      for (const stmt of splitSqlStatements(sql)) await conn.query(stmt);
    }
  } finally {
    conn.release();
  }
  const after = await readSchemaFingerprint({ queryAll });
  assert.deepEqual(after, before);
});

test('plants : domestication, ancêtre sauvage, clé étrangère et index de la prod', async () => {
  assert.deepEqual(await column('plants', 'domestication'), {
    type: "enum('sauvage','semi_domestique','domestique','feral')",
    nullable: 'YES',
    dflt: 'NULL',
  });
  assert.equal((await column('plants', 'wild_ancestor')).type, 'varchar(255)');
  assert.equal((await column('plants', 'wild_ancestor_plant_id')).type, 'int(10) unsigned');
  assert.deepEqual(await indexColumns('plants', 'idx_plants_domestication'), ['domestication']);
  assert.deepEqual(await indexColumns('plants', 'fk_plants_wild_ancestor'), [
    'wild_ancestor_plant_id',
  ]);
  const fks = await foreignKeys('plants');
  assert.ok(fks.fk_plants_wild_ancestor, 'clé fk_plants_wild_ancestor absente');
  assert.equal(fks.fk_plants_wild_ancestor.del, 'SET NULL');
  assert.equal(fks.fk_plants_wild_ancestor.ref, 'plants');
});

test('plants.health_risk : les 7 valeurs de la prod en fin de SET, dans son ordre', async () => {
  const col = await column('plants', 'health_risk');
  assert.equal(
    col.type,
    "set('rage','tetanos','salmonellose','leptospirose','toxoplasmose','vecteur','allergie'," +
      "'ornithose','mycobacteriose','aspergillose','toxocarose','teigne','echinococcose','fievre_q')",
  );
});

test('curriculum_notions : programme_ref et valide_jusqu_a', async () => {
  assert.equal((await column('curriculum_notions', 'programme_ref')).type, 'varchar(160)');
  assert.equal((await column('curriculum_notions', 'valide_jusqu_a')).type, 'varchar(9)');
});

test('id_key_runs : structure de la prod (clés, CHECK JSON)', async () => {
  assert.equal(
    (await column('id_key_runs', 'status')).type,
    "enum('en_cours','abouti','abandonne')",
  );
  assert.equal((await column('id_key_runs', 'path_json')).dflt, "'[]'");
  const fks = await foreignKeys('id_key_runs');
  assert.deepEqual(Object.keys(fks).sort(), [
    'fk_runs_final_lead',
    'fk_runs_key',
    'fk_runs_map',
    'fk_runs_obs',
    'fk_runs_user',
  ]);
  const check = await queryOne(
    `SELECT CHECK_CLAUSE AS clause FROM information_schema.CHECK_CONSTRAINTS
      WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'id_key_runs'
        AND CONSTRAINT_NAME = 'chk_runs_path_json'`,
  );
  assert.match(String(check?.clause), /json_valid/i);
});

test('écarts connus du 25/09 : défauts, MEDIUMTEXT, noms de clés du glossaire, index', async () => {
  assert.equal((await column('audit_log', 'details')).type, 'mediumtext');
  assert.equal((await column('map_markers', 'note')).dflt, "''");
  assert.equal((await column('zones', 'description')).dflt, "''");
  assert.equal((await column('visit_tutorials', 'map_id')).dflt, "'foret'");
  assert.deepEqual(Object.keys(await foreignKeys('glossary_term_relations')).sort(), [
    'fk_gtr_from',
    'fk_gtr_to',
  ]);
  assert.ok((await foreignKeys('glossary_term_tutorials')).fk_gtt_tuto);
  assert.deepEqual(await indexColumns('glossary_term_relations', 'idx_gtr_to'), ['to_code']);
  assert.deepEqual(await indexColumns('glossary_term_tutorials', 'idx_gtt_tuto'), ['tutorial_id']);
  assert.deepEqual(await indexColumns('group_members', 'idx_group_members_group_role'), [
    'group_id',
  ]);
  assert.deepEqual(await indexColumns('map_species', 'idx_map_species_status'), [
    'map_id',
    'validation_status',
    'presence_status',
  ]);
});

test('vue v_id_key_integrity : SQL SECURITY INVOKER, colonnes de la prod', async () => {
  const view = await queryOne(
    `SELECT SECURITY_TYPE AS sec FROM information_schema.VIEWS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'v_id_key_integrity'`,
  );
  assert.equal(view?.sec, 'INVOKER');
  const cols = await queryAll(
    `SELECT COLUMN_NAME AS c FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'v_id_key_integrity'
      ORDER BY ORDINAL_POSITION`,
  );
  assert.deepEqual(
    cols.map((r) => r.c),
    ['key_id', 'slug', 'couplet_number', 'lead_id', 'severity', 'issue'],
  );
  // La vue se lit (aucune erreur de colonne ou de jointure).
  await queryAll('SELECT * FROM v_id_key_integrity LIMIT 5');
});

test('vue v_id_key_integrity : signale une clé sans couplet de départ', async () => {
  const { execute } = require('../database');
  const slug = `f7-derive-${Date.now()}`;
  const res = await execute('INSERT INTO id_keys (slug, title) VALUES (?, ?)', [
    slug,
    'Clé de test sans couplet 1',
  ]);
  const keyId = res.insertId;
  try {
    await execute('INSERT INTO id_key_couplets (key_id, number) VALUES (?, 2)', [keyId]);
    const rows = await queryAll(
      'SELECT severity, issue FROM v_id_key_integrity WHERE key_id = ? ORDER BY issue',
      [keyId],
    );
    const issues = rows.map((r) => `${r.severity} : ${r.issue}`);
    assert.ok(issues.includes('erreur : Pas de couplet n°1 (point de départ)'), issues.join(' | '));
    assert.ok(issues.includes('erreur : Couplet avec moins de 2 propositions'), issues.join(' | '));
    assert.ok(issues.includes('avertissement : Couplet jamais atteint'), issues.join(' | '));
  } finally {
    await execute('DELETE FROM id_key_couplets WHERE key_id = ?', [keyId]);
    await execute('DELETE FROM id_keys WHERE id = ?', [keyId]);
  }
});
