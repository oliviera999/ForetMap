'use strict';

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute, queryOne } = require('../database');
const {
  createGlAdmin,
  createGlClass,
  createGlPlayer,
  createGlChapterWithMarker,
  createGlGameWithTeams,
  signTokens,
} = require('./helpers/glFixtures');
const jwt = require('jsonwebtoken');
const { serializeEventConfig } = require('../lib/glMarkerEventConfig');
const { invalidateGameplayCache } = require('../lib/glSettings');

let adminToken = '';
let playerToken = '';
let gameId = null;
let teamId = null;
let markerId = null;
const stamp = Date.now();

before(async () => {
  await initSchema();
  invalidateGameplayCache();

  const admin = await createGlAdmin({ email: `marker-q.admin.${stamp}@ecole.local` });
  const cls = await createGlClass({ adminId: admin.id, name: `Classe MarkerQ ${stamp}` });
  const { chapter } = await createGlChapterWithMarker({
    slug: `marker-q-ch-${stamp}`,
    title: 'Chapitre marker Q',
    biomeSlugs: [],
    markerLabel: 'Quiz repère',
  });

  const eventConfig = serializeEventConfig({
    version: 1,
    question: {
      mode: 'fixed',
      fixedQuestionCode: 'QCM0001',
      pool: { biomeMode: 'chapter' },
    },
  });
  await execute(
    `UPDATE gl_chapter_markers
        SET event_type = 'question', event_config_json = ?
      WHERE chapter_id = ?`,
    [eventConfig, chapter.id]
  );
  const marker = await queryOne(
    'SELECT id FROM gl_chapter_markers WHERE chapter_id = ? ORDER BY id DESC LIMIT 1',
    [chapter.id]
  );
  markerId = Number(marker.id);

  const { game, teams } = await createGlGameWithTeams({
    classId: cls.id,
    chapterId: chapter.id,
    createdBy: admin.id,
    teams: [{ name: 'Equipe A', type: 'gnome' }],
  });
  gameId = Number(game.id);
  teamId = Number(teams[0].id);

  const player = await createGlPlayer({ classId: cls.id, pseudo: `marker-q-player-${stamp}` });
  await execute(
    `INSERT INTO gl_team_members (game_id, team_id, player_id, joined_at)
     VALUES (?, ?, ?, NOW())`,
    [gameId, teamId, player.id]
  );

  const tokens = await signTokens({
    adminId: admin.id,
    playerId: player.id,
    playerPseudo: player.pseudo,
    teamId,
    adminPermissions: ['gl.read', 'gl.game.manage', 'gl.event.emit', 'gl.content.manage'],
    playerPermissions: ['gl.read', 'gl.action.request'],
  });
  adminToken = tokens.adminToken;
  playerToken = tokens.playerToken;

  await execute(
    `INSERT INTO gl_qcm_categories (slug, nom, order_index, created_at, updated_at)
     VALUES ('test-cat', 'Test', 0, NOW(), NOW())
     ON DUPLICATE KEY UPDATE nom = VALUES(nom), updated_at = NOW()`
  );
  await execute(
    `INSERT INTO gl_qcm_questions (
       question_code, biome_slug, categorie_slug, numero_dans_categorie, question,
       choix_a, choix_b, choix_c, choix_d, choix_e, reponse_correcte, statut, created_at, updated_at
     ) VALUES (
       'QCM0001', 'sahara', 'test-cat', 1, 'Question test marker?',
       'A', 'B', 'C', 'D', 'E', 'A', 'actif', NOW(), NOW()
     )
     ON DUPLICATE KEY UPDATE question = VALUES(question), updated_at = NOW()`
  );
});

test('GET /api/gl/gameplay-settings expose markerQuestionRetrigger', async () => {
  const res = await request(app)
    .get('/api/gl/gameplay-settings')
    .set('Authorization', `Bearer ${playerToken}`)
    .expect(200);
  assert.ok(['every_arrival', 'once_per_team', 'once_per_game'].includes(res.body?.settings?.markerQuestionRetrigger));
});

test('POST present-question pour joueur membre', async () => {
  const res = await request(app)
    .post(`/api/gl/games/${gameId}/markers/${markerId}/present-question`)
    .set('Authorization', `Bearer ${playerToken}`)
    .send({})
    .expect(200);
  assert.strictEqual(res.body.questionCode, 'QCM0001');
  assert.ok(res.body.presentation?.question);
  assert.ok(res.body.presentation?.presentationToken);
});

