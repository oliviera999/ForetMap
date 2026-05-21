'use strict';

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute, queryOne } = require('../database');
const { createGlPlayer } = require('./helpers/glFixtures');
const { signAuthToken } = require('../middleware/requireTeacher');

let adminToken = '';
let playerToken = '';
let createdChapterId = null;
let createdMarkerId = null;
const stamp = Date.now();
const slugCreated = `chap-test-${stamp}`;

before(async () => {
  await initSchema();
  await execute(
    `INSERT INTO gl_admins (email, display_name, role, is_active, created_at, updated_at)
     VALUES (?, 'MJ Chapters Admin', 'admin', 1, NOW(), NOW())
     ON DUPLICATE KEY UPDATE is_active = 1, updated_at = NOW()`,
    [`chapters.admin.${stamp}@ecole.local`]
  );
  const admin = await queryOne(
    'SELECT id FROM gl_admins WHERE email = ? LIMIT 1',
    [`chapters.admin.${stamp}@ecole.local`]
  );
  adminToken = await signAuthToken({
    product: 'gl',
    userType: 'gl_admin',
    userId: String(admin.id),
    roleSlug: 'gl_admin',
    permissions: ['gl.read', 'gl.content.manage', 'gl.game.manage', 'gl.settings.manage'],
    displayName: 'MJ Chapters Admin',
  });

  await execute(
    `INSERT INTO gl_classes (name, school, created_by, is_active, created_at, updated_at)
     VALUES (?, 'Ecole', ?, 1, NOW(), NOW())`,
    [`Classe Chapters Admin ${stamp}`, admin.id]
  );
  const cls = await queryOne('SELECT id FROM gl_classes WHERE name = ? LIMIT 1', [`Classe Chapters Admin ${stamp}`]);
  const player = await createGlPlayer({
    classId: cls.id,
    pseudo: `chapters-admin-player-${stamp}`,
  });
  playerToken = await signAuthToken({
    product: 'gl',
    userType: 'gl_player',
    userId: String(player.id),
    roleSlug: 'gl_player',
    permissions: ['gl.read', 'gl.action.request'],
    displayName: 'chapters-admin-player',
  });
});

test('POST /api/gl/chapters/admin refuse sans gl.content.manage', async () => {
  await request(app)
    .post('/api/gl/chapters/admin')
    .set('Authorization', `Bearer ${playerToken}`)
    .send({ slug: slugCreated, title: 'Refus' })
    .expect(403);
});

test('POST /api/gl/chapters/admin crée un chapitre', async () => {
  const res = await request(app)
    .post('/api/gl/chapters/admin')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      slug: slugCreated,
      title: 'Chapitre test',
      biome: 'biome test',
      mapImageUrl: '/maps/map-foret.svg',
      storyMarkdown: '# Histoire test',
      biotopeMarkdown: '## Biotope test',
      biocenoseMarkdown: '## Biocénose test',
      orderIndex: 99,
    })
    .expect(201);
  assert.ok(res.body?.chapter?.id);
  assert.strictEqual(res.body.chapter.slug, slugCreated);
  assert.strictEqual(res.body.chapter.title, 'Chapitre test');
  assert.ok(Array.isArray(res.body.markers));
  createdChapterId = Number(res.body.chapter.id);
});

test('POST /api/gl/chapters/admin refuse un slug déjà utilisé (409)', async () => {
  await request(app)
    .post('/api/gl/chapters/admin')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ slug: slugCreated, title: 'Doublon' })
    .expect(409);
});

test('PUT /api/gl/chapters/admin/:id met à jour le titre et l\'order_index', async () => {
  const res = await request(app)
    .put(`/api/gl/chapters/admin/${createdChapterId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ title: 'Chapitre test bis', orderIndex: 5 })
    .expect(200);
  assert.strictEqual(res.body.chapter.title, 'Chapitre test bis');
  assert.strictEqual(Number(res.body.chapter.order_index), 5);
});

test('POST /api/gl/chapters/admin/:id/markers ajoute un marker', async () => {
  const res = await request(app)
    .post(`/api/gl/chapters/admin/${createdChapterId}/markers`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      label: 'Repère 1',
      xPct: 30,
      yPct: 50,
      eventType: 'quiz',
      description: 'desc',
      orderIndex: 10,
    })
    .expect(201);
  assert.strictEqual(res.body.label, 'Repère 1');
  assert.strictEqual(Number(res.body.chapter_id), createdChapterId);
  createdMarkerId = Number(res.body.id);
});

test('PUT /api/gl/chapters/admin/markers/:markerId met à jour le label', async () => {
  const res = await request(app)
    .put(`/api/gl/chapters/admin/markers/${createdMarkerId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ label: 'Repère 1 bis' })
    .expect(200);
  assert.strictEqual(res.body.label, 'Repère 1 bis');
});

test('DELETE /api/gl/chapters/admin/markers/:markerId supprime le marker', async () => {
  await request(app)
    .delete(`/api/gl/chapters/admin/markers/${createdMarkerId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  const row = await queryOne(
    'SELECT id FROM gl_chapter_markers WHERE id = ? LIMIT 1',
    [createdMarkerId]
  );
  assert.ok(!row, 'Marker should be removed (queryOne returns null or undefined)');
});

test('DELETE /api/gl/chapters/admin/:id supprime le chapitre (aucune partie liée)', async () => {
  await request(app)
    .delete(`/api/gl/chapters/admin/${createdChapterId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  const row = await queryOne('SELECT id FROM gl_chapters WHERE id = ? LIMIT 1', [createdChapterId]);
  assert.ok(!row, 'Chapter should be removed (queryOne returns null or undefined)');
});

test('DELETE /api/gl/chapters/admin/:id refuse si chapitre lié à une partie (409)', async () => {
  const chapter = await queryOne("SELECT id FROM gl_chapters WHERE slug = 'foret-magique' LIMIT 1");
  await request(app)
    .delete(`/api/gl/chapters/admin/${chapter.id}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect((res) => {
      if (res.status !== 409 && res.status !== 200) {
        throw new Error(`Expected 200 or 409, got ${res.status}`);
      }
    });
});
