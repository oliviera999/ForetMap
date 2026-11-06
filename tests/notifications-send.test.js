'use strict';

/**
 * `POST /api/notifications/send` (lot D4) : notification libre à des comptes, aux membres d'un
 * groupe ou à tous ; permission `notifications.send` (admin et prof) ; bornes ; auteur jamais
 * notifié ; journal d'audit. Et l'extraction des jobs quotidiens (`lib/dailyJobs.js`).
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, queryOne, queryAll, execute } = require('../database');
const { ensureAdminTeacherAuthToken, getAdminTeacherUserId } = require('./helpers/adminAuth');
const { signAuthToken } = require('../middleware/requireTeacher');

const STAMP = `${Date.now().toString(36)}${crypto.randomBytes(2).toString('hex')}`;
const createdUsers = [];
const createdGroups = [];
let adminToken;

async function createUser(userType, label) {
  const id = crypto.randomUUID();
  await execute(
    `INSERT INTO users (id, user_type, email, pseudo, first_name, last_name, display_name,
                        password_hash, auth_provider, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'Notif', ?, ?, 'x', 'local', 1, NOW(), NOW())`,
    [id, userType, `ns_${label}_${STAMP}@example.test`, `ns_${label}_${STAMP}`, label, label],
  );
  createdUsers.push(id);
  return id;
}

async function teacherToken(roleSlug, label) {
  const id = await createUser('teacher', label);
  const role = await queryOne('SELECT id FROM roles WHERE slug = ? LIMIT 1', [roleSlug]);
  await execute(
    `INSERT INTO user_roles (user_type, user_id, role_id, is_primary) VALUES ('teacher', ?, ?, 1)
     ON DUPLICATE KEY UPDATE role_id = VALUES(role_id), is_primary = 1`,
    [id, role.id],
  );
  await execute('UPDATE users SET assigned_role_id = ? WHERE id = ?', [role.id, id]);
  const token = await signAuthToken(
    {
      userType: 'teacher',
      userId: id,
      canonicalUserId: id,
      roleId: role.id,
      roleSlug,
      roleDisplayName: roleSlug,
      elevated: false,
    },
    false,
  );
  return { id, token };
}

function send(token, body) {
  return request(app)
    .post('/api/notifications/send')
    .set('Authorization', `Bearer ${token}`)
    .send(body);
}

async function notificationsOf(userId, title) {
  return queryAll('SELECT * FROM notifications WHERE user_id = ? AND title = ?', [userId, title]);
}

test.before(async () => {
  await initSchema();
  adminToken = await ensureAdminTeacherAuthToken({ extraPermissions: ['notifications.send'] });
});

test.after(async () => {
  if (createdUsers.length) {
    const ph = createdUsers.map(() => '?').join(', ');
    await execute(`DELETE FROM notifications WHERE user_id IN (${ph})`, createdUsers);
    await execute(`DELETE FROM group_members WHERE user_id IN (${ph})`, createdUsers);
    await execute(`DELETE FROM user_roles WHERE user_id IN (${ph})`, createdUsers);
  }
  for (const g of createdGroups) await execute('DELETE FROM `groups` WHERE id = ?', [g]);
  if (createdUsers.length) {
    await execute(
      `DELETE FROM users WHERE id IN (${createdUsers.map(() => '?').join(', ')})`,
      createdUsers,
    );
  }
  await execute("DELETE FROM notifications WHERE kind = 'announcement' AND title LIKE ?", [
    `%${STAMP}%`,
  ]);
});

test('catalogue : notifications.send (admin, prof) et mcp.ops (admin)', () => {
  const { ROLE_PERMISSION_MATRIX, PERMISSIONS } = require('../lib/rbac');
  const keys = new Set(PERMISSIONS.map((p) => p[0]));
  assert.ok(keys.has('notifications.send'));
  assert.ok(keys.has('mcp.ops'));
  assert.ok(ROLE_PERMISSION_MATRIX.admin.includes('notifications.send'));
  assert.ok(ROLE_PERMISSION_MATRIX.prof.includes('notifications.send'));
  assert.ok(ROLE_PERMISSION_MATRIX.admin.includes('mcp.ops'));
  assert.ok(!ROLE_PERMISSION_MATRIX.prof.includes('mcp.ops'));
  assert.ok(!ROLE_PERMISSION_MATRIX.prof_classe.includes('notifications.send'));
});

test('envoi à des comptes : lien, auteur exclu, audit', async () => {
  const a = await createUser('student', 'ElevA');
  const b = await createUser('student', 'ElevB');
  const adminId = await getAdminTeacherUserId();
  const title = `Sortie au jardin ${STAMP}`;
  const res = await send(adminToken, {
    title,
    body: 'Rendez-vous à 14 h devant la serre.',
    link: { type: 'task', id: 'task-xyz', map_id: 'foret' },
    target: { user_ids: [a, b, adminId] },
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(res.body.recipients, 2, 'l’auteur est exclu');
  assert.equal(res.body.inserted, 2);
  const [row] = await notificationsOf(a, title);
  assert.equal(row.kind, 'announcement');
  assert.equal(row.body, 'Rendez-vous à 14 h devant la serre.');
  assert.equal(row.target_type, 'task');
  assert.equal(row.target_id, 'task-xyz');
  assert.equal(row.map_id, 'foret');
  assert.equal((await notificationsOf(adminId, title)).length, 0);
  const audit = await queryOne(
    "SELECT payload_json FROM audit_log WHERE action = 'notification_send' AND details = ? ORDER BY id DESC LIMIT 1",
    [title],
  );
  const payload =
    typeof audit.payload_json === 'string' ? JSON.parse(audit.payload_json) : audit.payload_json;
  assert.equal(payload.recipients, 2);
  assert.equal(payload.target, 'user_ids');
});

test('envoi aux membres d’un groupe (filtre user_type)', async () => {
  const s = await createUser('student', 'GrpEleve');
  const t = await createUser('teacher', 'GrpProf');
  const outsider = await createUser('student', 'Dehors');
  const groupId = `grp-ns-${STAMP}`;
  await execute('INSERT INTO `groups` (id, slug, name) VALUES (?, ?, ?)', [
    groupId,
    groupId,
    `Groupe ${STAMP}`,
  ]);
  createdGroups.push(groupId);
  await execute(
    "INSERT INTO group_members (group_id, user_id, user_type) VALUES (?, ?, 'student'), (?, ?, 'teacher')",
    [groupId, s, groupId, t],
  );
  const title = `Classe dehors ${STAMP}`;
  const res = await send(adminToken, {
    title,
    target: { group_id: groupId, user_type: 'student' },
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(res.body.recipients, 1);
  assert.equal((await notificationsOf(s, title)).length, 1);
  assert.equal((await notificationsOf(t, title)).length, 0);
  assert.equal((await notificationsOf(outsider, title)).length, 0);

  const missing = await send(adminToken, { title, target: { group_id: 'grp-inexistant' } });
  assert.equal(missing.status, 404);
});

test('validation : une seule cible, bornes, lien du catalogue', async () => {
  const two = await send(adminToken, {
    title: 'x',
    target: { all: true, group_id: 'g' },
  });
  assert.equal(two.status, 400);
  const none = await send(adminToken, { title: 'x', target: {} });
  assert.equal(none.status, 400);
  const long = await send(adminToken, { title: 'x'.repeat(201), target: { all: true } });
  assert.equal(long.status, 400);
  const bodyLong = await send(adminToken, {
    title: 'x',
    body: 'y'.repeat(501),
    target: { all: true },
  });
  assert.equal(bodyLong.status, 400);
  const badLink = await send(adminToken, {
    title: 'x',
    link: { type: 'url', id: 'https://exemple.test' },
    target: { all: true },
  });
  assert.equal(badLink.status, 400);
  const tooMany = await send(adminToken, {
    title: 'x',
    target: { user_ids: Array.from({ length: 501 }, (_, i) => `u${i}`) },
  });
  assert.equal(tooMany.status, 400);
  const nobody = await send(adminToken, {
    title: 'x',
    target: { user_ids: ['compte-inexistant'] },
  });
  assert.equal(nobody.status, 400);
});

test('permission : refusée sans notifications.send (prof de classe)', async () => {
  const { token } = await teacherToken('prof_classe', 'ProfClasse');
  const res = await send(token, { title: 'x', target: { all: true } });
  assert.equal(res.status, 403);
});

test('dailyJobs : liste nommée et lancement à la demande tracé', async () => {
  const { DAILY_JOB_NAMES, listDailyJobs, runJobNow } = require('../lib/dailyJobs');
  assert.deepEqual(
    [...DAILY_JOB_NAMES],
    [
      'recurring_tasks',
      'auto_archive',
      'notifications_purge',
      'task_deadline_reminders',
      'rewards_evaluate',
    ],
  );
  assert.equal(listDailyJobs().length, 5);
  const before = await queryOne(
    "SELECT COALESCE(MAX(id), 0) AS id FROM scheduled_job_runs WHERE job = 'notifications_purge'",
  );
  const out = await runJobNow('notifications_purge');
  assert.equal(out.job, 'notifications_purge');
  assert.equal(typeof out.result.purged, 'number');
  const run = await queryOne(
    "SELECT outcome FROM scheduled_job_runs WHERE job = 'notifications_purge' AND id > ? ORDER BY id DESC LIMIT 1",
    [before.id],
  );
  assert.equal(run.outcome, 'success');
  await assert.rejects(() => runJobNow('inconnu'), /inconnue/);
});
