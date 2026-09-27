'use strict';

// Caractérisation de `PUT /api/tasks/:id` (piste B, étape B5 de l'audit du 25/09/2026).
//
// Le handler faisait ≈ 460 lignes pour une complexité de 114. Avant de le décomposer sur
// `lib/tasks/taskService.js`, ces tests FIGENT son comportement observable, défauts compris :
// statuts et messages d'erreur exacts, ORDRE des contrôles quand plusieurs champs sont
// invalides, permissions et périmètres (gestion, validation seule, proposeur n3beur), et effets
// de bord (lieux, projet, espèces, référents, tutoriels, séance, journal, temps réel,
// notifications, progression). Ils doivent passer à l'identique avant ET après l'extraction.
//
// Les trous comblés ici, par rapport aux ≈ 48 fichiers de tests « tâches » existants : aucun ne
// couvrait le profil « validation seule », l'ordre des 400, les champs conservés quand ils sont
// absents du corps, la double synchronisation de projet, ni les appels temps réel /
// notification / progression.

require('./helpers/setup');
require('dotenv').config();

// Espions posés AVANT le chargement du serveur : les modules consommateurs déstructurent ces
// fonctions à leur premier `require`.
const realtime = require('../lib/realtime');
const notificationEvents = require('../lib/notificationEvents');
const rbacLib = require('../lib/rbac');

const emitted = [];
const notified = [];
const progressions = [];
const originalEmitTasksChanged = realtime.emitTasksChanged;
realtime.emitTasksChanged = (extra) => {
  emitted.push(extra);
  return originalEmitTasksChanged(extra);
};
const originalNotifyTaskStatusChange = notificationEvents.notifyTaskStatusChange;
notificationEvents.notifyTaskStatusChange = (args) => {
  notified.push({
    taskId: args?.task?.id,
    status: args?.task?.status,
    previousStatus: args?.previousStatus,
    actorUserId: args?.actorUserId,
  });
  return originalNotifyTaskStatusChange(args);
};
const originalSyncProgression = rbacLib.syncProgressionForValidatedTask;
rbacLib.syncProgressionForValidatedTask = (taskId) => {
  progressions.push(String(taskId));
  return originalSyncProgression(taskId);
};

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, queryOne, queryAll, execute } = require('../database');
const { signAuthToken } = require('../middleware/requireTeacher');
const { ensureRbacBootstrap } = require('../lib/rbac');
const { ensureAdminTeacherAuthToken, getAdminTeacherUserId } = require('./helpers/adminAuth');
const { createZone, createMarker, createMap, createPlant } = require('./helpers/fmFixtures');
const { UPLOADS_DIR } = require('../lib/uploads');

const SAMPLE_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5qXg8AAAAASUVORK5CYII=';
const SAMPLE_JPEG =
  'data:image/jpeg;base64,/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAABgj/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABykX//Z';

let adminToken;
let adminUserId;

function uid(prefix) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

async function waitFor(check, { timeoutMs = 3000, stepMs = 25 } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() > deadline) return value;
    await new Promise((resolve) => setTimeout(resolve, stepMs));
  }
}

/** Profil dédié (rôle non système) portant exactement `permissions`, et un compte prof qui le porte. */
async function createTeacherWithPermissions(permissions) {
  const slug = uid('test_role').replace(/-/g, '_');
  const inserted = await execute(
    'INSERT INTO roles (slug, display_name, `rank`, is_system) VALUES (?, ?, 300, 0)',
    [slug, slug],
  );
  const roleId = inserted.insertId;
  for (const key of permissions) {
    await execute('INSERT IGNORE INTO permissions (`key`, label, description) VALUES (?, ?, ?)', [
      key,
      key,
      'Permission auto-seed tests PUT tâches',
    ]);
    await execute('INSERT IGNORE INTO role_permissions (role_id, permission_key) VALUES (?, ?)', [
      roleId,
      key,
    ]);
  }
  const userId = uid('prof');
  await execute(
    `INSERT INTO users (id, user_type, email, first_name, last_name, display_name, is_active, assigned_role_id)
     VALUES (?, 'teacher', ?, 'Prof', ?, ?, 1, ?)`,
    [userId, `${userId}@test.local`, userId, `Prof ${userId}`, roleId],
  );
  await execute(
    'INSERT INTO user_roles (user_type, user_id, role_id, is_primary) VALUES (?, ?, ?, 1)',
    ['teacher', userId, roleId],
  );
  const token = await signAuthToken({
    userType: 'teacher',
    userId,
    canonicalUserId: userId,
    roleId,
    roleSlug: slug,
    roleDisplayName: slug,
  });
  return { userId, token };
}

