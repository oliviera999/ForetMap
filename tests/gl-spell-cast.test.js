'use strict';

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute, queryOne } = require('../database');
const { invalidateGameplayCache, invalidateModulesCache } = require('../lib/glSettings');
const { signAuthToken } = require('../middleware/requireTeacher');
const {
  createGlAdmin,
  createGlClass,
  createGlPlayer,
  createGlChapterWithMarker,
  createGlGameWithTeams,
  assignPlayerToGameTeam,
} = require('./helpers/glFixtures');

const stamp = Date.now();
let gameId = null;
let teamAId = null;
let teamBId = null;
let chapterId = null;
let playerAId = null;
let playerBId = null;
let tokenA = '';
let tokenB = '';

async function enableSpellCast(extra = {}) {
  await execute(
    `INSERT INTO gl_settings (\`key\`, value_json, updated_at)
     VALUES ('gameplay.vitality_enabled', 'true', NOW()),
            ('modules.spell_cast_enabled', 'true', NOW()),
            ('gameplay.spell_cast_contribution_mode', ?, NOW()),
            ('gameplay.spell_cast_team_scope', ?, NOW()),
            ('gameplay.spell_cast_mj_only', ?, NOW())
     ON DUPLICATE KEY UPDATE value_json = VALUES(value_json), updated_at = NOW()`,
    [
      JSON.stringify(extra.contributionMode || 'coordinator'),
      JSON.stringify(extra.teamScope || 'any_team'),
      JSON.stringify(extra.mjOnly === true),
    ],
  );
  invalidateGameplayCache();
  invalidateModulesCache();
}

before(async () => {
  await initSchema();
  await enableSpellCast();

  const admin = await createGlAdmin({
    email: `spellcast.mj.${stamp}@ecole.local`,
    displayName: 'MJ SpellCast',
  });
  const cls = await createGlClass({
    name: `Classe SpellCast ${stamp}`,
    school: 'Ecole Test',
    adminId: admin.id,
  });

  const { chapter } = await createGlChapterWithMarker({
    slug: `ch-spellcast-${stamp}`,
    title: 'Chapitre SpellCast',
  });
  chapterId = Number(chapter.id);

  await execute(
    `INSERT INTO gl_spells (spell_code, category_slug, nom, emoji, cout_gemmes, cout_coeurs, statut, created_at, updated_at)
     VALUES ('SCT01', 'vie', 'Sort gemmes', '💎', 2, 0, 'officiel', NOW(), NOW()),
            ('SCT02', 'vie', 'Sort coeurs', '❤️', 0, 2, 'officiel', NOW(), NOW()),
            ('SCT03', 'vie', 'Sort mixte', '✨', 1, 1, 'officiel', NOW(), NOW())
     ON DUPLICATE KEY UPDATE nom = VALUES(nom), cout_gemmes = VALUES(cout_gemmes),
       cout_coeurs = VALUES(cout_coeurs), updated_at = NOW()`,
  );
  await execute(
    `INSERT INTO gl_chapter_spells (chapter_id, spell_code, order_index)
     VALUES (?, 'SCT01', 0), (?, 'SCT02', 10), (?, 'SCT03', 20)
     ON DUPLICATE KEY UPDATE order_index = VALUES(order_index)`,
    [chapterId, chapterId, chapterId],
  );

  const playerA = await createGlPlayer({
    classId: cls.id,
    pseudo: `sc-a-${stamp}`,
    healthPoints: 5,
    powerPoints: 5,
  });
  const playerB = await createGlPlayer({
    classId: cls.id,
    pseudo: `sc-b-${stamp}`,
    healthPoints: 4,
    powerPoints: 3,
  });
  playerAId = Number(playerA.id);
  playerBId = Number(playerB.id);

  const { game, teams } = await createGlGameWithTeams({
    classId: cls.id,
    chapterId,
    createdBy: admin.id,
    status: 'live',
    name: `Partie SpellCast ${stamp}`,
    teams: [
      { name: 'Gnomes', type: 'gnome' },
      { name: 'Licornes', type: 'unicorn' },
    ],
  });
  gameId = Number(game.id);
  teamAId = Number(teams[0].id);
  teamBId = Number(teams[1].id);

  await assignPlayerToGameTeam({ gameId, teamId: teamAId, playerId: playerAId });
  await assignPlayerToGameTeam({ gameId, teamId: teamAId, playerId: playerBId });

  tokenA = await signAuthToken({
    product: 'gl',
    userType: 'gl_player',
    userId: String(playerAId),
    roleSlug: 'gl_player',
    permissions: ['gl.read', 'gl.action.request'],
    displayName: playerA.pseudo,
    classId: cls.id,
    teamId: teamAId,
    gameId,
  });
  tokenB = await signAuthToken({
    product: 'gl',
    userType: 'gl_player',
    userId: String(playerBId),
    roleSlug: 'gl_player',
    permissions: ['gl.read', 'gl.action.request'],
    displayName: playerB.pseudo,
    classId: cls.id,
    teamId: teamAId,
    gameId,
  });
});

