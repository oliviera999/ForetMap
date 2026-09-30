'use strict';

/**
 * Non-régression des correctifs G&L de l'audit sécurité / RGPD du 30/09/2026
 * (`docs/AUDIT_SECURITE_RGPD_2026-09-30.md` §3 GL1 à GL8, §4 AP2 et AP5).
 *
 * Chaque bloc reproduit le scénario d'attaque du rapport : sans le correctif, l'assertion
 * principale échoue.
 */

require('./helpers/setup');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
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
const { setStudentPrimaryRole } = require('./helpers/studentRoles');
const {
  ensureForetmapGroupForGlClass,
  upsertForetmapUserForGlPlayer,
} = require('../lib/glGroupBridge');
const { serializeEventConfig } = require('../lib/glMarkerEventConfig');
const {
  invalidateGameplayCache,
  invalidateModulesCache,
  setGameplayCacheForTests,
  setModulesCacheForTests,
} = require('../lib/glSettings');
const { sortMarkersByPath, targetMarkerAfterDice } = require('../lib/shared/glBoardPathCore');
const { listAuthRateLimitPaths } = require('../lib/products');
const { sendSafeError } = require('../lib/safeErrorResponse');
const { rollServerDice, parseDiceCount } = require('../lib/glDiceRoll');

const stamp = Date.now();
let admin;
let cls;
let adminToken = '';
let questionCode = '';
let categorySlug = '';

function auth(token) {
  return { Authorization: `Bearer ${token}` };
}

function decodeJwt(token) {
  return JSON.parse(Buffer.from(String(token).split('.')[1], 'base64url').toString('utf8'));
}

async function createForetmapStudent({ email, password = null, pseudo }) {
  const id = crypto.randomUUID();
  const hash = password ? await bcrypt.hash(password, 10) : null;
  await execute(
    `INSERT INTO users
      (id, user_type, email, pseudo, first_name, last_name, display_name, password_hash,
       auth_provider, is_active, created_at, updated_at)
     VALUES (?, 'student', ?, ?, 'Eleve', 'Reel', 'Eleve Reel', ?, ?, 1, NOW(), NOW())`,
    [id, email, pseudo, hash, password ? 'local' : 'google'],
  );
  return id;
}

async function createQuestionMarkerGame({ status = 'live', teams = 2 } = {}) {
  const s = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const { chapter } = await createGlChapterWithMarker({
    slug: `sec-gl-ch-${s}`,
    title: `Chapitre sécu ${s}`,
    markerLabel: 'Repère quiz',
  });
  const eventConfig = serializeEventConfig({
    version: 1,
    question: { mode: 'fixed', fixedQuestionCode: questionCode, pool: { biomeMode: 'chapter' } },
  });
  await execute(
    `UPDATE gl_chapter_markers SET event_type = 'question', event_config_json = ?
      WHERE chapter_id = ?`,
    [eventConfig, chapter.id],
  );
  const marker = await queryOne(
    'SELECT id FROM gl_chapter_markers WHERE chapter_id = ? ORDER BY id DESC LIMIT 1',
    [chapter.id],
  );
  const { game, teams: created } = await createGlGameWithTeams({
    classId: cls.id,
    chapterId: chapter.id,
    createdBy: admin.id,
    status,
    teams: Array.from({ length: teams }, (_, i) => ({ name: `Equipe ${i + 1}` })),
  });
  const player = await createGlPlayer({ classId: cls.id, pseudo: `sec-gl-p-${s}` });
  await assignPlayerToGameTeam({ gameId: game.id, teamId: created[0].id, playerId: player.id });
  await execute('UPDATE gl_teams SET position_marker_id = ? WHERE id = ?', [
    marker.id,
    created[0].id,
  ]);
  const { playerToken } = await signTokens({
    playerId: player.id,
    playerPseudo: player.pseudo,
    teamId: created[0].id,
  });
  return {
    chapter,
    gameId: Number(game.id),
    teams: created.map((t) => Number(t.id)),
    markerId: Number(marker.id),
    player,
    playerToken,
  };
}

function correctChoiceIdOf(presentation) {
  return presentation.choices.findIndex((choice) => choice.text === 'Charlie');
}