async function createStudent() {
  const role = await queryOne(
    "SELECT id, slug, display_name FROM roles WHERE slug = 'eleve_avance'",
  );
  const userId = uid('eleve');
  const lastName = `Nom${userId}`;
  await execute(
    `INSERT INTO users (id, user_type, first_name, last_name, display_name, is_active, assigned_role_id)
     VALUES (?, 'student', 'Eleve', ?, ?, 1, ?)`,
    [userId, lastName, `Eleve ${lastName}`, role.id],
  );
  await execute(
    'INSERT INTO user_roles (user_type, user_id, role_id, is_primary) VALUES (?, ?, ?, 1)',
    ['student', userId, role.id],
  );
  const token = await signAuthToken({
    userType: 'student',
    userId,
    canonicalUserId: userId,
    roleId: role.id,
    roleSlug: role.slug,
    roleDisplayName: role.display_name,
  });
  return { userId, token, firstName: 'Eleve', lastName };
}

async function createTask(body = {}) {
  const res = await request(app)
    .post('/api/tasks')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ title: uid('Tâche PUT'), map_id: 'foret', required_students: 1, ...body })
    .expect(201);
  return res.body;
}

function put(taskId, body, token = adminToken) {
  const req = request(app).put(`/api/tasks/${taskId}`);
  if (token) req.set('Authorization', `Bearer ${token}`);
  return body === undefined ? req : req.send(body);
}

async function assign(taskId, student, { done = false } = {}) {
  await execute(
    `INSERT INTO task_assignments (task_id, student_id, student_first_name, student_last_name, done_at, assigned_at)
     VALUES (?, ?, ?, ?, ${done ? 'NOW(3)' : 'NULL'}, NOW(3))`,
    [taskId, student.userId, student.firstName, student.lastName],
  );
}

async function makeProposal(student) {
  const task = await createTask({ title: uid('Proposition') });
  await execute("UPDATE tasks SET status = 'proposed' WHERE id = ?", [task.id]);
  await execute(
    `INSERT INTO audit_log (action, target_type, target_id, details, actor_user_type, actor_user_id, result, created_at)
     VALUES ('propose_task', 'task', ?, ?, 'student', ?, 'success', NOW(3))`,
    [task.id, task.title, student.userId],
  );
  return task;
}

async function createProject(mapId = 'foret') {
  const res = await request(app)
    .post('/api/task-projects')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ title: uid('Projet'), map_id: mapId })
    .expect(201);
  return res.body;
}

async function lastUpdateAudit(taskId) {
  return waitFor(() =>
    queryOne(
      `SELECT actor_user_type, actor_user_id, details, payload_json
         FROM audit_log
        WHERE action = 'update_task' AND target_id = ?
        ORDER BY id DESC LIMIT 1`,
      [taskId],
    ),
  );
}

/** `payload_json` revient déjà décodé (colonne JSON côté MariaDB) ou en chaîne selon le pilote. */
function parsePayload(value) {
  return typeof value === 'string' ? JSON.parse(value) : value;
}

async function createGroup() {
  const id = crypto.randomUUID();
  const slug = uid('groupe-put');
  await execute(
    `INSERT INTO \`groups\` (id, slug, name, kind, is_active, created_at, updated_at)
     VALUES (?, ?, ?, 'class', 1, NOW(), NOW())`,
    [id, slug, slug],
  );
  return id;
}

async function readTaskRow(taskId) {
  return queryOne('SELECT * FROM tasks WHERE id = ?', [taskId]);
}

async function joinIds(table, column, taskId) {
  const rows = await queryAll(
    `SELECT ${column} AS v FROM ${table} WHERE task_id = ? ORDER BY ${column}`,
    [taskId],
  );
  return rows.map((r) => String(r.v));
}

before(async () => {
  await initSchema();
  await ensureRbacBootstrap();
  adminToken = await ensureAdminTeacherAuthToken();
  adminUserId = await getAdminTeacherUserId();
});