test('module désactivé → 409', async () => {
  await execute(
    `INSERT INTO gl_settings (\`key\`, value_json, updated_at)
     VALUES ('modules.spell_cast_enabled', 'false', NOW())
     ON DUPLICATE KEY UPDATE value_json = VALUES(value_json), updated_at = NOW()`,
  );
  invalidateModulesCache();
  const res = await request(app)
    .post(`/api/gl/games/${gameId}/spell-casts/drafts`)
    .set('Authorization', `Bearer ${tokenA}`)
    .send({ spellCode: 'SCT01', teamId: teamAId });
  assert.strictEqual(res.status, 409);
  await enableSpellCast();
});

test('sort hors chapitre → 400', async () => {
  await execute(
    `INSERT INTO gl_spells (spell_code, category_slug, nom, cout_gemmes, cout_coeurs, statut, created_at, updated_at)
     VALUES ('SCT99', 'vie', 'Hors chapitre', 1, 0, 'officiel', NOW(), NOW())
     ON DUPLICATE KEY UPDATE updated_at = NOW()`,
  );
  const res = await request(app)
    .post(`/api/gl/games/${gameId}/spell-casts/drafts`)
    .set('Authorization', `Bearer ${tokenA}`)
    .send({ spellCode: 'SCT99', teamId: teamAId });
  assert.strictEqual(res.status, 400);
});

test('lancement gemmes : débit et événement spell_cast', async () => {
  const draftRes = await request(app)
    .post(`/api/gl/games/${gameId}/spell-casts/drafts`)
    .set('Authorization', `Bearer ${tokenA}`)
    .send({ spellCode: 'SCT01', teamId: teamAId });
  assert.strictEqual(draftRes.status, 201);
  const draftId = draftRes.body.draft.id;

  await request(app)
    .put(`/api/gl/games/${gameId}/spell-casts/drafts/${draftId}/contributions`)
    .set('Authorization', `Bearer ${tokenA}`)
    .send({
      contributions: [
        { playerId: playerAId, gems: 1, hearts: 0 },
        { playerId: playerBId, gems: 1, hearts: 0 },
      ],
    })
    .expect(200);

  const launchRes = await request(app)
    .post(`/api/gl/games/${gameId}/spell-casts/drafts/${draftId}/launch`)
    .set('Authorization', `Bearer ${tokenA}`);
  assert.strictEqual(launchRes.status, 200);
  assert.strictEqual(launchRes.body.ok, true);
  assert.strictEqual(launchRes.body.event?.eventType, 'spell_cast');
  assert.ok(Number(launchRes.body.event?.id) > 0);

  const rowA = await queryOne('SELECT power_points FROM gl_players WHERE id = ?', [playerAId]);
  const rowB = await queryOne('SELECT power_points FROM gl_players WHERE id = ?', [playerBId]);
  assert.strictEqual(Number(rowA.power_points), 4);
  assert.strictEqual(Number(rowB.power_points), 2);

  const evt = await queryOne(
    `SELECT event_type, payload_json FROM gl_game_events
      WHERE game_id = ? AND event_type = 'spell_cast' ORDER BY id DESC LIMIT 1`,
    [gameId],
  );
  assert.ok(evt);
  const payload = JSON.parse(evt.payload_json);
  assert.strictEqual(payload.spellCode, 'SCT01');
  assert.ok(Array.isArray(payload.casters));
  assert.ok(payload.casters.length >= 1);
  for (const caster of payload.casters) {
    assert.ok(String(caster.displayName || '').length > 0);
    assert.ok(Number(caster.playerId) > 0);
  }
});

