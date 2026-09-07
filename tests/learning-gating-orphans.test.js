'use strict';

// Orphelins polymorphes (docs/AUDIT_VALIDATION_QUIZ_2026-09.md, C7) : supprimer une plante
// emporte ses liens, sa politique et ses verrous de conditionnement.

require('./helpers/setup');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute, queryOne } = require('../database');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');
const { purgeResourceGatingRows } = require('../lib/learningGatingOrphans');

const stamp = Date.now();
const catSlug = `orph${stamp}`.slice(0, 64);
const qcode = `QOR${stamp}`.slice(0, 16);
let token = '';
let plantId = 0;
let studentId = '';

before(async () => {
  await initSchema();
  token = await ensureAdminTeacherAuthToken();
  await execute(
    "INSERT IGNORE INTO quiz_categories (slug, nom, theme, order_index) VALUES (?, 'Orph', 'sciences', 999)",
    [catSlug],
  );
  await execute(
    `INSERT IGNORE INTO quiz_questions
      (question_code, categorie_slug, numero_dans_categorie, question, choix_a, choix_b, choix_c, reponse_correcte, niveau)
     VALUES (?, ?, 1, 'Q ?', 'A', 'B', 'C', 'A', 'college')`,
    [qcode, catSlug],
  );
  const plant = await execute('INSERT INTO plants (name, emoji) VALUES (?, ?)', [
    `Orpheline ${stamp}`,
    '🌱',
  ]);
  plantId = plant.insertId;
  await execute(
    `INSERT INTO resource_question_links (resource_type, resource_ref, question_code, is_gating, weight, origin, status)
     VALUES ('plant', ?, ?, 1, 1, 'manual', 'approved')`,
    [String(plantId), qcode],
  );
  await execute(
    "INSERT INTO resource_gating_policy (resource_type, resource_ref, mode, enabled) VALUES ('plant', ?, 'all', 1)",
    [String(plantId)],
  );
  // Le verrou porte une clé étrangère vers `users` : un vrai compte élève est nécessaire.
  const reg = await request(app)
    .post('/api/auth/register')
    .send({
      firstName: 'Orphe',
      lastName: `Line${stamp}`,
      pseudo: `orphan${stamp}`.slice(0, 40),
      password: 'testpass1234',
      affiliation: 'both',
    })
    .expect(201);
  studentId = reg.body.id;
  await execute(
    `INSERT INTO resource_gating_cooldowns
      (user_id, resource_type, resource_ref, question_code, locked_until, wrong_question_code, wrong_attempts)
     VALUES (?, 'plant', ?, '', DATE_ADD(NOW(), INTERVAL 1 DAY), ?, 1)`,
    [studentId, String(plantId), qcode],
  );
});

after(async () => {
  for (const table of [
    'resource_question_links',
    'resource_gating_policy',
    'resource_gating_cooldowns',
  ]) {
    await execute(`DELETE FROM ${table} WHERE resource_type = 'plant' AND resource_ref = ?`, [
      String(plantId),
    ]).catch(() => {});
  }
  await execute('DELETE FROM plants WHERE id = ?', [plantId]).catch(() => {});
  if (studentId) await execute('DELETE FROM users WHERE id = ?', [studentId]).catch(() => {});
  await execute('DELETE FROM quiz_questions WHERE question_code = ?', [qcode]).catch(() => {});
  await execute('DELETE FROM quiz_categories WHERE slug = ?', [catSlug]).catch(() => {});
});

async function countRows(table) {
  const row = await queryOne(
    `SELECT COUNT(*) AS n FROM ${table} WHERE resource_type = 'plant' AND resource_ref = ?`,
    [String(plantId)],
  );
  return Number(row.n);
}

test('purgeResourceGatingRows — ignore les paramètres vides et une base sans table', async () => {
  assert.deepEqual(await purgeResourceGatingRows(null, {}), {});
  assert.deepEqual(await purgeResourceGatingRows({ execute }, { resourceType: 'plant' }), {});
  const failing = {
    execute: async () => {
      throw new Error('no table');
    },
  };
  const res = await purgeResourceGatingRows(failing, { resourceType: 'plant', resourceRef: '1' });
  assert.deepEqual(Object.values(res), [0, 0, 0], 'best-effort : jamais bloquant');
});

test('DELETE /api/plants/:id emporte liens, politique et verrous de la plante', async () => {
  assert.equal(await countRows('resource_question_links'), 1);
  assert.equal(await countRows('resource_gating_policy'), 1);
  assert.equal(await countRows('resource_gating_cooldowns'), 1);
  await request(app)
    .delete(`/api/plants/${plantId}`)
    .set({ Authorization: `Bearer ${token}` })
    .expect(200);
  assert.equal(await countRows('resource_question_links'), 0);
  assert.equal(await countRows('resource_gating_policy'), 0);
  assert.equal(await countRows('resource_gating_cooldowns'), 0);
});