describe('PUT /api/tasks/:id — accès et état', () => {
  it('404 pour une tâche inconnue, même sans jeton', async () => {
    const res = await put('inexistante-put-carac', { title: 'x' }, null).expect(404);
    assert.deepEqual(res.body, { error: 'Tâche introuvable' });
  });

  it('403 « Accès refusé » sans jeton et pour un élève qui n’est pas le proposeur', async () => {
    const task = await createTask();
    const anon = await put(task.id, { title: 'x' }, null).expect(403);
    assert.deepEqual(anon.body, { error: 'Accès refusé' });
    const student = await createStudent();
    const res = await put(task.id, { title: 'x' }, student.token).expect(403);
    assert.deepEqual(res.body, { error: 'Accès refusé' });
    assert.equal((await readTaskRow(task.id)).title, task.title);
  });

  it('corps absent (prof) : 500 « Erreur serveur » — défaut figé, détail exposé seulement en mode diagnostic', async () => {
    const task = await createTask();
    const res = await put(task.id, undefined).expect(500);
    assert.deepEqual(res.body, { error: 'Erreur serveur' });

    const previous = process.env.FORETMAP_DEBUG_TASK_PUT_CLIENT;
    process.env.FORETMAP_DEBUG_TASK_PUT_CLIENT = '1';
    try {
      const debug = await put(task.id, undefined).expect(500);
      assert.equal(debug.body.error, 'Erreur serveur');
      assert.equal(typeof debug.body.debugDetail, 'string');
      assert.ok(debug.body.debugDetail.length > 0);
    } finally {
      if (previous === undefined) delete process.env.FORETMAP_DEBUG_TASK_PUT_CLIENT;
      else process.env.FORETMAP_DEBUG_TASK_PUT_CLIENT = previous;
    }
  });
});

describe('PUT /api/tasks/:id — profil « validation seule » (tasks.validate sans tasks.manage)', () => {
  let validator;
  before(async () => {
    validator = await createTeacherWithPermissions(['teacher.access', 'tasks.validate']);
  });

  it('refuse tout champ autre que status, et un corps sans status', async () => {
    const task = await createTask();
    const onlyValidation =
      'Ce profil ne peut modifier que la validation des tâches (bouton Validée ou POST /validate).';
    const r1 = await put(task.id, { title: 'x' }, validator.token).expect(403);
    assert.deepEqual(r1.body, { error: onlyValidation });
    const r2 = await put(task.id, { status: 'validated', title: 'x' }, validator.token).expect(403);
    assert.deepEqual(r2.body, { error: onlyValidation });
    const r3 = await put(task.id, {}, validator.token).expect(403);
    assert.deepEqual(r3.body, { error: 'Accès refusé' });
    const r4 = await put(task.id, undefined, validator.token).expect(403);
    assert.deepEqual(r4.body, { error: 'Accès refusé' });
  });

  it('statut invalide → 400 ; statut autre que « validée » → 403 ; « validée » → 200', async () => {
    const task = await createTask();
    const bad = await put(task.id, { status: 'bogus' }, validator.token).expect(400);
    assert.deepEqual(bad.body, { error: 'Statut invalide' });
    const other = await put(task.id, { status: 'available' }, validator.token).expect(403);
    assert.deepEqual(other.body, { error: 'Permission insuffisante' });
    const ok = await put(task.id, { status: 'validated' }, validator.token).expect(200);
    assert.equal(ok.body.status, 'validated');
    // Défaut figé : la route ne pose pas `req.auth` (authentification optionnelle lue à la
    // main), donc `logAudit` ne retrouve pas l'acteur d'un PUT enseignant.
    const audit = await lastUpdateAudit(task.id);
    assert.equal(audit.actor_user_type, null);
    assert.equal(audit.actor_user_id, null);
  });
});

describe('PUT /api/tasks/:id — profil « gestion seule » (tasks.manage sans tasks.validate)', () => {
  it('ne peut pas valider, mais pose les autres statuts', async () => {
    const manager = await createTeacherWithPermissions(['teacher.access', 'tasks.manage']);
    const task = await createTask();
    const denied = await put(task.id, { status: 'validated' }, manager.token).expect(403);
    assert.deepEqual(denied.body, { error: 'Permission insuffisante' });
    const ok = await put(task.id, { status: 'on_hold', title: 'En pause' }, manager.token).expect(
      200,
    );
    assert.equal(ok.body.status, 'on_hold');
    assert.equal(ok.body.title, 'En pause');
  });
});

