'use strict';

// Conditionnement par QCM du type `feuillet` avec le jeu de questions LORE (`qcm_lore`).
// Comble le trou de couverture relevé par docs/AUDIT_GATING_QCM_FEUILLETS_2026-08.md (J5) :
// `gl-learning-gating-newtypes` couvre content_page/ecosystem sur le dataset `qcm`, et rien
// ne verrouillait la seule combinaison qui fait basculer client et serveur vers
// /api/gl/lore/qcm/... — celle du Carnet de Sélène.
//
// Couvre aussi J2 (feuillet désactivé non marquable) et F3 (tentative enregistrée même
// conditionnement éteint, donc activation rétroactive).

require('./helpers/setup');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, queryOne, execute } = require('../database');
const glSettings = require('../lib/glSettings');
const { createGlAdmin, createGlClass, createGlPlayer } = require('./helpers/glFixtures');

const stamp = Date.now();
const scopeSlug = `lfg${stamp}`.slice(0, 64);
const catSlug = `lfgcat${stamp}`.slice(0, 64);
const loreCode = `LQCM9${String(stamp).slice(-5)}`.slice(0, 16); // préfixe LQCM = dataset lore
const feuilletCode = `lfg-${String(stamp).slice(-8)}`;
const feuilletOff = `lfgoff-${String(stamp).slice(-8)}`;
const password = 'feuilletgating1';
const CORRECT_TEXT = 'Le pacte du seuil';

let player = null;
let glToken = '';

before(async () => {
  await initSchema();

  await execute(
    `INSERT IGNORE INTO gl_qcm_lore_scopes (slug, nom, order_index) VALUES (?, 'Scope feuillet gating', 999)`,
    [scopeSlug],
  );
  await execute(
    `INSERT IGNORE INTO gl_qcm_lore_categories (slug, nom, order_index) VALUES (?, 'Cat feuillet gating', 999)`,
    [catSlug],
  );
  await execute(
    `INSERT IGNORE INTO gl_qcm_lore_questions
      (question_code, chapitre_slug, categorie_slug, numero_dans_categorie, question,
       choix_a, choix_b, choix_c, choix_d, choix_e, reponse_correcte, statut)
     VALUES (?, ?, ?, 1, 'Que scelle Sélène au seuil du biome ?', ?, 'Une carte', 'Un sortilège', 'Une gemme', '', 'A', 'actif')`,
    [loreCode, scopeSlug, catSlug, CORRECT_TEXT],
  );

  // Deux feuillets : un actif (parcours nominal), un désactivé (garde J2).
  await execute(
    `INSERT INTO gl_lore_feuillets (feuillet_code, titre, texte, statut)
     VALUES (?, 'Feuillet du seuil', 'Texte du feuillet.', 'actif')
     ON DUPLICATE KEY UPDATE statut = 'actif'`,
    [feuilletCode],
  );
  await execute(
    `INSERT INTO gl_lore_feuillets (feuillet_code, titre, texte, statut)
     VALUES (?, 'Feuillet retiré', 'Texte retiré.', 'inactif')
     ON DUPLICATE KEY UPDATE statut = 'inactif'`,
    [feuilletOff],
  );

  // Lien bloquant approuvé : le feuillet actif est conditionné par la question LORE.
  await execute(
    `INSERT IGNORE INTO gl_resource_question_links
      (question_dataset, resource_type, resource_ref, question_code, is_gating, weight, origin, status)
     VALUES ('qcm_lore', 'feuillet', ?, ?, 1, 1, 'manual', 'approved')`,
    [feuilletCode, loreCode],
  );

  const admin = await createGlAdmin({ email: `lfg.${stamp}@ecole.local` });
  const cls = await createGlClass({ name: `Lfg ${stamp}`, adminId: admin.id });
  player = await createGlPlayer({
    classId: cls.id,
    pseudo: `lfg${stamp}`.slice(0, 40),
    password,
    firstName: 'Lore',
    lastName: 'Feuillet',
  });
  const login = await request(app)
    .post('/api/gl/auth/login')
    .send({ pseudo: player.pseudo, password });
  glToken = login.body.authToken;
});

