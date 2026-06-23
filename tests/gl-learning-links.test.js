'use strict';

require('./helpers/setup');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute } = require('../database');
const { createGlAdmin, createGlChapterWithMarker, signTokens } = require('./helpers/glFixtures');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');

const stamp = Date.now();
const lqcode = `LQT${stamp}`.slice(0, 16);
const scopeSlug = `tscope${stamp}`.slice(0, 64);
const catSlug = `tcat${stamp}`.slice(0, 64);
const resourceRef = `LG${stamp}`.slice(0, 64);

let adminToken = '';
let fmToken = '';
let chapterId = null;

before(async () => {
  await initSchema();
  fmToken = await ensureAdminTeacherAuthToken();

  const admin = await createGlAdmin({ email: `links.admin.${stamp}@ecole.local` });
  const tokens = await signTokens({
    adminId: admin.id,
    adminPermissions: ['gl.read', 'gl.content.manage', 'gl.settings.manage'],
  });
  adminToken = tokens.adminToken;

  const { chapter } = await createGlChapterWithMarker({ slug: `gl-links-chap-${stamp}` });
  chapterId = chapter.id;

  // Question QCM lore dediee (parents scope + categorie).
  await execute(
    `INSERT IGNORE INTO gl_qcm_lore_scopes (slug, nom, order_index) VALUES (?, 'Scope test', 999)`,
    [scopeSlug],
  );
  await execute(
    `INSERT IGNORE INTO gl_qcm_lore_categories (slug, nom, order_index) VALUES (?, 'Cat test', 999)`,
    [catSlug],
  );
  await execute(
    `INSERT IGNORE INTO gl_qcm_lore_questions
      (question_code, chapitre_slug, categorie_slug, numero_dans_categorie, question, choix_a, choix_b, choix_c, choix_d, reponse_correcte)
     VALUES (?, ?, ?, 1, 'Q lore ?', 'A', 'B', 'C', 'D', 'A')`,
    [lqcode, scopeSlug, catSlug],
  );
});

after(async () => {
  // Hermetique : supprimer toutes les donnees creees (liens, question/categorie/scope, chapitre).
  await execute('DELETE FROM gl_resource_question_links WHERE question_code = ?', [lqcode]).catch(
    () => {},
  );
  await execute('DELETE FROM gl_resource_gating_policy WHERE resource_ref = ?', [
    resourceRef,
  ]).catch(() => {});
  await execute('DELETE FROM gl_qcm_lore_questions WHERE question_code = ?', [lqcode]).catch(
    () => {},
  );
  await execute('DELETE FROM gl_qcm_lore_categories WHERE slug = ?', [catSlug]).catch(() => {});
  await execute('DELETE FROM gl_qcm_lore_scopes WHERE slug = ?', [scopeSlug]).catch(() => {});
  if (chapterId) {
    await execute('DELETE FROM gl_chapters WHERE id = ?', [chapterId]).catch(() => {});
  }
});

const glAuth = () => ({ Authorization: `Bearer ${adminToken}` });

test('refus sans authentification GL', async () => {
  const res = await request(app).get('/api/gl/learning-links');
  assert.ok([401, 403].includes(res.status), `statut inattendu ${res.status}`);
});

test('POST cree un lien QCM lore <-> glossaire lore', async () => {
  const res = await request(app)
    .post('/api/gl/learning-links')
    .set(glAuth())
    .send({
      question_dataset: 'qcm_lore',
      resource_type: 'lore_glossary',
      resource_ref: resourceRef,
      question_code: lqcode,
    })
    .expect(201);
  assert.equal(res.body.link.question_dataset, 'qcm_lore');
  assert.equal(res.body.link.resource_type, 'lore_glossary');
  assert.equal(res.body.link.question_code, lqcode);
});

test('POST sans dataset -> 400', async () => {
  await request(app)
    .post('/api/gl/learning-links')
    .set(glAuth())
    .send({ resource_type: 'lore_glossary', resource_ref: resourceRef, question_code: lqcode })
    .expect(400);
});