before(async () => {
  await initSchema();
  invalidateGameplayCache();
  invalidateModulesCache();
  admin = await createGlAdmin({ email: `sec-gl.admin.${stamp}@ecole.local` });
  cls = await createGlClass({ adminId: admin.id, name: `Classe sécu GL ${stamp}` });
  ({ adminToken } = await signTokens({
    adminId: admin.id,
    adminPermissions: [
      'gl.read',
      'gl.players.manage',
      'gl.game.manage',
      'gl.team.manage',
      'gl.event.emit',
      'gl.settings.manage',
      'gl.content.manage',
    ],
  }));

  questionCode = `QCM${String(stamp).slice(-5)}`;
  categorySlug = `sec-gl-${stamp}`.slice(0, 64);
  await execute(
    `INSERT INTO gl_qcm_categories (slug, nom, order_index, created_at, updated_at)
     VALUES (?, 'Sécu', 0, NOW(), NOW())
     ON DUPLICATE KEY UPDATE nom = VALUES(nom), updated_at = NOW()`,
    [categorySlug],
  );
  await execute(
    `INSERT INTO gl_qcm_questions (
       question_code, biome_slug, categorie_slug, numero_dans_categorie, question,
       choix_a, choix_b, choix_c, choix_d, choix_e, reponse_correcte, statut, created_at, updated_at
     ) VALUES (?, 'sahara', ?, 1, 'Question sécu ?',
       'Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'C', 'actif', NOW(), NOW())`,
    [questionCode, categorySlug],
  );
  setGameplayCacheForTests({ scoringEnabled: true });
});

after(() => {
  invalidateGameplayCache();
  invalidateModulesCache();
});

// ---------------------------------------------------------------------------------------
// GL1 — un MJ ne s'approprie plus le compte ForetMap d'un élève
// ---------------------------------------------------------------------------------------

test('GL1 : création avec l’e-mail d’un élève Google hors classe → 409, aucun hachage posé', async () => {
  const email = `gl1.google.${stamp}@ecole.local`;
  const studentId = await createForetmapStudent({ email, pseudo: `gl1_google_${stamp}` });
  const res = await request(app)
    .post('/api/gl/admin/players')
    .set(auth(adminToken))
    .send({
      classId: cls.id,
      firstName: 'Eleve',
      lastName: 'Reel',
      pseudo: `gl1_mj_${stamp}`,
      email,
      password: 'mot-de-passe-du-mj',
    })
    .expect(409);
  assert.match(String(res.body.error), /compte ForetMap/);
  const row = await queryOne('SELECT password_hash, email FROM users WHERE id = ?', [studentId]);
  assert.equal(row.password_hash, null);
  assert.equal(row.email, email);
  const player = await queryOne('SELECT id FROM gl_players WHERE pseudo = ?', [`gl1_mj_${stamp}`]);
  assert.equal(player, undefined);
});

test('GL1 : le pont ne rapproche pas un élève hors classe (miroir distinct, groupes intacts)', async () => {
  const otherClass = await createGlClass({ adminId: admin.id, name: `Autre classe ${stamp}` });
  const otherGroup = await ensureForetmapGroupForGlClass(otherClass);
  const email = `gl1.bridge.${stamp}@ecole.local`;
  const studentId = await createForetmapStudent({ email, pseudo: `gl1_bridge_${stamp}` });
  await execute(
    "INSERT INTO group_members (group_id, user_id, user_type) VALUES (?, ?, 'student')",
    [otherGroup.id, studentId],
  );
  const link = await upsertForetmapUserForGlPlayer({
    classId: cls.id,
    firstName: 'Eleve',
    lastName: 'Reel',
    pseudo: `gl1_bridge_player_${stamp}`,
    email,
    passwordHash: await bcrypt.hash('mj-choisi', 10),
  });
  assert.equal(link.ok, true);
  assert.notEqual(String(link.user.id), studentId);
  assert.equal(link.reusedExisting, false);
  assert.equal(link.emailConflict, true);
  const student = await queryOne('SELECT password_hash FROM users WHERE id = ?', [studentId]);
  assert.equal(student.password_hash, null);
  const stillMember = await queryOne(
    'SELECT 1 AS ok FROM group_members WHERE group_id = ? AND user_id = ?',
    [otherGroup.id, studentId],
  );
  assert.ok(stillMember, 'l’élève ne doit pas être retiré de ses autres groupes');
});

