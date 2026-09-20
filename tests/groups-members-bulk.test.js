require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const crypto = require('node:crypto');
const { app } = require('../server');
const { initSchema, queryAll, queryOne, execute } = require('../database');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');

test.before(async () => {
  await initSchema();
});

async function createStudent(label) {
  const id = crypto.randomUUID();
  const firstName = `Mb${label}`;
  const lastName = `Eleve${Date.now()}`.slice(0, 40);
  await execute(
    `INSERT INTO users
      (id, user_type, first_name, last_name, display_name, auth_provider, is_active, created_at, updated_at)
     VALUES (?, 'student', ?, ?, ?, 'local', 1, NOW(), NOW())`,
    [id, firstName, lastName, `${firstName} ${lastName}`],
  );
  return id;
}

async function memberIds(groupId) {
  const rows = await queryAll('SELECT user_id FROM group_members WHERE group_id = ?', [groupId]);
  return rows.map((r) => String(r.user_id)).sort();
}

test('Groupes : rattachement en lot puis retrait unitaire', async () => {
  const token = await ensureAdminTeacherAuthToken({ elevated: true });
  const stamp = Date.now();
  const created = await request(app)
    .post('/api/groups')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: `Lot ${stamp}`, slug: `lot-${stamp}`, kind: 'class' })
    .expect(201);
  const groupId = created.body.id;
  const a = await createStudent('A');
  const b = await createStudent('B');

  const bulk = await request(app)
    .post(`/api/groups/${groupId}/members/bulk`)
    .set('Authorization', `Bearer ${token}`)
    .send({ user_ids: [a, b, 'inexistant-xyz'] })
    .expect(200);
  assert.strictEqual(bulk.body.added, 2);
  assert.strictEqual(bulk.body.failed, 1);
  assert.deepStrictEqual(await memberIds(groupId), [a, b].sort());

  // Idempotent : rejouer le lot n'ajoute pas de doublon.
  await request(app)
    .post(`/api/groups/${groupId}/members/bulk`)
    .set('Authorization', `Bearer ${token}`)
    .send({ user_ids: [a] })
    .expect(200);
  assert.deepStrictEqual(await memberIds(groupId), [a, b].sort());

  await request(app)
    .delete(`/api/groups/${groupId}/members/${a}`)
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  assert.deepStrictEqual(await memberIds(groupId), [b]);

  // Retirer deux fois : 404 explicite plutôt qu'un succès trompeur.
  await request(app)
    .delete(`/api/groups/${groupId}/members/${a}`)
    .set('Authorization', `Bearer ${token}`)
    .expect(404);

  await execute('DELETE FROM group_members WHERE group_id = ?', [groupId]);
  await execute('DELETE FROM `groups` WHERE id = ?', [groupId]);
  await execute("DELETE FROM users WHERE id IN (?, ?) AND user_type = 'student'", [a, b]);
});

test('Groupes : le lot refuse un corps vide ou hors borne', async () => {
  const token = await ensureAdminTeacherAuthToken({ elevated: true });
  const group = await queryOne('SELECT id FROM `groups` LIMIT 1');
  assert.ok(group?.id, 'Au moins un groupe en base');

  await request(app)
    .post(`/api/groups/${group.id}/members/bulk`)
    .set('Authorization', `Bearer ${token}`)
    .send({ user_ids: [] })
    .expect(400);

  await request(app)
    .post(`/api/groups/${group.id}/members/bulk`)
    .set('Authorization', `Bearer ${token}`)
    .send({ user_ids: Array.from({ length: 201 }, (_, i) => `x${i}`) })
    .expect(400);
});
