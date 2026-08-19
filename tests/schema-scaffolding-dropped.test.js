'use strict';

// L'échafaudage de schéma doit avoir disparu à la fin d'initSchema(), et le rester après
// un second passage — c'est exactement le scénario qui échouait auparavant : le fichier de
// schéma recréait role_pin_secrets / elevation_audit au démarrage suivant, et la migration
// 164, déjà passée d'après schema_version, ne les supprimait plus jamais
// (audit docs/AUDIT_BDD_2026-08.md §3.3).
// Tests BDD partagée = exécution séquentielle.

// La mémoïsation d'initSchema (sentinelle partagée entre fichiers de test) court-circuiterait
// le second passage — or c'est précisément lui qu'on veut observer ici. On la désactive AVANT
// de charger le harnais, qui lit ce drapeau à son chargement.
process.env.FORETMAP_TESTS_SCHEMA_MEMO = '0';

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert');
const { initSchema, queryOne } = require('../database');
const {
  LEGACY_SCAFFOLDING_TABLES,
  LEGACY_SCAFFOLDING_COLUMNS,
} = require('../lib/legacySchemaCleanup');

async function tableExists(table) {
  const row = await queryOne(
    'SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?',
    [table],
  );
  return Number(row?.n) > 0;
}

async function columnExists(table, column) {
  const row = await queryOne(
    `SELECT COUNT(*) AS n FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
    [table, column],
  );
  return Number(row?.n) > 0;
}

before(async () => {
  await initSchema();
});

test("l'échafaudage a disparu après initSchema()", async () => {
  for (const table of LEGACY_SCAFFOLDING_TABLES) {
    assert.strictEqual(await tableExists(table), false, `${table} doit avoir été supprimée`);
  }
  for (const { table, column } of LEGACY_SCAFFOLDING_COLUMNS) {
    assert.strictEqual(
      await columnExists(table, column),
      false,
      `${table}.${column} doit avoir été supprimée`,
    );
  }
});

test('un second initSchema() ne le fait pas ressusciter', async () => {
  // C'est ici que le bug se manifestait : le 2e passage recréait les tables via
  // schema_foretmap.sql, sans que plus aucune migration ne les supprime.
  await initSchema();
  for (const table of LEGACY_SCAFFOLDING_TABLES) {
    assert.strictEqual(
      await tableExists(table),
      false,
      `${table} est réapparue après un second initSchema()`,
    );
  }
  for (const { table, column } of LEGACY_SCAFFOLDING_COLUMNS) {
    assert.strictEqual(
      await columnExists(table, column),
      false,
      `${table}.${column} est réapparue après un second initSchema()`,
    );
  }
});

test('les tables RBAC vivantes sont intactes', async () => {
  // Le nettoyage ne doit toucher QUE l'échafaudage.
  for (const table of ['roles', 'permissions', 'role_permissions', 'user_roles']) {
    assert.strictEqual(await tableExists(table), true, `${table} doit rester`);
  }
});
