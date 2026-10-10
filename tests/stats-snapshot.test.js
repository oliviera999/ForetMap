'use strict';

// Instantanés des réponses `/api/stats/*` sur un jeu de données de test (piste B, étape B5 :
// statistiques en modèle de lecture, `lib/stats/statsReadModel.js`).
//
// Le jeu est isolé dans un groupe dédié (filtre `group_id`) : deux n3beurs du groupe, un
// troisième hors groupe qui ne doit jamais apparaître. Les réponses sont comparées à des
// littéraux — compteurs par statut (dont un rattachement par prénom + nom seul), engagement
// biodiversité et tutoriels, tri, ligne CSV échappée. Les totaux du site étant globaux, on en
// compare l'ÉCART avant/après l'ajout des données. La progression (paliers configurables par
// d'autres tests de la suite) n'est vérifiée que dans sa forme.

require('./helpers/setup');
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, queryOne, execute } = require('../database');
const { ensureRbacBootstrap } = require('../lib/rbac');
const { signAuthToken } = require('../middleware/requireTeacher');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');
const { createPlant, createZone } = require('./helpers/fmFixtures');

/** Forme de l'URL signée de l'avatar par défaut (`lib/defaultAvatar.js`). */
const DEFAULT_AVATAR_URL_RE = /^\/api\/users\/[^/]+\/default-avatar\?exp=\d+&sig=[\w-]+$/;

let adminToken;
let groupId;
let siteBefore;
const people = {};
const tasks = {};

function uid(prefix) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

async function createStudent(firstName, lastName) {
  const role = await queryOne("SELECT id FROM roles WHERE slug = 'eleve_novice'");
  const id = uid('stats-eleve');
  await execute(
    `INSERT INTO users (id, user_type, first_name, last_name, display_name, is_active, assigned_role_id)
     VALUES (?, 'student', ?, ?, ?, 1, ?)`,
    [id, firstName, lastName, `${firstName} ${lastName}`, role.id],
  );
  await execute(
    'INSERT INTO user_roles (user_type, user_id, role_id, is_primary) VALUES (?, ?, ?, 1)',
    ['student', id, role.id],
  );
  return { id, firstName, lastName };
}

async function createTask(title, status, zoneId = null) {
  const id = uid('stats-tache');
  await execute(
    `INSERT INTO tasks (id, title, description, status, zone_id, due_date, created_at)
     VALUES (?, ?, '', ?, ?, '2026-10-15', NOW())`,
    [id, title, status, zoneId],
  );
  return id;
}

async function assign(taskId, student, { byNameOnly = false, at, done = false }) {
  await execute(
    `INSERT INTO task_assignments (task_id, student_id, student_first_name, student_last_name, done_at, assigned_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      taskId,
      byNameOnly ? null : student.id,
      student.firstName,
      student.lastName,
      done ? at : null,
      at,
    ],
  );
}

function getAll(query = {}) {
  return request(app)
    .get('/api/stats/all')
    .query(query)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
}

before(async () => {
  await initSchema();
  await ensureRbacBootstrap();
  adminToken = await ensureAdminTeacherAuthToken();
  siteBefore = (await getAll()).body.site;

  const eleveNovice = await queryOne("SELECT id FROM roles WHERE slug = 'eleve_novice'");
  groupId = crypto.randomUUID();
  const slug = uid('stats-groupe');
  await execute(
    `INSERT INTO \`groups\` (id, slug, name, kind, default_role_id, is_active, created_at, updated_at)
     VALUES (?, ?, ?, 'class', ?, 1, NOW(), NOW())`,
    [groupId, slug, slug, eleveNovice.id],
  );
  const suffix = crypto.randomUUID().slice(0, 6);
  people.alix = await createStudent('Alix', `Martin${suffix}`);
  people.basile = await createStudent('Basile', `Du;pont "B" ${suffix}`);
  people.chloe = await createStudent('Chloé', `Hors${suffix}`);
  for (const s of [people.alix, people.basile]) {
    await execute(
      "INSERT INTO group_members (group_id, user_type, user_id, joined_at) VALUES (?, 'student', ?, NOW())",
      [groupId, s.id],
    );
  }

  const zone = await createZone({ name: `Zone stats ${suffix}` });
  tasks.t1 = await createTask('Stats T1 validée', 'validated');
  tasks.t2 = await createTask('Stats T2 en cours', 'in_progress', zone.id);
  tasks.t3 = await createTask('Stats T3 terminée', 'done');
  tasks.t4 = await createTask('Stats T4 disponible', 'available');
  tasks.t5 = await createTask('Stats T5 validée', 'validated');
  tasks.t6 = await createTask('Stats T6 proposée', 'proposed');
  tasks.zoneName = zone.name;

  await assign(tasks.t1, people.alix, { at: '2026-09-01 10:00:00.000', done: true });
  await assign(tasks.t5, people.alix, { at: '2026-09-02 10:00:00.000', done: true });
  await assign(tasks.t2, people.alix, { at: '2026-09-03 10:00:00.000' });
  // Rattachement historique par prénom + nom seul (student_id NULL) : compté pour Alix.
  await assign(tasks.t4, people.alix, { at: '2026-09-04 10:00:00.000', byNameOnly: true });
  await assign(tasks.t1, people.basile, { at: '2026-09-01 11:00:00.000', done: true });
  await assign(tasks.t3, people.basile, { at: '2026-09-05 11:00:00.000', done: true });
  await assign(tasks.t6, people.basile, { at: '2026-09-06 11:00:00.000' });
  await assign(tasks.t1, people.chloe, { at: '2026-09-01 12:00:00.000', done: true });

  const p1 = await createPlant({ name: uid('Espèce stats A') });
  const p2 = await createPlant({ name: uid('Espèce stats B') });
  for (const plantId of [p1.id, p1.id, p2.id]) {
    await execute(
      'INSERT INTO user_plant_observation_events (user_id, plant_id, observed_at) VALUES (?, ?, NOW(3))',
      [people.alix.id, plantId],
    );
  }
  await execute(
    'INSERT INTO user_tutorial_reads (user_id, tutorial_id, acknowledged_at) VALUES (?, 1, NOW(3))',
    [people.alix.id],
  );
  for (const tutorialId of [1, 2]) {
    await execute(
      'INSERT INTO user_tutorial_reads (user_id, tutorial_id, acknowledged_at) VALUES (?, ?, NOW(3))',
      [people.basile.id, tutorialId],
    );
  }
});

