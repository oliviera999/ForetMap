'use strict';

// Caractérisation de la recopie des jonctions au clonage d'une occurrence récurrente
// (`spawnSingleRecurringTask`, lib/recurringTasks.js), posée **avant** son remplacement par
// l'utilitaire unique fondé sur `replaceTaskJoinRows` (chantier des élèves référents, lot 9).
//
// Comportement figé : zones, repères, tutoriels **actifs seulement**, référents et espèces sont
// recopiés ; sans lieu propre, les lieux reviennent de l'instantané de récurrence ; la source et
// la date de pose des référents voyagent avec eux (lot 4).

require('./helpers/setup');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { initDatabase, execute, queryAll, queryOne } = require('../database');
const { spawnRecurringTaskNow } = require('../lib/recurringTasks');

const STAMP = crypto.randomUUID().slice(0, 8);
const created = { tasks: [], users: [], tutorials: [], markers: [] };
let fx;

async function addUser(type) {
  const id = `rj-${type[0]}-${STAMP}-${created.users.length}`;
  created.users.push(id);
  await execute(
    'INSERT INTO users (id, user_type, first_name, last_name, is_active) VALUES (?, ?, ?, ?, 1)',
    [id, type, 'Joint', `Carac${STAMP}`],
  );
  return id;
}

async function addTutorial(active) {
  const slug = `rj-${STAMP}-${created.tutorials.length}`;
  const res = await execute('INSERT INTO tutorials (title, slug, is_active) VALUES (?, ?, ?)', [
    `Tutoriel ${slug}`,
    slug,
    active ? 1 : 0,
  ]);
  created.tutorials.push(res.insertId);
  return Number(res.insertId);
}

async function addValidatedRecurringTask(extra = {}) {
  const id = `rj-task-${STAMP}-${created.tasks.length}`;
  created.tasks.push(id);
  await execute(
    `INSERT INTO tasks (id, title, status, recurrence, start_date, due_date, validated_at,
                        recurrence_template_zone_ids, recurrence_template_marker_ids)
     VALUES (?, ?, 'validated', 'weekly', '2020-01-01', '2020-01-08', '2020-01-08 10:00:00', ?, ?)`,
    [id, `Jonctions ${id}`, extra.snapZones || null, extra.snapMarkers || null],
  );
  return id;
}

async function idsOf(table, column, taskId) {
  const rows = await queryAll(
    `SELECT ${column} AS v FROM ${table} WHERE task_id = ? ORDER BY ${column}`,
    [taskId],
  );
  return rows.map((r) => String(r.v));
}

before(async () => {
  await initDatabase();
  const zones = await queryAll('SELECT id FROM zones ORDER BY id LIMIT 2');
  const markerId = `rj-m-${STAMP}`;
  await execute(
    "INSERT INTO map_markers (id, map_id, x_pct, y_pct, label) VALUES (?, 'foret', 10, 10, ?)",
    [markerId, `Repère ${STAMP}`],
  );
  created.markers.push(markerId);
  const markers = [{ id: markerId }];
  const plants = await queryAll('SELECT id FROM plants ORDER BY id LIMIT 2');
  assert.ok(zones.length === 2 && markers.length === 1 && plants.length === 2, 'jeu de démo');
  fx = {
    zoneIds: zones.map((z) => String(z.id)),
    markerIds: markers.map((m) => String(m.id)),
    plantIds: plants.map((p) => String(p.id)),
    tutorialActive: await addTutorial(true),
    tutorialInactive: await addTutorial(false),
    teacher: await addUser('teacher'),
    student: await addUser('student'),
  };
});

after(async () => {
  for (const id of created.tasks) {
    await execute('DELETE FROM tasks WHERE id = ? OR parent_task_id = ?', [id, id]);
  }
  for (const id of created.tutorials) await execute('DELETE FROM tutorials WHERE id = ?', [id]);
  for (const id of created.users) await execute('DELETE FROM users WHERE id = ?', [id]);
  for (const id of created.markers) await execute('DELETE FROM map_markers WHERE id = ?', [id]);
});

test('clone : zones, repères, tutoriels actifs, référents (avec source) et espèces recopiés', async () => {
  const src = await addValidatedRecurringTask();
  for (const z of fx.zoneIds) {
    await execute('INSERT INTO task_zones (task_id, zone_id) VALUES (?, ?)', [src, z]);
  }
  await execute('INSERT INTO task_markers (task_id, marker_id) VALUES (?, ?)', [
    src,
    fx.markerIds[0],
  ]);
  for (const t of [fx.tutorialActive, fx.tutorialInactive]) {
    await execute('INSERT INTO task_tutorials (task_id, tutorial_id) VALUES (?, ?)', [src, t]);
  }
  await execute('INSERT INTO task_referents (task_id, user_id) VALUES (?, ?)', [src, fx.teacher]);
  await execute(
    "INSERT INTO task_referents (task_id, user_id, source, added_at) VALUES (?, ?, 'auto', '2026-11-02 08:00:00')",
    [src, fx.student],
  );
  for (const p of fx.plantIds) {
    await execute('INSERT INTO task_species (task_id, plant_id) VALUES (?, ?)', [src, p]);
  }

  const { created: cloneId } = await spawnRecurringTaskNow(src);
  assert.ok(cloneId, 'occurrence suivante créée');
  created.tasks.push(cloneId);

  assert.deepEqual(await idsOf('task_zones', 'zone_id', cloneId), [...fx.zoneIds].sort());
  assert.deepEqual(await idsOf('task_markers', 'marker_id', cloneId), fx.markerIds);
  assert.deepEqual(await idsOf('task_tutorials', 'tutorial_id', cloneId), [
    String(fx.tutorialActive),
  ]);
  assert.deepEqual(await idsOf('task_species', 'plant_id', cloneId), [...fx.plantIds].sort());
  const refs = await queryAll(
    `SELECT user_id, source, DATE_FORMAT(added_at, '%Y-%m-%d %H:%i:%s') AS added_at
       FROM task_referents WHERE task_id = ? ORDER BY user_id`,
    [cloneId],
  );
  const byUser = Object.fromEntries(refs.map((r) => [r.user_id, r]));
  assert.equal(refs.length, 2);
  assert.equal(byUser[fx.teacher].source, 'manual');
  assert.equal(byUser[fx.student].source, 'auto');
  assert.equal(byUser[fx.student].added_at, '2026-11-02 08:00:00');
  const clone = await queryOne('SELECT zone_id, marker_id FROM tasks WHERE id = ?', [cloneId]);
  assert.equal(clone.zone_id, [...fx.zoneIds].sort()[0], 'colonne héritée = premier lien');
  assert.equal(clone.marker_id, fx.markerIds[0]);
});

test('clone sans lieu propre : lieux repris de l’instantané de récurrence', async () => {
  const src = await addValidatedRecurringTask({
    snapZones: JSON.stringify([fx.zoneIds[1]]),
    snapMarkers: JSON.stringify(fx.markerIds),
  });
  const { created: cloneId } = await spawnRecurringTaskNow(src);
  assert.ok(cloneId);
  created.tasks.push(cloneId);
  assert.deepEqual(await idsOf('task_zones', 'zone_id', cloneId), [fx.zoneIds[1]]);
  assert.deepEqual(await idsOf('task_markers', 'marker_id', cloneId), fx.markerIds);
  assert.deepEqual(await idsOf('task_referents', 'user_id', cloneId), []);
});
