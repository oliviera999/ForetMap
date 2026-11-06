'use strict';

/**
 * Routes `/api/rewards` (lot F) : rétrocompatibilité de `GET /me` (champs ajoutés :
 * progression, catalogue à paliers), annonces vues, vitrine élève et groupe (périmètre,
 * 403 hors périmètre, tri alphabétique sans classement), badge manuel (permission
 * `rewards.award`, mot obligatoire et limité, journal `reward_award`, numérotation).
 */

require('./helpers/setup');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, queryOne, queryAll, execute } = require('../database');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');
const { setStudentPrimaryRole, ensureN3beurTestGroup } = require('./helpers/studentRoles');
const { snapshotSetting, restoreSetting } = require('./helpers/settingsSnapshot');
const { setSetting } = require('../lib/settings');
const { signAuthToken } = require('../middleware/requireTeacher');

const MODULE_KEY = 'ui.modules.rewards_enabled';
const stamp = Date.now();
let snapshot;
let admin;
let student;
let classTeacher;
const bearer = (t) => ({ Authorization: `Bearer ${t}` });

async function registerStudent(lastName) {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ firstName: 'Badge', lastName, password: 'pwd1pwd1' })
    .expect(201);
  await setStudentPrimaryRole(res.body.id, 'eleve_novice');
  return { id: res.body.id, token: res.body.authToken };
}

before(async () => {
  await initSchema();
  snapshot = await snapshotSetting(MODULE_KEY);
  await setSetting(MODULE_KEY, true);
  admin = bearer(await ensureAdminTeacherAuthToken());
  student = await registerStudent(`Api${stamp}`);
  const role = await queryOne("SELECT id FROM roles WHERE slug = 'prof_classe' LIMIT 1");
  const id = `t-rewards-${stamp}`;
  await execute(
    `INSERT INTO users (id, user_type, email, pseudo, display_name, password_hash, auth_provider, is_active, created_at, updated_at)
     VALUES (?, 'teacher', ?, ?, 'Prof classe badges', 'x', 'local', 1, NOW(), NOW())`,
    [id, `${id}@foretmap.local`, id],
  );
  await execute('UPDATE users SET assigned_role_id = ? WHERE id = ?', [role.id, id]);
  classTeacher = bearer(
    await signAuthToken({
      userType: 'teacher',
      userId: id,
      canonicalUserId: id,
      roleId: role.id,
      roleSlug: 'prof_classe',
      roleDisplayName: 'Prof de classe',
    }),
  );
});

after(async () => {
  await restoreSetting(snapshot);
});

test('GET /me : rétrocompatible, progression et catalogue à paliers ajoutés', async () => {
  const res = await request(app).get('/api/rewards/me').set(bearer(student.token)).expect(200);
  assert.ok(Array.isArray(res.body.rewards));
  assert.ok(res.body.catalogue.every((r) => r.key && r.title && r.emoji && r.description));
  const jardinage = res.body.catalogue.find((r) => r.key === 'metier.jardinage');
  assert.deepEqual(
    jardinage.tiers.map((t) => [t.label, t.threshold]),
    [
      ['Bourgeon', 2],
      ['Fleur', 6],
      ['Fruit', 15],
    ],
  );
  assert.equal(jardinage.metric, undefined, 'pas de détail interne');
  const p = res.body.progress.find((x) => x.key === 'metier.jardinage');
  assert.deepEqual(
    { value: p.value, tier: p.tier, nextThreshold: p.nextThreshold, remaining: p.remaining },
    { value: 0, tier: 0, nextThreshold: 2, remaining: 2 },
  );
  assert.ok(res.body.families.length >= 8);
  assert.equal(res.body.tiers.length, 3);
});

