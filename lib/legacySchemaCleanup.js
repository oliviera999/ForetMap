'use strict';

const logger = require('./logger');

/**
 * Échafaudage de schéma : objets que `sql/schema_foretmap.sql` DOIT déclarer pour que
 * les migrations historiques se rejouent sur une base neuve, mais qui ne doivent plus
 * exister une fois la chaîne de migrations terminée.
 *
 * Pourquoi ce module existe (audit docs/AUDIT_BDD_2026-08.md §3.3)
 * ----------------------------------------------------------------
 * `initSchema()` exécute `sql/schema_foretmap.sql` AVANT `runMigrations()`, à chaque
 * démarrage. Un objet supprimé par une migration numérotée mais toujours déclaré dans le
 * fichier de schéma est donc **recréé au démarrage suivant**, et la migration — déjà
 * passée d'après `schema_version` — ne le supprimera plus jamais. C'est ce qui s'est
 * produit avec `role_pin_secrets` et `elevation_audit` : supprimées par la migration 164,
 * présentes dans l'export de production du 18/08/2026.
 *
 * On ne peut pas simplement retirer ces déclarations du fichier de schéma : les migrations
 * 025, 029, 034, 139 et 163 lisent ou écrivent ces objets, et échoueraient sur une base
 * neuve (`ER_BAD_FIELD_ERROR` n'est pas une erreur tolérée par le runner). Le fichier de
 * schéma les déclare donc toujours, et c'est ce nettoyage — exécuté APRÈS les migrations,
 * à chaque démarrage — qui les retire. Idempotent, et immunisé contre la résurrection.
 *
 * Ajouter ici tout objet dans la même situation : le test statique
 * `tests/schema-legacy-scaffolding.test.js` échoue si une migration supprime un objet que
 * `sql/schema_foretmap.sql` déclare encore sans qu'il figure dans ces listes.
 */
const LEGACY_SCAFFOLDING_TABLES = Object.freeze(['role_pin_secrets', 'elevation_audit']);

const LEGACY_SCAFFOLDING_COLUMNS = Object.freeze([
  { table: 'role_permissions', column: 'requires_elevation' },
]);

async function tableExists(conn, table) {
  const [rows] = await conn.query(
    'SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1',
    [table],
  );
  return Array.isArray(rows) && rows.length > 0;
}

async function columnExists(conn, table, column) {
  const [rows] = await conn.query(
    `SELECT 1 FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? LIMIT 1`,
    [table, column],
  );
  return Array.isArray(rows) && rows.length > 0;
}

/**
 * Supprime l'échafaudage de schéma resté en place après les migrations.
 * À appeler une fois `runMigrations()` terminé, sur la même connexion.
 *
 * @param {import('mysql2/promise').Connection} conn
 * @returns {Promise<{ droppedTables: string[], droppedColumns: string[] }>}
 */
async function dropLegacyScaffolding(conn) {
  const droppedTables = [];
  const droppedColumns = [];

  for (const table of LEGACY_SCAFFOLDING_TABLES) {
    if (!(await tableExists(conn, table))) continue;
    await conn.query(`DROP TABLE IF EXISTS \`${table}\``);
    droppedTables.push(table);
  }

  for (const { table, column } of LEGACY_SCAFFOLDING_COLUMNS) {
    if (!(await tableExists(conn, table))) continue;
    if (!(await columnExists(conn, table, column))) continue;
    await conn.query(`ALTER TABLE \`${table}\` DROP COLUMN \`${column}\``);
    droppedColumns.push(`${table}.${column}`);
  }

  if (droppedTables.length > 0 || droppedColumns.length > 0) {
    logger.info(
      { droppedTables, droppedColumns },
      'Échafaudage de schéma supprimé après migrations',
    );
  }
  return { droppedTables, droppedColumns };
}

module.exports = {
  dropLegacyScaffolding,
  LEGACY_SCAFFOLDING_TABLES,
  LEGACY_SCAFFOLDING_COLUMNS,
};