test('POST qcm/answer pour joueur membre après présentation', async () => {
  const present = await request(app)
    .post(`/api/gl/games/${gameId}/markers/${markerId}/present-question`)
    .set('Authorization', `Bearer ${playerToken}`)
    .send({})
    .expect(200);
  const tokenClaims = jwt.decode(present.body.presentation.presentationToken);
  const choiceId = Number(tokenClaims?.correctChoiceId);

  const answer = await request(app)
    .post(`/api/gl/games/${gameId}/qcm/answer`)
    .set('Authorization', `Bearer ${playerToken}`)
    .send({
      questionCode: present.body.questionCode,
      presentationToken: present.body.presentation.presentationToken,
      choiceId,
      markerId,
    })
    .expect(200);
  assert.strictEqual(answer.body.correct, true);
  assert.ok(String(answer.body.feedback || '').trim().length > 0);
  const row = await queryOne(
    `SELECT feedback_correct FROM gl_qcm_questions WHERE question_code = 'QCM0001' LIMIT 1`
  );
  if (row?.feedback_correct) {
    assert.strictEqual(answer.body.feedback, String(row.feedback_correct).trim());
  } else {
    assert.match(String(answer.body.feedback || ''), /Bonne réponse/i);
  }
});

test('POST qcm/answer pour MJ avec teamId (sans gl.action.request)', async () => {
  const present = await request(app)
    .post(`/api/gl/games/${gameId}/markers/${markerId}/present-question`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ teamId })
    .expect(200);
  const tokenClaims = jwt.decode(present.body.presentation.presentationToken);
  const choiceId = Number(tokenClaims?.correctChoiceId);

  const answer = await request(app)
    .post(`/api/gl/games/${gameId}/qcm/answer`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      questionCode: present.body.questionCode,
      presentationToken: present.body.presentation.presentationToken,
      choiceId,
      markerId,
      teamId,
    })
    .expect(200);
  assert.strictEqual(answer.body.correct, true);
});

test('POST present-question refus once_per_team au second appel', async () => {
  await execute('DELETE FROM gl_game_events WHERE game_id = ?', [gameId]);
  await execute(
    `INSERT INTO gl_settings (\`key\`, value_json, updated_at)
     VALUES ('gameplay.marker_question_retrigger', '"once_per_team"', NOW())
     ON DUPLICATE KEY UPDATE value_json = VALUES(value_json), updated_at = NOW()`
  );
  invalidateGameplayCache();

  await request(app)
    .post(`/api/gl/games/${gameId}/markers/${markerId}/present-question`)
    .set('Authorization', `Bearer ${playerToken}`)
    .send({})
    .expect(200);

  await request(app)
    .post(`/api/gl/games/${gameId}/markers/${markerId}/present-question`)
    .set('Authorization', `Bearer ${playerToken}`)
    .send({})
    .expect(409);

  await execute(
    `INSERT INTO gl_settings (\`key\`, value_json, updated_at)
     VALUES ('gameplay.marker_question_retrigger', '"every_arrival"', NOW())
     ON DUPLICATE KEY UPDATE value_json = VALUES(value_json), updated_at = NOW()`
  );
  invalidateGameplayCache();
});

test('GET /api/gl/qcm/pool-preview admin', async () => {
  const res = await request(app)
    .get('/api/gl/qcm/pool-preview?biomeSlugs=sahara')
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.ok(Array.isArray(res.body.items));
  assert.ok(res.body.items.some((item) => item.question_code === 'QCM0001'));
});

test('PUT marker avec eventConfig', async () => {
  const eventConfig = {
    version: 1,
    question: {
      mode: 'random',
      pool: {
        biomeMode: 'chapter',
        categorieSlugs: ['test-cat'],
        selectedQuestionCodes: ['QCM0001'],
      },
    },
  };
  const res = await request(app)
    .put(`/api/gl/chapters/admin/markers/${markerId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ eventType: 'question', eventConfig })
    .expect(200);
  assert.strictEqual(res.body.event_config.question.mode, 'random');
  assert.deepStrictEqual(res.body.event_config.question.pool.selectedQuestionCodes, ['QCM0001']);
});
