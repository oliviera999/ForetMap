'use strict';

// Graine de contenu biodiversité (`sql/biodiv_pedago_seed.sql`) : extraction depuis un export
// récent et relecture par les scripts d'import. Voir scripts/lib/sqlDumpInserts.js.

require('./helpers/setup');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const {
  findInsertStatements,
  parseCreateTableColumns,
  splitValueTuples,
  buildInsert,
} = require('../scripts/lib/sqlDumpInserts');
const { extractTable, TABLES } = require('../scripts/extract-biodiv-pedago-seed');
const { insertStatementsFor } = require('../scripts/import-biodiv-pedago');
const {
  ENRICH_IDX,
  parseInsertRows,
  resolveEnrichIndex,
} = require('../scripts/import-plants-enriched');

const SEED = path.join(__dirname, '..', 'sql', 'biodiv_pedago_seed.sql');
const REVIEWER = '7f3c2a10-5b6d-4e8f-9a01-23456789abcd';

/** Export factice au format `mariadb-dump` : structure + deux INSERT pour `plants`. */
const DUMP = [
  'DROP TABLE IF EXISTS `plants`;',
  'CREATE TABLE `plants` (',
  '  `id` int(11) NOT NULL AUTO_INCREMENT,',
  '  `name` varchar(255) NOT NULL,',
  '  `description` text DEFAULT NULL,',
  '  `hazard_reviewed_by` varchar(64) DEFAULT NULL,',
  '  PRIMARY KEY (`id`),',
  '  CONSTRAINT `fk_plants_hazard_reviewed_by` FOREIGN KEY (`hazard_reviewed_by`) REFERENCES `users` (`id`)',
  ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;',
  `INSERT INTO \`plants\` VALUES (1,'Ortie','Piquante ; (attention), l\\'été','${REVIEWER}'),(2,'Sureau','Baies d''automne',NULL);`,
  "INSERT INTO `plants` VALUES (3,'Lierre',NULL,NULL);",
  'CREATE TABLE `glossary_terms` (',
  '  `id` int(11) NOT NULL,',
  '  `term` varchar(120) NOT NULL',
  ');',
  "INSERT INTO `glossary_terms` VALUES (1,'Humus');",
  '-- Dump completed on 2026-09-26 10:00:00',
].join('\n');

test('findInsertStatements : plusieurs INSERT par table, chaînes piégées respectées', () => {
  const stmts = findInsertStatements(DUMP, 'plants');
  assert.equal(stmts.length, 2);
  assert.equal(stmts[0].columns, null);
  const rows = splitValueTuples(stmts[0].valuesText);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], ['1', "'Ortie'", "'Piquante ; (attention), l\\'été'", `'${REVIEWER}'`]);
  assert.deepEqual(rows[1], ['2', "'Sureau'", "'Baies d''automne'", 'NULL']);
  assert.deepEqual(parseCreateTableColumns(DUMP, 'plants'), [
    'id',
    'name',
    'description',
    'hazard_reviewed_by',
  ]);
});

test('extractTable : INSERT fusionnés, colonnes nommées, relecteur vidé', () => {
  const { statement, rows } = extractTable(DUMP, 'plants');
  assert.equal(rows, 3);
  assert.ok(
    statement.startsWith(
      'INSERT INTO `plants` (`id`,`name`,`description`,`hazard_reviewed_by`) VALUES',
    ),
  );
  assert.ok(!statement.includes(REVIEWER), "l'identifiant du relecteur ne doit pas sortir");
  // Relu comme par l'import : 3 lignes, 4 colonnes, relecteur à NULL.
  const [reparsed] = findInsertStatements(statement, 'plants');
  const parsedRows = splitValueTuples(reparsed.valuesText);
  assert.equal(parsedRows.length, 3);
  assert.ok(parsedRows.every((r) => r.length === 4 && r[3] === 'NULL'));
  assert.equal(parsedRows[0][2], "'Piquante ; (attention), l\\'été'");
});

test('extractTable : sans structure, une table à colonne sensible est refusée', () => {
  const noCreate = DUMP.split('\n')
    .filter((line) => !/^(CREATE TABLE|  `|  PRIMARY|  CONSTRAINT|\) ENGINE|\);)/.test(line))
    .join('\n');
  assert.throws(() => extractTable(noCreate, 'plants'), /structure absente/);
  // Une table sans colonne sensible passe, sans liste de colonnes.
  assert.ok(extractTable(noCreate, 'glossary_terms').statement.includes('VALUES'));
});

test('extract-biodiv-pedago-seed : écrit une graine sans identifiant de compte', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fm-seed-'));
  const dump = path.join(dir, 'export.sql');
  const out = path.join(dir, 'graine.sql');
  fs.writeFileSync(dump, DUMP);
  const res = spawnSync(
    process.execPath,
    [path.join(__dirname, '..', 'scripts', 'extract-biodiv-pedago-seed.js'), dump, `--out=${out}`],
    { encoding: 'utf8' },
  );
  assert.equal(res.status, 0, res.stderr);
  const content = fs.readFileSync(out, 'utf8');
  assert.ok(!content.includes(REVIEWER));
  assert.match(content, /-- plants\nINSERT INTO `plants` \(`id`/);
  assert.match(res.stdout, /plants 3/);
});

test('graine actuelle : les imports relisent le même nombre de lignes qu’avant', () => {
  const sql = fs.readFileSync(SEED, 'utf8');
  for (const table of TABLES.filter((t) => t !== 'plants')) {
    const statements = insertStatementsFor(sql, table);
    assert.ok(statements.length <= 1, `${table} : une seule instruction dans la graine actuelle`);
    for (const stmt of statements) assert.match(stmt, /^INSERT IGNORE INTO `/);
  }
  const interactions = insertStatementsFor(sql, 'species_interactions')[0];
  if (interactions) {
    assert.match(interactions, /`species_interactions` \(id, from_plant_id/);
  }
  const [plants] = findInsertStatements(sql, 'plants');
  const legacyRows = parseInsertRows(plants.text);
  assert.equal(splitValueTuples(plants.valuesText).length, legacyRows.length);
  // Graine ancienne sans liste de colonnes : positions historiques.
  assert.deepEqual(resolveEnrichIndex(null), ENRICH_IDX);
});

test('import des fiches : positions lues dans la liste de colonnes quand elle existe', () => {
  const columns = ['id', ...Object.keys(ENRICH_IDX).reverse(), 'name'];
  const index = resolveEnrichIndex(columns);
  for (const name of Object.keys(ENRICH_IDX)) assert.equal(columns[index[name]], name);
  assert.throws(() => resolveEnrichIndex(['id', 'name']), /absente/);
  // buildInsert → parseInsertRows : aller-retour.
  const stmt = buildInsert('plants', ['id', 'name'], [['1', "'Ortie, l''été'"]]);
  assert.deepEqual(parseInsertRows(stmt), [[1, "Ortie, l'été"]]);
});