describe('PUT /api/tasks/:id — proposeur n3beur', () => {
  it('chaque champ réservé est refusé (403), sans rien modifier', async () => {
    const student = await createStudent();
    const task = await makeProposal(student);
    for (const key of [
      'status',
      'project_id',
      'tutorial_ids',
      'referent_user_ids',
      'recurrence',
      'completion_mode',
      'pedago_session_id',
    ]) {
      const res = await put(task.id, { title: 'Tentative', [key]: null }, student.token).expect(
        403,
      );
      assert.deepEqual(
        res.body,
        { error: 'Champ non modifiable sur une proposition n3beur' },
        `champ ${key}`,
      );
    }
    assert.equal((await readTaskRow(task.id)).title, task.title);
  });

  it('modifie titre, description et lieux ; group_id ignoré ; journal au nom de l’élève ; aucune notification', async () => {
    const student = await createStudent();
    const task = await makeProposal(student);
    const zone = await createZone({ name: uid('Zone proposeur') });
    const res = await put(
      task.id,
      {
        title: 'Proposition retouchée',
        description: 'Nouvelle description',
        group_id: 'groupe-ignore',
        zone_ids: [zone.id],
      },
      student.token,
    ).expect(200);
    assert.equal(res.body.title, 'Proposition retouchée');
    assert.equal(res.body.description, 'Nouvelle description');
    assert.equal(res.body.status, 'proposed');
    assert.equal(res.body.group_id, null);
    assert.deepEqual(await joinIds('task_zones', 'zone_id', task.id), [zone.id]);
    assert.equal(String(res.body.proposed_by_student_id), student.userId);

    const audit = await lastUpdateAudit(task.id);
    assert.equal(audit.actor_user_type, 'student');
    assert.equal(audit.actor_user_id, student.userId);
    const payload = parsePayload(audit.payload_json);
    assert.equal(payload.proposer_edit, true);
    assert.equal(payload.status, 'proposed');

    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(
      notified.filter((n) => n.taskId === task.id).length,
      0,
      'une retouche de proposition ne notifie personne',
    );
    const emits = emitted.filter((e) => e.reason === 'update_task' && e.taskId === task.id);
    assert.equal(emits.length, 1);
  });

  it('une proposition devenue « disponible » n’est plus modifiable par son auteur', async () => {
    const student = await createStudent();
    const task = await makeProposal(student);
    await put(task.id, { status: 'available' }).expect(200);
    const res = await put(task.id, { title: 'Trop tard' }, student.token).expect(403);
    assert.deepEqual(res.body, { error: 'Accès refusé' });
  });
});

