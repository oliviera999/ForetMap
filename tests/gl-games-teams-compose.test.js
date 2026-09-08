'use strict';

// Composition automatique des équipes GL — routes
// POST /api/gl/games/:id/teams/compose/preview et /apply (lot v1).
require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute, queryOne, queryAll } = require('../database');
const {
  createGlAdmin,
  createGlClass,
  createGlPlayer,
  createGlChapterWithMarker,
  createGlGameWithTeams,
  assignPlayerToGameTeam,
  signTokens,
} = require('./helpers/glFixtures');
const { presentJournalEvent } = require('../lib/glJournalPresent');

const stamp = Date.now();
let admin;
let cls;
let players = [];
let chapter;
let draftGame;
let fullToken;
let teamOnlyToken;
let playerToken;

const url = (gameId, action) => `/api/gl/games/${gameId}/teams/compose/${action}`;

before(async () => {
  await initSchema();
  admin = await createGlAdmin({ email: `compose-${stamp}@ecole.local` });
  cls = await createGlClass({ name: `Classe compose ${stamp}`, adminId: admin.id });
  ({ chapter } = await createGlChapterWithMarker({
    slug: `compose-ch-${stamp}`,
    title: 'Les Sources du Nord',
  }));
  players = [];
  for (let i = 0; i < 11; i += 1) {
    players.push(
      await createGlPlayer({
        classId: cls.id,
        pseudo: `compose-${stamp}-${i}`,
        firstName: `P${i}`,
        lastName: `N${i}`,
        isActive: i !== 10, // le 11e est inactif
      }),
    );
  }
  draftGame = await createGlGameWithTeams({
    classId: cls.id,
    chapterId: chapter.id,
    createdBy: admin.id,
    status: 'draft',
    name: `Partie compose ${stamp}`,
    teams: [],
  });
  const full = await signTokens({
    adminId: admin.id,
    adminPermissions: ['gl.read', 'gl.game.manage', 'gl.team.manage', 'gl.players.manage'],
    playerId: players[0].id,
  });
  fullToken = full.adminToken;
  playerToken = full.playerToken;
  ({ adminToken: teamOnlyToken } = await signTokens({
    adminId: admin.id,
    adminPermissions: ['gl.read', 'gl.team.manage'],
  }));
});

test('preview : 401 sans jeton, 403 joueur ; le staff (droits RBAC relus en base) passe', async () => {
  await request(app).post(url(draftGame.game.id, 'preview')).send({}).expect(401);
  await request(app)
    .post(url(draftGame.game.id, 'preview'))
    .set('Authorization', `Bearer ${playerToken}`)
    .send({})
    .expect(403);
  // Les permissions du jeton ne sont jamais lues (hydratation B6) : un staff GL porte toujours
  // `gl.team.manage` + `gl.players.manage` via son rôle, même si le jeton en liste moins.
  await request(app)
    .post(url(draftGame.game.id, 'preview'))
    .set('Authorization', `Bearer ${teamOnlyToken}`)
    .send({})
    .expect(200);
});

test('garde gl.players.manage : refus 403 quand la permission manque à l’auth hydratée', () => {
  const { hasGlPermission } = require('../middleware/requireGlAuth');
  assert.equal(hasGlPermission({ permissions: ['gl.team.manage'] }, 'gl.players.manage'), false);
  assert.equal(
    hasGlPermission({ permissions: ['gl.team.manage', 'gl.players.manage'] }, 'gl.players.manage'),
    true,
  );
});

test('preview : 404 partie inconnue, 400 recette inconnue', async () => {
  const notFound = await request(app)
    .post(url(999999999, 'preview'))
    .set('Authorization', `Bearer ${fullToken}`)
    .send({})
    .expect(404);
  assert.equal(notFound.body.code, 'GAME_NOT_FOUND');
  const bad = await request(app)
    .post(url(draftGame.game.id, 'preview'))
    .set('Authorization', `Bearer ${fullToken}`)
    .send({ recipe: 'telepathie' })
    .expect(400);
  assert.equal(bad.body.code, 'INVALID_RECIPE');
});

