'use strict';

// Audit ForetMap du 19/11/2026, lot 9 (quiz, liens d'apprentissage, verrouillage).
// Chaque test rejoue le scénario de l'audit (§ 6) et échoue sans la correction.
//
//   P1  : une question `strict` se résolvait sans compte, avec contexte ressource ;
//   P2  : créer / importer une question sur un emplacement (catégorie, numéro) pris écrasait
//         l'autre question ;
//   P3  : modifier une question effaçait le caractère bloquant d'un lien glossaire `keyword` ;
//   P4  : un import partiel purgeait les liens `keyword` de toutes les questions ;
//   P10 : l'échéance du verrou était calculée par `NOW()` de la base (voir aussi le fichier
//         sans base `audit-fm-lot9-cooldown-utc.test.js`).

require('./helpers/setup');
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute, queryOne, queryAll } = require('../database');
const { setSetting } = require('../lib/settings');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');
const { applyFmQuizImport } = require('../lib/fmQuizImport');
const { registerResourceCooldown } = require('../lib/learningGatingCooldown');

const stamp = Date.now();
const short = String(stamp).slice(-7);
const catSlug = `l9cat${stamp}`.slice(0, 64);
const Q_GATED = `QL9G${short}`;
const Q_A = `QL9A${short}`;
const Q_B = `QL9B${short}`;
const GLOSS = `GL9${short}`;
const GLOSS_TERM = `lotneufterme${short}`;
let tutorialId = 0;
let teacherToken = '';
const students = [];

const teacher = () => ({ Authorization: `Bearer ${teacherToken}` });
const bearer = (s) => ({ Authorization: `Bearer ${s.token}` });
const ctx = () => `?resourceType=tutorial&resourceRef=${encodeURIComponent(String(tutorialId))}`;

async function registerStudent(suffix) {
  const reg = await request(app)
    .post('/api/auth/register')
    .send({
      firstName: 'Lot',
      lastName: `Neuf${suffix}${stamp}`,
      pseudo: `lotneuf${suffix}${stamp}`.slice(0, 40),
      password: 'testpass1234',
      affiliation: 'both',
    })
    .expect(201);
  const s = { token: reg.body.authToken, id: String(reg.body.id) };
  students.push(s);
  return s;
}

function choose(presentation, correct) {
  return presentation.choices.find((c) => (c.text === 'Bonne') === correct);
}

function questionBody(code, numero, extra = {}) {
  return {
    question_code: code,
    categorie_slug: catSlug,
    numero_dans_categorie: numero,
    question: `Énoncé de ${code} ?`,
    choix_a: 'Bonne',
    choix_b: 'Fausse 1',
    choix_c: 'Fausse 2',
    reponse_correcte: 'A',
    niveau: 'college',
    ...extra,
  };
}

function importRow(code, numero, extra = {}) {
  return {
    question_code: code,
    categorie_slug: catSlug,
    numero_dans_categorie: numero,
    question: `Énoncé importé de ${code} ?`,
    choix_a: 'Bonne',
    choix_b: 'Fausse 1',
    choix_c: 'Fausse 2',
    reponse_correcte: 'A',
    niveau: 'college',
    ...extra,
  };
}

const importCategory = () => ({
  categorie_slug: catSlug,
  categorie_nom: 'Lot 9',
  theme: 'sciences',
  ordre: 999,
});

const db = { queryAll, queryOne, execute };

before(async () => {
  await initSchema();
  teacherToken = await ensureAdminTeacherAuthToken();
  await execute(
    "INSERT IGNORE INTO quiz_categories (slug, nom, theme, order_index) VALUES (?, 'Lot 9', 'sciences', 999)",
    [catSlug],
  );
  await execute(
    `INSERT IGNORE INTO quiz_questions
      (question_code, categorie_slug, numero_dans_categorie, question, choix_a, choix_b, choix_c,
       reponse_correcte, niveau, statut)
     VALUES (?, ?, 1, 'Question bloquante ?', 'Bonne', 'Fausse 1', 'Fausse 2', 'A', 'college', 'actif')`,
    [Q_GATED, catSlug],
  );
  const tut = await execute(
    "INSERT INTO tutorials (title, slug, type, is_active, created_at, updated_at) VALUES ('Lot 9', ?, 'html', 1, NOW(), NOW())",
    [`l9-tuto-${stamp}`.slice(0, 80)],
  );
  tutorialId = tut.insertId;
  await execute(
    `INSERT IGNORE INTO resource_question_links
      (resource_type, resource_ref, question_code, is_gating, weight, origin, status)
     VALUES ('tutorial', ?, ?, 1, 1, 'manual', 'approved')`,
    [String(tutorialId), Q_GATED],
  );
  await execute(
    `INSERT IGNORE INTO glossary_terms
       (glossary_code, terme, variantes, categorie, niveau, definition_courte, statut)
     VALUES (?, ?, '', 'flore', 'base', 'Terme du lot 9', 'actif')`,
    [GLOSS, GLOSS_TERM],
  );
  await setSetting('learning.gating.enabled', true, {});
  await setSetting('learning.gating.default_mode', 'any', {});
  await setSetting('learning.gating.allowed_wrong_attempts', 0, {});
  await setSetting('learning.gating.retry_cooldown_hours', 6, {});
  await setSetting('learning.gating.lock_mode', 'strict', {});
  await setSetting('learning.gating.cooldown_scope', 'resource', {});
});

