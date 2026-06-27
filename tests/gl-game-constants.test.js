'use strict';

// Régularisation des tables gl_game_constants / gl_game_constant_refs
// (migration 151) : source documentaire de game design GL, NON câblée au runtime.
// On vérifie que la migration crée les tables, insère les 14 constantes + 13 refs,
// quelques clés/valeurs attendues, et que le rejeu est idempotent (aucun doublon).
// Tests GL = exécution séquentielle (BDD partagée).

require('./helpers/setup');
const fs = require('node:fs');
const path = require('node:path');
const { test, before } = require('node:test');
const assert = require('node:assert');
const { initSchema, execute, queryOne, queryAll } = require('../database');

const MIGRATION_PATH = path.join(__dirname, '..', 'migrations', '151_gl_game_constants.sql');

before(async () => {
  await initSchema();
});

test('les tables gl_game_constants / gl_game_constant_refs existent', async () => {
  const c = await queryOne(
    "SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'gl_game_constants'",
  );
  const r = await queryOne(
    "SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'gl_game_constant_refs'",
  );
  assert.strictEqual(Number(c.n), 1);
  assert.strictEqual(Number(r.n), 1);
});

test('les 14 constantes sont présentes avec quelques valeurs attendues', async () => {
  const total = await queryOne('SELECT COUNT(*) AS n FROM gl_game_constants');
  assert.strictEqual(Number(total.n), 14);

  const cases = await queryOne(
    "SELECT const_value, unit FROM gl_game_constants WHERE const_key = 'nb_cases_plateau'",
  );
  assert.strictEqual(cases.const_value, '42');
  assert.strictEqual(cases.unit, 'cases');

  const arrivee = await queryOne(
    "SELECT const_value FROM gl_game_constants WHERE const_key = 'position_arrivee'",
  );
  assert.strictEqual(arrivee.const_value, '42');

  const depart = await queryOne(
    "SELECT const_value FROM gl_game_constants WHERE const_key = 'position_depart'",
  );
  assert.strictEqual(depart.const_value, '1');

  const frontiere = await queryOne(
    "SELECT const_value FROM gl_game_constants WHERE const_key = 'position_frontiere'",
  );
  assert.strictEqual(frontiere.const_value, '22');

  const gemmes = await queryOne(
    "SELECT const_value, unit FROM gl_game_constants WHERE const_key = 'gemmes_arrivee'",
  );
  assert.strictEqual(gemmes.const_value, '3');
  assert.strictEqual(gemmes.unit, 'gemmes');
});

test('les 13 refs constante -> question lore sont présentes', async () => {
  const total = await queryOne('SELECT COUNT(*) AS n FROM gl_game_constant_refs');
  assert.strictEqual(Number(total.n), 13);

  const ref = await queryOne(
    "SELECT question_dataset, question_code FROM gl_game_constant_refs WHERE const_key = 'nb_plateaux_jouables'",
  );
  assert.strictEqual(ref.question_dataset, 'qcm_lore');
  assert.strictEqual(ref.question_code, 'LQCM0045');

  const rows = await queryAll(
    "SELECT question_code FROM gl_game_constant_refs WHERE const_key = 'gemmes_arrivee'",
  );
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].question_code, 'LQCM0107');
});

test('rejeu de la migration : idempotent (aucun doublon)', async () => {
  const sql = fs.readFileSync(MIGRATION_PATH, 'utf8');
  // Découpage simple sur ';' en fin de statement (le fichier ne contient pas de
  // routine PREPARE/délimiteur particulier).
  const statements = sql
    .split(/;\s*\n/)
    .map((s) => s.replace(/--[^\n]*\n/g, '\n').trim())
    .filter((s) => s.length > 0);
  for (const stmt of statements) {
    await execute(stmt);
  }

  const constCount = await queryOne('SELECT COUNT(*) AS n FROM gl_game_constants');
  const refCount = await queryOne('SELECT COUNT(*) AS n FROM gl_game_constant_refs');
  assert.strictEqual(Number(constCount.n), 14);
  assert.strictEqual(Number(refCount.n), 13);
});
