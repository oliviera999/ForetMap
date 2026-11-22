'use strict';

// Mécanique de rejeu de la migration `college_groupes_usage` (chantier collège, flux D2) :
// idempotence, garde sur l'ancien `clade_id`, aucune valeur posée dans l'application écrasée.
// Le fichier est retrouvé par son suffixe (numéro posé par SI). BDD partagée : séquentiel.

require('./helpers/setup');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { initSchema, execute, queryOne, queryAll, splitSqlStatements } = require('../database');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');
const FILE = fs.readdirSync(MIGRATIONS_DIR).find((f) => /_college_groupes_usage\.sql$/.test(f));
const stamp = Date.now().toString(36);
const created = [];
let savedInsectes = null;

async function runMigration() {
  const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, FILE), 'utf8');
  for (const stmt of splitSqlStatements(sql)) await execute(stmt);
}

async function insertPlant(scientificName, cladeId) {
  const r = await execute(
    `INSERT INTO plants (name, emoji, description, scientific_name, clade_id)
     VALUES (?, '🦗', 'rejeu D2', ?, ?)`,
    [`Rejeu D2 ${stamp} ${scientificName}`, scientificName, cladeId],
  );
  created.push(r.insertId);
  return r.insertId;
}

async function snapshotCounts() {
  const clades = await queryOne(
    `SELECT COUNT(*) AS n, SUM(visible_college) AS vis,
            SUM(label_simple IS NOT NULL) AS lab, SUM(attribute_simple IS NOT NULL) AS att
       FROM clades`,
  );
  const plants = await queryAll('SELECT id, clade_id FROM plants ORDER BY id');
  return { clades: { ...clades }, plants: JSON.stringify(plants) };
}

before(async () => {
  await initSchema();
  assert.ok(FILE, 'migration college_groupes_usage introuvable');
  // Fixtures de base : chaîne minimale jusqu'à `insectes` si la base de démonstration ne l'a pas.
  for (const [id, parent] of [
    ['vivant', null],
    ['arthropodes', 'vivant'],
    ['insectes', 'arthropodes'],
  ]) {
    await execute(
      `INSERT IGNORE INTO clades (id, parent_id, name, shared_attribute) VALUES (?, ?, ?, 'test')`,
      [id, parent, id],
    );
  }
  savedInsectes = await queryOne(
    'SELECT label_simple, attribute_simple, visible_college FROM clades WHERE id = ?',
    ['insectes'],
  );
});

after(async () => {
  for (const id of created) await execute('DELETE FROM plants WHERE id = ?', [id]);
  if (savedInsectes) {
    await execute(
      'UPDATE clades SET label_simple = ?, attribute_simple = ?, visible_college = ? WHERE id = ?',
      [
        savedInsectes.label_simple,
        savedInsectes.attribute_simple,
        savedInsectes.visible_college,
        'insectes',
      ],
    );
  }
});

test('rejeu : crée les ordres d’insectes, déplace les fiches, idempotent', async () => {
  const grillon = await insertPlant('Gryllus bimaculatus', 'insectes');
  const mante = await insertPlant('Sphodromantis viridis', 'insectes');
  await runMigration();
  const orders = await queryAll(
    `SELECT id, parent_id, visible_college FROM clades
      WHERE id IN ('orthopteres', 'dermapteres', 'mantes', 'nevropteres') ORDER BY id`,
  );
  assert.equal(orders.length, 4);
  for (const o of orders) {
    assert.equal(o.parent_id, 'insectes');
    assert.equal(Number(o.visible_college), 0, `${o.id} ne doit pas être visible au collège`);
  }
  assert.equal(
    (await queryOne('SELECT clade_id FROM plants WHERE id = ?', [grillon])).clade_id,
    'orthopteres',
  );
  assert.equal(
    (await queryOne('SELECT clade_id FROM plants WHERE id = ?', [mante])).clade_id,
    'mantes',
  );
  const first = await snapshotCounts();
  await runMigration();
  assert.deepEqual(await snapshotCounts(), first, 'second passage : aucun changement');
});

test('garde : une fiche déjà rattachée ailleurs dans l’application n’est pas déplacée', async () => {
  const perce = await insertPlant('Forficula auricularia', 'arthropodes');
  await runMigration();
  assert.equal(
    (await queryOne('SELECT clade_id FROM plants WHERE id = ?', [perce])).clade_id,
    'arthropodes',
  );
});

test('garde : un libellé ou une marque posés dans l’application ne sont pas écrasés', async () => {
  await execute(
    `UPDATE clades SET label_simple = 'Libellé maison', attribute_simple = 'Attribut maison'
      WHERE id = 'insectes'`,
  );
  await runMigration();
  const row = await queryOne(
    'SELECT label_simple, attribute_simple, visible_college FROM clades WHERE id = ?',
    ['insectes'],
  );
  assert.equal(row.label_simple, 'Libellé maison');
  assert.equal(row.attribute_simple, 'Attribut maison');
  assert.equal(Number(row.visible_college), 1);
});

test('les boîtes de l’arbre collège présentes en base sont marquées et libellées', async () => {
  await runMigration();
  const row = await queryOne(
    'SELECT label_simple, attribute_simple, visible_college FROM clades WHERE id = ?',
    ['vivant'],
  );
  assert.equal(Number(row.visible_college), 1);
  assert.ok(row.label_simple);
  assert.ok(row.attribute_simple);
});
