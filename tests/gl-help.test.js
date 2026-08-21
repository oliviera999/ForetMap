'use strict';

require('./helpers/setup');
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute, queryOne } = require('../database');
const { signAuthToken } = require('../middleware/requireTeacher');
const { createGlAdmin } = require('./helpers/glFixtures');
const { loadDefaultGlHelpConfig } = require('../lib/glHelp');

describe('GL help content API', () => {
  let adminToken;

  // Identité GL relue en base à chaque requête (audit B6) : il faut une vraie ligne.
  before(async () => {
    await initSchema();
    const admin = await createGlAdmin({
      email: `help.mj.${Date.now()}@ecole.local`,
      displayName: 'MJ Help',
    });
    adminToken = await signAuthToken({
      product: 'gl',
      userType: 'gl_admin',
      userId: String(admin.id),
      roleSlug: 'gl_admin',
      permissions: ['gl.read', 'gl.content.manage', 'gl.settings.manage'],
      displayName: 'MJ Help',
    });
  });

  after(async () => {
    await execute("DELETE FROM gl_settings WHERE `key` = 'content.help'").catch(() => {});
  });

  it('GET /api/gl/admin/content/help retourne les défauts', async () => {
    const res = await request(app)
      .get('/api/gl/admin/content/help')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    assert.ok(res.body.entries['tab:maps']?.body);
  });

  // Dégel (§11.2) : la ligne en base ne contient plus que ce qui s'écarte des défauts,
  // sans quoi la première sauvegarde d'un MJ gèlerait le corpus livré avec l'application.
  it('PUT /api/gl/admin/content/help ne stocke que la surcharge', async () => {
    // Partir des défauts : un autre fichier de la suite a pu laisser une surcharge.
    await execute("DELETE FROM gl_settings WHERE `key` = 'content.help'");
    const getRes = await request(app)
      .get('/api/gl/admin/content/help')
      .set('Authorization', `Bearer ${adminToken}`);
    const draft = getRes.body;
    draft.entries['tab:forum'] = { title: 'Forum de la classe', body: 'Consigne maison' };
    await request(app)
      .put('/api/gl/admin/content/help')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(draft)
      .expect(200);

    const row = await queryOne("SELECT value_json FROM gl_settings WHERE `key` = 'content.help'");
    const stored = typeof row.value_json === 'string' ? JSON.parse(row.value_json) : row.value_json;
    assert.deepStrictEqual(Object.keys(stored.entries), ['tab:forum']);

    // Ce qui n'a pas été réécrit continue de suivre le dépôt.
    const check = await request(app)
      .get('/api/gl/content/help')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    assert.equal(check.body.entries['tab:forum'].body, 'Consigne maison');
    assert.equal(
      check.body.entries['tab:maps'].title,
      loadDefaultGlHelpConfig().entries['tab:maps'].title,
    );
  });

  it('PUT /api/gl/admin/content/help persiste une entrée', async () => {
    const getRes = await request(app)
      .get('/api/gl/admin/content/help')
      .set('Authorization', `Bearer ${adminToken}`);
    const draft = getRes.body;
    draft.entries['tab:rules'] = { title: 'Test', body: 'Corps test' };
    await request(app)
      .put('/api/gl/admin/content/help')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(draft)
      .expect(200);
    const check = await request(app)
      .get('/api/gl/content/help')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    assert.equal(check.body.entries['tab:rules'].body, 'Corps test');
  });

  it('POST /api/gl/admin/content/help/reset recharge les défauts', async () => {
    await request(app)
      .post('/api/gl/admin/content/help/reset')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const check = await request(app)
      .get('/api/gl/admin/content/help')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    assert.notEqual(check.body.entries['tab:rules']?.body, 'Corps test');
  });
});