const PROGRESSION_KEYS_ALL = ['autoProgressionEnabled', 'roleDisplayName', 'roleEmoji', 'roleSlug'];

describe('GET /api/stats/all — instantané', () => {
  it('groupe filtré : n3beurs du groupe seulement, compteurs, engagement et tri', async () => {
    const res = await getAll({ group_id: groupId });
    const { students, site } = res.body;
    assert.deepEqual(Object.keys(res.body).sort(), ['site', 'students']);
    const stripped = students.map((s) => {
      // `default_avatar_url` : URL signée à échéance horaire, vérifiée dans sa forme seulement.
      const { progression, default_avatar_url: avatarUrl, ...rest } = s;
      assert.match(avatarUrl, DEFAULT_AVATAR_URL_RE);
      assert.deepEqual(Object.keys(progression).sort(), PROGRESSION_KEYS_ALL);
      assert.equal(typeof progression.roleSlug, 'string');
      return rest;
    });
    const presence = students[0].presence_status
      ? { presence_status: 'offline', presence_label: students[0].presence_label }
      : {};
    assert.deepEqual(stripped, [
      {
        id: people.alix.id,
        first_name: 'Alix',
        last_name: people.alix.lastName,
        pseudo: null,
        description: null,
        avatar_path: null,
        last_seen: null,
        stats: {
          total: 4,
          done: 2,
          pending: 2,
          submitted: 0,
          plant_species_observed: 2,
          plant_observation_events: 3,
          tutorials_read: 1,
        },
        ...presence,
      },
      {
        id: people.basile.id,
        first_name: 'Basile',
        last_name: people.basile.lastName,
        pseudo: null,
        description: null,
        avatar_path: null,
        last_seen: null,
        stats: {
          total: 3,
          done: 1,
          pending: 0,
          submitted: 1,
          plant_species_observed: 0,
          plant_observation_events: 0,
          tutorials_read: 2,
        },
        ...presence,
      },
    ]);
    assert.deepEqual(
      {
        plant_species_observed: site.plant_species_observed - siteBefore.plant_species_observed,
        plant_observation_events:
          site.plant_observation_events - siteBefore.plant_observation_events,
        tutorials_read: site.tutorials_read - siteBefore.tutorials_read,
      },
      { plant_species_observed: 2, plant_observation_events: 3, tutorials_read: 3 },
    );
  });

  it('vue globale : le n3beur hors groupe y figure avec ses compteurs', async () => {
    const res = await getAll();
    const chloe = res.body.students.find((s) => s.id === people.chloe.id);
    assert.ok(chloe, 'élève hors groupe présent dans la vue globale');
    assert.deepEqual(chloe.stats, {
      total: 1,
      done: 1,
      pending: 0,
      submitted: 0,
      plant_species_observed: 0,
      plant_observation_events: 0,
      tutorials_read: 0,
    });
    const dones = res.body.students.map((s) => s.stats.done);
    assert.deepEqual(
      dones,
      [...dones].sort((a, b) => b - a),
      'tri décroissant sur les validées',
    );
  });
});

