'use strict';

/**
 * Surcharges éditoriales des visites guidées GL (`content.tour`, table `gl_settings`).
 * Pendant de `tests/tour-content-*.test.js` côté ForetMap.
 */

require('./helpers/setup');
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute, queryOne } = require('../database');
const { signAuthToken } = require('../middleware/requireTeacher');
const { createGlAdmin, createGlClass, createGlPlayer } = require('./helpers/glFixtures');
const { GL_TOUR_REGISTRY_KEY } = require('../lib/glTourContent');

describe('GL — surcharges des visites guidées', () => {
  let adminToken;
  let playerToken;
  const stamp = Date.now();

  before(async () => {
    await initSchema();
    const admin = await createGlAdmin({
      email: `tours.mj.${stamp}@ecole.local`,
      displayName: 'MJ Tours',
    });
    const cls = await createGlClass({ name: `Classe Tours ${stamp}`, adminId: admin.id });
    const player = await createGlPlayer({ classId: cls.id, pseudo: `tours-player-${stamp}` });
    adminToken = await signAuthToken({
      product: 'gl',
      userType: 'gl_admin',
      userId: String(admin.id),
      roleSlug: 'gl_admin',
      permissions: ['gl.read', 'gl.content.manage'],
      displayName: 'MJ Tours',
    });
    playerToken = await signAuthToken({
      product: 'gl',
      userType: 'gl_player',
      userId: String(player.id),
      roleSlug: 'gl_player',
      permissions: ['gl.read'],
      displayName: 'Équipe test',
    });
  });

  after(async () => {
    await execute('DELETE FROM gl_settings WHERE `key` = ?', [GL_TOUR_REGISTRY_KEY]).catch(
      () => {},
    );
  });

  it('sans écriture, le registre est vide — les parcours jouent leurs textes livrés', async () => {
    await execute('DELETE FROM gl_settings WHERE `key` = ?', [GL_TOUR_REGISTRY_KEY]);
    const res = await request(app)
      .get('/api/gl/content/tours')
      .set('Authorization', `Bearer ${playerToken}`)
      .expect(200);
    assert.deepStrictEqual(res.body.registry, {});
  });

  it('un joueur lit les surcharges, mais ne peut pas les écrire', async () => {
    await request(app)
      .put('/api/gl/content/tours')
      .set('Authorization', `Bearer ${playerToken}`)
      .send({ registry: { 'maps.intro.body': 'Tentative' } })
      .expect(403);
  });

  it('sans jeton, ni lecture ni écriture', async () => {
    await request(app).get('/api/gl/content/tours').expect(401);
    await request(app).put('/api/gl/content/tours').send({ registry: {} }).expect(401);
  });

  it('un MJ réécrit une bulle, et le joueur la lit', async () => {
    await request(app)
      .put('/api/gl/content/tours')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ registry: { 'maps.intro.body': '  Version de la classe  ' } })
      .expect(200);

    const res = await request(app)
      .get('/api/gl/content/tours')
      .set('Authorization', `Bearer ${playerToken}`)
      .expect(200);
    // Le texte est rogné à l'enregistrement.
    assert.deepStrictEqual(res.body.registry, { 'maps.intro.body': 'Version de la classe' });
  });

  it('une clé mal formée est refusée — le réglage n’est pas un dépotoir', async () => {
    await request(app)
      .put('/api/gl/content/tours')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ registry: { 'pas-une-cle': 'x' } })
      .expect(400);
    await request(app)
      .put('/api/gl/content/tours')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ registry: { 'maps.intro.target': '#autre' } })
      .expect(400);
  });

  it('vider un champ efface la surcharge plutôt que de stocker du vide', async () => {
    await request(app)
      .put('/api/gl/content/tours')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ registry: { 'maps.intro.body': '   ' } })
      .expect(200);
    const row = await queryOne('SELECT value_json FROM gl_settings WHERE `key` = ? LIMIT 1', [
      GL_TOUR_REGISTRY_KEY,
    ]);
    const stored = typeof row.value_json === 'string' ? JSON.parse(row.value_json) : row.value_json;
    assert.deepStrictEqual(stored, {});
  });

  it('les surcharges GL n’atteignent pas ForetMap', async () => {
    await request(app)
      .put('/api/gl/content/tours')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ registry: { 'maps.intro.body': 'Texte GL' } })
      .expect(200);
    const fm = await request(app).get('/api/settings/public').expect(200);
    const fmRegistry = fm.body?.settings?.content?.tour?.registry || {};
    assert.ok(!('maps.intro.body' in fmRegistry), 'une surcharge GL a fuité vers ForetMap');
  });
});
