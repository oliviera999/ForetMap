'use strict';

// A.1 — Quiz-gating des « nouveaux » types marquables du carnet joueur GL.
// Prouve de bout en bout que « marquer appris » peut exiger un quiz pour
// `content_page` et `ecosystem` (via l'endpoint générique /learning/mark),
// exactement comme pour species/glossary/tutorial. Le core acceptait déjà ces
// types ; ce test verrouille le comportement (consulter → quiz → confirmer → appris).

require('./helpers/setup');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, queryOne, execute } = require('../database');
const glSettings = require('../lib/glSettings');
const { createGlAdmin, createGlClass, createGlPlayer } = require('./helpers/glFixtures');

const stamp = Date.now();
const glq = `GNT${stamp}`.slice(0, 16);
const catSlug = `gntcat${stamp}`.slice(0, 64);
const pageSlug = `gntpage${stamp}`.slice(0, 80);
const biomeSlug = 'savane'; // biome réel (migration 092)
const password = 'gatingnt1';
let player = null;
let glToken = '';

before(async () => {
  await initSchema();
  await execute(
    `INSERT IGNORE INTO gl_qcm_categories (slug, nom, order_index) VALUES (?, 'NT', 999)`,
    [catSlug],
  );
  await execute(
    `INSERT IGNORE INTO gl_qcm_questions
      (question_code, categorie_slug, numero_dans_categorie, question, choix_a, choix_b, choix_c, reponse_correcte, niveau)
     VALUES (?, ?, 1, 'Q ?', 'A', 'B', 'C', 'A', 'college')`,
    [glq, catSlug],
  );
  // Page de contenu réelle (existence contrôlée par resourceExists).
  await execute(
    `INSERT INTO gl_content_pages (slug, title, body_markdown, updated_by, updated_at)
     VALUES (?, 'Page NT', 'Corps NT', 'test', NOW())
     ON DUPLICATE KEY UPDATE title = VALUES(title)`,
    [pageSlug],
  );
  // Liens de gating : la même question conditionne la page ET l'écosystème.
  await execute(
    `INSERT IGNORE INTO gl_resource_question_links
      (question_dataset, resource_type, resource_ref, question_code, is_gating, weight, origin, status)
     VALUES ('qcm', 'content_page', ?, ?, 1, 1, 'manual', 'approved')`,
    [pageSlug, glq],
  );
  await execute(
    `INSERT IGNORE INTO gl_resource_question_links
      (question_dataset, resource_type, resource_ref, question_code, is_gating, weight, origin, status)
     VALUES ('qcm', 'ecosystem', ?, ?, 1, 1, 'manual', 'approved')`,
    [biomeSlug, glq],
  );

  const admin = await createGlAdmin({ email: `gnt.${stamp}@ecole.local` });
  const cls = await createGlClass({ name: `Gnt ${stamp}`, adminId: admin.id });
  player = await createGlPlayer({
    classId: cls.id,
    pseudo: `gnt${stamp}`.slice(0, 40),
    password,
    firstName: 'Gl',
    lastName: 'Nt',
  });
  const login = await request(app)
    .post('/api/gl/auth/login')
    .send({ pseudo: player.pseudo, password });
  glToken = login.body.authToken;
});

after(async () => {
  glSettings.setGatingCacheForTests(null);
  await execute('DELETE FROM gl_learning_acknowledgements WHERE target_code IN (?, ?)', [
    pageSlug,
    biomeSlug,
  ]).catch(() => {});
  await execute('DELETE FROM gl_qcm_attempts WHERE question_code = ?', [glq]).catch(() => {});
  await execute('DELETE FROM gl_resource_question_links WHERE question_code = ?', [glq]).catch(
    () => {},
  );
  await execute('DELETE FROM gl_content_pages WHERE slug = ?', [pageSlug]).catch(() => {});
  await execute('DELETE FROM gl_qcm_questions WHERE question_code = ?', [glq]).catch(() => {});
  await execute('DELETE FROM gl_qcm_categories WHERE slug = ?', [catSlug]).catch(() => {});
  if (player?.id) await execute('DELETE FROM gl_players WHERE id = ?', [player.id]).catch(() => {});
});

test('GL — challenge de gating disponible pour content_page et ecosystem', async () => {
  glSettings.setGatingCacheForTests({
    enabled: true,
    granularity: 'player',
    defaultMode: 'any',
    defaultRequiredCorrect: 1,
  });
  for (const [type, ref] of [
    ['content_page', pageSlug],
    ['ecosystem', biomeSlug],
  ]) {
    const res = await request(app)
      .get(
        `/api/gl/learning/gating/challenge?resourceType=${type}&resourceRef=${encodeURIComponent(ref)}`,
      )
      .set('Authorization', 'Bearer ' + glToken)
      .expect(200);
    assert.equal(res.body.required, true, `${type} doit exiger un quiz`);
    assert.equal(res.body.pending_count, 1);
    assert.equal(res.body.questions[0].question_code, glq);
  }
});

test('GL — mark content_page : 403 sans bonne réponse puis 200 après', async () => {
  glSettings.setGatingCacheForTests({ enabled: true, granularity: 'player' });
  await execute(
    'DELETE FROM gl_learning_acknowledgements WHERE reader_user_id = ? AND target_code = ?',
    [String(player.id), pageSlug],
  );
  await execute('DELETE FROM gl_qcm_attempts WHERE reader_user_id = ?', [String(player.id)]);

  await request(app)
    .post(`/api/gl/learning/mark/content_page/${encodeURIComponent(pageSlug)}`)
    .set('Authorization', 'Bearer ' + glToken)
    .send({ confirm: true })
    .expect(403);

  await execute(
    `INSERT INTO gl_qcm_attempts
      (reader_user_type, reader_user_id, question_dataset, question_code, is_correct, answered_at)
     VALUES ('gl_player', ?, 'qcm', ?, 1, NOW())`,
    [String(player.id), glq],
  );

  const ok = await request(app)
    .post(`/api/gl/learning/mark/content_page/${encodeURIComponent(pageSlug)}`)
    .set('Authorization', 'Bearer ' + glToken)
    .send({ confirm: true })
    .expect(200);
  assert.equal(ok.body.success, true);
  assert.equal(ok.body.target_type, 'content_page');
});

test('GL — mark ecosystem : 200 après bonne réponse (quiz partagé)', async () => {
  glSettings.setGatingCacheForTests({ enabled: true, granularity: 'player' });
  await execute(
    'DELETE FROM gl_learning_acknowledgements WHERE reader_user_id = ? AND target_code = ?',
    [String(player.id), biomeSlug],
  );
  // La bonne réponse au quiz partagé (posée au test précédent) satisfait aussi l'écosystème.
  const ok = await request(app)
    .post(`/api/gl/learning/mark/ecosystem/${encodeURIComponent(biomeSlug)}`)
    .set('Authorization', 'Bearer ' + glToken)
    .send({ confirm: true })
    .expect(200);
  assert.equal(ok.body.success, true);
  assert.equal(ok.body.target_type, 'ecosystem');

  const ack = await queryOne(
    `SELECT 1 AS x FROM gl_learning_acknowledgements
      WHERE reader_user_type = 'gl_player' AND reader_user_id = ? AND target_code = ? LIMIT 1`,
    [String(player.id), biomeSlug],
  );
  assert.ok(ack);
});