test('GL1 : élève déjà dans la classe rapproché, mais jamais de mot de passe posé', async () => {
  const group = await ensureForetmapGroupForGlClass(cls);
  const email = `gl1.member.${stamp}@ecole.local`;
  const studentId = await createForetmapStudent({ email, pseudo: `gl1_member_${stamp}` });
  await execute(
    "INSERT INTO group_members (group_id, user_id, user_type) VALUES (?, ?, 'student')",
    [group.id, studentId],
  );
  const link = await upsertForetmapUserForGlPlayer({
    classId: cls.id,
    firstName: 'Eleve',
    lastName: 'Reel',
    pseudo: `gl1_member_player_${stamp}`,
    email,
    passwordHash: await bcrypt.hash('mj-choisi', 10),
  });
  assert.equal(String(link.user.id), studentId);
  assert.equal(link.reusedExisting, true);
  const row = await queryOne('SELECT password_hash FROM users WHERE id = ?', [studentId]);
  assert.equal(row.password_hash, null);
});

test('GL1 : PUT de l’e-mail d’un joueur lié à un vrai compte → 403, e-mail inchangé', async () => {
  const group = await ensureForetmapGroupForGlClass(cls);
  const email = `gl1.put.${stamp}@ecole.local`;
  const studentId = await createForetmapStudent({
    email,
    pseudo: `gl1_put_${stamp}`,
    password: 'secret-eleve',
  });
  await execute(
    "INSERT INTO group_members (group_id, user_id, user_type) VALUES (?, ?, 'student')",
    [group.id, studentId],
  );
  const player = await createGlPlayer({
    classId: cls.id,
    pseudo: `gl1_put_player_${stamp}`,
    linkedForetmapUserId: studentId,
  });
  const res = await request(app)
    .put(`/api/gl/admin/players/${player.id}`)
    .set(auth(adminToken))
    .send({ email: `mj.${stamp}@ecole.local` })
    .expect(403);
  assert.equal(res.body.code, 'GL_PLAYER_REAL_ACCOUNT');
  const row = await queryOne('SELECT email FROM users WHERE id = ?', [studentId]);
  assert.equal(row.email, email);
  // Même e-mail renvoyé par le formulaire (édition du nom) : accepté.
  await request(app)
    .put(`/api/gl/admin/players/${player.id}`)
    .set(auth(adminToken))
    .send({ email, firstName: 'Renommé' })
    .expect(200);
});

// ---------------------------------------------------------------------------------------
// GL2 — points QCM de partie
// ---------------------------------------------------------------------------------------

test('GL2 : un jeton de QCM libre ne rapporte aucun point en partie', async () => {
  const ctx = await createQuestionMarkerGame();
  const free = await request(app)
    .get(`/api/gl/qcm/questions/${questionCode}/present`)
    .set(auth(ctx.playerToken))
    .expect(200);
  const res = await request(app)
    .post(`/api/gl/games/${ctx.gameId}/qcm/answer`)
    .set(auth(ctx.playerToken))
    .send({
      questionCode,
      presentationToken: free.body.presentationToken,
      choiceId: correctChoiceIdOf(free.body),
      markerId: ctx.markerId,
    })
    .expect(403);
  assert.equal(res.body.code, 'GL_QCM_TOKEN_NOT_FOR_GAME');
  const score = await queryOne(
    'SELECT score FROM gl_team_scores WHERE game_id = ? AND team_id = ?',
    [ctx.gameId, ctx.teams[0]],
  );
  assert.equal(Number(score?.score || 0), 0);
});

