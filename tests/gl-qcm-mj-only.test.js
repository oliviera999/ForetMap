'use strict';

require('./helpers/setup');
const { test, before, beforeEach, after } = require('node:test');
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
const { serializeEventConfig } = require('../lib/glMarkerEventConfig');
const { invalidateGameplayCache, setGameplayCacheForTests } = require('../lib/glSettings');

async function enableQcmMjOnly() {
  await execute(
    `INSERT INTO gl_settings (\`key\`, value_json, updated_at)
     VALUES ('gameplay.qcm_mj_only', 'true', NOW())
     ON DUPLICATE KEY UPDATE value_json = 'true', updated_at = NOW()`
  );
  invalidateGameplayCache();
  setGameplayCacheForTests({ qcmMjOnly: true });
}

let adminToken = '';
let playerToken = '';
let gameId = null;
let teamId = null;
let markerId = null;
const stamp = Date.now();

before(async () => {
  await initSchema();
  invalidateGameplayCache();

  await enableQcmMjOnly();

  const admin = await createGlAdmin({ email: `qcm-mj.admin.${stamp}@ecole.local` });
  const cls = await createGlClass({ adminId: admin.id, name: `Classe QcmMj ${stamp}` });
  const { chapter } = await createGlChapterWithMarker({
    slug: `qcm-mj-ch-${stamp}`,
    title: 'Chapitre QcmMj',
    biomeSlugs: [],
    markerLabel: 'Quiz MJ only',
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
  const markerRow = await queryOne(
    'SELECT id FROM gl_chapter_markers WHERE chapter_id = ? ORDER BY id DESC LIMIT 1',
    [chapter.id]
  );
  markerId = Number(markerRow.id);

  const { game, teams } = await createGlGameWithTeams({
    classId: cls.id,
    chapterId: chapter.id,
    createdBy: admin.id,
    teams: [{ name: 'Equipe MJ', type: 'gnome' }],
  });
  gameId = Number(game.id);
  teamId = Number(teams[0].id);

  const player = await createGlPlayer({ classId: cls.id, pseudo: `qcm-mj-player-${stamp}` });
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
    adminPermissions: ['gl.read', 'gl.game.manage', 'gl.event.emit'],
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
       'QCM0001', 'sahara', 'test-cat', 1, 'Question test mj only?',
       'A', 'B', 'C', 'D', 'E', 'A', 'actif', NOW(), NOW()
     )
     ON DUPLICATE KEY UPDATE question = VALUES(question), updated_at = NOW()`
  );
});

after(async () => {
  await execute(
    `UPDATE gl_settings SET value_json = 'false', updated_at = NOW()
      WHERE \`key\` = 'gameplay.qcm_mj_only'`
  );
  invalidateGameplayCache();
  setGameplayCacheForTests(null);
});

beforeEach(async () => {
  await enableQcmMjOnly();
});

test('Joueur : present-question refusé si qcm_mj_only', async () => {
  await request(app)
    .post(`/api/gl/games/${gameId}/markers/${markerId}/present-question`)
    .set('Authorization', `Bearer ${playerToken}`)
    .send({})
    .expect(403);
});

test('MJ : present-question OK avec teamId si qcm_mj_only', async () => {
  const res = await request(app)
    .post(`/api/gl/games/${gameId}/markers/${markerId}/present-question`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ teamId })
    .expect(200);
  assert.strictEqual(res.body.questionCode, 'QCM0001');
  assert.ok(res.body.presentation?.presentationToken);
});

test('Joueur : qcm/answer refusé si qcm_mj_only', async () => {
  const present = await request(app)
    .post(`/api/gl/games/${gameId}/markers/${markerId}/present-question`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ teamId })
    .expect(200);

  await request(app)
    .post(`/api/gl/games/${gameId}/qcm/answer`)
    .set('Authorization', `Bearer ${playerToken}`)
    .send({
      questionCode: present.body.questionCode,
      presentationToken: present.body.presentation.presentationToken,
      choiceId: 1,
      markerId,
    })
    .expect(403);
});
