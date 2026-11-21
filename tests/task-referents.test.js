'use strict';

require('./helpers/setup');
require('dotenv').config();
const { describe, it, before } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, queryOne, execute } = require('../database');
const { signAuthToken } = require('../middleware/requireTeacher');
const { ensureRbacBootstrap } = require('../lib/rbac');

let teacherToken;
let studentId;

before(async () => {
  await initSchema();
  await ensureRbacBootstrap();
  const loginEmail = String(process.env.TEACHER_ADMIN_EMAIL || '').trim();
  const teacher = await queryOne(
    "SELECT id FROM users WHERE user_type = 'teacher' AND LOWER(email) = LOWER(?) LIMIT 1",
    [loginEmail],
  );
  const adminRole = await queryOne("SELECT id FROM roles WHERE slug = 'admin' LIMIT 1");
  assert.ok(teacher?.id, 'Compte admin enseignant introuvable');
  assert.ok(adminRole?.id, 'Rôle admin introuvable');
  teacherToken = await signAuthToken(
    {
      userType: 'teacher',
      userId: teacher.id,
      canonicalUserId: teacher.id,
      roleId: adminRole.id,
      roleSlug: 'admin',
      roleDisplayName: 'Administrateur',
      elevated: false,
    },
    false,
  );
  const reg = await request(app)
    .post('/api/auth/register')
    .send({ firstName: 'Ref', lastName: `St${Date.now()}`, password: 'pass1234' })
    .expect(201);
  studentId = reg.body.id;
});

describe('Référents de tâche', () => {
  it('POST /api/tasks avec referent_user_ids valides renvoie les référents enrichis', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        title: 'Tâche avec référent',
        required_students: 1,
        referent_user_ids: [studentId],
      })
      .expect(201);
    assert.ok(Array.isArray(res.body.referent_user_ids));
    assert.ok(res.body.referent_user_ids.includes(String(studentId)));
    assert.ok(Array.isArray(res.body.referents_linked));
    assert.ok(res.body.referents_linked.some((r) => String(r.id) === String(studentId)));
  });

  it('POST /api/tasks avec référent inexistant renvoie 400', async () => {
    await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        title: 'Tâche référent invalide',
        referent_user_ids: ['00000000-0000-4000-8000-000000000001'],
      })
      .expect(400);
  });

  it('GET /api/tasks/referent-candidates avec jeton admin renvoie un tableau', async () => {
    const res = await request(app)
      .get('/api/tasks/referent-candidates')
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(200);
    assert.ok(Array.isArray(res.body));
    assert.ok(res.body.length >= 1);
    const sample = res.body[0];
    assert.ok(sample.id);
    assert.ok(['teacher', 'student'].includes(sample.user_type));
  });

  it('GET /api/tasks/referent-candidates sans jeton renvoie 401', async () => {
    await request(app).get('/api/tasks/referent-candidates').expect(401);
  });
});

describe('Référents automatiques : source préservée, refus par série (élèves référents)', () => {
  async function createRecurringTaskWithAutoReferent() {
    const res = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        title: `Récurrente référent auto ${Date.now()}`,
        required_students: 1,
        recurrence: 'weekly',
        referent_user_ids: [studentId],
      })
      .expect(201);
    await execute("UPDATE task_referents SET source = 'auto' WHERE task_id = ? AND user_id = ?", [
      res.body.id,
      studentId,
    ]);
    return res.body.id;
  }

  async function sourceOf(taskId) {
    const row = await queryOne(
      'SELECT source FROM task_referents WHERE task_id = ? AND user_id = ?',
      [taskId, studentId],
    );
    return row?.source || null;
  }

  it('un PUT qui ne touche pas aux référents ne change aucune source ; la réponse expose source', async () => {
    const taskId = await createRecurringTaskWithAutoReferent();
    const res = await request(app)
      .put(`/api/tasks/${taskId}`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ title: 'Titre modifié, référents intacts' })
      .expect(200);
    assert.equal(await sourceOf(taskId), 'auto');
    const linked = res.body.referents_linked.find((r) => String(r.id) === String(studentId));
    assert.equal(linked.source, 'auto');
    // Liste identique renvoyée : le lien gardé reste `auto`.
    await request(app)
      .put(`/api/tasks/${taskId}`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ referent_user_ids: [studentId] })
      .expect(200);
    assert.equal(await sourceOf(taskId), 'auto');
    await execute('DELETE FROM tasks WHERE id = ?', [taskId]);
  });

  it('retirer un référent auto enregistre un refus ; le rajouter à la main le lève (manual)', async () => {
    const taskId = await createRecurringTaskWithAutoReferent();
    const { series_id: seriesId } = await queryOne(
      'SELECT COALESCE(recurrence_series_id, id) AS series_id FROM tasks WHERE id = ?',
      [taskId],
    );
    await request(app)
      .put(`/api/tasks/${taskId}`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ referent_user_ids: [] })
      .expect(200);
    const veto = await queryOne(
      'SELECT series_id, created_by FROM task_series_referent_vetoes WHERE user_id = ? AND series_id = ?',
      [studentId, seriesId],
    );
    assert.ok(veto, 'refus enregistré sur la série');
    assert.ok(veto.created_by, 'auteur du refus');
    await request(app)
      .put(`/api/tasks/${taskId}`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ referent_user_ids: [studentId] })
      .expect(200);
    assert.equal(await sourceOf(taskId), 'manual');
    const lifted = await queryOne(
      'SELECT COUNT(*) AS n FROM task_series_referent_vetoes WHERE user_id = ? AND series_id = ?',
      [studentId, seriesId],
    );
    assert.equal(Number(lifted.n), 0);
    await execute('DELETE FROM tasks WHERE id = ?', [taskId]);
  });

  it('retirer un référent manuel n’enregistre aucun refus', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ title: `Référent manuel ${Date.now()}`, referent_user_ids: [studentId] })
      .expect(201);
    await request(app)
      .put(`/api/tasks/${res.body.id}`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ referent_user_ids: [] })
      .expect(200);
    const n = await queryOne(
      'SELECT COUNT(*) AS n FROM task_series_referent_vetoes WHERE user_id = ?',
      [studentId],
    );
    assert.equal(Number(n.n), 0);
    await execute('DELETE FROM tasks WHERE id = ?', [res.body.id]);
  });
});
