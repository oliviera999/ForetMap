'use strict';

// Lot B (audit du 25/09/2026, § 1.5) : un lien bloquant vers une question désactivée ne
// verrouille rien. L'écran de couverture ne doit plus le compter comme un verrou, et le
// professeur qui crée un tel lien doit en être averti.

require('./helpers/setup');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute, queryOne } = require('../database');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');

const stamp = Date.now();
const catSlug = `inqcat${stamp}`.slice(0, 64);
const codeActive = `QIA${stamp}`.slice(0, 16);
const codeInactive = `QII${stamp}`.slice(0, 16);
const slug = `tuto-inactif-${stamp}`.slice(0, 190);
let token = '';
let tutorialId = 0;

const auth = () => ({ Authorization: `Bearer ${token}` });

before(async () => {
  await initSchema();
  token = await ensureAdminTeacherAuthToken();
  await execute(
    `INSERT IGNORE INTO quiz_categories (slug, nom, theme, order_index)
     VALUES (?, 'Test lot B', 'sciences', 997)`,
    [catSlug],
  );
  for (const [code, statut, n] of [
    [codeActive, 'actif', 1],
    [codeInactive, 'inactif', 2],
  ]) {
    await execute(
      `INSERT IGNORE INTO quiz_questions
        (question_code, categorie_slug, numero_dans_categorie, question,
         choix_a, choix_b, choix_c, reponse_correcte, niveau, statut)
       VALUES (?, ?, ?, 'Q ?', 'A', 'B', 'C', 'A', 'college', ?)`,
      [code, catSlug, n, statut],
    );
  }
  await execute(
    `INSERT INTO tutorials (title, slug, type, summary, html_content, is_active, sort_order)
     VALUES (?, ?, 'html', 'Résumé', '<p>Contenu</p>', 1, 901)`,
    [`Tutoriel lot B ${stamp}`, slug],
  );
  tutorialId = Number((await queryOne('SELECT id FROM tutorials WHERE slug = ?', [slug])).id);
});

after(async () => {
  await execute('DELETE FROM resource_question_links WHERE question_code IN (?, ?)', [
    codeActive,
    codeInactive,
  ]).catch(() => {});
  await execute('DELETE FROM quiz_questions WHERE question_code IN (?, ?)', [
    codeActive,
    codeInactive,
  ]).catch(() => {});
  if (tutorialId) await execute('DELETE FROM tutorials WHERE id = ?', [tutorialId]).catch(() => {});
  await execute('DELETE FROM quiz_categories WHERE slug = ?', [catSlug]).catch(() => {});
});

const postLink = (questionCode) =>
  request(app)
    .post('/api/learning-links')
    .set(auth())
    .send({
      resource_type: 'tutorial',
      resource_ref: String(tutorialId),
      question_code: questionCode,
      is_gating: true,
    });

test('POST vers une question inactive : 201 avec un avertissement', async () => {
  const res = await postLink(codeInactive).expect(201);
  assert.equal(res.body.link.question_code, codeInactive);
  assert.match(String(res.body.warning || ''), /inactive/i);
});

test('POST vers une question active : pas d’avertissement', async () => {
  const res = await postLink(codeActive).expect(201);
  assert.equal(res.body.warning, undefined);
});

test('GET /resources : seul le lien vers la question active compte comme verrou', async () => {
  const res = await request(app)
    .get('/api/learning-links/resources?type=tutorial')
    .set(auth())
    .expect(200);
  const mine = res.body.resources.find((r) => r.ref === String(tutorialId));
  assert.ok(mine, 'le tutoriel de test doit être listé');
  assert.equal(mine.links_count, 2);
  assert.equal(mine.gating_count, 1);
  assert.equal(mine.inactive_gating_count, 1);
  assert.equal(typeof res.body.without_active_gating_count, 'number');
  assert.equal(
    res.body.without_active_gating_count,
    res.body.resources.filter((r) => r.gating_count === 0).length,
  );
});

test('GET /resources : une question désactivée fait sortir la ressource des verrous', async () => {
  await execute("UPDATE quiz_questions SET statut = 'inactif' WHERE question_code = ?", [
    codeActive,
  ]);
  const res = await request(app)
    .get('/api/learning-links/resources?type=tutorial')
    .set(auth())
    .expect(200);
  const mine = res.body.resources.find((r) => r.ref === String(tutorialId));
  assert.equal(mine.gating_count, 0);
  assert.equal(mine.inactive_gating_count, 2);
});
