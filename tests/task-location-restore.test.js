'use strict';

// Lieux rendus à une tâche qui quitte l'état « validée ».
//
// Valider une tâche efface ses liens de zone/repère (règle métier : une tâche validée
// n'occupe plus un lieu). Rien ne les rendait quand un professeur la remettait à « à faire » :
// elle redevenait active **sans lieu**, donc sans pastille et introuvable sur la carte, sans
// que rien à l'écran ne le signale. Ces tests fixent la reprise : la mémoire posée au
// détachement vaut pour toute tâche (pas seulement les récurrentes), et un lieu soumis
// explicitement dans le même PUT reste prioritaire.

require('./helpers/setup');
require('dotenv').config();
const { describe, it, before } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, queryOne, queryAll, execute } = require('../database');
const { signAuthToken } = require('../middleware/requireTeacher');
const { ensureRbacBootstrap } = require('../lib/rbac');

let teacherToken;

async function createZone(nom) {
  const res = await request(app)
    .post('/api/zones')
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({
      name: nom,
      map_id: 'foret',
      points: [
        { xp: 10, yp: 10 },
        { xp: 20, yp: 10 },
        { xp: 20, yp: 20 },
      ],
    })
    .expect(201);
  return res.body.id;
}

async function createTask(body) {
  const res = await request(app)
    .post('/api/tasks')
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({ map_id: 'foret', required_students: 1, ...body })
    .expect(201);
  return res.body;
}

function setStatus(taskId, body) {
  return request(app)
    .put(`/api/tasks/${taskId}`)
    .set('Authorization', `Bearer ${teacherToken}`)
    .send(body);
}

async function zoneIdsOf(taskId) {
  const rows = await queryAll('SELECT zone_id FROM task_zones WHERE task_id = ? ORDER BY zone_id', [
    taskId,
  ]);
  return rows.map((r) => r.zone_id);
}

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
  await execute('UPDATE user_roles SET is_primary = 0 WHERE user_type = ? AND user_id = ?', [
    'teacher',
    teacher.id,
  ]);
  await execute(
    'INSERT INTO user_roles (user_type, user_id, role_id, is_primary) VALUES (?, ?, ?, 1) ON DUPLICATE KEY UPDATE is_primary = 1',
    ['teacher', teacher.id, adminRole.id],
  );
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
});

describe('Lieux rendus à une tâche qui quitte « validée »', () => {
  it('tâche simple : le lieu revient quand elle repasse à « à faire »', async () => {
    const zoneId = await createZone(`Restore simple ${Date.now()}`);
    const task = await createTask({ title: 'Restore simple', zone_ids: [zoneId] });

    await request(app)
      .post(`/api/tasks/${task.id}/validate`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(200);
    assert.deepStrictEqual(await zoneIdsOf(task.id), [], 'la validation détache bien le lieu');

    const res = await setStatus(task.id, { status: 'available' }).expect(200);
    assert.deepStrictEqual(await zoneIdsOf(task.id), [zoneId]);
    assert.deepStrictEqual(res.body.zone_ids, [zoneId], 'la réponse porte le lieu rendu');
    const row = await queryOne('SELECT zone_id FROM tasks WHERE id = ?', [task.id]);
    assert.strictEqual(row.zone_id, zoneId, 'colonne historique resynchronisée');
  });

  it('tâche récurrente : idem, la mémoire sert aussi à la reprise', async () => {
    const zoneId = await createZone(`Restore recurrente ${Date.now()}`);
    const task = await createTask({
      title: 'Restore récurrente',
      zone_ids: [zoneId],
      recurrence: 'weekly',
      due_date: '2026-09-21',
    });

    await request(app)
      .post(`/api/tasks/${task.id}/validate`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(200);
    await setStatus(task.id, { status: 'in_progress' }).expect(200);
    assert.deepStrictEqual(await zoneIdsOf(task.id), [zoneId]);
  });

  it('un lieu soumis dans le même PUT l’emporte sur la mémoire', async () => {
    const zoneId = await createZone(`Restore memoire ${Date.now()}`);
    const autreZoneId = await createZone(`Restore choix ${Date.now()}`);
    const task = await createTask({ title: 'Restore choix', zone_ids: [zoneId] });

    await request(app)
      .post(`/api/tasks/${task.id}/validate`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(200);
    await setStatus(task.id, { status: 'available', zone_ids: [autreZoneId] }).expect(200);
    assert.deepStrictEqual(await zoneIdsOf(task.id), [autreZoneId]);
  });

  it('détacher volontairement reste possible : zone_ids vide n’est pas réécrit', async () => {
    const zoneId = await createZone(`Restore detache ${Date.now()}`);
    const task = await createTask({ title: 'Restore détaché', zone_ids: [zoneId] });

    await request(app)
      .post(`/api/tasks/${task.id}/validate`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(200);
    await setStatus(task.id, { status: 'available', zone_ids: [] }).expect(200);
    assert.deepStrictEqual(await zoneIdsOf(task.id), []);
  });

  it('un lieu supprimé entre-temps ne bloque pas le changement de statut', async () => {
    const zoneId = await createZone(`Restore supprimee ${Date.now()}`);
    const task = await createTask({ title: 'Restore supprimée', zone_ids: [zoneId] });

    await request(app)
      .post(`/api/tasks/${task.id}/validate`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(200);
    await request(app)
      .delete(`/api/zones/${zoneId}`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(200);

    await setStatus(task.id, { status: 'available' }).expect(200);
    assert.deepStrictEqual(await zoneIdsOf(task.id), [], 'aucun lieu rendu, mais pas d’erreur');
    const row = await queryOne('SELECT status FROM tasks WHERE id = ?', [task.id]);
    assert.strictEqual(row.status, 'available');
  });

  it('une tâche qui reste validée n’acquiert pas de lieu', async () => {
    // La règle métier tient toujours : tant que la tâche est validée, les lieux soumis sont
    // ignorés. Elle ne les retrouve qu'en redevenant active.
    const zoneId = await createZone(`Restore garde ${Date.now()}`);
    const autreZoneId = await createZone(`Restore garde 2 ${Date.now()}`);
    const task = await createTask({ title: 'Restore garde', zone_ids: [zoneId] });

    await request(app)
      .post(`/api/tasks/${task.id}/validate`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(200);
    await setStatus(task.id, { status: 'validated', zone_ids: [autreZoneId] }).expect(200);
    assert.deepStrictEqual(await zoneIdsOf(task.id), []);
  });
});