test('GL2 : jeton de repère → +1 une fois ; même question sur place → 0 ; après un déplacement → +1', async () => {
  const ctx = await createQuestionMarkerGame();
  async function presentAndAnswer() {
    const present = await request(app)
      .post(`/api/gl/games/${ctx.gameId}/markers/${ctx.markerId}/present-question`)
      .set(auth(ctx.playerToken))
      .send({})
      .expect(200);
    const claims = decodeJwt(present.body.presentation.presentationToken);
    assert.equal(claims.game.gameId, ctx.gameId);
    assert.equal(claims.game.teamId, ctx.teams[0]);
    assert.equal(claims.game.markerId, ctx.markerId);
    return request(app)
      .post(`/api/gl/games/${ctx.gameId}/qcm/answer`)
      .set(auth(ctx.playerToken))
      .send({
        questionCode: present.body.questionCode,
        presentationToken: present.body.presentation.presentationToken,
        choiceId: correctChoiceIdOf(present.body.presentation),
      })
      .expect(200);
  }
  assert.equal((await presentAndAnswer()).body.scoreDelta, 1);
  const again = await presentAndAnswer();
  assert.equal(again.body.correct, true);
  assert.equal(again.body.scoreDelta, 0);
  // Arrivée de nouveau sur le repère (déplacement MJ) : re-déclenchement `every_arrival`.
  await request(app)
    .post(`/api/gl/games/${ctx.gameId}/events`)
    .set(auth(adminToken))
    .send({ teamId: ctx.teams[0], eventType: 'move', payload: { markerId: ctx.markerId } })
    .expect(201);
  assert.equal((await presentAndAnswer()).body.scoreDelta, 1);
  const score = await queryOne(
    'SELECT score FROM gl_team_scores WHERE game_id = ? AND team_id = ?',
    [ctx.gameId, ctx.teams[0]],
  );
  assert.equal(Number(score.score), 2);
});

test('GL2 : partie terminée → 409 ; jeton d’une équipe rejoué pour une autre → 403', async () => {
  const ctx = await createQuestionMarkerGame();
  const present = await request(app)
    .post(`/api/gl/games/${ctx.gameId}/markers/${ctx.markerId}/present-question`)
    .set(auth(adminToken))
    .send({ teamId: ctx.teams[0] })
    .expect(200);
  const body = {
    questionCode: present.body.questionCode,
    presentationToken: present.body.presentation.presentationToken,
    choiceId: correctChoiceIdOf(present.body.presentation),
  };
  const other = await request(app)
    .post(`/api/gl/games/${ctx.gameId}/qcm/answer`)
    .set(auth(adminToken))
    .send({ ...body, teamId: ctx.teams[1] })
    .expect(403);
  assert.equal(other.body.code, 'GL_QCM_TOKEN_OTHER_TEAM');
  await execute("UPDATE gl_games SET status = 'ended' WHERE id = ?", [ctx.gameId]);
  await request(app)
    .post(`/api/gl/games/${ctx.gameId}/qcm/answer`)
    .set(auth(adminToken))
    .send({ ...body, teamId: ctx.teams[0] })
    .expect(409);
});

// ---------------------------------------------------------------------------------------
// GL3 / GL6 — commentaires G&L
// ---------------------------------------------------------------------------------------

async function insertComment(contextType, contextId, author = { type: 'student', id: 'x' }) {
  const id = crypto.randomUUID();
  await execute(
    `INSERT INTO context_comments
      (id, context_type, context_id, body, author_user_type, author_user_id, is_deleted)
     VALUES (?, ?, ?, 'Commentaire de test sécurité', ?, ?, 0)`,
    [id, contextType, String(contextId), author.type, author.id],
  );
  return id;
}

test('GL3 : un MJ G&L ne supprime ni ne signale un commentaire ForetMap (404)', async () => {
  const commentId = await insertComment('zone', `zone-sec-${stamp}`);
  await request(app)
    .delete(`/api/gl/context-comments/${commentId}`)
    .set(auth(adminToken))
    .expect(404);
  await request(app)
    .post(`/api/gl/context-comments/${commentId}/reactions`)
    .set(auth(adminToken))
    .send({ emoji: '👍' })
    .expect(404);
  const row = await queryOne('SELECT is_deleted FROM context_comments WHERE id = ?', [commentId]);
  assert.equal(Number(row.is_deleted), 0);
});

