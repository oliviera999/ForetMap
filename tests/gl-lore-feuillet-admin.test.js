'use strict';

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, queryAll, execute } = require('../database');
const { createGlAdmin, signTokens } = require('./helpers/glFixtures');
const { applyFeuilletsImport, parseFeuilletsWorkbook } = require('../lib/glLoreFeuilletsImport');

let adminToken = '';
const code = 'cop-cover';

before(async () => {
  await initSchema();
  const admin = await createGlAdmin({ email: `gl.feui.admin.${Date.now()}@ecole.local` });
  const tokens = await signTokens({
    adminId: admin.id,
    adminPermissions: ['gl.read', 'gl.content.manage'],
  });
  adminToken = tokens.adminToken;

  const file = path.join(process.cwd(), 'data', 'gl', 'corpus-feuillets-selene.xlsx');
  const parsed = await parseFeuilletsWorkbook(fs.readFileSync(file));
  await applyFeuilletsImport({ queryAll, execute }, parsed, { dryRun: false });
});

test('GET /admin/feuillets liste les feuillets avec leurs caractéristiques', async () => {
  const res = await request(app)
    .get('/api/gl/lore/admin/feuillets')
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.ok(Array.isArray(res.body.items));
  assert.ok(res.body.items.length >= 100);
  const cover = res.body.items.find((r) => r.feuillet_code === code);
  assert.ok(cover, 'cop-cover présent');
  assert.ok('titre' in cover && 'type' in cover && 'statut' in cover);
});

test('PUT /admin/feuillets/:code met à jour les champs', async () => {
  const res = await request(app)
    .put(`/api/gl/lore/admin/feuillets/${code}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ titre: 'Couverture éditée', ordre_voyage: 7, idee_cle: 'Idée test' })
    .expect(200);
  assert.strictEqual(res.body.ok, true);
  assert.strictEqual(res.body.feuillet.titre, 'Couverture éditée');
  assert.strictEqual(res.body.feuillet.ordreVoyage, 7);
  assert.strictEqual(res.body.feuillet.ideeCle, 'Idée test');
});

test('PUT tolère un biome inconnu (enregistré sans biome + warning)', async () => {
  const res = await request(app)
    .put(`/api/gl/lore/admin/feuillets/${code}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ titre: 'Avec biome exotique', biome_slug: 'biome_inexistant_xyz' })
    .expect(200);
  assert.ok(res.body.warning && res.body.warning.field === 'biome_slug');
  assert.strictEqual(res.body.feuillet.biomeSlug, null);
});

test('PUT 404 sur un code inconnu', async () => {
  await request(app)
    .put('/api/gl/lore/admin/feuillets/zzz-inexistant')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ titre: 'X' })
    .expect(404);
});

test('PATCH /admin/feuillets/:code archive puis réactive', async () => {
  const arch = await request(app)
    .patch(`/api/gl/lore/admin/feuillets/${code}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ statut: 'inactif' })
    .expect(200);
  assert.strictEqual(arch.body.feuillet.statut, 'inactif');

  const react = await request(app)
    .patch(`/api/gl/lore/admin/feuillets/${code}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ statut: 'actif' })
    .expect(200);
  assert.strictEqual(react.body.feuillet.statut, 'actif');
});

test('PUT /admin/feuillets/reorder met à jour ordre_liasse par lot', async () => {
  const res = await request(app)
    .put('/api/gl/lore/admin/feuillets/reorder')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      updates: [
        { code, ordreLiasse: 42 },
        { code, ordreLiasse: 43 },
      ],
    })
    .expect(200);
  assert.strictEqual(res.body.ok, true);
  assert.strictEqual(res.body.requested, 2);

  const detail = await request(app)
    .get(`/api/gl/lore/admin/feuillets/${code}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.strictEqual(detail.body.feuillet.ordreLiasse, 43);
});

test('PUT /admin/feuillets/reorder 400 sur entrée invalide', async () => {
  await request(app)
    .put('/api/gl/lore/admin/feuillets/reorder')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ updates: [{ code: '', ordreLiasse: 'abc' }] })
    .expect(400);
  await request(app)
    .put('/api/gl/lore/admin/feuillets/reorder')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ updates: [] })
    .expect(400);
});

test('PUT refuse sans permission gl.content.manage', async () => {
  const readOnly = await signTokens({
    adminId: 'gl-admin-readonly',
    adminPermissions: ['gl.read'],
  });
  await request(app)
    .put(`/api/gl/lore/admin/feuillets/${code}`)
    .set('Authorization', `Bearer ${readOnly.adminToken}`)
    .send({ titre: 'X' })
    .expect(403);
});
