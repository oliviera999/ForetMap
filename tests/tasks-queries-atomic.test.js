'use strict';

// Tests du module mutualisé lib/tasks/taskQueries.js : atomicité de
// replaceTaskJoinRows (DELETE + INSERT dans une transaction quand appelé seul,
// exécution directe quand un `tx` est fourni).
require('./helpers/setup');
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { initSchema, queryAll, execute, withTransaction } = require('../database');
const { setTaskZones, syncLegacyLocationColumns } = require('../lib/tasks/taskQueries');

const MAP_ID = 'tq-atomic';
const ZONE_ID = `tq-zone-${Date.now()}`;
const TASK_ID = `tq-task-${Date.now()}`;

async function taskZoneIds(taskId) {
  const rows = await queryAll('SELECT zone_id FROM task_zones WHERE task_id = ? ORDER BY zone_id', [
    taskId,
  ]);
  return rows.map((r) => r.zone_id);
}

before(async () => {
  await initSchema();
  await execute("INSERT IGNORE INTO maps (id, label) VALUES (?, 'Carte test taskQueries')", [
    MAP_ID,
  ]);
  await execute('INSERT INTO zones (id, map_id, name) VALUES (?, ?, ?)', [
    ZONE_ID,
    MAP_ID,
    'Zone taskQueries',
  ]);
  await execute(
    `INSERT INTO tasks (id, title, description, required_students, completion_mode, status, created_at)
     VALUES (?, 'Tâche taskQueries', '', 1, 'single_done', 'available', ?)`,
    [TASK_ID, new Date()],
  );
});

// Nettoyage : sans lui, la carte `tq-atomic` (sort_order 0, sans fond publié) restait en
// base et devenait la première carte active servie par `/api/plan/content` — le plan
// affichait « Aucun fond de plan » et les e2e `plan-mobile` échouaient après `npm test`.
after(async () => {
  await execute('DELETE FROM task_zones WHERE task_id = ?', [TASK_ID]).catch(() => {});
  await execute('DELETE FROM tasks WHERE id = ?', [TASK_ID]).catch(() => {});
  await execute('DELETE FROM zones WHERE id = ?', [ZONE_ID]).catch(() => {});
  await execute('DELETE FROM maps WHERE id = ?', [MAP_ID]).catch(() => {});
});

describe('lib/tasks/taskQueries — atomicité des jointures', () => {
  it('setTaskZones appelé seul : remplace les lignes de jointure', async () => {
    await setTaskZones(TASK_ID, [ZONE_ID]);
    assert.deepStrictEqual(await taskZoneIds(TASK_ID), [ZONE_ID]);
  });

  it('setTaskZones appelé seul : un INSERT en échec (FK) annule aussi le DELETE', async () => {
    await assert.rejects(() => setTaskZones(TASK_ID, ['zone-inexistante-taskqueries']));
    // Atomicité : les anciennes lignes de jointure survivent au rollback.
    assert.deepStrictEqual(await taskZoneIds(TASK_ID), [ZONE_ID]);
  });

  it('setTaskZones avec un tx fourni : participe à la transaction englobante', async () => {
    await assert.rejects(() =>
      withTransaction(async (tx) => {
        await setTaskZones(TASK_ID, [], tx);
        await syncLegacyLocationColumns(TASK_ID, [], [], tx);
        throw new Error('rollback volontaire');
      }),
    );
    // Le rollback englobant restaure la jointure vidée dans la transaction.
    assert.deepStrictEqual(await taskZoneIds(TASK_ID), [ZONE_ID]);

    await withTransaction(async (tx) => {
      await setTaskZones(TASK_ID, [], tx);
      await syncLegacyLocationColumns(TASK_ID, [], [], tx);
    });
    assert.deepStrictEqual(await taskZoneIds(TASK_ID), []);
  });
});