test('GL3 : modération G&L réservée aux comptes d’encadrement qui pilotent le jeu', async () => {
  const { canModerateGlComments } = require('../routes/gl/context-comments');
  const staff = (permissions) => ({ product: 'gl', userType: 'gl_admin', permissions });
  assert.equal(canModerateGlComments(staff(['gl.read'])), false);
  assert.equal(canModerateGlComments(staff(['gl.read', 'gl.game.manage'])), true);
  assert.equal(
    canModerateGlComments({ userType: 'gl_player', permissions: ['gl.game.manage'] }),
    false,
  );

  // Un MJ (rôle `mj`) garde la modération des commentaires G&L.
  const mj = await createGlAdmin({ email: `sec-gl.mj.${stamp}@ecole.local`, role: 'mj' });
  const { adminToken: mjToken } = await signTokens({ adminId: mj.id });
  const { chapter } = await createGlChapterWithMarker({ slug: `sec-gl-mod-${stamp}` });
  const commentId = await insertComment('gl_chapter', chapter.id, {
    type: 'gl_player',
    id: '999999',
  });
  await request(app).delete(`/api/gl/context-comments/${commentId}`).set(auth(mjToken)).expect(200);
});

test('GL6 : un joueur hors de la partie ne lit ni n’écrit ses commentaires', async () => {
  const ctx = await createQuestionMarkerGame();
  const outsider = await createGlPlayer({ classId: cls.id, pseudo: `gl6_out_${stamp}` });
  const { playerToken: outsiderToken } = await signTokens({
    playerId: outsider.id,
    playerPseudo: outsider.pseudo,
  });
  await request(app)
    .get(`/api/gl/context-comments?contextType=gl_game&contextId=${ctx.gameId}`)
    .set(auth(outsiderToken))
    .expect(404);
  await request(app)
    .post('/api/gl/context-comments')
    .set(auth(outsiderToken))
    .send({ contextType: 'gl_game', contextId: String(ctx.gameId), body: 'Intrusion' })
    .expect(404);
  await request(app)
    .get(`/api/gl/context-comments?contextType=gl_game&contextId=${ctx.gameId}`)
    .set(auth(ctx.playerToken))
    .expect(200);
});

// ---------------------------------------------------------------------------------------
// GL3 (côté ForetMap) / AP5 — commentaires de contexte ForetMap
// ---------------------------------------------------------------------------------------

