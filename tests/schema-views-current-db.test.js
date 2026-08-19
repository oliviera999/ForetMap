'use strict';

// Vues de lecture : elles doivent lire la base COURANTE, jamais une base nommée en dur.
//
// MariaDB ne conserve pas la définition d'une vue telle qu'on l'a écrite : il résout les
// noms de table au `CREATE VIEW` et fige le nom de la base active dans VIEW_DEFINITION.
// Le nom voyage donc avec le schéma, et toute copie / restauration sous un autre nom
// hérite de vues qui continuent de lire la base d'origine — pour une copie de la
// production, la production elle-même (audit docs/AUDIT_BDD_2026-08.md §4.1).
//
// Le test existant `gl-dead-views-dropped.test.js` vérifie que les vues EXISTENT ; celui-ci
// vérifie CE QU'ELLES LISENT. La migration 183 est ce qui les remet d'aplomb.
// Tests BDD partagée = exécution séquentielle.

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert');
const { initSchema, queryAll, queryOne } = require('../database');

before(async () => {
  await initSchema();
});

test('aucune vue ne lit un autre schéma que la base courante', async () => {
  const dbRow = await queryOne('SELECT DATABASE() AS db');
  const currentDb = String(dbRow?.db || '');
  assert.ok(currentDb, 'DATABASE() doit être défini');

  const views = await queryAll(
    `SELECT table_name AS name, view_definition AS def
       FROM information_schema.views
      WHERE table_schema = DATABASE()`,
  );
  assert.ok(views.length > 0, 'au moins une vue doit exister (v_food_web, v_zone_inventory)');

  // VIEW_DEFINITION emploie la même notation `x`.`y` pour DEUX choses : une table qualifiée
  // par son schéma (`base`.`table`) et une colonne qualifiée par son alias (`si`.`id`). On
  // ne peut donc pas conclure du seul motif — c'est ce qui faisait échouer ce test sur des
  // vues pourtant saines. On ne retient que les préfixes qui sont de VRAIS noms de schéma,
  // confrontés à information_schema.schemata : un alias de table n'y figure jamais.
  const schemaRows = await queryAll('SELECT schema_name AS name FROM information_schema.schemata');
  const knownSchemas = new Set(schemaRows.map((r) => String(r.name)));

  const foreign = [];
  for (const view of views) {
    const def = String(view.def || '');
    for (const match of def.matchAll(/`([^`]+)`\s*\.\s*`/g)) {
      const prefix = match[1];
      if (prefix === currentDb) continue;
      if (!knownSchemas.has(prefix)) continue; // alias de table, pas un schéma
      foreign.push(`${view.name} → \`${prefix}\``);
    }
  }
  assert.deepStrictEqual(
    [...new Set(foreign)],
    [],
    `vue(s) lisant un autre schéma que ${currentDb} — rejouer migrations/183_views_recreate_in_current_schema.sql`,
  );
});

test('les vues vivantes restent interrogeables et cohérentes avec leurs tables', async () => {
  // Complément indispensable au test précédent, qui ne peut reconnaître qu'un schéma
  // EXISTANT sur le serveur : si la base d'origine a disparu (copie restaurée sur une autre
  // machine), son nom n'est plus dans information_schema.schemata et passe inaperçu. Ici la
  // vue est réellement interrogée — une référence morte lève, une référence vers d'autres
  // données fait diverger le COUNT. Contrôle de bout en bout.
  const viaTable = await queryOne('SELECT COUNT(*) AS n FROM species_interactions');
  const viaView = await queryOne('SELECT COUNT(*) AS n FROM v_food_web');
  assert.strictEqual(
    Number(viaView?.n),
    Number(viaTable?.n),
    'v_food_web doit exposer autant de lignes que species_interactions (jointure sur plants obligatoire)',
  );

  await queryAll('SELECT zone_id, plant_id FROM v_zone_inventory LIMIT 1');
});
