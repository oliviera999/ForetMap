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
let adminId = null;

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
  adminId = admin.id;
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
    `INSERT INTO gl_spells (spell_code, category_slug, nom, emoji, cout_gemmes, cout_coeurs, effet_court, statut, created_at, updated_at)
     VALUES ('SCT01', 'vie', 'Sort gemmes', '💎', 2, 0, 'Rend un cœur à un camarade', 'officiel', NOW(), NOW()),
            ('SCT02', 'vie', 'Sort coeurs', '❤️', 0, 2, NULL, 'officiel', NOW(), NOW()),
            ('SCT03', 'vie', 'Sort mixte', '✨', 1, 1, NULL, 'officiel', NOW(), NOW())
     ON DUPLICATE KEY UPDATE nom = VALUES(nom), cout_gemmes = VALUES(cout_gemmes),
       cout_coeurs = VALUES(cout_coeurs), effet_court = VALUES(effet_court), updated_at = NOW()`,
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
    userId: String(adminId),
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
    userId: String(adminId),
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
    userId: String(adminId),
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

// --- Correctifs issus de docs/AUDIT_SORTILEGES.md ---

/** Remet les soldes des deux joueurs et purge les brouillons de la partie. */
async function resetSpellCastState({ health = 10, power = 10 } = {}) {
  await execute(
    `DELETE FROM gl_spell_cast_contributions
      WHERE draft_id IN (SELECT id FROM gl_spell_cast_drafts WHERE game_id = ?)`,
    [gameId],
  );
  await execute('DELETE FROM gl_spell_cast_drafts WHERE game_id = ?', [gameId]);
  await execute('UPDATE gl_players SET health_points = ?, power_points = ? WHERE id IN (?, ?)', [
    health,
    power,
    playerAId,
    playerBId,
  ]);
}

async function setApprovalMode(mode) {
  await execute(
    `INSERT INTO gl_settings (\`key\`, value_json, updated_at)
     VALUES ('gameplay.spell_cast_approval_mode', ?, NOW())
     ON DUPLICATE KEY UPDATE value_json = VALUES(value_json), updated_at = NOW()`,
    [JSON.stringify(mode)],
  );
  invalidateGameplayCache();
}

function mjTokenForGame() {
  return signAuthToken({
    product: 'gl',
    userType: 'gl_admin',
    userId: String(adminId),
    roleSlug: 'gl_admin',
    permissions: ['gl.read', 'gl.game.manage', 'gl.event.emit'],
    displayName: 'MJ audit',
    classId: null,
    gameId,
  });
}

// S2 — double clic / deux onglets : un seul débit, un seul événement.
test('audit S2 : deux lancements concurrents ne débitent qu’une fois', async () => {
  await resetSpellCastState();

  const draftRes = await request(app)
    .post(`/api/gl/games/${gameId}/spell-casts/drafts`)
    .set('Authorization', `Bearer ${tokenA}`)
    .send({ spellCode: 'SCT01', teamId: teamAId })
    .expect(201);
  const draftId = draftRes.body.draft.id;

  await request(app)
    .put(`/api/gl/games/${gameId}/spell-casts/drafts/${draftId}/contributions`)
    .set('Authorization', `Bearer ${tokenA}`)
    .send({ contributions: [{ playerId: playerAId, gems: 2, hearts: 0 }] })
    .expect(200);

  const [r1, r2] = await Promise.all([
    request(app)
      .post(`/api/gl/games/${gameId}/spell-casts/drafts/${draftId}/launch`)
      .set('Authorization', `Bearer ${tokenA}`),
    request(app)
      .post(`/api/gl/games/${gameId}/spell-casts/drafts/${draftId}/launch`)
      .set('Authorization', `Bearer ${tokenA}`),
  ]);
  assert.deepStrictEqual([r1.status, r2.status].sort(), [200, 409]);

  const row = await queryOne('SELECT power_points FROM gl_players WHERE id = ?', [playerAId]);
  assert.strictEqual(Number(row.power_points), 8, 'débit unique (10 - 2)');

  const countRow = await queryOne(
    `SELECT COUNT(*) AS c FROM gl_game_events
      WHERE game_id = ? AND event_type = 'spell_cast'
        AND CAST(JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.draftId')) AS UNSIGNED) = ?`,
    [gameId, draftId],
  );
  assert.strictEqual(Number(countRow.c), 1, 'un seul événement spell_cast');
});

