'use strict';

// Contenu du flux D2 (chantier collège, novembre 2026) : groupes d'usage de l'arbre des clades
// et ordres d'insectes manquants. Données : data/college-2026-11/D2/ ; migration
// `college_groupes_usage` (retrouvée par son suffixe).

require('../helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {
  runChecks,
  snapshotAvailable,
  loadData,
  checkText,
  collegeDepth,
  MAX_DEPTH,
} = require('../../scripts/college-2026-11/check-D2-donnees');
const { buildSql, findMigrationFile } = require('../../scripts/college-2026-11/build-D2-migration');
const { indexClades, usageGroupFor } = require('../../lib/clades');
const { initSchema, queryAll } = require('../../database');

const data = loadData();

before(async () => {
  await initSchema();
});

test(
  'les données D2 passent le contrôle (instantané du 21/11)',
  {
    skip: !snapshotAvailable() && 'instantané du 21/11 absent (non versionné sur main)',
  },
  () => {
    const { errors, stats } = runChecks();
    assert.deepEqual(errors, []);
    assert.equal(stats.profondeur_max <= MAX_DEPTH, true);
    assert.deepEqual(stats.hors_arbre.sort(), ['Biofilm', 'Phytoplancton', 'Zooplancton']);
  },
);

test('la migration versionnée est la sortie du générateur', () => {
  assert.equal(fs.readFileSync(findMigrationFile(), 'utf8'), buildSql(data));
});

test('le contrôle typographique détecte les fautes visées', () => {
  assert.ok(checkText('t', 'Six pattes ; deux antennes', 99).length > 0, 'espace ordinaire');
  assert.ok(checkText('t', 'On peut toucher', 99).length > 0, 'verbe interdit');
  assert.ok(checkText('t', 'Une coquille d’escargot', 99).length > 0, 'apostrophe courbe');
  assert.deepEqual(checkText('t', 'Six pattes ; deux antennes', 99), []);
});

test('base de test : boîtes marquées, ordres d’insectes créés et non visibles', async () => {
  const rows = await queryAll(
    'SELECT id, parent_id, label_simple, attribute_simple, visible_college FROM clades',
  );
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const b of data.arbre) {
    const row = byId.get(b.id);
    if (!row) continue; // boîte absente de la base de démonstration : ligne sautée
    assert.equal(Number(row.visible_college), 1, `${b.id} visible au collège`);
    assert.ok(row.label_simple, `${b.id} : label_simple`);
    assert.ok(row.attribute_simple, `${b.id} : attribute_simple`);
  }
  for (const n of data.insectes) {
    if (!byId.has(n.parent_id)) continue;
    const row = byId.get(n.id);
    assert.ok(row, `clade ${n.id} créé`);
    assert.equal(row.parent_id, n.parent_id);
    assert.equal(Number(row.visible_college), 0);
  }
});

test('base de test : profondeur collège ≤ 4 et aucune fiche d’un ordre déplacé restée sous insectes', async () => {
  const rows = await queryAll('SELECT id, parent_id, visible_college FROM clades');
  const byId = indexClades(rows);
  for (const r of rows) {
    if (Number(r.visible_college) !== 1) continue;
    assert.ok(collegeDepth(byId, r.id) <= MAX_DEPTH, `${r.id} trop profond`);
  }
  const names = data.deplacements.map((d) => d.scientific_name);
  const stuck = await queryAll(
    `SELECT name FROM plants WHERE clade_id = 'insectes' AND scientific_name IN (${names
      .map(() => '?')
      .join(',')})`,
    names,
  );
  assert.deepEqual(stuck, []);
  const plants = await queryAll(
    "SELECT name, clade_id FROM plants WHERE clade_id IS NOT NULL AND entity_kind <> 'ressource'",
  );
  for (const p of plants) {
    const g = usageGroupFor(byId, p.clade_id);
    if (g) assert.ok(collegeDepth(byId, g.id) <= MAX_DEPTH);
  }
});
