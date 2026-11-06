'use strict';

/**
 * Rattrapage initial des badges (`scripts/rewards-backfill.js`, `lib/rewards/batch.js`) :
 * le dry-run n'écrit rien et donne la répartition par palier ; l'application envoie une
 * seule notification récapitulative par élève (et pas une seconde au passage suivant).
 */

require('./helpers/setup');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { initSchema, queryAll, queryOne, execute } = require('../database');
const { setStudentPrimaryRole } = require('./helpers/studentRoles');
const { snapshotSetting, restoreSetting } = require('./helpers/settingsSnapshot');
const { setSetting } = require('../lib/settings');
const { evaluateMany } = require('../lib/rewards/batch');
const { formatDistribution } = require('../scripts/rewards-backfill');

const MODULE_KEY = 'ui.modules.rewards_enabled';
let snapshot;
const students = [];

async function studentWithTasks(n, category) {
  const id = `rw-bf-${crypto.randomUUID().slice(0, 8)}`;
  await execute(
    `INSERT INTO users (id, user_type, first_name, last_name, display_name, password_hash,
                        auth_provider, is_active, created_at, updated_at)
     VALUES (?, 'student', 'Rattrapage', ?, 'Rattrapage', 'x', 'local', 1, NOW(), NOW())`,
    [id, id],
  );
  await setStudentPrimaryRole(id, 'eleve_novice');
  for (let i = 0; i < n; i += 1) {
    const taskId = crypto.randomUUID();
    await execute(
      `INSERT INTO tasks (id, title, description, map_id, required_students, status, category,
                          format, validated_at, created_at)
       VALUES (?, ?, '', 'foret', 1, 'validated', ?, 'flash', NOW(), NOW())`,
      [taskId, `Rattrapage ${i}`, category],
    );
    await execute(
      `INSERT INTO task_assignments (task_id, student_id, student_first_name, student_last_name, assigned_at)
       VALUES (?, ?, 'Rattrapage', ?, NOW())`,
      [taskId, id, id],
    );
  }
  return id;
}

before(async () => {
  await initSchema();
  snapshot = await snapshotSetting(MODULE_KEY);
  await setSetting(MODULE_KEY, true);
  students.push(await studentWithTasks(3, 'jardinage'));
  students.push(await studentWithTasks(1, 'bricolage'));
});

after(async () => {
  await restoreSetting(snapshot);
});

test('dry-run : aucune écriture, répartition par badge et palier', async () => {
  const ph = students.map(() => '?').join(',');
  const before = await queryOne(
    `SELECT COUNT(*) AS n FROM user_rewards WHERE user_id IN (${ph})`,
    students,
  );
  const summary = await evaluateMany(students, { dryRun: true, announce: 'recap' });
  const after = await queryOne(
    `SELECT COUNT(*) AS n FROM user_rewards WHERE user_id IN (${ph})`,
    students,
  );
  assert.equal(Number(after.n), Number(before.n), 'rien écrit');
  assert.equal(summary.students, 2);
  assert.equal(summary.rewarded, 2);
  assert.equal(summary.byKey['metier.jardinage.1'], 1);
  assert.equal(summary.byKey['metier.bricolage.1'], 1);
  assert.equal(summary.byKey['format.colibri.1'], 1);
  assert.equal(summary.notified, 0);
  const lines = formatDistribution(summary);
  assert.ok(
    lines.some((l) => l.includes('metier.jardinage.1') && l.includes('Main verte palier 1')),
  );
  const notes = await queryAll(
    `SELECT id FROM notifications WHERE kind = 'reward' AND user_id IN (${ph})`,
    students,
  );
  assert.equal(notes.length, 0);
});

test('application : une seule notification récapitulative par élève', async () => {
  const summary = await evaluateMany(students, { announce: 'recap' });
  assert.equal(summary.notified, 2);
  const ph = students.map(() => '?').join(',');
  const notes = await queryAll(
    `SELECT user_id, title FROM notifications WHERE kind = 'reward' AND user_id IN (${ph})`,
    students,
  );
  assert.equal(notes.length, 2, 'une par élève, quel que soit le nombre de badges');
  assert.ok(notes.every((n) => /Tes badges sont arrivés/.test(n.title)));
  const again = await evaluateMany(students, { announce: 'recap' });
  assert.equal(again.awarded, 0);
  const after = await queryAll(
    `SELECT id FROM notifications WHERE kind = 'reward' AND user_id IN (${ph})`,
    students,
  );
  assert.equal(after.length, 2, 'pas de seconde notification');
  const sources = await queryAll(
    `SELECT DISTINCT source_type FROM user_rewards WHERE user_id IN (${ph})`,
    students,
  );
  assert.deepEqual(
    sources.map((s) => s.source_type),
    ['backfill'],
  );
});
