'use strict';

require('./helpers/setup');
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute } = require('../database');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');
const { ensureRbacBootstrap } = require('../lib/rbac');

let teacherToken;

before(async () => {
  await initSchema();
  await ensureRbacBootstrap();
  teacherToken = await ensureAdminTeacherAuthToken();
});

describe('Anti-LVE — liste tâches allégée', () => {
  it('GET /api/tasks omet species[] et recurrence_template_* ; conserve living_beings_list', async () => {
    const mapId = 'foret';
    const taskId = `lean-task-${Date.now()}`;
    await execute(
      `INSERT INTO tasks (id, title, description, map_id, status, required_students, completion_mode, created_at)
       VALUES (?, 'Lean', 'desc', ?, 'available', 1, 'single_done', NOW())`,
      [taskId, mapId],
    );

    const res = await request(app)
      .get(`/api/tasks?map_id=${mapId}`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(200);

    assert.ok(Array.isArray(res.body));
    const row = res.body.find((t) => t.id === taskId);
    assert.ok(row, 'tâche créée présente');
    assert.equal(row.species, undefined);
    assert.ok(Array.isArray(row.living_beings_list));
    assert.ok(Array.isArray(row.species_ids));
    assert.equal(row.recurrence_template_zone_ids, undefined);
    assert.equal(row.recurrence_template_marker_ids, undefined);
    assert.ok(Array.isArray(row.assignments));
  });

  it('GET /api/tasks défaut = actives seulement', async () => {
    const mapId = 'foret';
    const activeId = `active-${Date.now()}`;
    const archivedId = `arch-${Date.now()}`;
    await execute(
      `INSERT INTO tasks (id, title, map_id, status, required_students, completion_mode, created_at)
       VALUES (?, 'A', ?, 'available', 1, 'single_done', NOW())`,
      [activeId, mapId],
    );
    await execute(
      `INSERT INTO tasks (id, title, map_id, status, required_students, completion_mode, archived_at, created_at)
       VALUES (?, 'B', ?, 'validated', 1, 'single_done', NOW(), NOW())`,
      [archivedId, mapId],
    );

    const activeRes = await request(app)
      .get(`/api/tasks?map_id=${mapId}`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(200);
    const ids = activeRes.body.map((t) => t.id);
    assert.ok(ids.includes(activeId));
    assert.ok(!ids.includes(archivedId));

    const archRes = await request(app)
      .get(`/api/tasks?map_id=${mapId}&archived=archived`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(200);
    const archIds = archRes.body.map((t) => t.id);
    assert.ok(archIds.includes(archivedId));
  });
});

describe('Anti-LVE — zones liste sans body_json', () => {
  it('GET /api/zones omet visit_body_json ; détail le conserve', async () => {
    const mapId = 'foret';
    const zoneId = `z-lean-${Date.now()}`;
    await execute(
      `INSERT INTO zones (id, map_id, name, shape, points, color, stage)
       VALUES (?, ?, 'Zone lean', 'poly', '[]', '#86efac80', 'empty')`,
      [zoneId, mapId],
    );
    await execute(
      `INSERT INTO visit_zones
        (id, map_id, name, points, subtitle, short_description, details_title, details_text, body_json, is_active, sort_order, created_at, updated_at)
       VALUES (?, ?, 'Zone lean', '[]', '', '', 'Détails', '', ?, 1, 0, NOW(), NOW())
       ON DUPLICATE KEY UPDATE body_json = VALUES(body_json)`,
      [zoneId, mapId, JSON.stringify([{ type: 'text', text: 'gros corps' }])],
    );

    const list = await request(app).get(`/api/zones?map_id=${mapId}`).expect(200);
    const z = list.body.find((row) => row.id === zoneId);
    assert.ok(z);
    assert.equal(z.visit_body_json, undefined);
    assert.equal(!!z.has_visit_body, true);

    const detail = await request(app).get(`/api/zones/${zoneId}`).expect(200);
    assert.ok(detail.body.visit_body_json != null);
    assert.equal(detail.body.history_truncated, false);
  });

  it('PUT sans visit_editorial_blocks conserve le corps visite', async () => {
    const mapId = 'foret';
    const zoneId = `z-keep-body-${Date.now()}`;
    const bodyJson = JSON.stringify([
      { id: 'p1', type: 'paragraph', markdown: 'Paragraphe à conserver' },
    ]);
    await execute(
      `INSERT INTO zones (id, map_id, name, shape, points, color, stage)
       VALUES (?, ?, 'Zone keep', 'poly', '[]', '#86efac80', 'empty')`,
      [zoneId, mapId],
    );
    await execute(
      `INSERT INTO visit_zones
        (id, map_id, name, points, subtitle, short_description, details_title, details_text, body_json, is_active, sort_order, created_at, updated_at)
       VALUES (?, ?, 'Zone keep', '[]', 'sous-titre', '', 'Détails', '', ?, 1, 0, NOW(), NOW())
       ON DUPLICATE KEY UPDATE body_json = VALUES(body_json)`,
      [zoneId, mapId, bodyJson],
    );

    const res = await request(app)
      .put(`/api/zones/${zoneId}`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ name: 'Zone keep renommée', visit_subtitle: 'nouveau sous-titre' })
      .expect(200);

    const stored = await request(app).get(`/api/zones/${zoneId}`).expect(200);
    assert.match(String(stored.body.visit_body_json || ''), /Paragraphe à conserver/);
    assert.equal(stored.body.visit_subtitle, 'nouveau sous-titre');
    assert.ok(res.body);
  });
});

describe('Anti-LVE — limite JSON globale', () => {
  it('POST /api/auth/login refuse un corps > 2mb (413)', async () => {
    const pad = 'x'.repeat(Math.floor(2.5 * 1024 * 1024));
    const res = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'nobody@test.local', password: 'x', pad })
      .expect(413);
    assert.equal(res.body.code, 'PAYLOAD_TOO_LARGE');
  });
});