describe('GET /api/stats/me/:studentId — instantané', () => {
  it('fiche n3beur : identité, compteurs, assignations (plus récentes d’abord) et progression', async () => {
    const res = await request(app)
      .get(`/api/stats/me/${people.alix.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const { progression, assignments, default_avatar_url: avatarUrl, ...rest } = res.body;
    assert.match(avatarUrl, DEFAULT_AVATAR_URL_RE);
    assert.deepEqual(rest, {
      id: people.alix.id,
      user_type: 'student',
      first_name: 'Alix',
      last_name: people.alix.lastName,
      display_name: `Alix ${people.alix.lastName}`,
      email: null,
      pseudo: null,
      description: null,
      avatar_path: null,
      last_seen: null,
      is_n3beur: true,
      stats: {
        done: 2,
        pending: 2,
        submitted: 0,
        total: 4,
        plant_species_observed: 2,
        plant_observation_events: 3,
        tutorials_read: 1,
      },
    });
    assert.deepEqual(Object.keys(progression).sort(), [
      'autoProgressionEnabled',
      'roleDisplayName',
      'roleEmoji',
      'roleSlug',
      'steps',
      'thresholds',
    ]);
    assert.deepEqual(
      assignments.map((a) => ({
        task_id: a.task_id,
        student_id: a.student_id,
        title: a.title,
        status: a.status,
        zone_name: a.zone_name,
        done: a.done_at != null,
      })),
      [
        {
          task_id: tasks.t4,
          student_id: null,
          title: 'Stats T4 disponible',
          status: 'available',
          zone_name: null,
          done: false,
        },
        {
          task_id: tasks.t2,
          student_id: people.alix.id,
          title: 'Stats T2 en cours',
          status: 'in_progress',
          zone_name: tasks.zoneName,
          done: false,
        },
        {
          task_id: tasks.t5,
          student_id: people.alix.id,
          title: 'Stats T5 validée',
          status: 'validated',
          zone_name: null,
          done: true,
        },
        {
          task_id: tasks.t1,
          student_id: people.alix.id,
          title: 'Stats T1 validée',
          status: 'validated',
          zone_name: null,
          done: true,
        },
      ],
    );
    for (const a of assignments) {
      assert.deepEqual(Object.keys(a).sort(), [
        'assigned_at',
        'done_at',
        'due_date',
        'id',
        'status',
        'student_first_name',
        'student_id',
        'student_last_name',
        'task_id',
        'title',
        'zone_id',
        'zone_name',
      ]);
    }
  });

  it('compte inconnu → 404 ; élève non propriétaire sans droit → 403', async () => {
    const missing = await request(app)
      .get('/api/stats/me/compte-inexistant-stats')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
    assert.deepEqual(missing.body, { error: 'Utilisateur introuvable' });

    const role = await queryOne(
      "SELECT id, slug, display_name FROM roles WHERE slug = 'eleve_novice'",
    );
    const basileToken = await signAuthToken({
      userType: 'student',
      userId: people.basile.id,
      canonicalUserId: people.basile.id,
      roleId: role.id,
      roleSlug: role.slug,
      roleDisplayName: role.display_name,
    });
    const denied = await request(app)
      .get(`/api/stats/me/${people.alix.id}`)
      .set('Authorization', `Bearer ${basileToken}`)
      .expect(403);
    assert.deepEqual(denied.body, { error: 'Accès refusé à ces statistiques' });
  });
});

describe('GET /api/stats/export — instantané', () => {
  it('CSV du groupe : BOM, en-têtes, lignes triées et échappement', async () => {
    const res = await request(app)
      .get('/api/stats/export')
      .query({ group_id: groupId })
      .set('Authorization', `Bearer ${adminToken}`)
      .buffer(true)
      .parse((r, cb) => {
        let data = '';
        r.setEncoding('utf8');
        r.on('data', (chunk) => {
          data += chunk;
        });
        r.on('end', () => cb(null, data));
      })
      .expect(200);
    assert.equal(res.headers['content-type'], 'text/csv; charset=utf-8');
    assert.match(
      res.headers['content-disposition'],
      /^attachment; filename="foretmap-stats-\d{4}-\d{2}-\d{2}\.csv"$/,
    );
    const escapedLast = `"${people.basile.lastName.replace(/"/g, '""')}"`;
    assert.equal(
      res.body,
      '﻿' +
        [
          'Prénom;Nom;Validées;En cours;En attente;Total;Espèces observées (fiches);Observations fiches plantes;Tutoriels lus;Dernière connexion',
          `Alix;${people.alix.lastName};2;2;0;4;2;3;1;Jamais`,
          `Basile;${escapedLast};1;0;1;3;0;0;2;Jamais`,
        ].join('\r\n'),
    );
  });
});
