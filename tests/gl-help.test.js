'use strict';

require('./helpers/setup');
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute } = require('../database');
const { signAuthToken } = require('../middleware/requireTeacher');

describe('GL help content API', () => {
  let adminToken;

  before(async () => {
    await initSchema();
    adminToken = await signAuthToken({
      product: 'gl',
      userType: 'gl_admin',
      userId: '301',
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
