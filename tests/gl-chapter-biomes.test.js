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
const stamp = Date.now();
const slugCreated = `chap-biomes-${stamp}`;

before(async () => {
  await initSchema();
  await execute(
    `INSERT INTO gl_admins (email, display_name, role, is_active, created_at, updated_at)
     VALUES (?, 'MJ Chapter Biomes', 'admin', 1, NOW(), NOW())
     ON DUPLICATE KEY UPDATE is_active = 1, updated_at = NOW()`,
    [`chapter.biomes.${stamp}@ecole.local`],
  );
  const admin = await queryOne('SELECT id FROM gl_admins WHERE email = ? LIMIT 1', [
    `chapter.biomes.${stamp}@ecole.local`,
  ]);
  adminToken = await signAuthToken({
    product: 'gl',
    userType: 'gl_admin',
    userId: String(admin.id),
    roleSlug: 'gl_admin',
    permissions: ['gl.read', 'gl.content.manage', 'gl.game.manage'],
  });

  await execute(
    `INSERT INTO gl_classes (name, school, created_by, is_active, created_at, updated_at)
     VALUES (?, 'Ecole', ?, 1, NOW(), NOW())`,
    [`Classe Chapter Biomes ${stamp}`, admin.id],
  );
  const cls = await queryOne('SELECT id FROM gl_classes WHERE name = ? LIMIT 1', [
    `Classe Chapter Biomes ${stamp}`,
  ]);
  const player = await createGlPlayer({
    classId: cls.id,
    pseudo: `chapter-biomes-player-${stamp}`,
  });
  playerToken = await signAuthToken({
    product: 'gl',
    userType: 'gl_player',
    userId: String(player.id),
    roleSlug: 'gl_player',
    permissions: ['gl.read', 'gl.action.request'],
  });
});

test('POST /api/gl/chapters/admin accepte plusieurs biomeSlugs', async () => {
  const res = await request(app)
    .post('/api/gl/chapters/admin')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      slug: slugCreated,
      title: 'Chapitre multi-biomes',
      biomeSlugs: ['sahara', 'foret_caducifoliee'],
      mapImageUrl: '/maps/map-foret.svg',
      mapImageFrame: { aspectRatio: '16/9', objectFit: 'contain', focalX: 50, focalY: 50 },
    })
    .expect(201);
  assert.ok(Array.isArray(res.body.chapter.biomes));
  assert.strictEqual(res.body.chapter.biomes.length, 2);
  assert.strictEqual(res.body.chapter.biomes[0].slug, 'sahara');
  assert.strictEqual(res.body.chapter.biomes[1].slug, 'foret_caducifoliee');
  assert.ok(res.body.chapter.biomes[0].nom);
});

test('GET /api/gl/chapters/:slug expose biomes[]', async () => {
  const res = await request(app)
    .get(`/api/gl/chapters/${slugCreated}`)
    .set('Authorization', `Bearer ${playerToken}`)
    .expect(200);
  assert.strictEqual(res.body.chapter.biomes.length, 2);
});

test('PUT /api/gl/chapters/admin/:id remplace biomeSlugs', async () => {
  const chapter = await queryOne('SELECT id FROM gl_chapters WHERE slug = ? LIMIT 1', [
    slugCreated,
  ]);
  const res = await request(app)
    .put(`/api/gl/chapters/admin/${chapter.id}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ biomeSlugs: ['toundra'] })
    .expect(200);
  assert.strictEqual(res.body.chapter.biomes.length, 1);
  assert.strictEqual(res.body.chapter.biomes[0].slug, 'toundra');
});

test('PUT /api/gl/chapters/admin/:id refuse biomeSlugs inconnu', async () => {
  const chapter = await queryOne('SELECT id FROM gl_chapters WHERE slug = ? LIMIT 1', [
    slugCreated,
  ]);
  await request(app)
    .put(`/api/gl/chapters/admin/${chapter.id}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ biomeSlugs: ['biome_inexistant'] })
    .expect(400);
});

test('PUT /api/gl/chapters/admin/:id accepte biomeSlug legacy (string)', async () => {
  const chapter = await queryOne('SELECT id FROM gl_chapters WHERE slug = ? LIMIT 1', [
    slugCreated,
  ]);
  const res = await request(app)
    .put(`/api/gl/chapters/admin/${chapter.id}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ biomeSlug: 'sahara' })
    .expect(200);
  assert.strictEqual(res.body.chapter.biomes.length, 1);
  assert.strictEqual(res.body.chapter.biomes[0].slug, 'sahara');
});

test('GET /api/gl/games/:id expose chapter_biomes', async () => {
  const chapter = await queryOne('SELECT id FROM gl_chapters WHERE slug = ? LIMIT 1', [
    slugCreated,
  ]);
  await execute(`UPDATE gl_chapters SET biome = 'test' WHERE id = ?`, [chapter.id]);
  await request(app)
    .put(`/api/gl/chapters/admin/${chapter.id}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ biomeSlugs: ['sahara', 'jungle_afc'] })
    .expect(200);

  const cls = await queryOne('SELECT id FROM gl_classes ORDER BY id DESC LIMIT 1');
  const admin = await queryOne('SELECT id FROM gl_admins ORDER BY id DESC LIMIT 1');
  await execute(
    `INSERT INTO gl_games (class_id, chapter_id, name, status, created_by, created_at, updated_at)
     VALUES (?, ?, ?, 'live', ?, NOW(), NOW())`,
    [cls.id, chapter.id, `Partie biomes ${stamp}`, admin.id],
  );
  const game = await queryOne('SELECT id FROM gl_games WHERE name = ? LIMIT 1', [
    `Partie biomes ${stamp}`,
  ]);

  const res = await request(app)
    .get(`/api/gl/games/${game.id}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.ok(Array.isArray(res.body.game.chapter_biomes));
  assert.strictEqual(res.body.game.chapter_biomes.length, 2);
  assert.ok(!('biome_slug' in res.body.game));
});

test('GET /api/gl/glossary?biomeSlugs= unionne les termes', async () => {
  const res = await request(app)
    .get('/api/gl/glossary?biomeSlugs=sahara,jungle_afc')
    .set('Authorization', `Bearer ${playerToken}`)
    .expect(200);
  assert.ok(Array.isArray(res.body.biomes));
  assert.strictEqual(res.body.biomes.length, 2);
  assert.ok(Array.isArray(res.body.items));
});

test('GET /api/gl/qcm/draw accepte biomeSlugs multiples', async () => {
  const res = await request(app)
    .get('/api/gl/qcm/draw?biomeSlugs=sahara,jungle_afc')
    .set('Authorization', `Bearer ${playerToken}`);
  if (res.status === 404) {
    assert.match(String(res.body?.error || ''), /Aucune question/i);
    return;
  }
  assert.strictEqual(res.status, 200);
  assert.ok(res.body.question_code);
});

test('DELETE chapitre test multi-biomes', async () => {
  const chapter = await queryOne('SELECT id FROM gl_chapters WHERE slug = ? LIMIT 1', [
    slugCreated,
  ]);
  await execute('DELETE FROM gl_games WHERE chapter_id = ?', [chapter.id]);
  await request(app)
    .delete(`/api/gl/chapters/admin/${chapter.id}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
});