test('badge manuel : permission, périmètre, mot obligatoire et limité, journal, numérotation', async () => {
  await request(app)
    .post('/api/rewards/award')
    .set(bearer(student.token))
    .send({ studentId: student.id, type: 'guide', note: 'Bravo' })
    .expect(403);
  await request(app)
    .post('/api/rewards/award')
    .set(classTeacher)
    .send({ studentId: student.id, type: 'guide', note: 'Bravo' })
    .expect(403);
  const empty = await request(app)
    .post('/api/rewards/award')
    .set(admin)
    .send({ studentId: student.id, type: 'guide', note: '   ' })
    .expect(400);
  assert.match(empty.body.error, /mot/);
  await request(app)
    .post('/api/rewards/award')
    .set(admin)
    .send({ studentId: student.id, type: 'guide', note: 'x'.repeat(281) })
    .expect(400);
  await request(app)
    .post('/api/rewards/award')
    .set(admin)
    .send({ studentId: student.id, type: 'pompier', note: 'Bravo' })
    .expect(400);
  const first = await request(app)
    .post('/api/rewards/award')
    .set(admin)
    .send({ studentId: student.id, type: 'guide', note: 'Tu as guidé les parents' })
    .expect(201);
  assert.equal(first.body.reward.key, 'manuel.guide.1');
  const second = await request(app)
    .post('/api/rewards/award')
    .set(admin)
    .send({ studentId: student.id, type: 'guide', note: 'Encore bravo' })
    .expect(201);
  assert.equal(second.body.reward.key, 'manuel.guide.2');
  const row = await queryOne(
    "SELECT note, awarded_by_user_id, source_type FROM user_rewards WHERE user_id = ? AND reward_key = 'manuel.guide.1'",
    [student.id],
  );
  assert.equal(row.note, 'Tu as guidé les parents');
  assert.ok(row.awarded_by_user_id);
  assert.equal(row.source_type, 'manual');
  const audit = await queryAll(
    "SELECT id FROM audit_log WHERE action = 'reward_award' AND target_id = ?",
    [student.id],
  );
  assert.equal(audit.length, 2);
  const me = await request(app).get('/api/rewards/me').set(bearer(student.token)).expect(200);
  const guide = me.body.rewards.find((r) => r.key === 'manuel.guide.1');
  assert.equal(guide.note, 'Tu as guidé les parents');
  assert.equal(guide.seen, false);
});

test('POST /me/seen : annonces marquées vues', async () => {
  const res = await request(app)
    .post('/api/rewards/me/seen')
    .set(bearer(student.token))
    .expect(200);
  assert.ok(res.body.seen >= 1);
  const me = await request(app).get('/api/rewards/me').set(bearer(student.token)).expect(200);
  assert.ok(me.body.rewards.every((r) => r.seen === true));
  await request(app).post('/api/rewards/me/seen').expect(401);
});

test('vitrine élève : personnel du périmètre seulement', async () => {
  const ok = await request(app).get(`/api/rewards/students/${student.id}`).set(admin).expect(200);
  assert.equal(ok.body.studentId, student.id);
  assert.ok(ok.body.rewards.some((r) => r.key === 'manuel.guide.1'));
  await request(app).get(`/api/rewards/students/${student.id}`).set(classTeacher).expect(403);
  const other = await registerStudent(`Autre${stamp}`);
  await request(app)
    .get(`/api/rewards/students/${student.id}`)
    .set(bearer(other.token))
    .expect(403);
});

test('vitrine de groupe : périmètre, tri alphabétique, aucun classement', async () => {
  const groupId = await ensureN3beurTestGroup('eleve_novice');
  const res = await request(app).get(`/api/rewards/groups/${groupId}`).set(admin).expect(200);
  const names = res.body.students.map((s) => s.name);
  assert.deepEqual(
    names,
    [...names].sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' })),
  );
  const mine = res.body.students.find((s) => s.id === student.id);
  assert.equal(mine.families.manuel, 2);
  assert.ok(!('rank' in mine) && !('position' in mine));
  assert.ok(Array.isArray(res.body.near));
  await request(app).get(`/api/rewards/groups/${groupId}`).set(classTeacher).expect(403);
  await request(app).get(`/api/rewards/groups/${groupId}`).set(bearer(student.token)).expect(403);
  await request(app).get('/api/rewards/groups/inconnu').set(admin).expect(404);
});

test('module éteint : 503 sur toutes les routes, badge manuel compris', async () => {
  await setSetting(MODULE_KEY, false);
  try {
    await request(app).get('/api/rewards/me').set(bearer(student.token)).expect(503);
    await request(app)
      .post('/api/rewards/award')
      .set(admin)
      .send({ studentId: student.id, type: 'guide', note: 'x' })
      .expect(503);
  } finally {
    await setSetting(MODULE_KEY, true);
  }
});