test('POST question inexistante -> 404', async () => {
  await request(app)
    .post('/api/gl/learning-links')
    .set(glAuth())
    .send({
      question_dataset: 'qcm_lore',
      resource_type: 'lore_glossary',
      resource_ref: resourceRef,
      question_code: 'LQCM_INCONNU',
    })
    .expect(404);
});

test('GET liste filtree', async () => {
  const res = await request(app)
    .get(`/api/gl/learning-links?questionCode=${lqcode}`)
    .set(glAuth())
    .expect(200);
  assert.ok(res.body.links.some((l) => l.resource_ref === resourceRef));
});

test('settings GET puis PUT granularite', async () => {
  const get = await request(app).get('/api/gl/learning-links/settings').set(glAuth()).expect(200);
  assert.equal(get.body.gating.enabled, false);
  assert.equal(get.body.gating.granularity, 'player');

  const put = await request(app)
    .put('/api/gl/learning-links/settings')
    .set(glAuth())
    .send({ key: 'gating.granularity', value: 'team' })
    .expect(200);
  assert.equal(put.body.value, 'team');
  assert.equal(put.body.gating.granularity, 'team');

  await request(app)
    .put('/api/gl/learning-links/settings')
    .set(glAuth())
    .send({ key: 'gating.granularity', value: 'bidon' })
    .expect(400);

  // Remise a l'etat par defaut pour ne pas influencer d'autres tests.
  await request(app)
    .put('/api/gl/learning-links/settings')
    .set(glAuth())
    .send({ key: 'gating.granularity', value: 'player' })
    .expect(200);
});

test('surcharge de granularite par chapitre et par scope lore', async () => {
  await request(app)
    .put('/api/gl/learning-links/chapter-granularity')
    .set(glAuth())
    .send({ chapterId, granularity: 'team' })
    .expect(200);
  await request(app)
    .put('/api/gl/learning-links/chapter-granularity')
    .set(glAuth())
    .send({ chapterId, granularity: 'bidon' })
    .expect(400);
  await request(app)
    .put('/api/gl/learning-links/scope-granularity')
    .set(glAuth())
    .send({ scopeSlug, granularity: 'player' })
    .expect(200);
});

test('isolement cross-produit : jeton ForetMap rejete sur route GL', async () => {
  const res = await request(app)
    .get('/api/gl/learning-links')
    .set({ Authorization: `Bearer ${fmToken}` });
  assert.ok([401, 403].includes(res.status), `statut inattendu ${res.status}`);
});

test('isolement cross-produit : jeton GL rejete sur route ForetMap', async () => {
  const res = await request(app)
    .get('/api/learning-links')
    .set({ Authorization: `Bearer ${adminToken}` });
  assert.ok([401, 403].includes(res.status), `statut inattendu ${res.status}`);
});

test('POST /review — rejet en masse (phase 2)', async () => {
  const ref = `${resourceRef}R`.slice(0, 64);
  const created = await request(app)
    .post('/api/gl/learning-links')
    .set(glAuth())
    .send({
      question_dataset: 'qcm_lore',
      resource_type: 'lore_glossary',
      resource_ref: ref,
      question_code: lqcode,
      status: 'suggested',
    })
    .expect(201);

  const r = await request(app)
    .post('/api/gl/learning-links/review')
    .set(glAuth())
    .send({ ids: [created.body.link.id], action: 'reject' })
    .expect(200);
  assert.equal(r.body.status, 'rejected');
  assert.equal(r.body.updated, 1);
});

test('DELETE supprime le lien', async () => {
  const list = await request(app)
    .get(`/api/gl/learning-links?questionCode=${lqcode}`)
    .set(glAuth());
  const id = list.body.links.find((l) => l.resource_ref === resourceRef).id;
  await request(app).delete(`/api/gl/learning-links/${id}`).set(glAuth()).expect(200);
});