test('preview : 409 GAME_NOT_DRAFT sur une partie live', async () => {
  const live = await createGlGameWithTeams({
    classId: cls.id,
    chapterId: chapter.id,
    createdBy: admin.id,
    status: 'live',
    name: `Partie live compose ${stamp}`,
  });
  const res = await request(app)
    .post(url(live.game.id, 'preview'))
    .set('Authorization', `Bearer ${fullToken}`)
    .send({})
    .expect(409);
  assert.equal(res.body.code, 'GAME_NOT_DRAFT');
});

test('preview : 409 NOT_ENOUGH_PLAYERS pour une classe vide', async () => {
  const empty = await createGlClass({ name: `Classe vide ${stamp}`, adminId: admin.id });
  const game = await createGlGameWithTeams({
    classId: empty.id,
    chapterId: chapter.id,
    createdBy: admin.id,
    status: 'draft',
    name: `Partie vide ${stamp}`,
  });
  const res = await request(app)
    .post(url(game.game.id, 'preview'))
    .set('Authorization', `Bearer ${fullToken}`)
    .send({})
    .expect(409);
  assert.equal(res.body.code, 'NOT_ENOUGH_PLAYERS');
});

test('preview random : proposition complète, déterministe, sans écriture ni score', async () => {
  const body = { recipe: 'random', teamSize: 4, seed: 'brume-4172' };
  const res = await request(app)
    .post(url(draftGame.game.id, 'preview'))
    .set('Authorization', `Bearer ${fullToken}`)
    .send(body)
    .expect(200);
  const p = res.body;
  assert.equal(p.recipe, 'random');
  assert.equal(p.seed, 'brume-4172');
  // 10 actifs / taille 4 ⇒ 3 équipes (arrondi), peuples alternés, ≥ 1 de chaque.
  assert.equal(p.teamCount, 3);
  assert.equal(p.teams.length, 3);
  const all = p.teams.flatMap((t) => t.members.map((m) => m.playerId)).sort((a, b) => a - b);
  assert.deepEqual(
    all,
    players
      .slice(0, 10)
      .map((x) => Number(x.id))
      .sort((a, b) => a - b),
  );
  assert.ok(p.teams.some((t) => t.type === 'gnome') && p.teams.some((t) => t.type === 'unicorn'));
  assert.ok(p.teams.every((t) => t.name && /^#[0-9a-f]{6}$/i.test(t.color) && t.mascotId));
  assert.equal(new Set(p.teams.map((t) => t.name)).size, 3);
  assert.equal(new Set(p.teams.map((t) => t.mascotId)).size, 3);
  // Le vocabulaire du chapitre est utilisé.
  assert.ok(
    p.teams.some((t) => ['Sources', 'Nord'].includes(t.name)),
    p.teams.map((t) => t.name),
  );
  // Joueur inactif écarté et signalé.
  assert.equal(p.excluded.length, 1);
  assert.equal(Number(p.excluded[0].playerId), Number(players[10].id));
  assert.ok(p.warnings.some((w) => w.code === 'INACTIVE_EXCLUDED'));
  assert.ok(Array.isArray(p.explain) && p.explain.length >= 2);
  // Aucun score individuel dans la réponse.
  for (const t of p.teams) {
    for (const m of t.members) {
      assert.deepEqual(Object.keys(m).sort(), [
        'firstName',
        'isActive',
        'lastName',
        'pinned',
        'playerId',
        'pseudo',
      ]);
    }
  }
  // Rien n'a été écrit.
  const teams = await queryAll('SELECT id FROM gl_teams WHERE game_id = ?', [draftGame.game.id]);
  assert.equal(teams.length, 0);
  // Déterminisme.
  const again = await request(app)
    .post(url(draftGame.game.id, 'preview'))
    .set('Authorization', `Bearer ${fullToken}`)
    .send(body)
    .expect(200);
  assert.deepEqual(again.body.teams, p.teams);
  // includeInactive : le 11e rejoint le pool.
  const inclusive = await request(app)
    .post(url(draftGame.game.id, 'preview'))
    .set('Authorization', `Bearer ${fullToken}`)
    .send({ ...body, includeInactive: true, teamCount: 2 })
    .expect(200);
  assert.equal(inclusive.body.stats.players, 11);
  assert.equal(inclusive.body.teamCount, 2);
});

test('preview carry_over sans partie précédente : repli random + NO_PREVIOUS_GAME', async () => {
  const res = await request(app)
    .post(url(draftGame.game.id, 'preview'))
    .set('Authorization', `Bearer ${fullToken}`)
    .send({ recipe: 'carry_over' })
    .expect(200);
  assert.equal(res.body.recipe, 'random');
  assert.equal(res.body.requestedRecipe, 'carry_over');
  assert.ok(res.body.warnings.some((w) => w.code === 'NO_PREVIOUS_GAME'));
});

test('apply : 400 INVALID_MEMBER (joueur d’une autre classe), 400 équipe invalide', async () => {
  const other = await createGlClass({ name: `Classe autre ${stamp}`, adminId: admin.id });
  const intruder = await createGlPlayer({ classId: other.id, pseudo: `intrus-${stamp}` });
  const res = await request(app)
    .post(url(draftGame.game.id, 'apply'))
    .set('Authorization', `Bearer ${fullToken}`)
    .send({
      teams: [
        { name: 'A', type: 'gnome', memberIds: [players[0].id, intruder.id] },
        { name: 'B', type: 'unicorn', memberIds: [players[1].id] },
      ],
    })
    .expect(400);
  assert.equal(res.body.code, 'INVALID_MEMBER');
  const dup = await request(app)
    .post(url(draftGame.game.id, 'apply'))
    .set('Authorization', `Bearer ${fullToken}`)
    .send({
      teams: [
        { name: 'A', type: 'gnome', memberIds: [players[0].id] },
        { name: 'B', type: 'unicorn', memberIds: [players[0].id] },
      ],
    })
    .expect(400);
  assert.equal(dup.body.code, 'INVALID_MEMBER');
  const badTeam = await request(app)
    .post(url(draftGame.game.id, 'apply'))
    .set('Authorization', `Bearer ${fullToken}`)
    .send({ teams: [{ name: '', type: 'gnome', memberIds: [players[0].id] }] })
    .expect(400);
  assert.equal(badTeam.body.code, 'INVALID_TEAM');
  const none = await queryAll('SELECT id FROM gl_teams WHERE game_id = ?', [draftGame.game.id]);
  assert.equal(none.length, 0, 'aucune écriture partielle');
});

test('apply : crée les équipes, affecte les joueurs, un seul événement teams_composed', async () => {
  const preview = await request(app)
    .post(url(draftGame.game.id, 'preview'))
    .set('Authorization', `Bearer ${fullToken}`)
    .send({ recipe: 'random', teamCount: 3, seed: 'sente-1234' })
    .expect(200);
  const res = await request(app)
    .post(url(draftGame.game.id, 'apply'))
    .set('Authorization', `Bearer ${fullToken}`)
    .send({ teams: preview.body.teams, recipe: preview.body.recipe, seed: preview.body.seed })
    .expect(201);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.replaced, false);
  assert.equal(res.body.teams.length, 3);
  const teams = await queryAll(
    'SELECT id, name, type, color, mascot_id FROM gl_teams WHERE game_id = ?',
    [draftGame.game.id],
  );
  assert.equal(teams.length, 3);
  const members = await queryAll(
    'SELECT player_id, team_id FROM gl_team_members WHERE game_id = ?',
    [draftGame.game.id],
  );
  assert.equal(members.length, 10);
  const events = await queryAll(
    "SELECT actor_type, actor_id, payload_json FROM gl_game_events WHERE game_id = ? AND event_type = 'teams_composed'",
    [draftGame.game.id],
  );
  assert.equal(events.length, 1);
  assert.equal(events[0].actor_type, 'mj');
  assert.equal(String(events[0].actor_id), String(admin.id));
  const payload = JSON.parse(events[0].payload_json);
  assert.equal(payload.recipe, 'random');
  assert.equal(payload.seed, 'sente-1234');
  assert.equal(payload.teamCount, 3);
  assert.equal(payload.playerCount, 10);
  assert.ok(!JSON.stringify(payload).includes('composite'));
  // Le journal sait le présenter (MJ et joueur).
  const evt = res.body.event;
  assert.match(presentJournalEvent(evt).body, /composé 3 équipes/);
  assert.match(presentJournalEvent(evt, { forPlayer: true }).body, /formé 3 équipes/);
  // Le pointeur global n'est pas réécrit (lot 0).
  const p0 = await queryOne('SELECT team_id FROM gl_players WHERE id = ?', [players[0].id]);
  assert.equal(p0.team_id, null);
});

test('apply : 409 TEAMS_NOT_EMPTY sans replaceExisting, puis remplacement effectif', async () => {
  const preview = await request(app)
    .post(url(draftGame.game.id, 'preview'))
    .set('Authorization', `Bearer ${fullToken}`)
    .send({ recipe: 'random', teamCount: 2, seed: 'source-9999' })
    .expect(200);
  assert.ok(preview.body.warnings.some((w) => w.code === 'TEAMS_NOT_EMPTY'));
  assert.equal(preview.body.existingTeams.length, 3);
  const refused = await request(app)
    .post(url(draftGame.game.id, 'apply'))
    .set('Authorization', `Bearer ${fullToken}`)
    .send({ teams: preview.body.teams })
    .expect(409);
  assert.equal(refused.body.code, 'TEAMS_NOT_EMPTY');
  const replaced = await request(app)
    .post(url(draftGame.game.id, 'apply'))
    .set('Authorization', `Bearer ${fullToken}`)
    .send({ teams: preview.body.teams, replaceExisting: true, recipe: 'random' })
    .expect(201);
  assert.equal(replaced.body.replaced, true);
  const teams = await queryAll('SELECT id FROM gl_teams WHERE game_id = ?', [draftGame.game.id]);
  assert.equal(teams.length, 2);
  const members = await queryAll('SELECT player_id FROM gl_team_members WHERE game_id = ?', [
    draftGame.game.id,
  ]);
  assert.equal(members.length, 10);
});

test('carry_over reprend les équipes de la partie précédente et place les nouveaux', async () => {
  // La partie composée ci-dessus devient la « précédente » (terminée).
  await execute('UPDATE gl_games SET status = ? WHERE id = ?', ['ended', draftGame.game.id]);
  const previousTeams = await queryAll(
    'SELECT id, name, type FROM gl_teams WHERE game_id = ? ORDER BY id',
    [draftGame.game.id],
  );
  const newcomer = await createGlPlayer({ classId: cls.id, pseudo: `newcomer-${stamp}` });
  const next = await createGlGameWithTeams({
    classId: cls.id,
    chapterId: chapter.id,
    createdBy: admin.id,
    status: 'draft',
    name: `Partie suivante ${stamp}`,
  });
  const res = await request(app)
    .post(url(next.game.id, 'preview'))
    .set('Authorization', `Bearer ${fullToken}`)
    .send({ recipe: 'carry_over' })
    .expect(200);
  assert.equal(res.body.recipe, 'carry_over');
  assert.equal(res.body.teams.length, previousTeams.length);
  assert.deepEqual(
    res.body.teams.map((t) => t.name).sort(),
    previousTeams.map((t) => t.name).sort(),
  );
  const all = res.body.teams.flatMap((t) => t.members.map((m) => m.playerId));
  assert.ok(all.includes(Number(newcomer.id)));
  assert.equal(all.length, 11);
  assert.ok(res.body.warnings.some((w) => w.code === 'CARRY_OVER_SOURCE'));
  // random_memory sur cette classe : l'historique est pris en compte.
  const memory = await request(app)
    .post(url(next.game.id, 'preview'))
    .set('Authorization', `Bearer ${fullToken}`)
    .send({ recipe: 'random_memory', teamCount: 2, seed: 'lande-1111' })
    .expect(200);
  assert.equal(memory.body.stats.historyGames, 1);
  assert.ok(memory.body.stats.newPairs > 0);
  assert.ok(memory.body.explain.some((line) => /inédit/.test(line)));
});

test('apply refuse une partie qui n’est plus en préparation', async () => {
  const res = await request(app)
    .post(url(draftGame.game.id, 'apply'))
    .set('Authorization', `Bearer ${fullToken}`)
    .send({
      teams: [{ name: 'X', type: 'gnome', memberIds: [players[0].id] }],
      replaceExisting: true,
    })
    .expect(409);
  assert.equal(res.body.code, 'GAME_NOT_DRAFT');
  // Sanity : la fixture d'affectation directe reste utilisable dans d'autres tests.
  await assignPlayerToGameTeam({
    gameId: draftGame.game.id,
    teamId: (
      await queryOne('SELECT id FROM gl_teams WHERE game_id = ? LIMIT 1', [draftGame.game.id])
    ).id,
    playerId: players[0].id,
  });
});
