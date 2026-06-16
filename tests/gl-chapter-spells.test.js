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
const stamp = Date.now();
const slugCreated = `chap-spells-${stamp}`;

before(async () => {
  await initSchema();
  await execute(
    `INSERT INTO gl_admins (email, display_name, role, is_active, created_at, updated_at)
     VALUES (?, 'MJ Chapter Spells', 'admin', 1, NOW(), NOW())
     ON DUPLICATE KEY UPDATE is_active = 1, updated_at = NOW()`,
    [`chapter.spells.${stamp}@ecole.local`],
  );
  const admin = await queryOne('SELECT id FROM gl_admins WHERE email = ? LIMIT 1', [
    `chapter.spells.${stamp}@ecole.local`,
  ]);
  adminToken = await signAuthToken({
    product: 'gl',
    userType: 'gl_admin',
    userId: String(admin.id),
    roleSlug: 'gl_admin',
    permissions: ['gl.read', 'gl.content.manage', 'gl.game.manage'],
  });

  await execute(
    `INSERT INTO gl_spells (spell_code, category_slug, nom, emoji, cout_gemmes, cout_coeurs, statut, created_at, updated_at)
     VALUES ('SLCH1', 'vie', 'Sort chapitre 1', '❤️', 1, 0, 'officiel', NOW(), NOW()),
            ('SLCH2', 'mouvement', 'Sort chapitre 2', '👣', 2, 0, 'propose', NOW(), NOW())
     ON DUPLICATE KEY UPDATE nom = VALUES(nom), updated_at = NOW()`,
  );
  await execute(
    `INSERT INTO gl_classes (name, school, created_by, is_active, created_at, updated_at)
     VALUES (?, 'Ecole', ?, 1, NOW(), NOW())`,
    [`Classe Chapter Spells ${stamp}`, admin.id],
  );
});

test('POST /api/gl/chapters/admin accepte spellCodes', async () => {
  const res = await request(app)
    .post('/api/gl/chapters/admin')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      slug: slugCreated,
      title: 'Chapitre sorts',
      spellCodes: ['SLCH1', 'SLCH2'],
      sortilegesMarkdown: '## Grimoire test',
      mapImageUrl: '/maps/map-foret.svg',
      mapImageFrame: { aspectRatio: '16/9', objectFit: 'contain', focalX: 50, focalY: 50 },
    })
    .expect(201);
  assert.ok(Array.isArray(res.body.chapter.spells));
  assert.strictEqual(res.body.chapter.spells.length, 2);
  assert.strictEqual(res.body.chapter.sortileges_markdown, '## Grimoire test');
});

test('PUT /api/gl/chapters/admin/:id remplace spellCodes', async () => {
  const chapter = await queryOne('SELECT id FROM gl_chapters WHERE slug = ? LIMIT 1', [
    slugCreated,
  ]);
  const res = await request(app)
    .put(`/api/gl/chapters/admin/${chapter.id}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ spellCodes: ['SLCH1'] })
    .expect(200);
  assert.strictEqual(res.body.chapter.spells.length, 1);
  assert.strictEqual(res.body.chapter.spells[0].spell_code, 'SLCH1');
});

test('PUT /api/gl/chapters/admin/:id refuse spellCodes inconnu', async () => {
  const chapter = await queryOne('SELECT id FROM gl_chapters WHERE slug = ? LIMIT 1', [
    slugCreated,
  ]);
  await request(app)
    .put(`/api/gl/chapters/admin/${chapter.id}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ spellCodes: ['SL_INEXISTANT'] })
    .expect(400);
});

test('GET /api/gl/games/:id expose chapter_spells', async () => {
  const chapter = await queryOne('SELECT id FROM gl_chapters WHERE slug = ? LIMIT 1', [
    slugCreated,
  ]);
  await request(app)
    .put(`/api/gl/chapters/admin/${chapter.id}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ spellCodes: ['SLCH1', 'SLCH2'] })
    .expect(200);

  const cls = await queryOne('SELECT id FROM gl_classes WHERE name = ? LIMIT 1', [
    `Classe Chapter Spells ${stamp}`,
  ]);
  const admin = await queryOne('SELECT id FROM gl_admins ORDER BY id DESC LIMIT 1');
  await execute(
    `INSERT INTO gl_games (class_id, chapter_id, name, status, created_by, created_at, updated_at)
     VALUES (?, ?, ?, 'live', ?, NOW(), NOW())`,
    [cls.id, chapter.id, `Partie spells ${stamp}`, admin.id],
  );
  const game = await queryOne('SELECT id FROM gl_games WHERE name = ? LIMIT 1', [
    `Partie spells ${stamp}`,
  ]);

  const res = await request(app)
    .get(`/api/gl/games/${game.id}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.ok(Array.isArray(res.body.game.chapter_spells));
  assert.strictEqual(res.body.game.chapter_spells.length, 2);
  assert.ok(res.body.game.chapter_spells.some((s) => s.spell_code === 'SLCH2'));
});

test('DELETE chapitre test sorts', async () => {
  const chapter = await queryOne('SELECT id FROM gl_chapters WHERE slug = ? LIMIT 1', [
    slugCreated,
  ]);
  await execute('DELETE FROM gl_games WHERE chapter_id = ?', [chapter.id]);
  await request(app)
    .delete(`/api/gl/chapters/admin/${chapter.id}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
});
