'use strict';

// Lot 0 — composition automatique des équipes : l'appartenance d'un joueur à une équipe est
// portée PAR PARTIE (`gl_team_members`). Le pointeur global `gl_players.team_id` n'est plus
// écrit ni lu : préparer le chapitre N+1 (brouillon) pendant que le chapitre N tourne ne doit
// plus changer l'équipe vue par le joueur, le gating d'équipe ni la liste admin.

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, queryOne, withTransaction, execute } = require('../database');
const { signAuthToken } = require('../middleware/requireTeacher');
const {
  createGlAdmin,
  createGlClass,
  createGlPlayer,
  createGlChapterWithMarker,
  createGlGameWithTeams,
  signTokens,
} = require('./helpers/glFixtures');
const { assignPlayerToTeamTx, unassignPlayerFromGameTx } = require('../lib/glRoster');
const {
  resolveGlPlayerActiveMembership,
  resolveGlPlayerTeamIdForGame,
} = require('../lib/glPlayerMembership');
const { hydrateGlAuthFromClaims } = require('../lib/auth/glHydration');
const { resolveGlReaderTeamId } = require('../lib/learningGatingAcknowledge');

let admin;
let cls;
let player;
let liveGame;
let draftGame;
let adminToken;

before(async () => {
  await initSchema();
  const stamp = Date.now();
  admin = await createGlAdmin({ email: `mj-membership-${stamp}@ecole.local` });
  cls = await createGlClass({ name: `Classe membership ${stamp}`, adminId: admin.id });
  player = await createGlPlayer({
    classId: cls.id,
    pseudo: `membership-${stamp}`,
    password: '1234',
  });
  const { chapter } = await createGlChapterWithMarker({ slug: `membership-ch-${stamp}` });
  liveGame = await createGlGameWithTeams({
    classId: cls.id,
    chapterId: chapter.id,
    createdBy: admin.id,
    status: 'live',
    name: `Partie N ${stamp}`,
    teams: [{ name: 'Gnomes N', type: 'gnome' }],
  });
  draftGame = await createGlGameWithTeams({
    classId: cls.id,
    chapterId: chapter.id,
    createdBy: admin.id,
    status: 'draft',
    name: `Partie N+1 ${stamp}`,
    teams: [{ name: 'Licornes N+1', type: 'unicorn' }],
  });
  ({ adminToken } = await signTokens({
    adminId: admin.id,
    adminPermissions: ['gl.read', 'gl.players.manage', 'gl.team.manage', 'gl.game.manage'],
  }));

  await withTransaction(async (tx) => {
    await assignPlayerToTeamTx(tx, {
      gameId: liveGame.game.id,
      teamId: liveGame.teams[0].id,
      playerId: player.id,
    });
  });
  // Le chapitre suivant se prépare pendant que la partie en cours tourne.
  await withTransaction(async (tx) => {
    await assignPlayerToTeamTx(tx, {
      gameId: draftGame.game.id,
      teamId: draftGame.teams[0].id,
      playerId: player.id,
    });
  });
});

test('assignPlayerToTeamTx n’écrit plus le pointeur global gl_players.team_id', async () => {
  const row = await queryOne('SELECT team_id FROM gl_players WHERE id = ? LIMIT 1', [player.id]);
  assert.strictEqual(row.team_id, null);
  assert.strictEqual(
    await resolveGlPlayerTeamIdForGame(player.id, liveGame.game.id),
    Number(liveGame.teams[0].id),
  );
  assert.strictEqual(
    await resolveGlPlayerTeamIdForGame(player.id, draftGame.game.id),
    Number(draftGame.teams[0].id),
  );
});

test('resolveGlPlayerActiveMembership préfère la partie live au brouillon plus récent', async () => {
  const membership = await resolveGlPlayerActiveMembership(player.id);
  assert.strictEqual(membership.gameId, Number(liveGame.game.id));
  assert.strictEqual(membership.teamId, Number(liveGame.teams[0].id));
  assert.strictEqual(membership.gameStatus, 'live');

  const preferred = await resolveGlPlayerActiveMembership(player.id, {
    preferredGameId: draftGame.game.id,
  });
  assert.strictEqual(preferred.teamId, Number(draftGame.teams[0].id));
  assert.strictEqual(await resolveGlPlayerActiveMembership(999999999), null);
});