describe('PUT /api/tasks/:id — validation des champs (messages et ordre des contrôles)', () => {
  it('chaque champ invalide répond 400 avec son message exact, sans modifier la tâche', async () => {
    const task = await createTask();
    const otherMap = await createMap({ label: 'Carte PUT carac' });
    const zoneOtherMap = await createZone({ mapId: otherMap.id, name: uid('Zone ailleurs') });
    const projectOtherMap = await createProject(otherMap.id);
    const tooManyReferents = Array.from({ length: 16 }, (_, i) => `ref-${i}`);
    const cases = [
      [{ title: '   ' }, 'Titre requis'],
      [{ zone_ids: ['zone-inconnue'] }, 'Zone introuvable'],
      [{ marker_ids: ['repere-inconnu'] }, 'Repère introuvable'],
      [{ map_id: 'carte-inconnue' }, 'Carte introuvable'],
      [
        { zone_ids: [zoneOtherMap.id], map_id: 'foret' },
        'Incohérence entre la carte et les zones/repères',
      ],
      [{ project_id: 'projet-inconnu' }, 'Projet introuvable'],
      [
        { project_id: projectOtherMap.id },
        'Le projet doit appartenir à la même carte que la tâche',
      ],
      [{ tutorial_ids: [999999] }, 'Tutoriel introuvable'],
      [{ referent_user_ids: ['compte-inconnu'] }, 'Référent introuvable ou compte inactif'],
      [{ referent_user_ids: tooManyReferents }, 'Au plus 15 référents par tâche'],
      [{ pedago_session_id: 'seance-inconnue' }, 'Séance pédagogique introuvable'],
      [{ status: 'bogus' }, 'Statut invalide'],
      [{ completion_mode: 'bogus' }, 'Mode de validation invalide'],
      [{ danger_level: 'bogus' }, 'Niveau de danger invalide'],
      [{ difficulty_level: 'bogus' }, 'Niveau de difficulté invalide'],
      [{ importance_level: 'bogus' }, "Degré d'importance invalide"],
      [{ recurrence: 'daily' }, 'Récurrence invalide (weekly, biweekly ou monthly)'],
      [{ start_date: '01/02/2026' }, 'Date de début invalide (format AAAA-MM-JJ attendu)'],
      [{ due_date: '2026-2-1' }, "Date d'échéance invalide (format AAAA-MM-JJ attendu)"],
      [
        { start_date: '2026-03-10', due_date: '2026-03-01' },
        "La date d'échéance ne peut pas précéder la date de début",
      ],
      [
        { imageData: 'data:image/png;base64,AAAA' },
        'Format image non supporté (JPEG, PNG ou WebP)',
      ],
    ];
    for (const [body, message] of cases) {
      const res = await put(task.id, { ...body, description: 'ne doit pas être écrite' }).expect(
        400,
      );
      assert.deepEqual(res.body, { error: message }, JSON.stringify(body));
    }
    const row = await readTaskRow(task.id);
    assert.equal(row.title, task.title);
    assert.equal(row.description, '');
  });

  it('plusieurs champs invalides : le premier contrôle du handler l’emporte', async () => {
    const task = await createTask();
    const ordered = [
      [{ title: '', zone_ids: ['z-x'] }, 'Titre requis'],
      [{ zone_ids: ['z-x'], project_id: 'p-x' }, 'Zone introuvable'],
      [{ project_id: 'p-x', tutorial_ids: [999999] }, 'Projet introuvable'],
      [{ tutorial_ids: [999999], referent_user_ids: ['u-x'] }, 'Tutoriel introuvable'],
      [
        { referent_user_ids: ['u-x'], pedago_session_id: 's-x' },
        'Référent introuvable ou compte inactif',
      ],
      [{ pedago_session_id: 's-x', status: 'bogus' }, 'Séance pédagogique introuvable'],
      [{ status: 'bogus', completion_mode: 'bogus' }, 'Statut invalide'],
      [{ completion_mode: 'bogus', danger_level: 'bogus' }, 'Mode de validation invalide'],
      [{ danger_level: 'bogus', difficulty_level: 'bogus' }, 'Niveau de danger invalide'],
      [{ difficulty_level: 'bogus', importance_level: 'bogus' }, 'Niveau de difficulté invalide'],
      [{ importance_level: 'bogus', recurrence: 'daily' }, "Degré d'importance invalide"],
      [
        { recurrence: 'daily', start_date: 'x' },
        'Récurrence invalide (weekly, biweekly ou monthly)',
      ],
      [{ start_date: 'x', due_date: 'y' }, 'Date de début invalide (format AAAA-MM-JJ attendu)'],
      [
        { due_date: 'y', imageData: 'data:image/png;base64,AAAA' },
        "Date d'échéance invalide (format AAAA-MM-JJ attendu)",
      ],
    ];
    for (const [body, message] of ordered) {
      const res = await put(task.id, body).expect(400);
      assert.deepEqual(res.body, { error: message }, JSON.stringify(body));
    }
  });

  it('une tâche héritée aux dates incohérentes reste modifiable tant que le PUT ne touche pas aux dates', async () => {
    const task = await createTask();
    await execute(
      "UPDATE tasks SET start_date = '2026-05-10', due_date = '2026-05-01' WHERE id = ?",
      [task.id],
    );
    const res = await put(task.id, { title: 'Titre corrigé' }).expect(200);
    assert.equal(res.body.title, 'Titre corrigé');
  });
});