test('self_only refuse contribution autre joueur', async () => {
  await enableSpellCast({ contributionMode: 'self_only' });
  const draftRes = await request(app)
    .post(`/api/gl/games/${gameId}/spell-casts/drafts`)
    .set('Authorization', `Bearer ${tokenA}`)
    .send({ spellCode: 'SCT02', teamId: teamAId });
  const draftId = draftRes.body.draft.id;

  const forbidden = await request(app)
    .put(`/api/gl/games/${gameId}/spell-casts/drafts/${draftId}/contributions`)
    .set('Authorization', `Bearer ${tokenA}`)
    .send({ contributions: [{ playerId: playerBId, gems: 0, hearts: 2 }] });
  assert.strictEqual(forbidden.status, 403);

  await request(app)
    .put(`/api/gl/games/${gameId}/spell-casts/drafts/${draftId}/contributions`)
    .set('Authorization', `Bearer ${tokenA}`)
    .send({ contributions: [{ playerId: playerAId, gems: 0, hearts: 2 }] })
    .expect(200);

  await request(app)
    .delete(`/api/gl/games/${gameId}/spell-casts/drafts/${draftId}`)
    .set('Authorization', `Bearer ${tokenA}`)
    .expect(200);

  await enableSpellCast({ contributionMode: 'coordinator' });
});

test('own_team : joueur ne peut pas choisir autre équipe', async () => {
  await enableSpellCast({ teamScope: 'own_team' });
  const res = await request(app)
    .post(`/api/gl/games/${gameId}/spell-casts/drafts`)
    .set('Authorization', `Bearer ${tokenA}`)
    .send({ spellCode: 'SCT01', teamId: teamBId });
  assert.strictEqual(res.status, 403);
  await enableSpellCast({ teamScope: 'any_team' });
});

test('mj_only : joueur refusé, staff autorisé', async () => {
  await enableSpellCast({ mjOnly: true });
  const playerRes = await request(app)
    .post(`/api/gl/games/${gameId}/spell-casts/drafts`)
    .set('Authorization', `Bearer ${tokenA}`)
    .send({ spellCode: 'SCT01', teamId: teamAId });
  assert.strictEqual(playerRes.status, 403);
  assert.match(String(playerRes.body?.error || ''), /MJ/i);

  const mjToken = await signAuthToken({
    product: 'gl',
    userType: 'gl_admin',
    userId: '1',
    roleSlug: 'gl_admin',
    permissions: ['gl.read', 'gl.game.manage', 'gl.event.emit'],
    displayName: 'MJ test',
    classId: null,
    gameId,
  });
  const staffRes = await request(app)
    .post(`/api/gl/games/${gameId}/spell-casts/drafts`)
    .set('Authorization', `Bearer ${mjToken}`)
    .send({ spellCode: 'SCT01', teamId: teamAId });
  assert.strictEqual(staffRes.status, 201);

  await enableSpellCast({ mjOnly: false });
});

