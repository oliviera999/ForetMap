'use strict';

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const jwt = require('jsonwebtoken');
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
const { serializeEventConfig } = require('../lib/glMarkerEventConfig');
const { invalidateGameplayCache } = require('../lib/glSettings');

let playerToken = '';
let gameId = null;
let teamId = null;
let markerId = null;
const stamp = Date.now();

before(async () => {
  await initSchema();
  invalidateGameplayCache();

  const admin = await createGlAdmin({ email: `qcm-reuse.admin.${stamp}@ecole.local` });
  const cls = await createGlClass({ adminId: admin.id, name: `Classe QcmReuse ${stamp}` });
  const { chapter } = await createGlChapterWithMarker({
    slug: `qcm-reuse-ch-${stamp}`,
    title: 'Chapitre QCM reuse',
    biomeSlugs: [],
    markerLabel: 'Quiz reuse',
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
    [eventConfig, chapter.id],
  );
  const marker = await queryOne(
    'SELECT id FROM gl_chapter_markers WHERE chapter_id = ? ORDER BY id DESC LIMIT 1',
    [chapter.id],
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

  const player = await createGlPlayer({ classId: cls.id, pseudo: `qcm-reuse-player-${stamp}` });
  await execute(
    `INSERT INTO gl_team_members (game_id, team_id, player_id, joined_at)
     VALUES (?, ?, ?, NOW())`,
    [gameId, teamId, player.id],
  );

  const tokens = await signTokens({
    adminId: admin.id,
    playerId: player.id,
    playerPseudo: player.pseudo,
    teamId,
    adminPermissions: ['gl.read', 'gl.game.manage', 'gl.event.emit'],
    playerPermissions: ['gl.read', 'gl.action.request'],
  });
  playerToken = tokens.playerToken;

  await execute(
    `INSERT INTO gl_settings (\`key\`, value_json, updated_at)
     VALUES ('gameplay.scoring_enabled', 'true', NOW())
     ON DUPLICATE KEY UPDATE value_json = VALUES(value_json), updated_at = NOW()`,
  );
  invalidateGameplayCache();

  await execute(
    `INSERT INTO gl_qcm_categories (slug, nom, order_index, created_at, updated_at)
     VALUES ('test-cat', 'Test', 0, NOW(), NOW())
     ON DUPLICATE KEY UPDATE nom = VALUES(nom), updated_at = NOW()`,
  );
  await execute(
    `INSERT INTO gl_qcm_questions (
       question_code, biome_slug, categorie_slug, numero_dans_categorie, question,
       choix_a, choix_b, choix_c, choix_d, choix_e, reponse_correcte, statut, created_at, updated_at
     ) VALUES (
       'QCM0001', 'sahara', 'test-cat', 1, 'Question test reuse?',
       'A', 'B', 'C', 'D', 'E', 'A', 'actif', NOW(), NOW()
     )
     ON DUPLICATE KEY UPDATE question = VALUES(question), updated_at = NOW()`,
  );
});

test('rejeu du même presentationToken refuse le second score (+1 une seule fois)', async () => {
  const present = await request(app)
    .post(`/api/gl/games/${gameId}/markers/${markerId}/present-question`)
    .set('Authorization', `Bearer ${playerToken}`)
    .send({})
    .expect(200);

  const choiceId = Number(jwt.decode(present.body.presentation.presentationToken)?.correctChoiceId);
  const body = {
    questionCode: present.body.questionCode,
    presentationToken: present.body.presentation.presentationToken,
    choiceId,
    markerId,
  };

  const first = await request(app)
    .post(`/api/gl/games/${gameId}/qcm/answer`)
    .set('Authorization', `Bearer ${playerToken}`)
    .send(body)
    .expect(200);
  assert.equal(first.body.correct, true);
  assert.equal(first.body.scoreDelta, 1);

  const second = await request(app)
    .post(`/api/gl/games/${gameId}/qcm/answer`)
    .set('Authorization', `Bearer ${playerToken}`)
    .send(body)
    .expect(409);
  assert.match(String(second.body.error || ''), /déjà utilisée/i);

  const scoreRow = await queryOne(
    'SELECT score FROM gl_team_scores WHERE game_id = ? AND team_id = ? LIMIT 1',
    [gameId, teamId],
  );
  assert.equal(Number(scoreRow?.score || 0), 1);
});