async function registerStudent(prefix) {
  const s = `${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  const res = await request(app)
    .post('/api/auth/register')
    .send({
      firstName: prefix,
      lastName: `Sec${s}`,
      email: `${prefix.toLowerCase()}_${s}@example.com`,
      password: 'pass1234',
    })
    .expect(201);
  await setStudentPrimaryRole(res.body.id, 'eleve_novice');
  const login = await request(app)
    .post('/api/auth/login')
    .send({ identifier: res.body.email, password: 'pass1234' })
    .expect(200);
  return { ...res.body, authToken: login.body.authToken };
}

async function teacherToken() {
  const loginEmail = String(process.env.TEACHER_ADMIN_EMAIL || '').trim();
  const adminRole = await queryOne("SELECT id FROM roles WHERE slug = 'admin' LIMIT 1");
  for (const key of ['zones.manage', 'context.comments.moderate']) {
    await execute('INSERT IGNORE INTO role_permissions (role_id, permission_key) VALUES (?, ?)', [
      adminRole.id,
      key,
    ]);
  }
  const login = await request(app)
    .post('/api/auth/login')
    .send({ identifier: loginEmail, password: process.env.TEACHER_ADMIN_PASSWORD })
    .expect(200);
  return login.body.authToken;
}

test('GL3 : un modérateur ForetMap ne supprime pas un commentaire G&L (404)', async () => {
  const teacher = await teacherToken();
  const commentId = await insertComment('gl_chapter', '1', { type: 'gl_player', id: '1' });
  await request(app).delete(`/api/context-comments/${commentId}`).set(auth(teacher)).expect(404);
  const row = await queryOne('SELECT is_deleted FROM context_comments WHERE id = ?', [commentId]);
  assert.equal(Number(row.is_deleted), 0);
});

test('AP5 : zone réservée à un autre profil → commentaires introuvables en lecture et écriture', async () => {
  const teacher = await teacherToken();
  const student = await registerStudent('SecAp5');
  const zone = await request(app)
    .post('/api/zones')
    .set(auth(teacher))
    .send({
      name: `Zone réservée ${stamp}`,
      map_id: 'foret',
      points: [
        { xp: 10, yp: 10 },
        { xp: 20, yp: 10 },
        { xp: 15, yp: 20 },
      ],
      stage: 'empty',
    })
    .expect(201);
  const zoneId = zone.body.id;
  const visible = await request(app)
    .get(`/api/context-comments?contextType=zone&contextId=${encodeURIComponent(zoneId)}`)
    .set(auth(student.authToken))
    .expect(200);
  assert.ok(Array.isArray(visible.body.items));
  const commentId = await insertComment('zone', zoneId);

  await execute("UPDATE zones SET visible_role_slugs = 'personnel' WHERE id = ?", [zoneId]);
  await request(app)
    .get(`/api/context-comments?contextType=zone&contextId=${encodeURIComponent(zoneId)}`)
    .set(auth(student.authToken))
    .expect(404);
  await request(app)
    .post('/api/context-comments')
    .set(auth(student.authToken))
    .send({ contextType: 'zone', contextId: zoneId, body: 'Je ne devrais pas voir ce lieu.' })
    .expect(404);
  await request(app)
    .post(`/api/context-comments/${commentId}/reactions`)
    .set(auth(student.authToken))
    .send({ emoji: '👍' })
    .expect(404);
  // Le gestionnaire de lieux, lui, y accède toujours.
  await request(app)
    .get(`/api/context-comments?contextType=zone&contextId=${encodeURIComponent(zoneId)}`)
    .set(auth(teacher))
    .expect(200);
});

// ---------------------------------------------------------------------------------------
// GL4 — dés serveur, déplacement borné au chapitre et au dernier jet
// ---------------------------------------------------------------------------------------

test('GL4 : les valeurs de dés envoyées par le client sont ignorées (tirage serveur)', async () => {
  const ctx = await createQuestionMarkerGame();
  const res = await request(app)
    .post(`/api/gl/games/${ctx.gameId}/teams/${ctx.teams[0]}/dice-roll`)
    .set(auth(ctx.playerToken))
    .send({ values: [6, 6, 6, 6, 6], total: 30 })
    .expect(201);
  assert.equal(res.body.payload.serverRoll, true);
  assert.equal(res.body.payload.values.length, 5);
  assert.equal(
    res.body.payload.total,
    res.body.payload.values.reduce((a, b) => a + b, 0),
  );
  await request(app)
    .post(`/api/gl/games/${ctx.gameId}/teams/${ctx.teams[0]}/dice-roll`)
    .set(auth(ctx.playerToken))
    .send({ count: 9 })
    .expect(400);
  assert.equal(parseDiceCount({ count: 3 }), 3);
  const fixed = rollServerDice(3, () => 4);
  assert.deepEqual(fixed, { values: [4, 4, 4], total: 12 });
});

test('GL4 : déplacement vers un repère d’un autre chapitre → 404', async () => {
  const ctx = await createQuestionMarkerGame();
  const { marker: foreign } = await createGlChapterWithMarker({ slug: `sec-gl-foreign-${stamp}` });
  setGameplayCacheForTests({ scoringEnabled: true, mascotMoveActor: 'players' });
  try {
    await request(app)
      .post(`/api/gl/games/${ctx.gameId}/teams/${ctx.teams[0]}/move`)
      .set(auth(ctx.playerToken))
      .send({ markerId: foreign.id })
      .expect(404);
    await request(app)
      .post(`/api/gl/games/${ctx.gameId}/events`)
      .set(auth(adminToken))
      .send({ teamId: ctx.teams[0], eventType: 'move', payload: { markerId: foreign.id } })
      .expect(404);
  } finally {
    setGameplayCacheForTests({ scoringEnabled: true });
  }
});

test('GL4 : repères numérotés — seule la destination du dernier jet est acceptée', async () => {
  const ctx = await createQuestionMarkerGame();
  await execute(
    "UPDATE gl_games SET board_movement_mode = 'numbered_path', board_path_start_index = 0 WHERE id = ?",
    [ctx.gameId],
  );
  for (let i = 1; i <= 3; i += 1) {
    await execute(
      `INSERT INTO gl_chapter_markers (chapter_id, x_pct, y_pct, event_type, label, description, order_index)
       VALUES (?, ?, 40, 'point', ?, 'case', ?)`,
      [ctx.chapter.id, 10 + i * 10, `Case ${i}`, i],
    );
  }
  await execute('UPDATE gl_teams SET position_marker_id = NULL WHERE id = ?', [ctx.teams[0]]);
  setGameplayCacheForTests({ scoringEnabled: true, mascotMoveActor: 'players' });
  setModulesCacheForTests({ virtualDiceEnabled: true });
  try {
    const markers = sortMarkersByPath(
      await queryAll('SELECT id, order_index FROM gl_chapter_markers WHERE chapter_id = ?', [
        ctx.chapter.id,
      ]),
    );
    // Pas de jet : refus.
    await request(app)
      .post(`/api/gl/games/${ctx.gameId}/teams/${ctx.teams[0]}/move`)
      .set(auth(ctx.playerToken))
      .send({ markerId: markers[1].id })
      .expect(409);
    const roll = await request(app)
      .post(`/api/gl/games/${ctx.gameId}/teams/${ctx.teams[0]}/dice-roll`)
      .set(auth(ctx.playerToken))
      .send({ count: 1 })
      .expect(201);
    const target = targetMarkerAfterDice(
      markers,
      { position_marker_id: null },
      roll.body.payload.total,
      0,
    );
    const wrong = markers.find(
      (m) => Number(m.id) !== Number(target.marker.id) && m !== markers[0],
    );
    await request(app)
      .post(`/api/gl/games/${ctx.gameId}/teams/${ctx.teams[0]}/move`)
      .set(auth(ctx.playerToken))
      .send({ markerId: wrong.id })
      .expect(409);
    await request(app)
      .post(`/api/gl/games/${ctx.gameId}/teams/${ctx.teams[0]}/move`)
      .set(auth(ctx.playerToken))
      .send({ markerId: target.marker.id })
      .expect(201);
    // Le jet est consommé : un second déplacement exige un nouveau jet.
    await request(app)
      .post(`/api/gl/games/${ctx.gameId}/teams/${ctx.teams[0]}/move`)
      .set(auth(ctx.playerToken))
      .send({ markerId: target.marker.id })
      .expect(409);
  } finally {
    setGameplayCacheForTests({ scoringEnabled: true });
    invalidateModulesCache();
  }
});

// ---------------------------------------------------------------------------------------
// GL5 — join-team
// ---------------------------------------------------------------------------------------

test('GL5 : changement d’équipe refusé en partie lancée, libre en préparation', async () => {
  const ctx = await createQuestionMarkerGame();
  const res = await request(app)
    .post(`/api/gl/games/${ctx.gameId}/join-team`)
    .set(auth(ctx.playerToken))
    .send({ teamId: ctx.teams[1] })
    .expect(409);
  assert.equal(res.body.code, 'GL_TEAM_LOCKED');
  const member = await queryOne(
    'SELECT team_id FROM gl_team_members WHERE game_id = ? AND player_id = ?',
    [ctx.gameId, ctx.player.id],
  );
  assert.equal(Number(member.team_id), ctx.teams[0]);

  // Joueur sans équipe : peut encore rejoindre la partie en cours.
  const late = await createGlPlayer({ classId: cls.id, pseudo: `gl5_late_${stamp}` });
  const { playerToken: lateToken } = await signTokens({
    playerId: late.id,
    playerPseudo: late.pseudo,
  });
  await request(app)
    .post(`/api/gl/games/${ctx.gameId}/join-team`)
    .set(auth(lateToken))
    .send({ teamId: ctx.teams[1] })
    .expect(200);

  await execute("UPDATE gl_games SET status = 'draft' WHERE id = ?", [ctx.gameId]);
  await request(app)
    .post(`/api/gl/games/${ctx.gameId}/join-team`)
    .set(auth(ctx.playerToken))
    .send({ teamId: ctx.teams[1] })
    .expect(200);
  await execute("UPDATE gl_games SET status = 'ended' WHERE id = ?", [ctx.gameId]);
  await request(app)
    .post(`/api/gl/games/${ctx.gameId}/join-team`)
    .set(auth(ctx.playerToken))
    .send({ teamId: ctx.teams[0] })
    .expect(409);
});

// ---------------------------------------------------------------------------------------
// GL7 — limiteur strict
// ---------------------------------------------------------------------------------------

test('GL7 : changement de mot de passe MJ et profil joueur sous le limiteur strict', () => {
  const limited = listAuthRateLimitPaths();
  assert.ok(limited.includes('/api/gl/auth/staff/change-password'));
  assert.ok(limited.includes('/api/gl/auth/me/profile'));
});

// ---------------------------------------------------------------------------------------
// GL8 — invités et QCM
// ---------------------------------------------------------------------------------------

test('GL8 : un invité répond à un QCM libre sans rien écrire en base (jeton à usage unique)', async () => {
  await execute("DELETE FROM gl_settings WHERE `key` = 'platform.guest_mode_enabled'");
  const guest = await request(app).post('/api/gl/auth/guest').expect(200);
  const guestToken = guest.body.authToken;
  const guestId = String(guest.body.auth.userId);
  const present = await request(app)
    .get(`/api/gl/qcm/questions/${questionCode}/present`)
    .set(auth(guestToken))
    .expect(200);
  const { jti } = decodeJwt(present.body.presentationToken);
  const body = {
    presentationToken: present.body.presentationToken,
    choiceId: correctChoiceIdOf(present.body),
  };
  const answer = await request(app)
    .post(`/api/gl/qcm/questions/${questionCode}/answer`)
    .set(auth(guestToken))
    .send(body)
    .expect(200);
  assert.equal(answer.body.correct, true);
  const use = await queryOne('SELECT jti FROM gl_qcm_presentation_uses WHERE jti = ?', [jti]);
  assert.equal(use, undefined);
  const attempts = await queryOne(
    "SELECT COUNT(*) AS c FROM gl_qcm_attempts WHERE reader_user_type = 'gl_guest' AND reader_user_id = ?",
    [guestId],
  );
  assert.equal(Number(attempts.c), 0);
  await request(app)
    .post(`/api/gl/qcm/questions/${questionCode}/answer`)
    .set(auth(guestToken))
    .send(body)
    .expect(409);
});

// ---------------------------------------------------------------------------------------
// AP2 — pas de message interne renvoyé au client
// ---------------------------------------------------------------------------------------

function fakeRes() {
  return {
    statusCode: 0,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

test('AP2 : une erreur SQL devient un 500 générique, une erreur métier garde son message', () => {
  const sqlErr = Object.assign(new Error('Deadlock found when trying to get lock; table `gl_x`'), {
    code: 'ER_LOCK_DEADLOCK',
    errno: 1213,
    sqlMessage: 'Deadlock',
  });
  const res1 = fakeRes();
  sendSafeError(res1, sqlErr);
  assert.equal(res1.statusCode, 500);
  assert.equal(res1.body.error, 'Erreur interne');

  const res2 = fakeRes();
  sendSafeError(
    res2,
    Object.assign(new Error('Token de présentation invalide'), { statusCode: 400 }),
  );
  assert.equal(res2.statusCode, 400);
  assert.equal(res2.body.error, 'Token de présentation invalide');

  const res3 = fakeRes();
  sendSafeError(res3, new Error('Colonne manquante : Pseudo'), { trustPlainErrors: true });
  assert.equal(res3.statusCode, 400);
  const res4 = fakeRes();
  sendSafeError(res4, Object.assign(new Error('/srv/app/uploads/x: ENOENT'), { code: 'ENOENT' }), {
    trustPlainErrors: true,
  });
  assert.equal(res4.statusCode, 500);
});

test('AP2 : réponse QCM avec jeton invalide → 400 métier (message conservé)', async () => {
  const ctx = await createQuestionMarkerGame();
  const res = await request(app)
    .post(`/api/gl/qcm/questions/${questionCode}/answer`)
    .set(auth(ctx.playerToken))
    .send({ presentationToken: 'pas-un-jeton', choiceId: 0 })
    .expect(400);
  assert.match(String(res.body.error), /Token de présentation/);
});