describe('PUT /api/tasks/:id — transitions de statut et effets de bord', () => {
  it('entrée en « validée » : horodatage, lieux détachés et mémorisés, progression, notification, journal, temps réel', async () => {
    const zone = await createZone({ name: uid('Zone validation') });
    const task = await createTask({ zone_ids: [zone.id] });
    const student = await createStudent();
    await assign(task.id, student, { done: true });
    await execute("UPDATE tasks SET status = 'done' WHERE id = ?", [task.id]);

    const res = await put(task.id, { status: 'validated' }).expect(200);
    assert.equal(res.body.status, 'validated');
    const row = await readTaskRow(task.id);
    assert.ok(row.validated_at, 'validated_at posé');
    assert.equal(row.zone_id, null);
    assert.deepEqual(await joinIds('task_zones', 'zone_id', task.id), []);
    assert.deepEqual(JSON.parse(row.recurrence_template_zone_ids), [zone.id]);
    assert.deepEqual(
      progressions.filter((id) => id === task.id),
      [task.id],
    );

    const emits = emitted.filter((e) => e.reason === 'update_task' && e.taskId === task.id);
    assert.deepEqual(emits, [
      { reason: 'update_task', taskId: task.id, projectId: null, mapId: 'foret' },
    ]);
    const notif = await waitFor(() => notified.find((n) => n.taskId === task.id));
    assert.deepEqual(notif, {
      taskId: task.id,
      status: 'validated',
      previousStatus: 'done',
      actorUserId: adminUserId,
    });
    const bell = await waitFor(() =>
      queryOne('SELECT kind FROM notifications WHERE user_id = ? AND target_id = ?', [
        student.userId,
        task.id,
      ]),
    );
    assert.equal(bell?.kind, 'task_validated');

    const audit = await lastUpdateAudit(task.id);
    assert.equal(audit.actor_user_type, null, 'acteur enseignant non journalisé (défaut figé)');
    assert.equal(audit.actor_user_id, null);
    assert.equal(audit.details, task.title);
    assert.deepEqual(parsePayload(audit.payload_json), {
      status: 'validated',
      completion_mode: 'single_done',
      required_students: 1,
      project_id: null,
      proposer_edit: false,
    });
  });

  it('une tâche qui reste « validée » ne rafraîchit ni l’horodatage ni la progression', async () => {
    const task = await createTask();
    await put(task.id, { status: 'validated' }).expect(200);
    await execute("UPDATE tasks SET validated_at = '2020-01-02 03:04:05' WHERE id = ?", [task.id]);
    const before = progressions.filter((id) => id === task.id).length;
    await put(task.id, { status: 'validated', title: 'Toujours validée' }).expect(200);
    const row = await readTaskRow(task.id);
    assert.equal(new Date(row.validated_at).getUTCFullYear(), 2020);
    assert.equal(progressions.filter((id) => id === task.id).length, before);
    const calls = await waitFor(() => {
      const list = notified.filter((n) => n.taskId === task.id);
      return list.length >= 2 ? list : null;
    });
    assert.deepEqual(calls[1], {
      taskId: task.id,
      status: 'validated',
      previousStatus: 'validated',
      actorUserId: adminUserId,
    });
  });

  it('changer le mode de validation SANS statut recalcule le statut ; AVEC statut, le statut fourni l’emporte', async () => {
    const s1 = await createStudent();
    const s2 = await createStudent();
    const recalc = await createTask({ required_students: 2 });
    await assign(recalc.id, s1, { done: true });
    await assign(recalc.id, s2, { done: true });
    await execute("UPDATE tasks SET status = 'in_progress' WHERE id = ?", [recalc.id]);
    const r1 = await put(recalc.id, { completion_mode: 'all_assignees_done' }).expect(200);
    assert.equal(r1.body.completion_mode, 'all_assignees_done');
    assert.equal(r1.body.status, 'done');

    const kept = await createTask({ required_students: 2 });
    await assign(kept.id, s1, { done: true });
    await assign(kept.id, s2, { done: true });
    await execute("UPDATE tasks SET status = 'in_progress' WHERE id = ?", [kept.id]);
    const r2 = await put(kept.id, {
      completion_mode: 'all_assignees_done',
      status: 'in_progress',
    }).expect(200);
    assert.equal(r2.body.status, 'in_progress');
  });

  it('changement de projet : l’ancien et le nouveau projet sont resynchronisés', async () => {
    const p1 = await createProject();
    const p2 = await createProject();
    const task = await createTask({ project_id: p1.id });
    await execute("UPDATE tasks SET status = 'validated' WHERE id = ?", [task.id]);
    await execute("UPDATE task_projects SET status = 'completed' WHERE id = ?", [p1.id]);

    const res = await put(task.id, { project_id: p2.id }).expect(200);
    assert.equal(res.body.project_id, p2.id);
    assert.equal(res.body.status, 'validated');
    const [row1, row2] = await Promise.all([
      queryOne('SELECT status FROM task_projects WHERE id = ?', [p1.id]),
      queryOne('SELECT status FROM task_projects WHERE id = ?', [p2.id]),
    ]);
    assert.equal(row1.status, 'active', 'ancien projet vidé : repasse actif');
    assert.equal(row2.status, 'completed', 'nouveau projet : sa seule tâche est validée');
    const emit = emitted.filter((e) => e.reason === 'update_task' && e.taskId === task.id).pop();
    assert.deepEqual(emit, {
      reason: 'update_task',
      taskId: task.id,
      projectId: p2.id,
      mapId: 'foret',
    });
    const audit = await lastUpdateAudit(task.id);
    assert.equal(parsePayload(audit.payload_json).project_id, p2.id);
  });
});

