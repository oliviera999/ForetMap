'use strict';

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute, queryOne } = require('../database');
const { signAuthToken } = require('../middleware/requireTeacher');

let adminToken = '';
let playerToken = '';
const stamp = Date.now();
const testCode = `GL9${String(stamp).slice(-4)}`;

before(async () => {
  await initSchema();
  await execute(
    `INSERT INTO gl_admins (email, display_name, role, is_active, created_at, updated_at)
     VALUES (?, 'MJ CRUD Glossary', 'admin', 1, NOW(), NOW())`,
    [`glossary.crud.${stamp}@ecole.local`]
  );
  const admin = await queryOne(
    'SELECT id FROM gl_admins WHERE email = ? LIMIT 1',
    [`glossary.crud.${stamp}@ecole.local`]
  );
  adminToken = await signAuthToken({
    product: 'gl',
    userType: 'gl_admin',
    userId: String(admin.id),
    roleSlug: 'gl_admin',
    permissions: ['gl.read', 'gl.content.manage'],
  });
  await execute(
    `INSERT INTO gl_classes (name, school, created_by, is_active, created_at, updated_at)
     VALUES (?, 'Ecole', ?, 1, NOW(), NOW())`,
    [`Classe CRUD Glossary ${stamp}`, admin.id]
  );
  const cls = await queryOne('SELECT id FROM gl_classes WHERE name = ? LIMIT 1', [`Classe CRUD Glossary ${stamp}`]);
  await execute(
    `INSERT INTO gl_players (class_id, pseudo, password_hash, is_active, created_at, updated_at)
     VALUES (?, ?, 'x', 1, NOW(), NOW())`,
    [cls.id, `glossary-crud-player-${stamp}`]
  );
  const player = await queryOne('SELECT id FROM gl_players WHERE pseudo = ? LIMIT 1', [`glossary-crud-player-${stamp}`]);
  playerToken = await signAuthToken({
    product: 'gl',
    userType: 'gl_player',
    userId: String(player.id),
    roleSlug: 'gl_player',
    permissions: ['gl.read'],
  });
});

test('GET /api/gl/admin/glossary/meta retourne catégories et biomes', async () => {
  const res = await request(app)
    .get('/api/gl/admin/glossary/meta')
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.ok(Array.isArray(res.body.categories));
  assert.ok(res.body.categories.length >= 5);
  assert.ok(Array.isArray(res.body.biomes));
});

test('POST /api/gl/admin/glossary/terms crée un terme et le joueur le lit', async () => {
  const create = await request(app)
    .post('/api/gl/admin/glossary/terms')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      glossary_code: testCode,
      terme: `Terme e2e ${stamp}`,
      categorie: 'ecologie',
      niveau: 'base',
      definition_courte: 'Définition courte test',
      all_biomes: true,
      statut: 'actif',
    })
    .expect(201);
  assert.strictEqual(create.body.created, true);
  assert.strictEqual(create.body.term.glossary_code, testCode);

  const list = await request(app)
    .get('/api/gl/glossary')
    .set('Authorization', `Bearer ${playerToken}`)
    .expect(200);
  const found = (list.body.items || []).find((row) => row.glossary_code === testCode);
  assert.ok(found, 'terme visible côté joueur');

  const update = await request(app)
    .put(`/api/gl/admin/glossary/terms/${testCode}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      terme: `Terme e2e modifié ${stamp}`,
      categorie: 'ecologie',
      niveau: 'approfondissement',
      definition_courte: 'Définition mise à jour',
      all_biomes: true,
      statut: 'actif',
    })
    .expect(200);
  assert.strictEqual(update.body.term.niveau, 'approfondissement');
});

test('POST /api/gl/admin/glossary/terms refuse catégorie invalide', async () => {
  const res = await request(app)
    .post('/api/gl/admin/glossary/terms')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      glossary_code: `GLBAD${stamp}`,
      terme: 'Invalide',
      categorie: 'inconnue',
      niveau: 'base',
      all_biomes: true,
    })
    .expect(400);
  assert.ok(Array.isArray(res.body.details));
});

test('POST /api/gl/admin/glossary/terms refuse doublon de code', async () => {
  await request(app)
    .post('/api/gl/admin/glossary/terms')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      glossary_code: testCode,
      terme: 'Doublon',
      categorie: 'biome',
      niveau: 'base',
      all_biomes: true,
    })
    .expect(409);
});

test('PATCH archive un terme glossaire', async () => {
  const patch = await request(app)
    .patch(`/api/gl/admin/glossary/terms/${testCode}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ statut: 'inactif' })
    .expect(200);
  assert.strictEqual(patch.body.term.statut, 'inactif');
});
