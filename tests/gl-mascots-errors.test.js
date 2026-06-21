'use strict';

require('./helpers/setup');
const { test, before } = require('node:test');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, queryOne } = require('../database');
const {
  createGlAdmin,
  createGlClass,
  createGlGameWithTeams,
  signTokens,
} = require('./helpers/glFixtures');

let adminToken = '';
let gameId = null;
let teamId = null;

before(async () => {
  await initSchema();
  const stamp = Date.now();
  const admin = await createGlAdmin({ email: `mascots.errors.${stamp}@ecole.local` });
  const cls = await createGlClass({ name: `Classe Mascots Errors ${stamp}`, adminId: admin.id });
  const chapter = await queryOne("SELECT id FROM gl_chapters WHERE slug = 'foret-magique' LIMIT 1");
  const seed = await createGlGameWithTeams({
    classId: cls.id,
    chapterId: chapter.id,
    createdBy: admin.id,
    status: 'live',
    teams: [{ name: 'Error Team', type: 'gnome' }],
  });
  gameId = Number(seed.game.id);
  teamId = Number(seed.teams[0].id);
  const tokens = await signTokens({
    adminId: admin.id,
    adminPermissions: ['gl.read', 'gl.team.manage'],
  });
  adminToken = tokens.adminToken;
});

test('POST /api/gl/mascots/assign valide gameId/teamId/mascotId', async () => {
  await request(app)
    .post('/api/gl/mascots/assign')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ gameId: 'bad', teamId, mascotId: 'gl-gnome-mousse' })
    .expect(400);
  await request(app)
    .post('/api/gl/mascots/assign')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ gameId, teamId: 'bad', mascotId: 'gl-gnome-mousse' })
    .expect(400);
  await request(app)
    .post('/api/gl/mascots/assign')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ gameId, teamId })
    .expect(400);
});

test('POST /api/gl/mascots/assign retourne 404 pour mascotte inconnue', async () => {
  await request(app)
    .post('/api/gl/mascots/assign')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ gameId, teamId, mascotId: 'gl-unknown-mascot' })
    .expect(404);
});
