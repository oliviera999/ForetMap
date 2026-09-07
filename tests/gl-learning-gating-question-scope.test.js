'use strict';

// Portée « question seule » branchée côté Gnomes & Licornes — lot 3 de
// docs/AUDIT_VALIDATION_QUIZ_2026-09.md (A1). Même moteur que ForetMap : ce fichier vérifie
// la parité (challenge, résumé groupé, refus de présentation d'une question verrouillée).

require('./helpers/setup');
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute } = require('../database');
const glSettings = require('../lib/glSettings');
const { createGlAdmin, createGlClass, createGlPlayer } = require('./helpers/glFixtures');

const stamp = Date.now();
const catSlug = `glqscat${stamp}`.slice(0, 64);
const pageSlug = `glqspage${stamp}`.slice(0, 80);
const q1 = `GQS1${String(stamp).slice(-6)}`.slice(0, 16);
const q2 = `GQS2${String(stamp).slice(-6)}`.slice(0, 16);
const password = 'qscope1234';

let player = null;
let glToken = '';

const site = (over = {}) =>
  glSettings.setGatingCacheForTests({
    enabled: true,
    granularity: 'player',
    defaultMode: 'all',
    retryCooldownHours: 6,
    lockMode: 'flow',
    cooldownScope: 'question',
    ...over,
  });

const withContext = () => `?resourceType=content_page&resourceRef=${encodeURIComponent(pageSlug)}`;

function present(code, query = withContext()) {
  return request(app)
    .get(`/api/gl/qcm/questions/${code}/present${query}`)
    .set('Authorization', 'Bearer ' + glToken);
}

async function failQuestion(code) {
  const shown = await present(code).expect(200);
  const choice = shown.body.choices.find((c) => c.text !== 'Bonne');
  return request(app)
    .post(`/api/gl/qcm/questions/${code}/answer`)
    .set('Authorization', 'Bearer ' + glToken)
    .send({ presentationToken: shown.body.presentationToken, choiceId: choice.id });
}

async function challenge() {
  const res = await request(app)
    .get(
      `/api/gl/learning/gating/challenge?resourceType=content_page&resourceRef=${encodeURIComponent(pageSlug)}`,
    )
    .set('Authorization', 'Bearer ' + glToken)
    .expect(200);
  return res.body;
}

async function summaryItem() {
  const res = await request(app)
    .get(
      `/api/gl/learning/gating/summary?resourceType=content_page&resourceRefs=${encodeURIComponent(pageSlug)}`,
    )
    .set('Authorization', 'Bearer ' + glToken)
    .expect(200);
  return res.body.items.find((i) => i.resource_ref === pageSlug);
}

before(async () => {
  await initSchema();
  await execute(
    `INSERT IGNORE INTO gl_qcm_categories (slug, nom, order_index) VALUES (?, 'Question scope', 999)`,
    [catSlug],
  );
  for (const [code, n] of [
    [q1, 1],
    [q2, 2],
  ]) {
    await execute(
      `INSERT IGNORE INTO gl_qcm_questions
        (question_code, biome_slug, categorie_slug, numero_dans_categorie, question, choix_a, choix_b, choix_c, reponse_correcte, niveau)
       VALUES (?, 'savane', ?, ?, 'Quelle réponse ?', 'Bonne', 'Fausse 1', 'Fausse 2', 'A', 'college')`,
      [code, catSlug, n],
    );
  }
  await execute(
    `INSERT INTO gl_content_pages (slug, title, body_markdown, updated_by, updated_at)
     VALUES (?, 'Page question scope', 'Corps', 'test', NOW())
     ON DUPLICATE KEY UPDATE title = VALUES(title)`,
    [pageSlug],
  );
  for (const code of [q1, q2]) {
    await execute(
      `INSERT IGNORE INTO gl_resource_question_links
        (question_dataset, resource_type, resource_ref, question_code, is_gating, weight, origin, status)
       VALUES ('qcm', 'content_page', ?, ?, 1, 1, 'manual', 'approved')`,
      [pageSlug, code],
    );
  }
  const admin = await createGlAdmin({ email: `glqs.${stamp}@ecole.local` });
  const cls = await createGlClass({ name: `Glqs ${stamp}`, adminId: admin.id });
  player = await createGlPlayer({
    classId: cls.id,
    pseudo: `glqs${stamp}`.slice(0, 40),
    password,
    firstName: 'Question',
    lastName: 'Scope',
  });
  const login = await request(app)
    .post('/api/gl/auth/login')
    .send({ pseudo: player.pseudo, password });
  glToken = login.body.authToken;
});