after(async () => {
  glSettings.setGatingCacheForTests(null);
  await execute('DELETE FROM gl_learning_acknowledgements WHERE target_code IN (?, ?)', [
    feuilletCode,
    feuilletOff,
  ]).catch(() => {});
  await execute('DELETE FROM gl_qcm_attempts WHERE question_code = ?', [loreCode]).catch(() => {});
  await execute('DELETE FROM gl_resource_gating_cooldowns WHERE resource_ref = ?', [
    feuilletCode,
  ]).catch(() => {});
  await execute('DELETE FROM gl_resource_question_links WHERE question_code = ?', [loreCode]).catch(
    () => {},
  );
  await execute('DELETE FROM gl_lore_feuillets WHERE feuillet_code IN (?, ?)', [
    feuilletCode,
    feuilletOff,
  ]).catch(() => {});
  await execute('DELETE FROM gl_qcm_lore_questions WHERE question_code = ?', [loreCode]).catch(
    () => {},
  );
  await execute('DELETE FROM gl_qcm_lore_categories WHERE slug = ?', [catSlug]).catch(() => {});
  await execute('DELETE FROM gl_qcm_lore_scopes WHERE slug = ?', [scopeSlug]).catch(() => {});
  if (player?.id) await execute('DELETE FROM gl_players WHERE id = ?', [player.id]).catch(() => {});
});

/** Réinitialise l'état du lecteur entre deux scénarios. */
async function resetReaderState() {
  await execute('DELETE FROM gl_qcm_attempts WHERE reader_user_id = ?', [String(player.id)]).catch(
    () => {},
  );
  await execute('DELETE FROM gl_learning_acknowledgements WHERE reader_user_id = ?', [
    String(player.id),
  ]).catch(() => {});
  await execute('DELETE FROM gl_resource_gating_cooldowns WHERE reader_user_id = ?', [
    String(player.id),
  ]).catch(() => {});
}

test('GL — le challenge d’un feuillet annonce la question du jeu LORE', async () => {
  glSettings.setGatingCacheForTests({ enabled: true, granularity: 'player', retryCooldownDays: 3 });
  await resetReaderState();

  const res = await request(app)
    .get(
      `/api/gl/learning/gating/challenge?resourceType=feuillet&resourceRef=${encodeURIComponent(feuilletCode)}`,
    )
    .set('Authorization', 'Bearer ' + glToken)
    .expect(200);

  assert.equal(res.body.required, true);
  assert.equal(res.body.pending_count, 1);
  assert.equal(res.body.questions[0].question_code, loreCode);
  // C'est ce champ qui fait basculer le client vers /api/gl/lore/qcm/... :
  assert.equal(res.body.questions[0].question_dataset, 'qcm_lore');
  assert.equal(res.body.cooldown.retry_days, 3);
});

test('GL — « Marquer comme étudié » : 403 tant que la question LORE n’est pas réussie', async () => {
  glSettings.setGatingCacheForTests({ enabled: true, granularity: 'player', retryCooldownDays: 3 });
  await resetReaderState();

  const res = await request(app)
    .post(`/api/gl/learning/mark/feuillet/${encodeURIComponent(feuilletCode)}`)
    .set('Authorization', 'Bearer ' + glToken)
    .send({ confirm: true })
    .expect(403);
  assert.deepEqual(res.body.missing_question_codes, [loreCode]);
});