beforeEach(async () => {
  await execute('DELETE FROM quiz_questions WHERE question_code IN (?, ?)', [Q_A, Q_B]);
  await execute('DELETE FROM resource_question_links WHERE question_code IN (?, ?)', [Q_A, Q_B]);
  for (const s of students) {
    await execute('DELETE FROM resource_gating_cooldowns WHERE user_id = ?', [s.id]);
  }
  await setSetting('learning.gating.lock_mode', 'strict', {});
});

after(async () => {
  await setSetting('learning.gating.enabled', false, {}).catch(() => {});
  await setSetting('learning.gating.lock_mode', 'flow', {}).catch(() => {});
  for (const s of students) {
    await execute('DELETE FROM resource_gating_cooldowns WHERE user_id = ?', [s.id]).catch(
      () => {},
    );
    await execute('DELETE FROM user_quiz_attempts WHERE user_id = ?', [s.id]).catch(() => {});
    await execute('DELETE FROM users WHERE id = ?', [s.id]).catch(() => {});
  }
  await execute('DELETE FROM resource_question_links WHERE question_code IN (?, ?, ?)', [
    Q_GATED,
    Q_A,
    Q_B,
  ]).catch(() => {});
  await execute('DELETE FROM quiz_questions WHERE categorie_slug = ?', [catSlug]).catch(() => {});
  await execute('DELETE FROM quiz_categories WHERE slug = ?', [catSlug]).catch(() => {});
  await execute('DELETE FROM glossary_terms WHERE glossary_code = ?', [GLOSS]).catch(() => {});
  if (tutorialId) {
    await execute('DELETE FROM tutorials WHERE id = ?', [tutorialId]).catch(() => {});
  }
});

// ---------------------------------------------------------------------------------------
// P1 — compte exigé dès qu'un contexte ressource est fourni
// ---------------------------------------------------------------------------------------

test('P1 : présentation avec contexte sans compte → 401 LOGIN_REQUIRED', async () => {
  const res = await request(app).get(`/api/quiz/questions/${Q_GATED}/present${ctx()}`);
  assert.equal(res.status, 401);
  assert.equal(res.body.code, 'LOGIN_REQUIRED');
  assert.match(res.body.error, /Connecte-toi/);
  assert.equal(res.body.presentationToken, undefined);
});

test('P1 : sans compte, on ne peut plus écarter les mauvais choix un à un', async () => {
  // Scénario de l'audit : quatre couples présentation / réponse anonymes en 200.
  for (let i = 0; i < 4; i += 1) {
    const res = await request(app).get(`/api/quiz/questions/${Q_GATED}/present${ctx()}`);
    assert.equal(res.status, 401);
  }
});

test('P1 : une présentation avec contexte ne se répond pas sans compte', async () => {
  const student = await registerStudent('a');
  const pres = await request(app)
    .get(`/api/quiz/questions/${Q_GATED}/present${ctx()}`)
    .set(bearer(student))
    .expect(200);
  const res = await request(app)
    .post(`/api/quiz/questions/${Q_GATED}/answer`)
    .send({
      presentationToken: pres.body.presentationToken,
      choiceId: choose(pres.body, false).id,
    });
  assert.equal(res.status, 401);
  assert.equal(res.body.code, 'LOGIN_REQUIRED');
  // Le jeton n'a pas été consommé : son titulaire peut encore répondre.
  const own = await request(app)
    .post(`/api/quiz/questions/${Q_GATED}/answer`)
    .set(bearer(student))
    .send({
      presentationToken: pres.body.presentationToken,
      choiceId: choose(pres.body, true).id,
    });
  assert.equal(own.status, 200);
  assert.equal(own.body.correct, true);
});

