require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, queryAll } = require('../database');
const { setStudentPrimaryRole } = require('./helpers/studentRoles');
const { ensureAdminTeacherAuthToken, getAdminTeacherUserId } = require('./helpers/adminAuth');
const { notifyTaskStatusChange, plainExcerpt } = require('../lib/notificationEvents');
const { runTaskDeadlineRemindersJob } = require('../lib/taskDeadlineReminders');

let teacherToken;
let teacherId;

test.before(async () => {
  await initSchema();
  teacherToken = await ensureAdminTeacherAuthToken({
    extraPermissions: ['place_messages.manage', 'teacher.access', 'context.comments.moderate'],
  });
  teacherId = await getAdminTeacherUserId();
});

function auth(token) {
  return { Authorization: `Bearer ${token}` };
}

async function registerStudent(prefix) {
  const stamp = `${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  const lastName = `Evt${stamp}`;
  const res = await request(app)
    .post('/api/auth/register')
    .send({
      firstName: prefix,
      lastName,
      email: `${prefix.toLowerCase()}_${stamp}@example.com`,
      password: 'pass1234',
    })
    .expect(201);
  await setStudentPrimaryRole(res.body.id, 'eleve_avance');
  const login = await request(app)
    .post('/api/auth/login')
    .send({ identifier: res.body.email, password: 'pass1234' })
    .expect(200);
  return { id: res.body.id, token: login.body.authToken, firstName: prefix, lastName };
}

/**
 * Les notifications sont émises sans attendre la réponse HTTP : on interroge la base jusqu'à
 * voir celle qui porte sur `targetId` (la base de test garde celles des exécutions passées).
 */
async function waitForNotifications(userId, kind, { targetId, timeoutMs = 3000 } = {}) {
  const started = Date.now();
  for (;;) {
    const rows = await queryAll(
      'SELECT * FROM notifications WHERE user_id = ? AND kind = ? ORDER BY id DESC',
      [userId, kind],
    );
    const matching = targetId ? rows.filter((r) => r.target_id === targetId) : rows;
    if (matching.length > 0 || Date.now() - started > timeoutMs) return matching;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

async function createTask(extra = {}) {
  const res = await request(app)
    .post('/api/tasks')
    .set(auth(teacherToken))
    .send({ title: `Tâche notif ${Date.now()}`, required_students: 1, ...extra })
    .expect(201);
  return res.body;
}

async function createZone() {
  const res = await request(app)
    .post('/api/zones')
    .set(auth(teacherToken))
    .send({
      name: `Mare notif ${Date.now()}`,
      map_id: 'foret',
      points: [
        { xp: 18, yp: 18 },
        { xp: 26, yp: 18 },
        { xp: 22, yp: 26 },
      ],
      stage: 'empty',
    })
    .expect(201);
  return res.body;
}

test('extrait lisible : balisage Markdown retiré', () => {
  assert.strictEqual(
    plainExcerpt('**Attention** au [nid](http://x) _fragile_'),
    'Attention au nid fragile',
  );
});

test('proposition d’un n3beur : les valideurs sont notifiés avec le titre et le proposeur', async () => {
  const student = await registerStudent('Propo');
  const title = `Planter des fèves ${Date.now()}`;
  const res = await request(app)
    .post('/api/tasks/proposals')
    .set(auth(student.token))
    .send({
      title,
      studentId: student.id,
      firstName: student.firstName,
      lastName: student.lastName,
    })
    .expect(201);
  const [row] = await waitForNotifications(teacherId, 'task_proposed', { targetId: res.body.id });
  assert.ok(row, 'notification de proposition absente');
  assert.ok(row.title.includes(title));
  assert.ok(row.body.startsWith(`Proposée par ${student.firstName} E.`));
  assert.strictEqual(row.target_type, 'task');
  const own = await queryAll('SELECT id FROM notifications WHERE user_id = ?', [student.id]);
  assert.strictEqual(own.length, 0, 'le proposeur ne doit pas être notifié');
});

test('inscription, tâche faite puis validation : chaque acteur prévient les autres', async () => {
  const student = await registerStudent('Cycle');
  const task = await createTask({ referent_user_ids: [teacherId] });

  await request(app)
    .post(`/api/tasks/${task.id}/assign`)
    .set(auth(student.token))
    .send({ studentId: student.id, firstName: student.firstName, lastName: student.lastName })
    .expect(200);
  const [assignedRow] = await waitForNotifications(teacherId, 'task_assigned_self', {
    targetId: task.id,
  });
  assert.ok(assignedRow);
  assert.ok(assignedRow.title.startsWith(`${student.firstName} E. a pris`));

  await request(app)
    .post(`/api/tasks/${task.id}/done`)
    .set(auth(student.token))
    .send({ studentId: student.id, firstName: student.firstName, lastName: student.lastName })
    .expect(200);
  const [doneRow] = await waitForNotifications(teacherId, 'task_done', { targetId: task.id });
  assert.ok(doneRow);
  assert.ok(doneRow.title.endsWith('attend votre validation'));
  assert.deepStrictEqual(JSON.parse(doneRow.target_extra_json), { filter: 'to_validate' });

  await request(app).post(`/api/tasks/${task.id}/validate`).set(auth(teacherToken)).expect(200);
  const validated = await waitForNotifications(student.id, 'task_validated');
  assert.strictEqual(validated.length, 1);
  assert.ok(validated[0].title.endsWith('est validée'));
  const teacherValidated = await queryAll(
    "SELECT id FROM notifications WHERE user_id = ? AND kind = 'task_validated' AND target_id = ?",
    [teacherId, task.id],
  );
  assert.strictEqual(teacherValidated.length, 0, 'le valideur ne se notifie pas lui-même');
});

test('renvoi « faite » → « en cours » et proposition acceptée', async () => {
  const student = await registerStudent('Renvoi');
  const task = {
    id: 't-renvoi',
    title: 'Désherber',
    status: 'in_progress',
    assignments: [{ student_id: student.id }],
    proposed_by_student_id: student.id,
  };
  await notifyTaskStatusChange({ task, previousStatus: 'done', actorUserId: teacherId });
  const reopened = await waitForNotifications(student.id, 'task_reopened');
  assert.strictEqual(reopened[0].title, '« Désherber » est à reprendre');

  await notifyTaskStatusChange({
    task: { ...task, id: 't-accept', status: 'available' },
    previousStatus: 'proposed',
    actorUserId: teacherId,
  });
  const accepted = await waitForNotifications(student.id, 'task_proposal_accepted');
  assert.strictEqual(accepted[0].title, 'Votre proposition « Désherber » est acceptée');
});

test('suppression d’une proposition : son auteur apprend qu’elle n’est pas retenue', async () => {
  const student = await registerStudent('Refus');
  const title = `Idée refusée ${Date.now()}`;
  const created = await request(app)
    .post('/api/tasks/proposals')
    .set(auth(student.token))
    .send({
      title,
      studentId: student.id,
      firstName: student.firstName,
      lastName: student.lastName,
    })
    .expect(201);
  await request(app).delete(`/api/tasks/${created.body.id}`).set(auth(teacherToken)).expect(200);
  const rows = await waitForNotifications(student.id, 'task_proposal_rejected');
  assert.strictEqual(rows.length, 1);
  assert.ok(rows[0].title.includes(title));
  assert.strictEqual(rows[0].target_type, null);
});

test('commentaire sur une tâche : les inscrits reçoivent l’extrait et l’auteur', async () => {
  const student = await registerStudent('Comm');
  const task = await createTask();
  await request(app)
    .post(`/api/tasks/${task.id}/assign`)
    .set(auth(student.token))
    .send({ studentId: student.id, firstName: student.firstName, lastName: student.lastName })
    .expect(200);
  await request(app)
    .post('/api/context-comments')
    .set(auth(teacherToken))
    .send({ contextType: 'task', contextId: task.id, body: 'Pensez aux gants, **merci** !' })
    .expect(201);
  const rows = await waitForNotifications(student.id, 'task_comment');
  assert.strictEqual(rows.length, 1);
  assert.ok(rows[0].title.includes(task.title));
  assert.ok(rows[0].body.endsWith('Pensez aux gants, merci !'));
});

test('message sur un lieu puis changement de statut : aller-retour ciblé sur le lieu', async () => {
  const student = await registerStudent('Lieu');
  const zone = await createZone();
  const created = await request(app)
    .post('/api/context-comments')
    .set(auth(student.token))
    .send({ contextType: 'zone', contextId: zone.id, body: 'La clôture est cassée.' })
    .expect(201);
  const [row] = await waitForNotifications(teacherId, 'place_message', { targetId: zone.id });
  assert.ok(row, 'notification de message de lieu absente');
  assert.ok(row.title.startsWith(`Message sur « ${zone.name} »`));
  assert.strictEqual(row.target_type, 'place');
  assert.strictEqual(row.map_id, 'foret');
  assert.deepStrictEqual(JSON.parse(row.target_extra_json), { kind: 'zone' });

  await request(app)
    .patch(`/api/context-comments/${created.body.id}/place-status`)
    .set(auth(teacherToken))
    .send({ status: 'traite' })
    .expect(200);
  const back = await waitForNotifications(student.id, 'place_message_status');
  assert.strictEqual(back.length, 1);
  assert.strictEqual(back[0].title, `Votre message sur « ${zone.name} » a été traité`);
  assert.strictEqual(back[0].target_id, zone.id);
});

test('réponse au forum : l’auteur du sujet est prévenu, pas l’auteur de la réponse', async () => {
  const student = await registerStudent('Forum');
  const title = `Sujet notif ${Date.now()}`;
  const thread = await request(app)
    .post('/api/forum/threads')
    .set(auth(student.token))
    .send({ title, body: 'Qui a vu le hérisson ?' })
    .expect(201);
  const threadId = thread.body.thread.id;
  const reply = await request(app)
    .post(`/api/forum/threads/${threadId}/posts`)
    .set(auth(teacherToken))
    .send({ body: 'Moi, près de la mare.' })
    .expect(201);
  const rows = await waitForNotifications(student.id, 'forum_reply');
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].title, `Nouvelle réponse dans « ${title} »`);
  assert.strictEqual(rows[0].target_id, threadId);
  assert.deepStrictEqual(JSON.parse(rows[0].target_extra_json), { postId: reply.body.id });
  const teacherRows = await queryAll(
    "SELECT id FROM notifications WHERE user_id = ? AND kind = 'forum_reply' AND target_id = ?",
    [teacherId, threadId],
  );
  assert.strictEqual(teacherRows.length, 0);
});

test('rappel d’échéance : une seule notification par tâche et par échéance', async () => {
  const student = await registerStudent('Echeance');
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const due = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
  const task = await createTask({ due_date: due });
  await request(app)
    .post(`/api/tasks/${task.id}/assign`)
    .set(auth(student.token))
    .send({ studentId: student.id, firstName: student.firstName, lastName: student.lastName })
    .expect(200);

  await runTaskDeadlineRemindersJob();
  await runTaskDeadlineRemindersJob();
  const rows = await queryAll(
    "SELECT * FROM notifications WHERE user_id = ? AND kind = 'task_deadline_soon'",
    [student.id],
  );
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].title, `« ${task.title} » est à rendre demain`);
  assert.strictEqual(rows[0].target_id, task.id);
});
