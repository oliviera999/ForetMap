'use strict';

// Sévérité du verrou (`lock_mode`), délai en heures et cohérence résumé/challenge — lot 2 de
// docs/AUDIT_VALIDATION_QUIZ_2026-09.md (A3, A4), côté Gnomes & Licornes.

require('./helpers/setup');
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute } = require('../database');
const glSettings = require('../lib/glSettings');
const {
  createGlAdmin,
  createGlClass,
  createGlPlayer,
  createGlChapterWithMarker,
  createGlGameWithTeams,
  signTokens,
} = require('./helpers/glFixtures');

const stamp = Date.now();
const catSlug = `glmcat${stamp}`.slice(0, 64);
const pageSlug = `glmpage${stamp}`.slice(0, 80);
const code = `GLM${String(stamp).slice(-6)}`.slice(0, 16);
const password = 'lockmode1234';

let player = null;
let glToken = '';
let teamToken = '';
let teamId = null;

const site = (over = {}) =>
  glSettings.setGatingCacheForTests({
    enabled: true,
    granularity: 'player',
    defaultMode: 'any',
    retryCooldownHours: 6,
    lockMode: 'flow',
    ...over,
  });

const withContext = () => `?resourceType=content_page&resourceRef=${encodeURIComponent(pageSlug)}`;

function present(query = '', token = glToken) {
  return request(app)
    .get(`/api/gl/qcm/questions/${code}/present${query}`)
    .set('Authorization', 'Bearer ' + token);
}

function answer(presentation, { correct, body = {} }) {
  const choice = presentation.choices.find((c) => (c.text === 'Bonne') === correct);
  return request(app)
    .post(`/api/gl/qcm/questions/${code}/answer`)
    .set('Authorization', 'Bearer ' + glToken)
    .send({ presentationToken: presentation.presentationToken, choiceId: choice.id, ...body });
}

async function challenge(token = glToken) {
  const res = await request(app)
    .get(
      `/api/gl/learning/gating/challenge?resourceType=content_page&resourceRef=${encodeURIComponent(pageSlug)}`,
    )
    .set('Authorization', 'Bearer ' + token)
    .expect(200);
  return res.body;
}

async function summary(token = glToken) {
  const res = await request(app)
    .get(
      `/api/gl/learning/gating/summary?resourceType=content_page&resourceRefs=${encodeURIComponent(pageSlug)}`,
    )
    .set('Authorization', 'Bearer ' + token)
    .expect(200);
  return res.body.items.find((i) => i.resource_ref === pageSlug);
}

before(async () => {
  await initSchema();
  await execute(
    `INSERT IGNORE INTO gl_qcm_categories (slug, nom, order_index) VALUES (?, 'Lock mode', 999)`,
    [catSlug],
  );
  await execute(
    `INSERT IGNORE INTO gl_qcm_questions
      (question_code, biome_slug, categorie_slug, numero_dans_categorie, question, choix_a, choix_b, choix_c, reponse_correcte, niveau)
     VALUES (?, 'savane', ?, 1, 'Quelle réponse ?', 'Bonne', 'Fausse 1', 'Fausse 2', 'A', 'college')`,
    [code, catSlug],
  );
  await execute(
    `INSERT INTO gl_content_pages (slug, title, body_markdown, updated_by, updated_at)
     VALUES (?, 'Page lock mode', 'Corps', 'test', NOW())
     ON DUPLICATE KEY UPDATE title = VALUES(title)`,
    [pageSlug],
  );
  await execute(
    `INSERT IGNORE INTO gl_resource_question_links
      (question_dataset, resource_type, resource_ref, question_code, is_gating, weight, origin, status)
     VALUES ('qcm', 'content_page', ?, ?, 1, 1, 'manual', 'approved')`,
    [pageSlug, code],
  );

  const admin = await createGlAdmin({ email: `glm.${stamp}@ecole.local` });
  const cls = await createGlClass({ name: `Glm ${stamp}`, adminId: admin.id });
  player = await createGlPlayer({
    classId: cls.id,
    pseudo: `glm${stamp}`.slice(0, 40),
    password,
    firstName: 'Lock',
    lastName: 'Mode',
  });
  const login = await request(app)
    .post('/api/gl/auth/login')
    .send({ pseudo: player.pseudo, password });
  glToken = login.body.authToken;

  const { chapter } = await createGlChapterWithMarker({ slug: `glm-chap-${stamp}` });
  const { teams } = await createGlGameWithTeams({
    classId: cls.id,
    chapterId: chapter.id,
    createdBy: admin.id,
    name: `Partie Glm ${stamp}`,
    teams: [{ name: `Equipe Glm ${stamp}` }],
  });
  teamId = Number(teams[0].id);
  ({ playerToken: teamToken } = await signTokens({
    playerId: player.id,
    playerPseudo: player.pseudo,
    teamId,
  }));
});

beforeEach(async () => {
  site();
  await execute('DELETE FROM gl_qcm_attempts WHERE question_code = ?', [code]);
  await execute('DELETE FROM gl_resource_gating_cooldowns WHERE resource_ref = ?', [pageSlug]);
  await execute('DELETE FROM gl_learning_acknowledgements WHERE target_code = ?', [pageSlug]);
  await execute(
    "DELETE FROM gl_resource_gating_policy WHERE resource_type = 'content_page' AND resource_ref IN (?, '*')",
    [pageSlug],
  );
  require('../lib/learningGatingLockMode').invalidateStrictCodesCache();
});