describe('PUT /api/tasks/:id — champs fournis, champs conservés', () => {
  it('groupe, tutoriels, référents et séance : posés quand fournis, conservés quand absents', async () => {
    const task = await createTask();
    const groupId = await createGroup();
    const session = await queryOne('SELECT id, slug FROM pedago_sessions ORDER BY id LIMIT 1');
    assert.ok(session, 'séance semée attendue');
    const tutorials = await queryAll(
      'SELECT id FROM tutorials WHERE is_active = 1 ORDER BY id LIMIT 2',
    );
    assert.equal(tutorials.length, 2);
    const [t1, t2] = tutorials.map((t) => Number(t.id));

    const r1 = await put(task.id, {
      group_id: `  ${groupId}  `,
      tutorial_ids: [String(t2), t1, 'x', t1],
      referent_user_ids: [adminUserId, ` ${adminUserId} `],
      pedago_session_id: session.slug,
    }).expect(200);
    assert.equal(r1.body.group_id, groupId);
    assert.deepEqual(
      (await joinIds('task_tutorials', 'tutorial_id', task.id)).sort(),
      [String(t1), String(t2)].sort(),
    );
    assert.deepEqual(await joinIds('task_referents', 'user_id', task.id), [String(adminUserId)]);
    assert.equal(r1.body.pedago_session_id, session.id);

    await put(task.id, { title: 'Seul le titre change' }).expect(200);
    const row = await readTaskRow(task.id);
    assert.equal(row.title, 'Seul le titre change');
    assert.equal(row.group_id, groupId);
    assert.equal(row.pedago_session_id, session.id);
    assert.equal((await joinIds('task_tutorials', 'tutorial_id', task.id)).length, 2);
    assert.deepEqual(await joinIds('task_referents', 'user_id', task.id), [String(adminUserId)]);

    const r3 = await put(task.id, {
      group_id: '',
      tutorial_ids: [],
      referent_user_ids: [],
      pedago_session_id: '',
    }).expect(200);
    assert.equal(r3.body.group_id, null);
    assert.equal(r3.body.pedago_session_id, null);
    assert.deepEqual(await joinIds('task_tutorials', 'tutorial_id', task.id), []);
    assert.deepEqual(await joinIds('task_referents', 'user_id', task.id), []);
  });

  it('group_id inconnu : 500 « Erreur serveur » (clé étrangère, défaut figé) sans rien modifier', async () => {
    const task = await createTask();
    const res = await put(task.id, { group_id: 'groupe-inexistant', title: 'Pas écrit' }).expect(
      500,
    );
    assert.deepEqual(res.body, { error: 'Erreur serveur' });
    const row = await readTaskRow(task.id);
    assert.equal(row.title, task.title);
    assert.equal(row.group_id, null);
  });

  it('titre et description absents ou null conservés ; required_students null conservé, invalide ramené à 1', async () => {
    const task = await createTask({ description: 'Description initiale', required_students: 3 });
    await put(task.id, { description: null, required_students: null }).expect(200);
    let row = await readTaskRow(task.id);
    assert.equal(row.title, task.title);
    assert.equal(row.description, 'Description initiale');
    assert.equal(Number(row.required_students), 3);
    await put(task.id, { required_students: 'zéro' }).expect(200);
    row = await readTaskRow(task.id);
    assert.equal(Number(row.required_students), 1);
  });

  it('récurrence : une série naît à la première récurrence et survit à son retrait', async () => {
    const task = await createTask();
    const r1 = await put(task.id, { recurrence: 'weekly' }).expect(200);
    assert.equal(r1.body.recurrence, 'weekly');
    const seriesId = (await readTaskRow(task.id)).recurrence_series_id;
    assert.ok(seriesId);
    await put(task.id, { recurrence: 'monthly' }).expect(200);
    assert.equal((await readTaskRow(task.id)).recurrence_series_id, seriesId);
    const r3 = await put(task.id, { recurrence: null }).expect(200);
    assert.equal(r3.body.recurrence, null);
    assert.equal((await readTaskRow(task.id)).recurrence_series_id, seriesId);
  });

  it('lieux : zone_id hérité accepté, colonnes héritées alignées sur le premier lien, carte vidée par ""', async () => {
    const zone = await createZone({ name: uid('Zone héritée') });
    const marker = await createMarker({ label: uid('Repère hérité') });
    const task = await createTask();
    await put(task.id, { zone_id: zone.id, marker_ids: [marker.id] }).expect(200);
    let row = await readTaskRow(task.id);
    assert.equal(row.zone_id, zone.id);
    assert.equal(row.marker_id, marker.id);
    assert.deepEqual(await joinIds('task_zones', 'zone_id', task.id), [zone.id]);

    await put(task.id, { title: 'Lieux conservés' }).expect(200);
    assert.deepEqual(await joinIds('task_zones', 'zone_id', task.id), [zone.id]);
    assert.deepEqual(await joinIds('task_markers', 'marker_id', task.id), [marker.id]);

    const cleared = await put(task.id, { zone_id: '', marker_ids: [], map_id: '' }).expect(200);
    row = await readTaskRow(task.id);
    assert.equal(row.zone_id, null);
    assert.equal(row.marker_id, null);
    assert.equal(row.map_id, null);
    assert.equal(cleared.body.map_id, null);
  });

  it('espèces liées : species_ids remplace la liste, un PUT sans espèces la conserve', async () => {
    const p1 = await createPlant({ name: uid('Espèce PUT A') });
    const p2 = await createPlant({ name: uid('Espèce PUT B') });
    const task = await createTask({ species_ids: [p1.id] });
    const r1 = await put(task.id, { species_ids: [p2.id] }).expect(200);
    assert.deepEqual(r1.body.living_beings_list, [p2.name]);
    const r2 = await put(task.id, { title: 'Espèces conservées' }).expect(200);
    assert.deepEqual(r2.body.living_beings_list, [p2.name]);
  });

  it('image : une nouvelle image remplace l’ancienne et supprime son fichier ; une image invalide ne touche à rien', async () => {
    const task = await createTask({ imageData: SAMPLE_PNG });
    const pngRel = (await readTaskRow(task.id)).image_path;
    assert.equal(pngRel, `tasks/${task.id}.png`);
    assert.ok(fs.existsSync(path.join(UPLOADS_DIR, pngRel)));

    const bad = await put(task.id, { title: 'Pas écrit', imageData: 'data:image/png;base64,' });
    assert.equal(bad.status, 400);
    assert.deepEqual(bad.body, { error: 'Image requise' });
    assert.equal((await readTaskRow(task.id)).title, task.title);

    const res = await put(task.id, { imageData: SAMPLE_JPEG, remove_task_image: true }).expect(200);
    const row = await readTaskRow(task.id);
    assert.equal(row.image_path, `tasks/${task.id}.jpg`);
    assert.ok(res.body.image_url);
    assert.equal(fs.existsSync(path.join(UPLOADS_DIR, pngRel)), false, 'ancien fichier supprimé');
    assert.ok(fs.existsSync(path.join(UPLOADS_DIR, row.image_path)));
  });

  it('forme de la réponse : celle de GET /api/tasks/:id', async () => {
    const task = await createTask();
    const res = await put(task.id, { title: 'Forme' }).expect(200);
    const detail = await request(app)
      .get(`/api/tasks/${task.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    assert.deepEqual(Object.keys(res.body).sort(), Object.keys(detail.body).sort());
    assert.equal(res.body.image_path, undefined);
    assert.ok(Array.isArray(res.body.assignments));
    assert.equal(res.body.proposed_by_student_id, null);
  });
});