// S3 — SCT02 ne coûte que des cœurs : aucune gemme ne doit pouvoir y être versée.
test('audit S3 : contribution sur un axe à coût nul → 400, aucun débit', async () => {
  await resetSpellCastState();

  const draftRes = await request(app)
    .post(`/api/gl/games/${gameId}/spell-casts/drafts`)
    .set('Authorization', `Bearer ${tokenA}`)
    .send({ spellCode: 'SCT02', teamId: teamAId })
    .expect(201);
  const draftId = draftRes.body.draft.id;

  const refused = await request(app)
    .put(`/api/gl/games/${gameId}/spell-casts/drafts/${draftId}/contributions`)
    .set('Authorization', `Bearer ${tokenA}`)
    .send({ contributions: [{ playerId: playerAId, gems: 3, hearts: 2 }] });
  assert.strictEqual(refused.status, 400);
  assert.match(String(refused.body?.error || ''), /gemme/i);

  const stored = await queryOne(
    'SELECT COUNT(*) AS c FROM gl_spell_cast_contributions WHERE draft_id = ?',
    [draftId],
  );
  assert.strictEqual(Number(stored.c), 0, 'aucune contribution enregistrée');

  // Le sort reste lançable sur son seul axe légitime.
  await request(app)
    .put(`/api/gl/games/${gameId}/spell-casts/drafts/${draftId}/contributions`)
    .set('Authorization', `Bearer ${tokenA}`)
    .send({ contributions: [{ playerId: playerAId, gems: 0, hearts: 2 }] })
    .expect(200);
  await request(app)
    .post(`/api/gl/games/${gameId}/spell-casts/drafts/${draftId}/launch`)
    .set('Authorization', `Bearer ${tokenA}`)
    .expect(200);
  const after = await queryOne('SELECT health_points, power_points FROM gl_players WHERE id = ?', [
    playerAId,
  ]);
  assert.strictEqual(Number(after.health_points), 8, 'cœurs débités');
  assert.strictEqual(Number(after.power_points), 10, 'gemmes intactes');
});

// S10 — un sort déjà soumis au MJ ne peut pas être re-soumis en parallèle.
test('audit S10 : un second brouillon du même sort en attente MJ → 409', async () => {
  await resetSpellCastState();
  await setApprovalMode('mj_required');
  try {
    const draftRes = await request(app)
      .post(`/api/gl/games/${gameId}/spell-casts/drafts`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ spellCode: 'SCT01', teamId: teamAId })
      .expect(201);
    const draftId = draftRes.body.draft.id;
    await request(app)
      .put(`/api/gl/games/${gameId}/spell-casts/drafts/${draftId}/contributions`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ contributions: [{ playerId: playerAId, gems: 2, hearts: 0 }] })
      .expect(200);
    const submit = await request(app)
      .post(`/api/gl/games/${gameId}/spell-casts/drafts/${draftId}/launch`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    assert.strictEqual(submit.body.pending, true);

    const second = await request(app)
      .post(`/api/gl/games/${gameId}/spell-casts/drafts`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ spellCode: 'SCT01', teamId: teamAId });
    assert.strictEqual(second.status, 409);
    assert.match(String(second.body?.error || ''), /validation/i);

    // Un autre sort reste ouvrable : c'est bien le doublon qui est refusé.
    await request(app)
      .post(`/api/gl/games/${gameId}/spell-casts/drafts`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ spellCode: 'SCT03', teamId: teamAId })
      .expect(201);
  } finally {
    await setApprovalMode('per_spell');
  }
});