test('MJ : brouillon multi-équipes sans teamId, contributions cross-team', async () => {
  await execute(
    'DELETE FROM gl_spell_cast_contributions WHERE draft_id IN (SELECT id FROM gl_spell_cast_drafts WHERE game_id = ?)',
    [gameId],
  );
  await execute('DELETE FROM gl_spell_cast_drafts WHERE game_id = ?', [gameId]);
  await execute('UPDATE gl_players SET health_points = 5, power_points = 5 WHERE id = ?', [
    playerAId,
  ]);
  await execute('UPDATE gl_players SET health_points = 4, power_points = 3 WHERE id = ?', [
    playerBId,
  ]);
  await assignPlayerToGameTeam({ gameId, teamId: teamBId, playerId: playerBId });

  const mjToken = await signAuthToken({
    product: 'gl',
    userType: 'gl_admin',
    userId: '1',
    roleSlug: 'gl_admin',
    permissions: ['gl.read', 'gl.game.manage', 'gl.event.emit'],
    displayName: 'MJ cross-team',
    classId: null,
    gameId,
  });

  const draftRes = await request(app)
    .post(`/api/gl/games/${gameId}/spell-casts/drafts`)
    .set('Authorization', `Bearer ${mjToken}`)
    .send({ spellCode: 'SCT03' });
  assert.strictEqual(draftRes.status, 201);
  assert.strictEqual(draftRes.body.draft.rosterScope, 'game');
  const rosterIds = (draftRes.body.draft.roster || []).map((r) => r.playerId);
  assert.ok(rosterIds.includes(playerAId));
  assert.ok(rosterIds.includes(playerBId));
  const draftId = draftRes.body.draft.id;

  await request(app)
    .put(`/api/gl/games/${gameId}/spell-casts/drafts/${draftId}/contributions`)
    .set('Authorization', `Bearer ${mjToken}`)
    .send({
      contributions: [
        { playerId: playerAId, gems: 1, hearts: 0 },
        { playerId: playerBId, gems: 0, hearts: 1 },
      ],
    })
    .expect(200);

  const launchRes = await request(app)
    .post(`/api/gl/games/${gameId}/spell-casts/drafts/${draftId}/launch`)
    .set('Authorization', `Bearer ${mjToken}`);
  assert.strictEqual(launchRes.status, 200);

  const rowA = await queryOne('SELECT power_points, health_points FROM gl_players WHERE id = ?', [
    playerAId,
  ]);
  const rowB = await queryOne('SELECT power_points, health_points FROM gl_players WHERE id = ?', [
    playerBId,
  ]);
  assert.strictEqual(Number(rowA.power_points), 4);
  assert.strictEqual(Number(rowB.health_points), 3);

  const payload = JSON.parse(
    (
      await queryOne(
        `SELECT payload_json FROM gl_game_events
        WHERE game_id = ? AND event_type = 'spell_cast' ORDER BY id DESC LIMIT 1`,
        [gameId],
      )
    ).payload_json,
  );
  const contribTeams = payload.contributions.map((c) => c.teamId);
  assert.ok(contribTeams.includes(teamAId) || contribTeams.includes(teamBId));

  await assignPlayerToGameTeam({ gameId, teamId: teamAId, playerId: playerBId });
});

test('contribution > solde → 409 CONTRIBUTION_EXCEEDS_BALANCE', async () => {
  const draftRes = await request(app)
    .post(`/api/gl/games/${gameId}/spell-casts/drafts`)
    .set('Authorization', `Bearer ${tokenA}`)
    .send({ spellCode: 'SCT01', teamId: teamAId });
  const draftId = draftRes.body.draft.id;

  const res = await request(app)
    .put(`/api/gl/games/${gameId}/spell-casts/drafts/${draftId}/contributions`)
    .set('Authorization', `Bearer ${tokenA}`)
    .send({ contributions: [{ playerId: playerAId, gems: 99, hearts: 0 }] });
  assert.strictEqual(res.status, 409);
  assert.match(String(res.body?.error || ''), /solde/i);

  await request(app)
    .delete(`/api/gl/games/${gameId}/spell-casts/drafts/${draftId}`)
    .set('Authorization', `Bearer ${tokenA}`)
    .expect(200);
});

test('mj_only : staff peut créer brouillon sans teamId', async () => {
  await enableSpellCast({ mjOnly: true });
  const mjToken = await signAuthToken({
    product: 'gl',
    userType: 'gl_admin',
    userId: '2',
    roleSlug: 'gl_admin',
    permissions: ['gl.read', 'gl.game.manage', 'gl.event.emit'],
    displayName: 'MJ only draft',
    classId: null,
    gameId,
  });
  const res = await request(app)
    .post(`/api/gl/games/${gameId}/spell-casts/drafts`)
    .set('Authorization', `Bearer ${mjToken}`)
    .send({ spellCode: 'SCT02' });
  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.body.draft.rosterScope, 'game');
  await request(app)
    .delete(`/api/gl/games/${gameId}/spell-casts/drafts/${res.body.draft.id}`)
    .set('Authorization', `Bearer ${mjToken}`)
    .expect(200);
  await enableSpellCast({ mjOnly: false });
});