beforeEach(async () => {
  site();
  await execute('DELETE FROM gl_qcm_attempts WHERE question_code IN (?, ?)', [q1, q2]);
  await execute('DELETE FROM gl_resource_gating_cooldowns WHERE resource_ref = ?', [pageSlug]);
  await execute('DELETE FROM gl_learning_acknowledgements WHERE target_code = ?', [pageSlug]);
});

after(async () => {
  glSettings.setGatingCacheForTests(null);
  await execute('DELETE FROM gl_qcm_attempts WHERE question_code IN (?, ?)', [q1, q2]).catch(
    () => {},
  );
  await execute('DELETE FROM gl_resource_gating_cooldowns WHERE resource_ref = ?', [
    pageSlug,
  ]).catch(() => {});
  await execute('DELETE FROM gl_learning_acknowledgements WHERE target_code = ?', [pageSlug]).catch(
    () => {},
  );
  await execute('DELETE FROM gl_resource_question_links WHERE question_code IN (?, ?)', [
    q1,
    q2,
  ]).catch(() => {});
  await execute('DELETE FROM gl_content_pages WHERE slug = ?', [pageSlug]).catch(() => {});
  await execute('DELETE FROM gl_qcm_questions WHERE question_code IN (?, ?)', [q1, q2]).catch(
    () => {},
  );
  await execute('DELETE FROM gl_qcm_categories WHERE slug = ?', [catSlug]).catch(() => {});
  if (player?.id) await execute('DELETE FROM gl_players WHERE id = ?', [player.id]).catch(() => {});
});

test('GL — Q1 ratée ne bloque que Q1 ; résumé et challenge d’accord ; Q1 refusée dans le flux', async () => {
  const wrong = await failQuestion(q1);
  assert.equal(wrong.body.cooldown?.locked, true);
  assert.equal(wrong.body.cooldown.scope, 'question');

  const state = await challenge();
  assert.equal(state.cooldown.locked, false, 'Q2 reste posable');
  assert.deepEqual(state.cooldown.locked_questions, [q1]);
  assert.equal(state.ask_count, 1);
  assert.equal(state.questions.find((q) => q.question_code === q1).locked, true);

  const item = await summaryItem();
  assert.equal(item.locked, false);
  assert.equal(item.ask_count, 1);

  await present(q1).expect(403);
  await present(q2).expect(200);
  await present(q1, '').expect(200);

  // Q2 ratée aussi : plus rien à poser, la fiche attend la levée la plus proche.
  await failQuestion(q2);
  const both = await challenge();
  assert.equal(both.cooldown.locked, true);
  assert.equal(both.cooldown.scope, 'question');
  assert.equal(both.ask_count, 0);
  assert.equal((await summaryItem()).locked, true);
  await request(app)
    .post(`/api/gl/learning/mark/content_page/${encodeURIComponent(pageSlug)}`)
    .set('Authorization', 'Bearer ' + glToken)
    .send({ confirm: true })
    .expect(403);
});

test('GL — portée « ressource » : Q1 ratée bloque aussi Q2', async () => {
  site({ cooldownScope: 'resource' });
  await failQuestion(q1);
  const state = await challenge();
  assert.equal(state.cooldown.locked, true);
  assert.equal(state.cooldown.scope, 'resource');
  await present(q2).expect(403);
});