test('login + GET /auth/me exposent l’équipe de la partie en cours, pas celle du brouillon', async () => {
  const login = await request(app)
    .post('/api/gl/auth/login')
    .send({ pseudo: player.pseudo, pin: '1234' })
    .expect(200);
  assert.strictEqual(Number(login.body.auth.teamId), Number(liveGame.teams[0].id));
  assert.strictEqual(Number(login.body.auth.gameId), Number(liveGame.game.id));

  const me = await request(app)
    .get('/api/gl/auth/me')
    .set('Authorization', `Bearer ${login.body.authToken}`)
    .expect(200);
  assert.strictEqual(Number(me.body.auth.teamId), Number(liveGame.teams[0].id));
  assert.strictEqual(Number(me.body.profile.team_id), Number(liveGame.teams[0].id));
  assert.strictEqual(me.body.profile.team_name, 'Gnomes N');
  assert.strictEqual(Number(me.body.profile.activeGameId), Number(liveGame.game.id));
});

test('hydratation : l’équipe suit la base même si le jeton porte une équipe périmée', async () => {
  const { queryOne: dbQueryOne } = require('../database');
  const auth = await hydrateGlAuthFromClaims(
    {
      product: 'gl',
      userType: 'gl_player',
      userId: String(player.id),
      teamId: Number(draftGame.teams[0].id),
    },
    { queryOne: dbQueryOne },
  );
  assert.ok(auth);
  assert.strictEqual(auth.teamId, Number(liveGame.teams[0].id));

  // Jeton portant la partie brouillon : c'est elle qui est visée.
  const scoped = await hydrateGlAuthFromClaims(
    {
      product: 'gl',
      userType: 'gl_player',
      userId: String(player.id),
      gameId: Number(draftGame.game.id),
    },
    { queryOne: dbQueryOne },
  );
  assert.strictEqual(scoped.teamId, Number(draftGame.teams[0].id));
});

test('hydratation : sans appartenance en base, le claim teamId du jeton fait foi', async () => {
  const lonely = await createGlPlayer({ classId: cls.id, pseudo: `lonely-${Date.now()}` });
  const { queryOne: dbQueryOne } = require('../database');
  const auth = await hydrateGlAuthFromClaims(
    { product: 'gl', userType: 'gl_player', userId: String(lonely.id), teamId: 4242 },
    { queryOne: dbQueryOne },
  );
  assert.strictEqual(auth.teamId, 4242);
});

test('gating d’équipe : resolveGlReaderTeamId est scopé à la partie du jeton', async () => {
  const db = require('../database');
  const glAuth = { userType: 'gl_player', userId: String(player.id), teamId: null, gameId: null };
  assert.strictEqual(await resolveGlReaderTeamId(db, glAuth), Number(liveGame.teams[0].id));
  assert.strictEqual(
    await resolveGlReaderTeamId(db, { ...glAuth, gameId: Number(draftGame.game.id) }),
    Number(draftGame.teams[0].id),
  );
  // Staff : pas de joueur derrière, le jeton fait foi.
  assert.strictEqual(
    await resolveGlReaderTeamId(db, { userType: 'gl_admin', userId: '1', teamId: 77 }),
    77,
  );
});

test('liste admin des joueurs : team_id = équipe de la partie active', async () => {
  const res = await request(app)
    .get(`/api/gl/admin/players?classId=${cls.id}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  const rows = Array.isArray(res.body) ? res.body : res.body?.players || res.body?.items || [];
  const row = rows.find((r) => Number(r.id) === Number(player.id));
  assert.ok(row, 'joueur attendu dans la liste admin');
  assert.strictEqual(Number(row.team_id), Number(liveGame.teams[0].id));
});

test('unassign puis fin de la partie live : l’équipe active bascule sur le brouillon', async () => {
  await withTransaction(async (tx) => {
    await unassignPlayerFromGameTx(tx, { gameId: liveGame.game.id, playerId: player.id });
  });
  assert.strictEqual(await resolveGlPlayerTeamIdForGame(player.id, liveGame.game.id), null);
  const membership = await resolveGlPlayerActiveMembership(player.id);
  assert.strictEqual(membership.teamId, Number(draftGame.teams[0].id));

  // Impersonation MJ : le profil renvoyé suit la même règle.
  const staffToken = await signAuthToken({
    product: 'gl',
    userType: 'gl_admin',
    userId: String(admin.id),
    roleSlug: 'gl_admin',
    permissions: ['gl.read', 'gl.players.manage', 'gl.game.manage'],
    displayName: 'Admin membership',
  });
  const imp = await request(app)
    .post('/api/gl/auth/admin/impersonate')
    .set('Authorization', `Bearer ${staffToken}`)
    .send({ userType: 'gl_player', userId: String(player.id) })
    .expect(200);
  assert.strictEqual(Number(imp.body.profile.team_id), Number(draftGame.teams[0].id));
  await execute('UPDATE gl_games SET status = ? WHERE id = ?', ['ended', liveGame.game.id]);
});
