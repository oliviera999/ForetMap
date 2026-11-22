'use strict';

// Mécanique de rejeu de la migration `college_etiquettes_simples` (chantier collège, flux D5) :
// idempotence, garde par clé naturelle (nom + nom scientifique), aucune étiquette posée dans
// l'application écrasée, aucune ressource étiquetée. Fichier retrouvé par son suffixe (numéro
// posé par SI). BDD partagée : séquentiel.

require('./helpers/setup');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { initSchema, execute, queryOne, splitSqlStatements } = require('../database');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');
const FILE = fs
  .readdirSync(MIGRATIONS_DIR)
  .find((f) => /_college_etiquettes_simples\.sql$/.test(f));
const created = [];

async function runMigration() {
  const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, FILE), 'utf8');
  for (const stmt of splitSqlStatements(sql)) await execute(stmt);
}

async function insertPlant(name, scientificName, { entityKind = 'taxon', label = null } = {}) {
  const r = await execute(
    `INSERT INTO plants (name, emoji, description, scientific_name, entity_kind, usage_label)
     VALUES (?, '🦋', 'rejeu D5', ?, ?, ?)`,
    [name, scientificName, entityKind, label],
  );
  created.push(r.insertId);
  return r.insertId;
}

async function labelOf(id) {
  return (await queryOne('SELECT usage_label FROM plants WHERE id = ?', [id])).usage_label;
}

before(async () => {
  await initSchema();
  assert.ok(FILE, 'migration college_etiquettes_simples introuvable');
  for (const name of ['Souci', 'Gamma', 'Tircis', 'Mégère']) {
    const hit = await queryOne('SELECT id FROM plants WHERE name = ?', [name]);
    assert.ok(!hit, `fiche de démonstration inattendue : ${name}`);
  }
});

after(async () => {
  for (const id of created) await execute('DELETE FROM plants WHERE id = ?', [id]);
});

test('rejeu : pose les étiquettes attendues, respecte les gardes, idempotent', async () => {
  const souci = await insertPlant('Souci', 'Colias croceus');
  const gamma = await insertPlant('Gamma', 'Autographa gamma', { label: 'posée dans l’app' });
  const tircis = await insertPlant('Tircis', 'Pararge aegeria', { entityKind: 'ressource' });
  const megere = await insertPlant('Mégère', 'Autre espèce');

  await runMigration();
  assert.equal(await labelOf(souci), 'un papillon jaune orangé');
  assert.equal(await labelOf(gamma), 'posée dans l’app', 'étiquette de l’app écrasée');
  assert.equal(await labelOf(tircis), null, 'ressource étiquetée');
  assert.equal(await labelOf(megere), null, 'nom scientifique différent : fiche sautée');

  await runMigration();
  assert.equal(await labelOf(souci), 'un papillon jaune orangé');
  assert.equal(await labelOf(gamma), 'posée dans l’app');
  assert.equal(await labelOf(tircis), null);
  assert.equal(await labelOf(megere), null);
});
