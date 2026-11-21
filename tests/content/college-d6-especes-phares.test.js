'use strict';

// Chantier collège (novembre 2026), flux D6 : espèces phares par carte et descriptions collège.
// Assertions sur les DONNÉES (fichiers `data/college-2026-11/d6/*.json`) et sur la migration
// « college_especes_phares » générée à partir d'eux. La mécanique de rejeu (fiches et présences
// semées, gardes contre l'écrasement) est dans `tests/college-d6-rejeu.test.js`.
// Tests BDD partagée : exécution séquentielle.

require('../helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { initSchema, queryOne, splitSqlStatements } = require('../../database');
const {
  checkD6,
  loadData,
  MIN_PAR_CARTE,
  MAX_PAR_CARTE,
} = require('../../scripts/college-2026-11/check-d6-donnees');
const { buildSql, SUFFIX_RE } = require('../../scripts/college-2026-11/build-d6-migration');

const MIGRATIONS_DIR = path.join(__dirname, '..', '..', 'migrations');
const migrationFile = () => fs.readdirSync(MIGRATIONS_DIR).filter((f) => SUFFIX_RE.test(f));

const data = loadData();

before(async () => {
  await initSchema();
});

test('D6 : fichiers de données conformes (contrôle par script)', () => {
  assert.deepEqual(checkD6(), []);
});

test('D6 : 12 à 20 espèces phares par carte (Beaulieu : celles qui remplissent les critères)', () => {
  const cartes = data.phares.cartes;
  assert.deepEqual(Object.keys(cartes).sort(), [
    'beaulieu',
    'dayat',
    'foret',
    'lyautey',
    'melah',
    'n3',
    'sablettes',
  ]);
  for (const [mapId, liste] of Object.entries(cartes)) {
    assert.ok(liste.length <= MAX_PAR_CARTE, mapId);
    if (mapId !== 'beaulieu') assert.ok(liste.length >= MIN_PAR_CARTE, mapId);
  }
});

test('D6 : une seule description par espèce, même présente sur plusieurs cartes', () => {
  const noms = data.descriptions.especes.map((d) => `${d.name}|${d.scientific_name}`);
  assert.equal(new Set(noms).size, noms.length);
  const phares = new Set(
    Object.values(data.phares.cartes)
      .flat()
      .map((e) => `${e.name}|${e.scientific_name}`),
  );
  assert.equal(phares.size, noms.length);
});

test('D6 : une seule migration college_especes_phares, à jour avec les données', () => {
  const files = migrationFile();
  assert.equal(files.length, 1, files.join(', '));
  const current = fs.readFileSync(path.join(MIGRATIONS_DIR, files[0]), 'utf8');
  assert.equal(current, buildSql(), 'relancer scripts/college-2026-11/build-d6-migration.js');
});

test('D6 : chaque écriture de la migration est gardée contre l’écrasement', () => {
  const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, migrationFile()[0]), 'utf8');
  const statements = splitSqlStatements(sql).filter((s) => /^\s*UPDATE/i.test(s));
  assert.equal(statements.length, 7 + data.descriptions.especes.length);
  for (const s of statements) {
    if (/UPDATE map_species/i.test(s)) assert.match(s, /AND ms\.is_featured = 0/);
    else assert.match(s, /AND description_college IS NULL\s*$/);
    assert.doesNotMatch(s, /\bid\s*=\s*\d/, 'pas d’identifiant auto-incrémenté');
  }
  for (const s of splitSqlStatements(sql)) {
    assert.doesNotMatch(s, /\b(DELETE|DROP|TRIGGER|DEFINER|INSERT)\b/i);
  }
});

test('D6 : sur la base, les fiches présentes portent leur description collège', async () => {
  for (const d of data.descriptions.especes) {
    const row = await queryOne(
      'SELECT description_college FROM plants WHERE name = ? AND scientific_name <=> ?',
      [d.name, d.scientific_name],
    );
    if (!row) continue;
    assert.ok(row.description_college, `${d.name} : description collège absente`);
  }
});
