'use strict';

require('./helpers/setup');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, queryOne, execute } = require('../database');
const glSettings = require('../lib/glSettings');
const { createGlAdmin, createGlClass, createGlPlayer } = require('./helpers/glFixtures');

const stamp = Date.now();
const glq = `GQA${stamp}`.slice(0, 16);
const speciesRef = `SPA${stamp}`.slice(0, 64);
const catSlug = `gqcat${stamp}`.slice(0, 64);
const password = 'gatinggl1';
let player = null;
let glToken = '';

before(async () => {
  await initSchema();
  await execute(
    `INSERT IGNORE INTO gl_qcm_categories (slug, nom, order_index) VALUES (?, 'RT', 999)`,
    [catSlug],
  );
  await execute(
    `INSERT IGNORE INTO gl_qcm_questions
      (question_code, categorie_slug, numero_dans_categorie, question, choix_a, choix_b, choix_c, reponse_correcte, niveau)
     VALUES (?, ?, 1, 'Q ?', 'A', 'B', 'C', 'A', 'college')`,
    [glq, catSlug],
  );
  await execute(
    `INSERT INTO gl_species (
      species_code, biome_slug, type, nom_commun, nom_scientifique, statut, created_at, updated_at
    ) VALUES (?, 'savane', 'faune', 'Espèce RT', 'Testus rtii', 'actif', NOW(), NOW())`,
    [speciesRef],
  );
  await execute(
    `INSERT IGNORE INTO gl_resource_question_links
      (question_dataset, resource_type, resource_ref, question_code, is_gating, weight, origin, status)
     VALUES ('qcm', 'species', ?, ?, 1, 1, 'manual', 'approved')`,
    [speciesRef, glq],
  );

  const admin = await createGlAdmin({ email: `gack.${stamp}@ecole.local` });
  const cls = await createGlClass({ name: `Gack ${stamp}`, adminId: admin.id });
  player = await createGlPlayer({
    classId: cls.id,
    pseudo: `gack${stamp}`.slice(0, 40),
    password,
    firstName: 'Gl',
    lastName: 'Ack',
  });
  const login = await request(app)
    .post('/api/gl/auth/login')
    .send({ pseudo: player.pseudo, password });
  glToken = login.body.authToken;
});

after(async () => {
  glSettings.setGatingCacheForTests(null);
  await execute('DELETE FROM gl_learning_acknowledgements WHERE target_code = ?', [
    speciesRef,
  ]).catch(() => {});
  await execute('DELETE FROM gl_qcm_attempts WHERE question_code = ?', [glq]).catch(() => {});
  await execute('DELETE FROM gl_resource_question_links WHERE question_code = ?', [glq]).catch(
    () => {},
  );
  await execute('DELETE FROM gl_species WHERE species_code = ?', [speciesRef]).catch(() => {});
  await execute('DELETE FROM gl_qcm_questions WHERE question_code = ?', [glq]).catch(() => {});
  await execute('DELETE FROM gl_qcm_categories WHERE slug = ?', [catSlug]).catch(() => {});
  if (player?.id) await execute('DELETE FROM gl_players WHERE id = ?', [player.id]).catch(() => {});
});

test('GL — GET challenge espèce avec question pending', async () => {
  glSettings.setGatingCacheForTests({
    enabled: true,
    granularity: 'player',
    defaultMode: 'any',
    defaultRequiredCorrect: 1,
  });
  const res = await request(app)
    .get(
      `/api/gl/learning/gating/challenge?resourceType=species&resourceRef=${encodeURIComponent(speciesRef)}`,
    )
    .set('Authorization', 'Bearer ' + glToken)
    .expect(200);
  assert.equal(res.body.required, true);
  assert.equal(res.body.pending_count, 1);
  assert.equal(res.body.questions[0].question_code, glq);
});

test('GL — POST species acknowledge 403 puis 200 après bonne réponse', async () => {
  glSettings.setGatingCacheForTests({ enabled: true, granularity: 'player' });
  await execute(
    'DELETE FROM gl_learning_acknowledgements WHERE reader_user_id = ? AND target_code = ?',
    [String(player.id), speciesRef],
  );
  await execute('DELETE FROM gl_qcm_attempts WHERE reader_user_id = ?', [String(player.id)]);

  await request(app)
    .post(`/api/gl/learning/species/${encodeURIComponent(speciesRef)}`)
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
    .post(`/api/gl/learning/species/${encodeURIComponent(speciesRef)}`)
    .set('Authorization', 'Bearer ' + glToken)
    .send({ confirm: true })
    .expect(200);
  assert.equal(ok.body.success, true);

  const ack = await queryOne(
    `SELECT 1 AS x FROM gl_learning_acknowledgements
      WHERE reader_user_type = 'gl_player' AND reader_user_id = ? AND target_code = ? LIMIT 1`,
    [String(player.id), speciesRef],
  );
  assert.ok(ack);
});
