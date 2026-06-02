'use strict';

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute, queryOne } = require('../database');
const { signAuthToken } = require('../middleware/requireTeacher');

const stamp = Date.now();
let playerToken = '';
let speciesCode = '';
let glossaryCode = '';
let tutorialId = null;

before(async () => {
  await initSchema();
  await execute(
    `INSERT INTO gl_admins (email, display_name, role, is_active, created_at, updated_at)
     VALUES (?, 'MJ Learning', 'admin', 1, NOW(), NOW())
     ON DUPLICATE KEY UPDATE is_active = 1`,
    [`learning.admin.${stamp}@ecole.local`]
  );
  const admin = await queryOne(
    'SELECT id FROM gl_admins WHERE email = ? LIMIT 1',
    [`learning.admin.${stamp}@ecole.local`]
  );
  await execute(
    `INSERT INTO gl_classes (name, school, created_by, is_active, created_at, updated_at)
     VALUES (?, 'Ecole', ?, 1, NOW(), NOW())`,
    [`Classe Learning ${stamp}`, admin.id]
  );
  const cls = await queryOne('SELECT id FROM gl_classes WHERE name = ? LIMIT 1', [`Classe Learning ${stamp}`]);
  await execute(
    `INSERT INTO gl_players (class_id, pseudo, password_hash, is_active, created_at, updated_at)
     VALUES (?, ?, 'x', 1, NOW(), NOW())`,
    [cls.id, `learning-player-${stamp}`]
  );
  const player = await queryOne(
    'SELECT id FROM gl_players WHERE pseudo = ? LIMIT 1',
    [`learning-player-${stamp}`]
  );
  playerToken = await signAuthToken({
    product: 'gl',
    userType: 'gl_player',
    userId: String(player.id),
    roleSlug: 'gl_player',
    permissions: ['gl.read'],
  });

  speciesCode = `SL${String(stamp).slice(-4)}`;
  await execute(
    `INSERT INTO gl_species (
      species_code, biome_slug, type, nom_commun, nom_scientifique, statut, created_at, updated_at
    ) VALUES (?, 'sahara', 'faune', 'Test Learning', 'Testus learnii', 'actif', NOW(), NOW())`,
    [speciesCode]
  );

  glossaryCode = `GL${String(stamp).slice(-4)}`;
  await execute(
    `INSERT INTO gl_glossary_terms (
      glossary_code, terme, categorie, niveau, definition_courte, all_biomes, statut, created_at, updated_at
    ) VALUES (?, 'Terme test learning', 'ecologie', 'base', 'Définition courte', 1, 'actif', NOW(), NOW())`,
    [glossaryCode]
  );

  const tutoRes = await execute(
    `INSERT INTO gl_tutorials (slug, title, body_markdown, is_published, created_at, updated_at)
     VALUES (?, 'Tuto learning', '# Test', 1, NOW(), NOW())`,
    [`tuto-learning-${stamp}`]
  );
  tutorialId = tutoRes.insertId;
});

test('POST learning exige confirm: true', async () => {
  const res = await request(app)
    .post(`/api/gl/learning/species/${speciesCode}`)
    .set('Authorization', `Bearer ${playerToken}`)
    .send({})
    .expect(400);
  assert.match(String(res.body?.error || ''), /confirm/i);
});

test('POST species + glossary + tutorial puis GET /me', async () => {
  await request(app)
    .post(`/api/gl/learning/species/${speciesCode}`)
    .set('Authorization', `Bearer ${playerToken}`)
    .send({ confirm: true })
    .expect(200);

  await request(app)
    .post(`/api/gl/learning/glossary/${glossaryCode}`)
    .set('Authorization', `Bearer ${playerToken}`)
    .send({ confirm: true })
    .expect(200);

  await request(app)
    .post(`/api/gl/learning/tutorials/${tutorialId}`)
    .set('Authorization', `Bearer ${playerToken}`)
    .send({ confirm: true })
    .expect(200);

  const me = await request(app)
    .get('/api/gl/learning/me')
    .set('Authorization', `Bearer ${playerToken}`)
    .expect(200);

  assert.ok(me.body.species_codes.includes(speciesCode));
  assert.ok(me.body.glossary_codes.includes(glossaryCode));
  assert.ok(me.body.tutorial_ids.includes(tutorialId));
});

test('GET /api/gl/tutorials/me/read-ids aligné sur learning', async () => {
  const res = await request(app)
    .get('/api/gl/tutorials/me/read-ids')
    .set('Authorization', `Bearer ${playerToken}`)
    .expect(200);
  assert.ok((res.body?.ids || []).includes(tutorialId));
});

test('GET species enrichit learned', async () => {
  const res = await request(app)
    .get('/api/gl/species?biomeSlug=sahara')
    .set('Authorization', `Bearer ${playerToken}`)
    .expect(200);
  const row = (res.body?.items || []).find((i) => i.species_code === speciesCode);
  assert.ok(row);
  assert.strictEqual(row.learned, true);
});

test('POST learning species inconnu → 404', async () => {
  await request(app)
    .post('/api/gl/learning/species/INEXISTANT-XYZ')
    .set('Authorization', `Bearer ${playerToken}`)
    .send({ confirm: true })
    .expect(404);
});