after(async () => {
  glSettings.setGatingCacheForTests(null);
  await execute('DELETE FROM gl_qcm_attempts WHERE question_code = ?', [code]).catch(() => {});
  await execute('DELETE FROM gl_resource_gating_cooldowns WHERE resource_ref = ?', [
    pageSlug,
  ]).catch(() => {});
  await execute('DELETE FROM gl_learning_acknowledgements WHERE target_code = ?', [pageSlug]).catch(
    () => {},
  );
  await execute(
    "DELETE FROM gl_resource_gating_policy WHERE resource_type = 'content_page' AND resource_ref IN (?, '*')",
    [pageSlug],
  ).catch(() => {});
  await execute('DELETE FROM gl_resource_question_links WHERE question_code = ?', [code]).catch(
    () => {},
  );
  await execute('DELETE FROM gl_content_pages WHERE slug = ?', [pageSlug]).catch(() => {});
  await execute('DELETE FROM gl_qcm_questions WHERE question_code = ?', [code]).catch(() => {});
  await execute('DELETE FROM gl_qcm_categories WHERE slug = ?', [catSlug]).catch(() => {});
  if (player?.id) await execute('DELETE FROM gl_players WHERE id = ?', [player.id]).catch(() => {});
});

test('GL flow — erreur avec jeton contextualisé : verrou de 6 h ; le corps seul ne verrouille pas', async () => {
  const free = await present().expect(200);
  const ignored = await answer(free.body, {
    correct: false,
    body: { resourceType: 'content_page', resourceRef: pageSlug },
  });
  assert.equal(ignored.body.cooldown, undefined, 'contexte du corps ignoré en sévérité normale');

  const shown = await present(withContext()).expect(200);
  assert.deepEqual(shown.body.resource, { type: 'content_page', ref: pageSlug });
  const wrong = await answer(shown.body, { correct: false });
  assert.equal(wrong.body.cooldown?.locked, true);
  assert.equal(wrong.body.cooldown.retry_hours, 6);
  assert.equal(wrong.body.cooldown.retry_label, '6 h');
  const state = await challenge();
  assert.equal(state.cooldown.locked, true);
  assert.equal(state.lock_mode, 'flow');
  await request(app)
    .post(`/api/gl/learning/mark/content_page/${encodeURIComponent(pageSlug)}`)
    .set('Authorization', 'Bearer ' + glToken)
    .send({ confirm: true })
    .expect(403);
});

test('GL strict (préréglage par type) — refus hors flux, exclusion du tirage', async () => {
  await execute(
    `INSERT INTO gl_resource_gating_policy (resource_type, resource_ref, mode, required_correct, enabled, lock_mode)
     VALUES ('content_page', '*', 'inherit', 1, 1, 'strict')`,
  );
  require('../lib/learningGatingLockMode').invalidateStrictCodesCache();
  assert.equal((await challenge()).lock_mode, 'strict');

  const refused = await present().expect(403);
  assert.deepEqual(refused.body.reserved_for, [{ type: 'content_page', ref: pageSlug }]);
  const draw = await request(app)
    .get(`/api/gl/qcm/draw?biomeSlug=savane&categorieSlug=${encodeURIComponent(catSlug)}`)
    .set('Authorization', 'Bearer ' + glToken);
  assert.equal(draw.status, 404, 'la seule question de la catégorie est réservée');
  await present(withContext()).expect(200);

  site({ enabled: false });
  require('../lib/learningGatingLockMode').invalidateStrictCodesCache();
  await present().expect(200);
});

test('GL advisory — le contexte du corps pose le verrou (comportement historique)', async () => {
  site({ lockMode: 'advisory' });
  const free = await present().expect(200);
  const res = await answer(free.body, {
    correct: false,
    body: { resourceType: 'content_page', resourceRef: pageSlug },
  });
  assert.equal(res.body.cooldown?.locked, true);
});

test('A3 — granularité « player » : le résumé ne compte pas les réponses de l’équipe', async () => {
  // La bonne réponse est portée par l'équipe (le MJ a répondu pour elle).
  await execute(
    `INSERT INTO gl_qcm_attempts
      (reader_user_type, reader_user_id, question_dataset, question_code, is_correct, team_id, answered_at)
     VALUES ('gl_admin', ?, 'qcm', ?, 1, ?, NOW())`,
    [`mj-${stamp}`, code, teamId],
  );
  const item = await summary(teamToken);
  const state = await challenge(teamToken);
  assert.equal(state.satisfied, false, 'en granularité joueur, l’équipe ne compte pas');
  assert.equal(item.satisfied, false, 'le résumé dit la même chose que le challenge');
  assert.equal(item.pending_count, state.pending_count);

  site({ granularity: 'team' });
  const teamItem = await summary(teamToken);
  const teamState = await challenge(teamToken);
  assert.equal(teamState.satisfied, true, 'en granularité équipe, la réponse du MJ compte');
  assert.equal(teamItem.satisfied, true);
});
