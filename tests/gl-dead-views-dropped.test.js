'use strict';

// Suppression des vues SQL mortes (migration 152) : `v_species` (mig 124) et
// `v_gl_food_web` (mig 136), jamais consommées par le code. On vérifie qu'après
// migrations elles n'apparaissent plus dans la liste des vues, que les vues
// vivantes `v_food_web` / `v_zone_inventory` (consommées par routes/food-web.js)
// sont toujours présentes, et que le rejeu de la migration reste idempotent.
// Tests GL = exécution séquentielle (BDD partagée).

require('./helpers/setup');
const fs = require('node:fs');
const path = require('node:path');
const { test, before } = require('node:test');
const assert = require('node:assert');
const { initSchema, execute, queryAll } = require('../database');

const MIGRATION_PATH = path.join(__dirname, '..', 'migrations', '152_drop_dead_views.sql');

async function listViews() {
  const rows = await queryAll(
    `SELECT table_name AS name
       FROM information_schema.views
      WHERE table_schema = DATABASE()`,
  );
  return rows.map((r) => r.name);
}

before(async () => {
  await initSchema();
});

test('les vues mortes v_species / v_gl_food_web ne sont plus listées', async () => {
  const views = await listViews();
  assert.ok(!views.includes('v_species'), 'v_species doit avoir été supprimée');
  assert.ok(!views.includes('v_gl_food_web'), 'v_gl_food_web doit avoir été supprimée');
});

test('les vues vivantes v_food_web / v_zone_inventory sont conservées', async () => {
  const views = await listViews();
  assert.ok(views.includes('v_food_web'), 'v_food_web doit rester (routes/food-web.js)');
  assert.ok(
    views.includes('v_zone_inventory'),
    'v_zone_inventory doit rester (routes/food-web.js)',
  );
});

test('rejeu de la migration 152 : idempotent', async () => {
  const sql = fs.readFileSync(MIGRATION_PATH, 'utf8');
  const statements = sql
    .split(/;\s*\n/)
    .map((s) => s.replace(/--[^\n]*\n/g, '\n').trim())
    .filter((s) => s.length > 0);
  for (const stmt of statements) {
    await execute(stmt);
  }

  const views = await listViews();
  assert.ok(!views.includes('v_species'));
  assert.ok(!views.includes('v_gl_food_web'));
  assert.ok(views.includes('v_food_web'));
  assert.ok(views.includes('v_zone_inventory'));
});