test('P1 : le jeton porte le compte — un autre compte est refusé (403)', async () => {
  const owner = await registerStudent('b');
  const other = await registerStudent('c');
  const pres = await request(app)
    .get(`/api/quiz/questions/${Q_GATED}/present${ctx()}`)
    .set(bearer(owner))
    .expect(200);
  const res = await request(app)
    .post(`/api/quiz/questions/${Q_GATED}/answer`)
    .set(bearer(other))
    .send({
      presentationToken: pres.body.presentationToken,
      choiceId: choose(pres.body, false).id,
    });
  assert.equal(res.status, 403);
  assert.equal(res.body.code, 'PRESENTATION_OTHER_ACCOUNT');
  // Aucun verrou posé au nom de l'un ou de l'autre.
  const locks = await queryAll(
    'SELECT user_id FROM resource_gating_cooldowns WHERE user_id IN (?, ?)',
    [owner.id, other.id],
  );
  assert.equal(locks.length, 0);
});

test('P1 : avec compte, une erreur pose bien le verrou (parcours nominal)', async () => {
  const student = await registerStudent('d');
  const pres = await request(app)
    .get(`/api/quiz/questions/${Q_GATED}/present${ctx()}`)
    .set(bearer(student))
    .expect(200);
  const res = await request(app)
    .post(`/api/quiz/questions/${Q_GATED}/answer`)
    .set(bearer(student))
    .send({
      presentationToken: pres.body.presentationToken,
      choiceId: choose(pres.body, false).id,
    })
    .expect(200);
  assert.equal(res.body.correct, false);
  assert.equal(res.body.cooldown?.locked, true);
});

test('P1 : réponse avec contexte dans le corps (advisory) sans compte → 401', async () => {
  await setSetting('learning.gating.lock_mode', 'advisory', {});
  // Question non bloquante : présentation libre permise.
  await request(app)
    .post('/api/quiz/admin/questions')
    .set(teacher())
    .send(questionBody(Q_A, 7))
    .expect(201);
  const pres = await request(app).get(`/api/quiz/questions/${Q_A}/present`).expect(200);
  const res = await request(app)
    .post(`/api/quiz/questions/${Q_A}/answer`)
    .send({
      presentationToken: pres.body.presentationToken,
      choiceId: choose(pres.body, false).id,
      resourceType: 'tutorial',
      resourceRef: String(tutorialId),
    });
  assert.equal(res.status, 401);
  // Sans contexte, le quiz libre anonyme reste ouvert.
  const free = await request(app).get(`/api/quiz/questions/${Q_A}/present`).expect(200);
  await request(app)
    .post(`/api/quiz/questions/${Q_A}/answer`)
    .send({
      presentationToken: free.body.presentationToken,
      choiceId: choose(free.body, true).id,
    })
    .expect(200);
});

// ---------------------------------------------------------------------------------------
// P2 — emplacement (catégorie, numéro) unique
// ---------------------------------------------------------------------------------------

test('P2 : créer une question sur un emplacement pris → 409, l’autre question intacte', async () => {
  await request(app)
    .post('/api/quiz/admin/questions')
    .set(teacher())
    .send(questionBody(Q_A, 5))
    .expect(201);
  const res = await request(app)
    .post('/api/quiz/admin/questions')
    .set(teacher())
    .send(questionBody(Q_B, 5, { question: 'Énoncé pirate ?', reponse_correcte: 'B' }));
  assert.equal(res.status, 409);
  assert.match(res.body.error, new RegExp(Q_A));
  const a = await queryOne(
    'SELECT question, reponse_correcte FROM quiz_questions WHERE question_code = ?',
    [Q_A],
  );
  assert.equal(a.question, `Énoncé de ${Q_A} ?`);
  assert.equal(a.reponse_correcte, 'A');
  const b = await queryOne('SELECT question_code FROM quiz_questions WHERE question_code = ?', [
    Q_B,
  ]);
  assert.ok(!b, 'la nouvelle question n’a pas été créée par écrasement');
});

test('P2 : déplacer une question sur un emplacement pris → 409', async () => {
  await request(app)
    .post('/api/quiz/admin/questions')
    .set(teacher())
    .send(questionBody(Q_A, 5))
    .expect(201);
  await request(app)
    .post('/api/quiz/admin/questions')
    .set(teacher())
    .send(questionBody(Q_B, 6))
    .expect(201);
  const res = await request(app)
    .put(`/api/quiz/admin/questions/${Q_B}`)
    .set(teacher())
    .send(questionBody(Q_B, 5));
  assert.equal(res.status, 409);
  const a = await queryOne('SELECT question FROM quiz_questions WHERE question_code = ?', [Q_A]);
  assert.equal(a.question, `Énoncé de ${Q_A} ?`);
  // Réenregistrer une question à sa propre place reste permis.
  await request(app)
    .put(`/api/quiz/admin/questions/${Q_B}`)
    .set(teacher())
    .send(questionBody(Q_B, 6, { question: 'Énoncé révisé ?' }))
    .expect(200);
});