test('GL — parcours complet : présenter, répondre juste sur le jeu LORE, puis marquer étudié', async () => {
  glSettings.setGatingCacheForTests({ enabled: true, granularity: 'player', retryCooldownDays: 3 });
  await resetReaderState();

  const present = await request(app)
    .get(`/api/gl/lore/qcm/questions/${loreCode}/present`)
    .set('Authorization', 'Bearer ' + glToken)
    .expect(200);
  const correctId = present.body.choices.find((c) => c.text === CORRECT_TEXT)?.id;
  assert.ok(correctId != null, 'le choix correct doit être présent');

  const answer = await request(app)
    .post(`/api/gl/lore/qcm/questions/${loreCode}/answer`)
    .set('Authorization', 'Bearer ' + glToken)
    .send({
      presentationToken: present.body.presentationToken,
      choiceId: correctId,
      // Contexte ressource : c'est lui qui arme le verrou en cas d'erreur.
      resourceType: 'feuillet',
      resourceRef: feuilletCode,
    })
    .expect(200);
  assert.equal(answer.body.correct, true);
  assert.equal(answer.body.qcmSet, 'lore');
  assert.equal(answer.body.cooldown, undefined, 'aucun verrou sur une bonne réponse');

  const attempt = await queryOne(
    `SELECT question_dataset, is_correct FROM gl_qcm_attempts
      WHERE reader_user_id = ? AND question_code = ? LIMIT 1`,
    [String(player.id), loreCode],
  );
  assert.ok(attempt, 'la tentative doit être enregistrée');
  assert.equal(attempt.question_dataset, 'qcm_lore');

  const challenge = await request(app)
    .get(
      `/api/gl/learning/gating/challenge?resourceType=feuillet&resourceRef=${encodeURIComponent(feuilletCode)}`,
    )
    .set('Authorization', 'Bearer ' + glToken)
    .expect(200);
  assert.equal(challenge.body.pending_count, 0);
  assert.equal(challenge.body.questions[0].already_correct, true);

  const mark = await request(app)
    .post(`/api/gl/learning/mark/feuillet/${encodeURIComponent(feuilletCode)}`)
    .set('Authorization', 'Bearer ' + glToken)
    .send({ confirm: true })
    .expect(200);
  assert.equal(mark.body.success, true);
  assert.equal(mark.body.target_type, 'feuillet');

  const ack = await queryOne(
    `SELECT 1 AS x FROM gl_learning_acknowledgements
      WHERE reader_user_type = 'gl_player' AND reader_user_id = ? AND target_type = 'feuillet'
        AND target_code = ? LIMIT 1`,
    [String(player.id), feuilletCode],
  );
  assert.ok(ack);
});

test('GL — un feuillet désactivé n’est pas marquable (404)', async () => {
  glSettings.setGatingCacheForTests({ enabled: false });
  await resetReaderState();

  const res = await request(app)
    .post(`/api/gl/learning/mark/feuillet/${encodeURIComponent(feuilletOff)}`)
    .set('Authorization', 'Bearer ' + glToken)
    .send({ confirm: true })
    .expect(404);
  assert.equal(res.body.error, 'Ressource introuvable');
});

test('GL — conditionnement éteint : la bonne réponse compte quand même une fois allumé', async () => {
  // F3 : l'écriture des tentatives ne dépend plus de gating.enabled — l'activation est rétroactive.
  glSettings.setGatingCacheForTests({ enabled: false });
  await resetReaderState();

  const present = await request(app)
    .get(`/api/gl/lore/qcm/questions/${loreCode}/present`)
    .set('Authorization', 'Bearer ' + glToken)
    .expect(200);
  const correctId = present.body.choices.find((c) => c.text === CORRECT_TEXT)?.id;
  await request(app)
    .post(`/api/gl/lore/qcm/questions/${loreCode}/answer`)
    .set('Authorization', 'Bearer ' + glToken)
    .send({ presentationToken: present.body.presentationToken, choiceId: correctId })
    .expect(200);

  // Conditionnement éteint : aucun quiz exigé…
  const off = await request(app)
    .get(
      `/api/gl/learning/gating/challenge?resourceType=feuillet&resourceRef=${encodeURIComponent(feuilletCode)}`,
    )
    .set('Authorization', 'Bearer ' + glToken)
    .expect(200);
  assert.equal(off.body.required, false);

  // …et une fois allumé, la réponse déjà donnée est reconnue : rien à repasser.
  glSettings.setGatingCacheForTests({ enabled: true, granularity: 'player', retryCooldownDays: 3 });
  const on = await request(app)
    .get(
      `/api/gl/learning/gating/challenge?resourceType=feuillet&resourceRef=${encodeURIComponent(feuilletCode)}`,
    )
    .set('Authorization', 'Bearer ' + glToken)
    .expect(200);
  assert.equal(on.body.required, true);
  assert.equal(on.body.pending_count, 0, 'la bonne réponse antérieure doit compter');
});
