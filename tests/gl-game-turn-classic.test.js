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
let markerId = null;
let playerAId = null;
let playerBId = null;
let tokenA = '';
let mjToken = '';

async function setSettings(map) {
  const entries = Object.entries(map);
  if (!entries.length) return;
  const values = entries.map(() => '(?, ?, NOW())').join(', ');
  const params = [];
  for (const [key, value] of entries) {
    params.push(key, JSON.stringify(value));
  }
  await execute(
    `INSERT INTO gl_settings (\`key\`, value_json, updated_at)
     VALUES ${values}
     ON DUPLICATE KEY UPDATE value_json = VALUES(value_json), updated_at = NOW()`,
    params,
  );
  invalidateGameplayCache();
  invalidateModulesCache();
}

before(async () => {
  await initSchema();
  await setSettings({
    'gameplay.turns_enabled': true,
    'gameplay.vitality_enabled': true,
    'modules.spell_cast_enabled': true,
    'gameplay.spell_cast_contribution_mode': 'coordinator',
    'gameplay.spell_cast_team_scope': 'any_team',
    'gameplay.spell_cast_mj_only': false,
    'gameplay.spell_cast_approval_mode': 'per_spell',
    'gameplay.mascot_move_actor': 'players',
  });

  const admin = await createGlAdmin({
    email: `classic.mj.${stamp}@ecole.local`,
    displayName: 'MJ Classic',
  });
  const cls = await createGlClass({ name: `Classe Classic ${stamp}`, adminId: admin.id });
  const { chapter, marker } = await createGlChapterWithMarker({
    slug: `ch-classic-${stamp}`,
    title: 'Chapitre Classic',
  });
  chapterId = Number(chapter.id);
  markerId = Number(marker.id);

  // Sorts : SAUTO (auto), SAPP (mj_required), SSOLO (solo), SCOLL (collective).
  await execute(
    `INSERT INTO gl_spells (spell_code, category_slug, nom, emoji, cout_gemmes, cout_coeurs, statut, approval_mode, cast_scope, created_at, updated_at)
     VALUES ('SAUTO', 'vie', 'Sort auto', '⚡', 1, 0, 'officiel', 'auto', 'any', NOW(), NOW()),
            ('SAPP', 'vie', 'Sort soumis', '🛡️', 1, 0, 'officiel', 'mj_required', 'any', NOW(), NOW()),
            ('SSOLO', 'vie', 'Sort solo', '🎯', 2, 0, 'officiel', 'auto', 'solo', NOW(), NOW()),
            ('SCOLL', 'vie', 'Sort collectif', '🤝', 2, 0, 'officiel', 'auto', 'collective', NOW(), NOW())
     ON DUPLICATE KEY UPDATE approval_mode = VALUES(approval_mode), cast_scope = VALUES(cast_scope),
       cout_gemmes = VALUES(cout_gemmes), cout_coeurs = VALUES(cout_coeurs), updated_at = NOW()`,
  );
  await execute(
    `INSERT INTO gl_chapter_spells (chapter_id, spell_code, order_index)
     VALUES (?, 'SAUTO', 0), (?, 'SAPP', 10), (?, 'SSOLO', 20), (?, 'SCOLL', 30)
     ON DUPLICATE KEY UPDATE order_index = VALUES(order_index)`,
    [chapterId, chapterId, chapterId, chapterId],
  );

  const playerA = await createGlPlayer({
    classId: cls.id,
    pseudo: `cl-a-${stamp}`,
    healthPoints: 5,
    powerPoints: 5,
  });
  const playerB = await createGlPlayer({
    classId: cls.id,
    pseudo: `cl-b-${stamp}`,
    healthPoints: 5,
    powerPoints: 5,
  });
  playerAId = Number(playerA.id);
  playerBId = Number(playerB.id);

  const { game, teams } = await createGlGameWithTeams({
    classId: cls.id,
    chapterId,
    createdBy: admin.id,
    status: 'live',
    name: `Partie Classic ${stamp}`,
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
  mjToken = await signAuthToken({
    product: 'gl',
    userType: 'gl_admin',
    userId: String(admin.id),
    roleSlug: 'gl_admin',
    permissions: ['gl.read', 'gl.game.manage', 'gl.event.emit'],
    displayName: 'MJ Classic',
    gameId,
  });
});

async function launchSpell(spellCode, gems) {
  const draftRes = await request(app)
    .post(`/api/gl/games/${gameId}/spell-casts/drafts`)
    .set('Authorization', `Bearer ${tokenA}`)
    .send({ spellCode, teamId: teamAId })
    .expect(201);
  const draftId = draftRes.body.draft.id;
  await request(app)
    .put(`/api/gl/games/${gameId}/spell-casts/drafts/${draftId}/contributions`)
    .set('Authorization', `Bearer ${tokenA}`)
    .send({ contributions: gems })
    .expect(200);
  return draftId;
}

test('sort auto : lancement immédiat avec débit', async () => {
  const before = Number(
    (await queryOne('SELECT power_points FROM gl_players WHERE id = ?', [playerAId])).power_points,
  );
  const draftId = await launchSpell('SAUTO', [{ playerId: playerAId, gems: 1, hearts: 0 }]);
  const res = await request(app)
    .post(`/api/gl/games/${gameId}/spell-casts/drafts/${draftId}/launch`)
    .set('Authorization', `Bearer ${tokenA}`)
    .expect(200);
  assert.strictEqual(res.body.event.eventType, 'spell_cast');
  assert.ok(!res.body.pending);
  const after = Number(
    (await queryOne('SELECT power_points FROM gl_players WHERE id = ?', [playerAId])).power_points,
  );
  assert.strictEqual(after, before - 1);
});

test('sort mj_required : joueur soumet → pending, aucun débit ; MJ accepte → débit + cast', async () => {
  const before = Number(
    (await queryOne('SELECT power_points FROM gl_players WHERE id = ?', [playerAId])).power_points,
  );
  const draftId = await launchSpell('SAPP', [{ playerId: playerAId, gems: 1, hearts: 0 }]);
  const submit = await request(app)
    .post(`/api/gl/games/${gameId}/spell-casts/drafts/${draftId}/launch`)
    .set('Authorization', `Bearer ${tokenA}`)
    .expect(200);
  assert.strictEqual(submit.body.pending, true);
  assert.strictEqual(submit.body.event.eventType, 'spell_cast_request');
  assert.strictEqual(submit.body.draft.status, 'pending_approval');
  // Pas de débit tant que le MJ n'a pas validé.
  const pendingBalance = Number(
    (await queryOne('SELECT power_points FROM gl_players WHERE id = ?', [playerAId])).power_points,
  );
  assert.strictEqual(pendingBalance, before);

  // La file MJ liste le sort en attente.
  const pendingList = await request(app)
    .get(`/api/gl/games/${gameId}/spell-casts/pending`)
    .set('Authorization', `Bearer ${mjToken}`)
    .expect(200);
  assert.ok(
    pendingList.body.drafts.some((d) => Number(d.id) === Number(draftId)),
    'le brouillon en attente doit apparaître dans la file MJ',
  );

  const accept = await request(app)
    .post(`/api/gl/games/${gameId}/spell-casts/drafts/${draftId}/resolve`)
    .set('Authorization', `Bearer ${mjToken}`)
    .send({ decision: 'accept' })
    .expect(200);
  assert.strictEqual(accept.body.decision, 'accept');
  assert.strictEqual(accept.body.event.eventType, 'spell_cast');
  const after = Number(
    (await queryOne('SELECT power_points FROM gl_players WHERE id = ?', [playerAId])).power_points,
  );
  assert.strictEqual(after, before - 1);
});

test('sort mj_required : MJ refuse → aucun débit, statut rejected', async () => {
  const before = Number(
    (await queryOne('SELECT power_points FROM gl_players WHERE id = ?', [playerAId])).power_points,
  );
  const draftId = await launchSpell('SAPP', [{ playerId: playerAId, gems: 1, hearts: 0 }]);
  await request(app)
    .post(`/api/gl/games/${gameId}/spell-casts/drafts/${draftId}/launch`)
    .set('Authorization', `Bearer ${tokenA}`)
    .expect(200);
  const reject = await request(app)
    .post(`/api/gl/games/${gameId}/spell-casts/drafts/${draftId}/resolve`)
    .set('Authorization', `Bearer ${mjToken}`)
    .send({ decision: 'reject' })
    .expect(200);
  assert.strictEqual(reject.body.event.eventType, 'spell_cast_rejected');
  const after = Number(
    (await queryOne('SELECT power_points FROM gl_players WHERE id = ?', [playerAId])).power_points,
  );
  assert.strictEqual(after, before);
  const row = await queryOne('SELECT status FROM gl_spell_cast_drafts WHERE id = ?', [draftId]);
  assert.strictEqual(String(row.status), 'rejected');
});

test('portée solo : refus si plusieurs contributeurs', async () => {
  // SSOLO coûte 2 gemmes : deux contributeurs (1+1) couvrent le coût mais violent le scope solo.
  const draftId = await launchSpell('SSOLO', [
    { playerId: playerAId, gems: 1, hearts: 0 },
    { playerId: playerBId, gems: 1, hearts: 0 },
  ]);
  const res = await request(app)
    .post(`/api/gl/games/${gameId}/spell-casts/drafts/${draftId}/launch`)
    .set('Authorization', `Bearer ${tokenA}`);
  assert.strictEqual(res.status, 409);
  assert.match(String(res.body.error || ''), /solo/i);
  await request(app)
    .delete(`/api/gl/games/${gameId}/spell-casts/drafts/${draftId}`)
    .set('Authorization', `Bearer ${tokenA}`)
    .expect(200);
});

test('portée collective : refus si un seul contributeur, accepté à deux', async () => {
  const draftId = await launchSpell('SCOLL', [{ playerId: playerAId, gems: 2, hearts: 0 }]);
  const solo = await request(app)
    .post(`/api/gl/games/${gameId}/spell-casts/drafts/${draftId}/launch`)
    .set('Authorization', `Bearer ${tokenA}`);
  assert.strictEqual(solo.status, 409);
  assert.match(String(solo.body.error || ''), /collectif/i);

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
  const both = await request(app)
    .post(`/api/gl/games/${gameId}/spell-casts/drafts/${draftId}/launch`)
    .set('Authorization', `Bearer ${tokenA}`);
  assert.strictEqual(both.status, 200);
});

test('déplacement mascotte par le joueur : autorisé une fois par tour', async () => {
  await setSettings({ 'gameplay.mascot_move_actor': 'players' });
  // Lance un tour propre.
  await request(app)
    .post(`/api/gl/games/${gameId}/turn/start`)
    .set('Authorization', `Bearer ${mjToken}`)
    .expect(200);

  const move1 = await request(app)
    .post(`/api/gl/games/${gameId}/teams/${teamAId}/move`)
    .set('Authorization', `Bearer ${tokenA}`)
    .send({ markerId });
  assert.strictEqual(move1.status, 201);
  assert.strictEqual(move1.body.eventType, 'move');

  // Deuxième déplacement dans le même tour → refusé.
  const move2 = await request(app)
    .post(`/api/gl/games/${gameId}/teams/${teamAId}/move`)
    .set('Authorization', `Bearer ${tokenA}`)
    .send({ markerId });
  assert.strictEqual(move2.status, 409);

  // Nouveau tour → de nouveau autorisé.
  await request(app)
    .post(`/api/gl/games/${gameId}/turn/start`)
    .set('Authorization', `Bearer ${mjToken}`)
    .expect(200);
  const move3 = await request(app)
    .post(`/api/gl/games/${gameId}/teams/${teamAId}/move`)
    .set('Authorization', `Bearer ${tokenA}`)
    .send({ markerId });
  assert.strictEqual(move3.status, 201);
});

test('déplacement mascotte joueur refusé quand mascot_move_actor = mj', async () => {
  await setSettings({ 'gameplay.mascot_move_actor': 'mj' });
  const res = await request(app)
    .post(`/api/gl/games/${gameId}/teams/${teamAId}/move`)
    .set('Authorization', `Bearer ${tokenA}`)
    .send({ markerId });
  assert.strictEqual(res.status, 403);
  await setSettings({ 'gameplay.mascot_move_actor': 'players' });
});

test('un joueur ne peut pas déplacer la mascotte d’une autre équipe', async () => {
  await request(app)
    .post(`/api/gl/games/${gameId}/turn/start`)
    .set('Authorization', `Bearer ${mjToken}`)
    .expect(200);
  const res = await request(app)
    .post(`/api/gl/games/${gameId}/teams/${teamBId}/move`)
    .set('Authorization', `Bearer ${tokenA}`)
    .send({ markerId });
  assert.strictEqual(res.status, 403);
});