test('P2 : importer une ligne sur un emplacement pris → erreur de ligne, rien d’écrasé', async () => {
  await request(app)
    .post('/api/quiz/admin/questions')
    .set(teacher())
    .send(questionBody(Q_A, 5))
    .expect(201);
  const report = await applyFmQuizImport(
    db,
    [importCategory()],
    [importRow(Q_B, 5, { question: 'Énoncé importé pirate ?', reponse_correcte: 'C' })],
    { dryRun: false },
  );
  assert.equal(report.totals.created, 0);
  assert.equal(report.totals.updated, 0);
  assert.ok(
    report.errors.some((e) => e.row === 2 && String(e.error).includes(Q_A)),
    JSON.stringify(report.errors),
  );
  const a = await queryOne(
    'SELECT question, reponse_correcte FROM quiz_questions WHERE question_code = ?',
    [Q_A],
  );
  assert.equal(a.question, `Énoncé de ${Q_A} ?`);
  assert.equal(a.reponse_correcte, 'A');
});

test('P2 : deux lignes du même fichier sur le même emplacement → la seconde est refusée', async () => {
  const report = await applyFmQuizImport(
    db,
    [importCategory()],
    [importRow(Q_A, 8), importRow(Q_B, 8)],
    { dryRun: true },
  );
  assert.equal(report.totals.created, 1);
  assert.ok(report.errors.some((e) => e.row === 3));
});

// ---------------------------------------------------------------------------------------
// P3 / P4 — liens glossaire `keyword`
// ---------------------------------------------------------------------------------------

async function keywordLink(code) {
  return queryOne(
    `SELECT id, is_gating, origin FROM resource_question_links
      WHERE resource_type = 'glossary' AND resource_ref = ? AND question_code = ?`,
    [GLOSS, code],
  );
}

test('P3 : modifier une question garde un lien `keyword` rendu bloquant par un prof', async () => {
  await request(app)
    .post('/api/quiz/admin/questions')
    .set(teacher())
    .send(questionBody(Q_A, 5, { tags: GLOSS_TERM }))
    .expect(201);
  const link = await keywordLink(Q_A);
  assert.ok(link, 'lien par mots-clés créé');
  assert.equal(link.origin, 'keyword');
  await request(app)
    .patch(`/api/learning-links/${link.id}`)
    .set(teacher())
    .send({ is_gating: true })
    .expect(200);

  await request(app)
    .put(`/api/quiz/admin/questions/${Q_A}`)
    .set(teacher())
    .send(questionBody(Q_A, 5, { tags: GLOSS_TERM, question: 'Énoncé corrigé ?' }))
    .expect(200);
  const after = await keywordLink(Q_A);
  assert.ok(after, 'le lien existe toujours');
  assert.equal(Number(after.is_gating), 1);
});

test('P4 : un import partiel ne purge pas les liens `keyword` des autres questions', async () => {
  await request(app)
    .post('/api/quiz/admin/questions')
    .set(teacher())
    .send(questionBody(Q_A, 5, { tags: GLOSS_TERM }))
    .expect(201);
  await request(app)
    .post('/api/quiz/admin/questions')
    .set(teacher())
    .send(questionBody(Q_B, 6, { tags: GLOSS_TERM }))
    .expect(201);
  assert.ok(await keywordLink(Q_B));

  // Import d'un fichier qui ne contient que Q_A, sans mot-clé.
  const report = await applyFmQuizImport(db, [importCategory()], [importRow(Q_A, 5)], {
    dryRun: false,
  });
  assert.equal(report.errors.length, 0, JSON.stringify(report.errors));
  assert.ok(!(await keywordLink(Q_A)), 'Q_A recalculé : plus de mot-clé, plus de lien');
  assert.ok(await keywordLink(Q_B), 'Q_B, absente du fichier, garde son lien');
});

// ---------------------------------------------------------------------------------------
// P10 — échéance du verrou en UTC
// ---------------------------------------------------------------------------------------

test('P10 : l’échéance relue est exactement maintenant + délai (UTC)', async () => {
  const student = await registerStudent('e');
  const nowMs = Date.UTC(2031, 0, 15, 10, 0, 0);
  await registerResourceCooldown(db, {
    product: 'fm',
    userId: student.id,
    resourceType: 'tutorial',
    resourceRef: String(tutorialId),
    questionCode: Q_GATED,
    retryHours: 6,
    nowMs,
  });
  const row = await queryOne(
    `SELECT locked_until FROM resource_gating_cooldowns
      WHERE user_id = ? AND resource_type = 'tutorial' AND resource_ref = ?`,
    [student.id, String(tutorialId)],
  );
  const until = row.locked_until instanceof Date ? row.locked_until.getTime() : row.locked_until;
  assert.equal(new Date(until).toISOString(), '2031-01-15T16:00:00.000Z');
});