// S9 — la portée solo/collectif est rejouée avant le débit, comme la restriction de peuple.
test('audit S9 : portée devenue « solo » pendant l’attente → acceptation MJ refusée', async () => {
  await resetSpellCastState();
  await setApprovalMode('mj_required');
  const mjToken = await mjTokenForGame();
  try {
    const draftRes = await request(app)
      .post(`/api/gl/games/${gameId}/spell-casts/drafts`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ spellCode: 'SCT03', teamId: teamAId })
      .expect(201);
    const draftId = draftRes.body.draft.id;
    await request(app)
      .put(`/api/gl/games/${gameId}/spell-casts/drafts/${draftId}/contributions`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        contributions: [
          { playerId: playerAId, gems: 1, hearts: 0 },
          { playerId: playerBId, gems: 0, hearts: 1 },
        ],
      })
      .expect(200);
    await request(app)
      .post(`/api/gl/games/${gameId}/spell-casts/drafts/${draftId}/launch`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);

    await execute("UPDATE gl_spells SET cast_scope = 'solo' WHERE spell_code = 'SCT03'");

    const accept = await request(app)
      .post(`/api/gl/games/${gameId}/spell-casts/drafts/${draftId}/resolve`)
      .set('Authorization', `Bearer ${mjToken}`)
      .send({ decision: 'accept' });
    assert.strictEqual(accept.status, 409);
    assert.match(String(accept.body?.error || ''), /solo/i);

    const balances = await queryOne(
      'SELECT health_points, power_points FROM gl_players WHERE id = ?',
      [playerAId],
    );
    assert.strictEqual(Number(balances.power_points), 10, 'aucun débit après refus');
  } finally {
    await execute("UPDATE gl_spells SET cast_scope = 'any' WHERE spell_code = 'SCT03'");
    await setApprovalMode('per_spell');
  }
});

// S11 — « MJ seul » réserve le lancement, pas la lecture du pot.
test('audit S11 : en mj_only, un joueur consulte encore le brouillon mais ne lance pas', async () => {
  await resetSpellCastState();
  const mjToken = await mjTokenForGame();
  const draftRes = await request(app)
    .post(`/api/gl/games/${gameId}/spell-casts/drafts`)
    .set('Authorization', `Bearer ${mjToken}`)
    .send({ spellCode: 'SCT01', teamId: teamAId })
    .expect(201);
  const draftId = draftRes.body.draft.id;

  await enableSpellCast({ mjOnly: true });
  try {
    const read = await request(app)
      .get(`/api/gl/games/${gameId}/spell-casts/drafts/${draftId}`)
      .set('Authorization', `Bearer ${tokenA}`);
    assert.strictEqual(read.status, 200, 'la lecture reste ouverte au joueur');
    assert.strictEqual(Number(read.body.draft.id), Number(draftId));

    const write = await request(app)
      .put(`/api/gl/games/${gameId}/spell-casts/drafts/${draftId}/contributions`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ contributions: [{ playerId: playerAId, gems: 2, hearts: 0 }] });
    assert.strictEqual(write.status, 403, 'l’écriture reste réservée au MJ');
  } finally {
    await enableSpellCast({ mjOnly: false });
  }
});

// --- Arbitrages G11 / G12 (docs/reference/INCOHERENCES.md) ---

// G12 — un joueur ne dépense que SA vitalité et ne vise que SON équipe, sauf réglage
// explicite de l'admin. Le MJ, lui, répartit toujours pour qui il veut.
test('audit G12 : par défaut, un joueur ne peut pas dépenser la vitalité d’un camarade', async () => {
  await resetSpellCastState();
  // Réglages « sortis d'usine » : on efface les clés pour retomber sur les défauts du code.
  await execute(
    `DELETE FROM gl_settings
      WHERE \`key\` IN ('gameplay.spell_cast_contribution_mode', 'gameplay.spell_cast_team_scope')`,
  );
  invalidateGameplayCache();
  try {
    const settings = await request(app)
      .get('/api/gl/spell-cast-settings')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    assert.strictEqual(settings.body.settings.contributionMode, 'self_only');
    assert.strictEqual(settings.body.settings.teamScope, 'own_team');

    const draftRes = await request(app)
      .post(`/api/gl/games/${gameId}/spell-casts/drafts`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ spellCode: 'SCT01', teamId: teamAId })
      .expect(201);
    const draftId = draftRes.body.draft.id;

    // A tente de dépenser les gemmes de B : refusé.
    const refused = await request(app)
      .put(`/api/gl/games/${gameId}/spell-casts/drafts/${draftId}/contributions`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ contributions: [{ playerId: playerBId, gems: 2, hearts: 0 }] });
    assert.strictEqual(refused.status, 403);

    // Sa propre part reste évidemment permise.
    await request(app)
      .put(`/api/gl/games/${gameId}/spell-casts/drafts/${draftId}/contributions`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ contributions: [{ playerId: playerAId, gems: 2, hearts: 0 }] })
      .expect(200);

    // Le MJ, lui, répartit pour n'importe qui.
    const mjToken = await mjTokenForGame();
    await request(app)
      .put(`/api/gl/games/${gameId}/spell-casts/drafts/${draftId}/contributions`)
      .set('Authorization', `Bearer ${mjToken}`)
      .send({ contributions: [{ playerId: playerBId, gems: 0, hearts: 0 }] })
      .expect(200);
  } finally {
    await enableSpellCast();
  }
});

