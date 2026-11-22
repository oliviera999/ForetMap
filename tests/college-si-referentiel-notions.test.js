'use strict';

// Chantier collège (novembre 2026), intégration SI — migration `college_referentiel_notions` :
// six notions de programme et quatorze liaisons catégorie → notion qui existaient en
// production sans être semées par les migrations (demandes des flux C6 et D3). Le fichier est
// retrouvé par son suffixe (numéro libre de bouger).

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { initSchema, execute, queryAll, queryOne, splitSqlStatements } = require('../database');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');
const FILE = fs
  .readdirSync(MIGRATIONS_DIR)
  .find((f) => /_college_referentiel_notions\.sql$/.test(f));
const SQL = fs.readFileSync(path.join(MIGRATIONS_DIR, FILE), 'utf8');
const NOTIONS = ['C3-MAT', 'C3-DEV', 'C4-REPRO', 'C4-MICRO', '2-PAYS', 'T-CLIM'];

async function replay() {
  for (const stmt of splitSqlStatements(SQL)) await execute(stmt);
}

async function fingerprint() {
  const n = await queryOne('SELECT COUNT(*) AS c FROM curriculum_notions');
  const l = await queryOne('SELECT COUNT(*) AS c FROM quiz_category_notions');
  return [Number(n.c), Number(l.c)];
}

before(async () => {
  await initSchema();
});

test('placée avant le retri des paliers du quiz', () => {
  const num = (re) =>
    Number(
      fs
        .readdirSync(MIGRATIONS_DIR)
        .find((f) => re.test(f))
        .split('_')[0],
    );
  assert.ok(num(/_college_referentiel_notions\.sql$/) < num(/_college_quiz_paliers\.sql$/));
});

test('les six notions de la production existent après les migrations', async () => {
  const rows = await queryAll(
    `SELECT id, niveau FROM curriculum_notions WHERE id IN (${NOTIONS.map(() => '?').join(', ')})`,
    NOTIONS,
  );
  const byId = new Map(rows.map((r) => [r.id, r.niveau]));
  for (const id of NOTIONS) assert.ok(byId.has(id), `${id} absente`);
  assert.equal(byId.get('C3-DEV'), 'cycle3');
  assert.equal(byId.get('C4-REPRO'), 'cycle4');
});

test('liaisons posées seulement si la catégorie existe', async () => {
  const link = await queryOne(
    "SELECT 1 AS ok FROM quiz_category_notions WHERE categorie_slug = 'semis_recolte' AND notion_id = 'C3-DEV'",
  );
  const cat = await queryOne("SELECT 1 AS ok FROM quiz_categories WHERE slug = 'semis_recolte'");
  assert.equal(!!link, !!cat);
});

test('rejouée deux fois : aucune erreur, aucun doublon', async () => {
  const before = await fingerprint();
  await replay();
  await replay();
  assert.deepEqual(await fingerprint(), before);
});

test('SQL sans DEFINER, trigger, DROP ni UPDATE', () => {
  assert.doesNotMatch(SQL, /\bDEFINER\b|\bTRIGGER\b|\bDROP\b|\bUPDATE\b|\bDELETE\b/i);
  assert.match(SQL, /^SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;/m);
});
