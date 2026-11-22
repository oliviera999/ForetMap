'use strict';

// Chantier collège (novembre 2026), intégration SI — câblage demandé par C2 : le HTML d'un
// tutoriel servi par `GET /api/tutorials/:id/view` ne souligne, pour un élève authentifié,
// que les termes de son palier (règle `glossary_depth_max`). Une requête sans compte (aperçu
// en iframe, qui part sans jeton) garde le comportement antérieur : tout est lié. Le palier
// entre dans la clé du cache de sortie (une sortie lycée ne sert jamais un collégien).

require('./helpers/setup');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const request = require('supertest');
const { initSchema, execute, queryOne } = require('../database');
const { app } = require('../server');
const { signAuthToken } = require('../middleware/requireTeacher');

const stamp = crypto.randomUUID().slice(0, 8);
const BASE_CODE = `FMSB${stamp}`.slice(0, 20);
const AVANCE_CODE = `FMSA${stamp}`.slice(0, 20);
const BASE_TERM = `racinette${stamp}`;
const AVANCE_TERM = `xylemoide${stamp}`;
const slug = `si-tuto-depth-${stamp}`;
let tutorialId;
const students = {};
const groups = [];

async function createStudentInClass(curriculumNiveau) {
  const id = crypto.randomUUID();
  const role = await queryOne(
    "SELECT id FROM roles WHERE slug IN ('eleve_novice', 'eleve') ORDER BY slug = 'eleve_novice' DESC LIMIT 1",
  );
  await execute(
    `INSERT INTO users (id, user_type, pseudo, display_name, is_active, created_at, updated_at)
     VALUES (?, 'student', ?, 'SI', 1, NOW(), NOW())`,
    [id, `si${curriculumNiveau}${stamp}`],
  );
  if (role) {
    await execute(
      'INSERT INTO user_roles (user_type, user_id, role_id, is_primary) VALUES (?, ?, ?, 1)',
      ['student', id, role.id],
    );
  }
  const groupId = crypto.randomUUID();
  await execute(
    `INSERT INTO \`groups\` (id, slug, name, kind, curriculum_niveau, is_active, created_at, updated_at)
     VALUES (?, ?, ?, 'class', ?, 1, NOW(), NOW())`,
    [groupId, `si-${curriculumNiveau}-${stamp}`, `SI ${curriculumNiveau}`, curriculumNiveau],
  );
  groups.push(groupId);
  await execute('INSERT INTO group_members (group_id, user_id, user_type) VALUES (?, ?, ?)', [
    groupId,
    id,
    'student',
  ]);
  const token = await signAuthToken({ userType: 'student', userId: id, canonicalUserId: id });
  return { id, token };
}

before(async () => {
  await initSchema();
  for (const [code, terme, niveau] of [
    [BASE_CODE, BASE_TERM, 'base'],
    [AVANCE_CODE, AVANCE_TERM, 'avance'],
  ]) {
    await execute(
      `INSERT INTO glossary_terms (glossary_code, terme, categorie, niveau, definition_courte, statut)
       VALUES (?, ?, 'taxonomie', ?, 'Définition de test.', 'actif')`,
      [code, terme, niveau],
    );
  }
  const res = await execute(
    `INSERT INTO tutorials (title, slug, type, html_content, is_active, created_at, updated_at)
     VALUES ('SI palier', ?, 'html', ?, 1, NOW(), NOW())`,
    [slug, `<html><body><p>Le mot ${BASE_TERM} et le mot ${AVANCE_TERM}.</p></body></html>`],
  );
  tutorialId = res.insertId;
  students.sixieme = await createStudentInClass('cycle3');
  students.seconde = await createStudentInClass('seconde');
});

after(async () => {
  await execute('DELETE FROM tutorials WHERE slug = ?', [slug]).catch(() => {});
  await execute('DELETE FROM glossary_terms WHERE glossary_code IN (?, ?)', [
    BASE_CODE,
    AVANCE_CODE,
  ]).catch(() => {});
  for (const s of Object.values(students)) {
    await execute('DELETE FROM group_members WHERE user_id = ?', [s.id]).catch(() => {});
    await execute('DELETE FROM user_roles WHERE user_id = ?', [s.id]).catch(() => {});
    await execute('DELETE FROM users WHERE id = ?', [s.id]).catch(() => {});
  }
  for (const g of groups) {
    await execute('DELETE FROM `groups` WHERE id = ?', [g]).catch(() => {});
  }
});

function linkedCodes(html) {
  return {
    base: html.includes(`data-glossary-code="${BASE_CODE}"`),
    avance: html.includes(`data-glossary-code="${AVANCE_CODE}"`),
  };
}

async function view(token) {
  const req = request(app).get(`/api/tutorials/${tutorialId}/view`);
  if (token) req.set('Authorization', `Bearer ${token}`);
  const res = await req.expect(200);
  return linkedCodes(res.text);
}

test('sans compte (aperçu en iframe) : tous les termes restent liés', async () => {
  assert.deepEqual(await view(null), { base: true, avance: true });
});

test('élève de 6e (cycle 3) : terme avancé non lié, terme de base lié', async () => {
  assert.deepEqual(await view(students.sixieme.token), { base: true, avance: false });
});

test('élève de 2de : tout lié, et la sortie 6e mise en cache ne lui est pas servie', async () => {
  await view(students.sixieme.token);
  assert.deepEqual(await view(students.seconde.token), { base: true, avance: true });
  assert.deepEqual(await view(students.sixieme.token), { base: true, avance: false });
});