test('audit G12 : par défaut, un joueur ne vise pas une autre équipe', async () => {
  await resetSpellCastState();
  await execute(
    `DELETE FROM gl_settings
      WHERE \`key\` IN ('gameplay.spell_cast_contribution_mode', 'gameplay.spell_cast_team_scope')`,
  );
  invalidateGameplayCache();
  try {
    const res = await request(app)
      .post(`/api/gl/games/${gameId}/spell-casts/drafts`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ spellCode: 'SCT01', teamId: teamBId });
    assert.strictEqual(res.status, 403);
  } finally {
    await enableSpellCast();
  }
});

// G11 — le logiciel n'exécute pas l'effet : il rappelle au MJ de l'appliquer et garde
// la trace du moment où il l'a fait.
test('audit G11 : un sort lancé entre dans la file « à appliquer », puis en sort une fois coché', async () => {
  await resetSpellCastState();
  const mjToken = await mjTokenForGame();

  const draftRes = await request(app)
    .post(`/api/gl/games/${gameId}/spell-casts/drafts`)
    .set('Authorization', `Bearer ${tokenA}`)
    .send({ spellCode: 'SCT01', teamId: teamAId })
    .expect(201);
  const draftId = draftRes.body.draft.id;
  await request(app)
    .put(`/api/gl/games/${gameId}/spell-casts/drafts/${draftId}/contributions`)
    .set('Authorization', `Bearer ${tokenA}`)
    .send({ contributions: [{ playerId: playerAId, gems: 2, hearts: 0 }] })
    .expect(200);
  await request(app)
    .post(`/api/gl/games/${gameId}/spell-casts/drafts/${draftId}/launch`)
    .set('Authorization', `Bearer ${tokenA}`)
    .expect(200);

  const queue = await request(app)
    .get(`/api/gl/games/${gameId}/spell-casts/awaiting-effect`)
    .set('Authorization', `Bearer ${mjToken}`)
    .expect(200);
  const entry = queue.body.drafts.find((d) => Number(d.id) === Number(draftId));
  assert.ok(entry, 'le sort lancé doit figurer dans la file « à appliquer »');
  assert.strictEqual(entry.effectAppliedAt, null);
  assert.strictEqual(entry.spell.effetCourt, 'Rend un cœur à un camarade');

  // La file est réservée au MJ.
  await request(app)
    .get(`/api/gl/games/${gameId}/spell-casts/awaiting-effect`)
    .set('Authorization', `Bearer ${tokenA}`)
    .expect(403);
  await request(app)
    .post(`/api/gl/games/${gameId}/spell-casts/drafts/${draftId}/effect-applied`)
    .set('Authorization', `Bearer ${tokenA}`)
    .expect(403);

  const applied = await request(app)
    .post(`/api/gl/games/${gameId}/spell-casts/drafts/${draftId}/effect-applied`)
    .set('Authorization', `Bearer ${mjToken}`)
    .expect(200);
  assert.strictEqual(applied.body.event.eventType, 'spell_effect_applied');
  assert.ok(applied.body.draft.effectAppliedAt, 'l’horodatage d’application est enregistré');

  const after = await request(app)
    .get(`/api/gl/games/${gameId}/spell-casts/awaiting-effect`)
    .set('Authorization', `Bearer ${mjToken}`)
    .expect(200);
  assert.ok(
    !after.body.drafts.some((d) => Number(d.id) === Number(draftId)),
    'le sort coché sort de la file',
  );

  // Deux clics : une seule trace, un seul événement.
  await request(app)
    .post(`/api/gl/games/${gameId}/spell-casts/drafts/${draftId}/effect-applied`)
    .set('Authorization', `Bearer ${mjToken}`)
    .expect(409);
  const countRow = await queryOne(
    `SELECT COUNT(*) AS c FROM gl_game_events
      WHERE game_id = ? AND event_type = 'spell_effect_applied'
        AND CAST(JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.draftId')) AS UNSIGNED) = ?`,
    [gameId, draftId],
  );
  assert.strictEqual(Number(countRow.c), 1, 'un seul événement spell_effect_applied');
});
