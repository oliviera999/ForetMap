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

test('aucune vue ne qualifie ses tables avec un nom de base', async () => {
  const dbRow = await queryOne('SELECT DATABASE() AS db');
  const currentDb = String(dbRow?.db || '');
  assert.ok(currentDb, 'DATABASE() doit être défini');

  const views = await queryAll(
    `SELECT table_name AS name, view_definition AS def
       FROM information_schema.views
      WHERE table_schema = DATABASE()`,
  );
  assert.ok(views.length > 0, 'au moins une vue doit exister (v_food_web, v_zone_inventory)');

  // Une qualification par la base COURANTE est ce que MariaDB écrit normalement ; toute
  // AUTRE base est le symptôme d'une copie de schéma (ou d'un renommage) non rejouée.
  const foreign = [];
  for (const view of views) {
    const def = String(view.def || '');
    for (const match of def.matchAll(/`([A-Za-z0-9_$]+)`\s*\.\s*`/g)) {
      if (match[1] !== currentDb) foreign.push(`${view.name} → \`${match[1]}\``);
    }
  }
  assert.deepStrictEqual(
    foreign,
    [],
    `vue(s) lisant une autre base que ${currentDb} — rejouer migrations/183_views_recreate_in_current_schema.sql : ${foreign.join(', ')}`,
  );
});

test('les vues vivantes restent interrogeables et cohérentes avec leurs tables', async () => {
  // Si une vue pointait ailleurs, ce COUNT divergerait (ou lèverait) : contrôle de bout en bout.
  const viaTable = await queryOne('SELECT COUNT(*) AS n FROM species_interactions');
  const viaView = await queryOne('SELECT COUNT(*) AS n FROM v_food_web');
  assert.strictEqual(
    Number(viaView?.n),
    Number(viaTable?.n),
    'v_food_web doit exposer autant de lignes que species_interactions (jointure sur plants obligatoire)',
  );

  await queryAll('SELECT zone_id, plant_id FROM v_zone_inventory LIMIT 1');
});
