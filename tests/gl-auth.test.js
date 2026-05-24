'use strict';

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { execute, initSchema } = require('../database');
const {
  createGlAdmin,
  createGlClass,
  createGlChapterWithMarker,
  createGlGameWithTeams,
  createGlPlayer,
} = require('./helpers/glFixtures');

const PSEUDO_NORMAL = 'equipe_aurore';
const PSEUDO_MUST_RESET = 'equipe_reinit';
let adminId = null;
let classId = null;

before(async () => {
  await initSchema();
  const admin = await createGlAdmin({ email: 'mj.test@ecole.local', displayName: 'MJ Test' });
  const cls = await createGlClass({ name: '6e A', school: 'College Test', adminId: admin.id });
  adminId = Number(admin.id);
  classId = Number(cls.id);
  await createGlPlayer({
    classId: cls.id,
    pseudo: PSEUDO_NORMAL,
    password: 'motdepasse123',
    firstName: 'Aurore',
    lastName: 'Dupont',
    passwordMustReset: false,
  });
  await createGlPlayer({
    classId: cls.id,
    pseudo: PSEUDO_MUST_RESET,
    password: 'ancienpin',
    firstName: 'Lea',
    lastName: 'Martin',
    passwordMustReset: true,
  });
});

test('POST /api/gl/auth/login accepte pseudo + password', async () => {
  const res = await request(app)
    .post('/api/gl/auth/login')
    .send({ pseudo: PSEUDO_NORMAL, pin: 'motdepasse123' })
    .expect(200);
  assert.ok(res.body?.authToken);
  assert.strictEqual(res.body?.auth?.product, 'gl');
  assert.strictEqual(res.body?.auth?.userType, 'gl_player');
  assert.strictEqual(res.body?.auth?.displayName, PSEUDO_NORMAL);
});

test('POST /api/gl/auth/login rejette un mauvais mot de passe', async () => {
  const res = await request(app)
    .post('/api/gl/auth/login')
    .send({ pseudo: PSEUDO_NORMAL, pin: 'mauvais' })
    .expect(401);
  assert.ok(String(res.body?.error || '').includes('incorrect'));
});

test('POST /api/gl/auth/login accepte identifier + password (joueur)', async () => {
  const res = await request(app)
    .post('/api/gl/auth/login')
    .send({ identifier: PSEUDO_NORMAL, password: 'motdepasse123' })
    .expect(200);
  assert.strictEqual(res.body?.auth?.userType, 'gl_player');
});

test('GET /api/gl/auth/me expose first_name / last_name', async () => {
  const login = await request(app)
    .post('/api/gl/auth/login')
    .send({ pseudo: PSEUDO_NORMAL, pin: 'motdepasse123' })
    .expect(200);
  const res = await request(app)
    .get('/api/gl/auth/me')
    .set('Authorization', `Bearer ${login.body.authToken}`)
    .expect(200);
  assert.strictEqual(res.body?.auth?.product, 'gl');
  assert.strictEqual(res.body?.profile?.pseudo, PSEUDO_NORMAL);
  assert.ok(res.body?.profile);
});

test('POST /api/gl/auth/login expose la partie active du joueur assigné', async () => {
  const pseudo = `equipe_game_${Date.now()}`;
  const { chapter } = await createGlChapterWithMarker({
    slug: `auth-game-${Date.now()}`,
    createdBy: adminId,
  });
  const seed = await createGlGameWithTeams({
    classId,
    chapterId: chapter.id,
    createdBy: adminId,
    teams: [{ name: 'Équipe session', type: 'gnome' }],
  });
  const teamId = Number(seed.teams[0].id);
  const player = await createGlPlayer({
    classId,
    teamId,
    pseudo,
    password: 'motdepasse123',
    firstName: 'Session',
    lastName: 'Active',
  });
  await execute(
    `INSERT INTO gl_team_members (game_id, team_id, player_id, joined_at)
     VALUES (?, ?, ?, NOW())`,
    [seed.game.id, teamId, player.id]
  );

  const login = await request(app)
    .post('/api/gl/auth/login')
    .send({ pseudo, pin: 'motdepasse123' })
    .expect(200);

  assert.strictEqual(Number(login.body?.auth?.gameId), Number(seed.game.id));
  assert.strictEqual(Number(login.body?.auth?.teamId), teamId);

  const me = await request(app)
    .get('/api/gl/auth/me')
    .set('Authorization', `Bearer ${login.body.authToken}`)
    .expect(200);
  assert.strictEqual(Number(me.body?.auth?.gameId), Number(seed.game.id));
  assert.strictEqual(Number(me.body?.profile?.activeGameId), Number(seed.game.id));
});
