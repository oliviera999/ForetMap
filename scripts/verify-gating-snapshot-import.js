#!/usr/bin/env node
'use strict';

/**
 * Vérifie le conditionnement « lu/appris » sur un snapshot prod importé (foretmap_local).
 * Usage : node scripts/verify-gating-snapshot-import.js
 */

require('dotenv').config();
process.env.NODE_ENV = process.env.NODE_ENV || 'test';

const assert = require('node:assert/strict');
const request = require('supertest');
const { initDatabase, queryOne, execute } = require('../database');
const { app } = require('../server');
const { createGlAdmin, createGlClass, createGlPlayer } = require('../tests/helpers/glFixtures');

const stamp = Date.now();
const FM_PSEUDO = `gatingfm${stamp}`.slice(0, 40);
const GL_PSEUDO = `gatinggl${stamp}`.slice(0, 40);
const GL_PASSWORD = 'gatingtest1';

async function waitForReady() {
  for (let i = 0; i < 40; i += 1) {
    const res = await request(app).get('/api/ready');
    if (res.status === 200 && res.body?.ok) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('Serveur non prêt (/api/ready)');
}

async function presentAndAnswer({ presentPath, answerPath, token, table, code, correctLetter }) {
  const letter = String(correctLetter || '')
    .trim()
    .toUpperCase();
  const row = await queryOne(`SELECT * FROM ${table} WHERE question_code = ? LIMIT 1`, [code]);
  assert.ok(row, `question ${code} introuvable`);
  const correctText = String(
    row[`choix_${letter.toLowerCase()}`] || row.reponse_texte || '',
  ).trim();
  assert.ok(correctText, `texte choix ${letter} manquant pour ${code}`);

  const present = await request(app)
    .get(presentPath)
    .set('Authorization', token ? `Bearer ${token}` : '');
  assert.equal(present.status, 200, `present ${code}: ${present.status} ${present.text}`);

  const choice = present.body?.choices?.find((c) => String(c.text || '').trim() === correctText);
  assert.ok(choice, `choix correct introuvable dans la présentation ${code}`);
  const answer = await request(app)
    .post(answerPath)
    .set('Authorization', token ? `Bearer ${token}` : '')
    .send({ presentationToken: present.body.presentationToken, choiceId: choice.id });
  assert.equal(answer.status, 200, `answer ${code}: ${answer.status} ${answer.text}`);
  assert.equal(answer.body?.correct, true, `réponse incorrecte pour ${code}`);
  return answer.body;
}

async function main() {
  await initDatabase();
  await waitForReady();

  // Smoke listes (complète test:snapshot si SERVICE_NOT_READY au boot)
  const zones = await request(app).get('/api/zones');
  assert.equal(zones.status, 200, `zones: ${zones.status}`);
  assert.ok(zones.body.length > 0, 'zones vide');
  const plants = await request(app).get('/api/plants');
  assert.equal(plants.status, 200, `plants: ${plants.status}`);
  assert.ok(plants.body.length > 0, 'plants vide');

  const gatingFm = await queryOne(
    "SELECT value_json FROM app_settings WHERE `key` = 'learning.gating.enabled' LIMIT 1",
  );
  const gatingGl = await queryOne(
    "SELECT value_json FROM gl_settings WHERE `key` = 'gating.enabled' LIMIT 1",
  );
  assert.equal(String(gatingFm?.value_json || '').replace(/"/g, ''), 'true', 'FM gating OFF');
  assert.equal(String(gatingGl?.value_json || '').replace(/"/g, ''), 'true', 'GL gating OFF');

  // --- ForetMap ---
  const reg = await request(app)
    .post('/api/auth/register')
    .send({
      firstName: 'Gating',
      lastName: `Test${stamp}`,
      pseudo: FM_PSEUDO,
      password: 'testpass1234',
      affiliation: 'both',
    });
  assert.equal(reg.status, 201, `register FM: ${reg.status} ${reg.text}`);
  const fmToken = reg.body.authToken;
  const fmUserId = reg.body.id;
  assert.ok(fmToken && fmUserId, 'token élève FM manquant');

  await presentAndAnswer({
    presentPath: '/api/quiz/questions/QF0080/present',
    answerPath: '/api/quiz/questions/QF0080/answer',
    token: fmToken,
    table: 'quiz_questions',
    code: 'QF0080',
    correctLetter: 'A',
  });
  const tutReadBefore = await queryOne(
    'SELECT 1 AS x FROM user_tutorial_reads WHERE user_id = ? AND tutorial_id = 1 LIMIT 1',
    [fmUserId],
  );
  assert.equal(tutReadBefore, undefined, 'tutoriel #1 ne doit pas être auto-marqué après QF0080');

  const tutAck = await request(app)
    .post('/api/tutorials/1/acknowledge-read')
    .set('Authorization', `Bearer ${fmToken}`)
    .send({ confirm: true });
  assert.equal(tutAck.status, 200, `ack tutoriel: ${tutAck.status} ${tutAck.text}`);
  const tutRead = await queryOne(
    'SELECT 1 AS x FROM user_tutorial_reads WHERE user_id = ? AND tutorial_id = 1 LIMIT 1',
    [fmUserId],
  );
  assert.ok(tutRead, 'tutoriel #1 non marqué lu après accusé + QF0080');

  await presentAndAnswer({
    presentPath: '/api/quiz/questions/QF0010/present',
    answerPath: '/api/quiz/questions/QF0010/answer',
    token: fmToken,
    table: 'quiz_questions',
    code: 'QF0010',
    correctLetter: 'A',
  });
  const plantObsBefore = await queryOne(
    'SELECT 1 AS x FROM user_plant_observation_events WHERE user_id = ? AND plant_id = 1 LIMIT 1',
    [fmUserId],
  );
  assert.equal(plantObsBefore, undefined, 'plante #1 ne doit pas être auto-observée après QF0010');
  const plantAck = await request(app)
    .post('/api/plants/1/acknowledge-discovery')
    .set('Authorization', `Bearer ${fmToken}`)
    .send({ confirm: true });
  assert.equal(plantAck.status, 200, `ack plante: ${plantAck.status} ${plantAck.text}`);
  const plantObs = await queryOne(
    'SELECT 1 AS x FROM user_plant_observation_events WHERE user_id = ? AND plant_id = 1 LIMIT 1',
    [fmUserId],
  );
  assert.ok(plantObs, 'plante #1 (Laitue) non observée après accusé + QF0010');

  // --- GL ---
  const admin = await createGlAdmin({
    email: `gating.mj.${stamp}@ecole.local`,
    displayName: 'MJ Gating',
  });
  const cls = await createGlClass({ name: `Gating ${stamp}`, adminId: admin.id });
  const player = await createGlPlayer({
    classId: cls.id,
    pseudo: GL_PSEUDO,
    password: GL_PASSWORD,
    firstName: 'Joueur',
    lastName: 'Gating',
  });

  const glLogin = await request(app)
    .post('/api/gl/auth/login')
    .send({ pseudo: GL_PSEUDO, password: GL_PASSWORD });
  assert.equal(glLogin.status, 200, `login GL: ${glLogin.status} ${glLogin.text}`);
  const glToken = glLogin.body.authToken;
  assert.ok(glToken, 'token GL manquant');

  await presentAndAnswer({
    presentPath: '/api/gl/qcm/questions/GQCM0759/present',
    answerPath: '/api/gl/qcm/questions/GQCM0759/answer',
    token: glToken,
    table: 'gl_qcm_questions',
    code: 'GQCM0759',
    correctLetter: 'B',
  });
  const speciesAckBefore = await queryOne(
    `SELECT 1 AS x FROM gl_learning_acknowledgements
      WHERE reader_user_type = 'gl_player' AND reader_user_id = ? AND target_type = 'species' AND target_code = 'SP0099'
      LIMIT 1`,
    [String(player.id)],
  );
  assert.equal(speciesAckBefore, undefined, 'SP0099 ne doit pas être auto-marquée après GQCM0759');
  const speciesPost = await request(app)
    .post('/api/gl/learning/species/SP0099')
    .set('Authorization', `Bearer ${glToken}`)
    .send({ confirm: true });
  assert.equal(speciesPost.status, 200, `ack espèce: ${speciesPost.status} ${speciesPost.text}`);
  const speciesAck = await queryOne(
    `SELECT 1 AS x FROM gl_learning_acknowledgements
      WHERE reader_user_type = 'gl_player' AND reader_user_id = ? AND target_type = 'species' AND target_code = 'SP0099'
      LIMIT 1`,
    [String(player.id)],
  );
  assert.ok(speciesAck, 'SP0099 (Gnou bleu) non marquée étudiée après accusé + GQCM0759');

  await presentAndAnswer({
    presentPath: '/api/gl/qcm/questions/QCM0093/present',
    answerPath: '/api/gl/qcm/questions/QCM0093/answer',
    token: glToken,
    table: 'gl_qcm_questions',
    code: 'QCM0093',
    correctLetter: 'B',
  });
  const glossAckBefore = await queryOne(
    `SELECT 1 AS x FROM gl_learning_acknowledgements
      WHERE reader_user_type = 'gl_player' AND reader_user_id = ? AND target_type = 'glossary' AND target_code = 'GL0001'
      LIMIT 1`,
    [String(player.id)],
  );
  assert.equal(glossAckBefore, undefined, 'GL0001 ne doit pas être auto-marqué après QCM0093');
  const glossPost = await request(app)
    .post('/api/gl/learning/glossary/GL0001')
    .set('Authorization', `Bearer ${glToken}`)
    .send({ confirm: true });
  assert.equal(glossPost.status, 200, `ack glossaire: ${glossPost.status} ${glossPost.text}`);
  const glossAck = await queryOne(
    `SELECT 1 AS x FROM gl_learning_acknowledgements
      WHERE reader_user_type = 'gl_player' AND reader_user_id = ? AND target_type = 'glossary' AND target_code = 'GL0001'
      LIMIT 1`,
    [String(player.id)],
  );
  assert.ok(glossAck, 'GL0001 (abeille) non marqué appris après accusé + QCM0093');

  // Nettoyage léger (comptes de test uniquement)
  await execute('DELETE FROM user_tutorial_reads WHERE user_id = ?', [fmUserId]).catch(() => {});
  await execute('DELETE FROM user_plant_observation_events WHERE user_id = ?', [fmUserId]).catch(
    () => {},
  );
  await execute('DELETE FROM user_quiz_attempts WHERE user_id = ?', [fmUserId]).catch(() => {});
  await execute('DELETE FROM users WHERE id = ?', [fmUserId]).catch(() => {});
  await execute(
    'DELETE FROM gl_learning_acknowledgements WHERE reader_user_type = ? AND reader_user_id = ?',
    ['gl_player', String(player.id)],
  ).catch(() => {});
  await execute('DELETE FROM gl_qcm_attempts WHERE reader_user_id = ?', [String(player.id)]).catch(
    () => {},
  );
  await execute('DELETE FROM gl_players WHERE id = ?', [player.id]).catch(() => {});
  await execute('DELETE FROM gl_classes WHERE id = ?', [cls.id]).catch(() => {});
  await execute('DELETE FROM gl_admins WHERE id = ?', [admin.id]).catch(() => {});

  console.log("[verify-gating] OK — snapshot prod + conditionnement pull à l'accusé validés.");
  console.log('  FM: QF0080 + accusé → tutoriel #1 lu ; QF0010 + accusé → plante #1 observée');
  console.log(
    '  GL: GQCM0759 + accusé → SP0099 étudiée ; QCM0093 + accusé → GL0001 glossaire appris',
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[verify-gating] ÉCHEC:', err.message || err);
    process.exit(1);
  });
