'use strict';

// Caractérisation de l'API quiz ForetMap (`/api/quiz/*`) — étape B2 de la piste B
// (docs/AUDIT_ETAT_DES_LIEUX_2026-09-25.md, § 3.3 ligne 8 et § 3.4).
//
// Ces tests figent les réponses HTTP **avant** l'extraction de `routes/quiz.js` vers
// `lib/pedago/quizService.js` et doivent passer à l'identique après : statuts, messages
// d'erreur, forme exacte des objets renvoyés. Ils complètent, sans les recopier :
//   - `quiz-api.test.js` (parcours nominal, fuite de la bonne réponse, import, CRUD) ;
//   - `curriculum-notions.test.js` (filtres « notion du programme ») ;
//   - `learning-gating-lock-mode.test.js` (contexte de validation, questions réservées) ;
//   - `quiz-question-stats.test.js` (taux de réussite par question).
//
// Jeu de données dédié : une catégorie propre au run, quatre questions aux niveaux et
// difficultés choisis, et une seconde catégorie pour les cas cassés — le tirage devient
// ainsi déterministe dès qu'un filtre ne laisse qu'une question.

require('./helpers/setup');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute, queryAll, queryOne } = require('../database');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');
const { parseNotionNiveauFilter } = require('../lib/curriculumNotions');

const stamp = String(Date.now()).slice(-8);
const CAT = `qcar${stamp}`;
const CAT_BROKEN = `qcarx${stamp}`;
const code = (suffix) => `QC${stamp}${suffix}`;
const TAG = `aiguille${stamp}`;

const Q = {
  collegeEasy: {
    code: code('A'),
    num: 1,
    niveau: 'college',
    difficulte: 1,
    label: '⭐ Facile',
    statut: 'actif',
    photo: null,
    feedbackB: 'Non : relis la définition.',
  },
  lyceeMedium: {
    code: code('B'),
    num: 2,
    niveau: 'lycee',
    difficulte: 2,
    label: '⭐⭐ Moyen',
    statut: 'actif',
    photo: 'https://example.org/photo-quiz.jpg',
    feedbackB: null,
  },
  lyceeHard: {
    code: code('C'),
    num: 3,
    niveau: 'lycee',
    difficulte: 3,
    label: '⭐⭐⭐ Difficile',
    statut: 'actif',
    // Espaces seuls : ne compte pas comme une question illustrée.
    photo: '   ',
    feedbackB: null,
    tags: TAG,
  },
  inactive: {
    code: code('D'),
    num: 4,
    niveau: 'college',
    difficulte: 1,
    label: '⭐ Facile',
    statut: 'inactif',
    photo: null,
    feedbackB: null,
  },
};
const BROKEN_CODE = code('E');
const ACTIVE_CODES = [Q.collegeEasy.code, Q.lyceeMedium.code, Q.lyceeHard.code];

let adminToken = '';
let studentToken = '';
let studentId = '';

const asAdmin = () => ({ Authorization: `Bearer ${adminToken}` });
const asStudent = () => ({ Authorization: `Bearer ${studentToken}` });

async function insertQuestion(slug, q) {
  await execute(
    `INSERT INTO quiz_questions
       (question_code, categorie_slug, numero_dans_categorie, question,
        choix_a, choix_b, choix_c, reponse_correcte, niveau, difficulte, difficulte_label,
        feedback_correct, feedback_b, tags, photo_url, statut)
     VALUES (?, ?, ?, ?, 'Bonne', 'Fausse B', 'Fausse C', 'A', ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      q.code,
      slug,
      q.num,
      `Question ${q.code} ?`,
      q.niveau,
      q.difficulte,
      q.label,
      q.num === 1 ? 'Exact : bravo.' : null,
      q.feedbackB,
      q.tags || null,
      q.photo,
      q.statut,
    ],
  );
}

before(async () => {
  await initSchema();
  adminToken = await ensureAdminTeacherAuthToken();
  await execute(
    "INSERT INTO quiz_categories (slug, nom, emoji, theme, description, order_index) VALUES (?, 'Caractérisation', '🧪', 'jardinage', 'Catégorie de test', 9990)",
    [CAT],
  );
  await execute(
    "INSERT INTO quiz_categories (slug, nom, theme, order_index) VALUES (?, 'Cassée', 'jardinage', 9991)",
    [CAT_BROKEN],
  );
  for (const q of Object.values(Q)) await insertQuestion(CAT, q);
  // Une seule proposition non vide : la présentation échoue (400), sans planter la route.
  await execute(
    `INSERT INTO quiz_questions
       (question_code, categorie_slug, numero_dans_categorie, question,
        choix_a, choix_b, choix_c, reponse_correcte, niveau, statut)
     VALUES (?, ?, 1, 'Question sans choix ?', 'Seule', '', '', 'A', 'college', 'actif')`,
    [BROKEN_CODE, CAT_BROKEN],
  );
  const reg = await request(app)
    .post('/api/auth/register')
    .send({
      firstName: 'Carac',
      lastName: `Quiz${stamp}`,
      pseudo: `caracquiz${stamp}`,
      password: 'testpass1234',
    })
    .expect(201);
  studentToken = reg.body.authToken;
  studentId = reg.body.id;
});

after(async () => {
  if (studentId) await execute('DELETE FROM users WHERE id = ?', [studentId]).catch(() => {});
  await execute('DELETE FROM user_quiz_attempts WHERE categorie_slug IN (?, ?)', [
    CAT,
    CAT_BROKEN,
  ]).catch(() => {});
  await execute('DELETE FROM resource_question_links WHERE question_code LIKE ?', [
    `QC${stamp}%`,
  ]).catch(() => {});
  await execute('DELETE FROM quiz_questions WHERE categorie_slug IN (?, ?)', [
    CAT,
    CAT_BROKEN,
  ]).catch(() => {});
  await execute('DELETE FROM quiz_categories WHERE slug IN (?, ?)', [CAT, CAT_BROKEN]).catch(
    () => {},
  );
});

/** Présente une question et renvoie l'identifiant du choix portant ce texte. */
async function presentAndPick(questionCode, text, headers = {}) {
  const present = await request(app)
    .get(`/api/quiz/questions/${questionCode}/present`)
    .set(headers)
    .expect(200);
  const choice = present.body.choices.find((c) => c.text === text);
  assert.ok(choice, `choix « ${text} » absent`);
  return { token: present.body.presentationToken, choiceId: choice.id, present: present.body };
}

// ---------------------------------------------------------------------------------------
// GET /api/quiz/draw — tirage par niveau, difficulté, illustration, catégorie
// ---------------------------------------------------------------------------------------

test('draw — une catégorie ne tire que ses questions actives', async () => {
  const drawn = new Set();
  for (let i = 0; i < 12; i += 1) {
    const res = await request(app).get(`/api/quiz/draw?categorieSlug=${CAT}`).expect(200);
    assert.deepEqual(Object.keys(res.body), ['question_code']);
    drawn.add(res.body.question_code);
  }
  for (const c of drawn) assert.ok(ACTIVE_CODES.includes(c), `${c} ne devrait pas être tirée`);
  assert.ok(!drawn.has(Q.inactive.code));
});

test('draw — le niveau filtre les questions (college → la seule question de collège)', async () => {
  for (let i = 0; i < 3; i += 1) {
    const res = await request(app)
      .get(`/api/quiz/draw?categorieSlug=${CAT}&niveau=college`)
      .expect(200);
    assert.deepEqual(res.body, { question_code: Q.collegeEasy.code });
  }
});

test('draw — niveau et difficulté combinés', async () => {
  const hard = await request(app)
    .get(`/api/quiz/draw?categorieSlug=${CAT}&niveau=lycee&difficulte=3`)
    .expect(200);
  assert.deepEqual(hard.body, { question_code: Q.lyceeHard.code });
  const medium = await request(app)
    .get(`/api/quiz/draw?categorieSlug=${CAT}&difficulte=2`)
    .expect(200);
  assert.deepEqual(medium.body, { question_code: Q.lyceeMedium.code });
  // Valeur vide : aucun filtre de difficulté.
  const empty = await request(app)
    .get(`/api/quiz/draw?categorieSlug=${CAT}&niveau=college&difficulte=`)
    .expect(200);
  assert.deepEqual(empty.body, { question_code: Q.collegeEasy.code });
});

test('draw — illustrated=1 / true : photo non vide seulement (espaces exclus)', async () => {
  for (const flag of ['1', 'true', 'TRUE']) {
    const res = await request(app)
      .get(`/api/quiz/draw?categorieSlug=${CAT}&niveau=lycee&illustrated=${flag}`)
      .expect(200);
    assert.deepEqual(res.body, { question_code: Q.lyceeMedium.code }, `illustrated=${flag}`);
  }
  // Toute autre valeur n'est pas un filtre.
  const drawn = new Set();
  for (let i = 0; i < 12; i += 1) {
    const res = await request(app)
      .get(`/api/quiz/draw?categorieSlug=${CAT}&niveau=lycee&illustrated=oui`)
      .expect(200);
    drawn.add(res.body.question_code);
  }
  for (const c of drawn) assert.ok([Q.lyceeMedium.code, Q.lyceeHard.code].includes(c));
});

test('draw — difficulté invalide : 400 « difficulte invalide »', async () => {
  for (const bad of ['0', '-1', 'abc', '1.5']) {
    const res = await request(app)
      .get(`/api/quiz/draw?categorieSlug=${CAT}&difficulte=${bad}`)
      .expect(400);
    assert.deepEqual(res.body, { error: 'difficulte invalide' }, `difficulte=${bad}`);
  }
  // La difficulté est contrôlée avant la notion.
  const both = await request(app).get('/api/quiz/draw?difficulte=abc&notionId=%21%21').expect(400);
  assert.deepEqual(both.body, { error: 'difficulte invalide' });
});

test('draw — notion invalide : 400 avec le message du filtre', async () => {
  const badId = await request(app).get('/api/quiz/draw?notionId=%21%21').expect(400);
  assert.deepEqual(badId.body, { error: 'notionId invalide' });
  const badNiveau = await request(app).get('/api/quiz/draw?notionNiveau=quatrieme').expect(400);
  assert.deepEqual(badNiveau.body, { error: parseNotionNiveauFilter('quatrieme').error });
  // Graphie alternative acceptée (`notion_niveau`).
  const alt = await request(app).get('/api/quiz/draw?notion_niveau=quatrieme').expect(400);
  assert.deepEqual(alt.body, badNiveau.body);
});

test('draw — aucun candidat : 404 « Aucune question disponible »', async () => {
  const res = await request(app)
    .get(`/api/quiz/draw?categorieSlug=${CAT}&niveau=college&difficulte=3`)
    .expect(404);
  assert.deepEqual(res.body, { error: 'Aucune question disponible' });
  const none = await request(app).get('/api/quiz/draw?categorieSlug=inexistante-zz').expect(404);
  assert.deepEqual(none.body, { error: 'Aucune question disponible' });
});

// ---------------------------------------------------------------------------------------
// GET /api/quiz/categories
// ---------------------------------------------------------------------------------------

test('categories — forme des lignes, sans compteur tant que le niveau est absent', async () => {
  const res = await request(app).get('/api/quiz/categories?theme=jardinage').expect(200);
  assert.deepEqual(Object.keys(res.body), ['categories']);
  const row = res.body.categories.find((c) => c.slug === CAT);
  assert.deepEqual(row, {
    slug: CAT,
    nom: 'Caractérisation',
    emoji: '🧪',
    theme: 'jardinage',
    description: 'Catégorie de test',
    order_index: 9990,
  });
  assert.ok(res.body.categories.every((c) => c.theme === 'jardinage'));
  // Ordre : order_index puis nom.
  const idx = res.body.categories.findIndex((c) => c.slug === CAT);
  const idxBroken = res.body.categories.findIndex((c) => c.slug === CAT_BROKEN);
  assert.ok(idx >= 0 && idxBroken === idx + 1);
});

test('categories — avec niveau : compteur de questions actives de ce niveau', async () => {
  const lycee = await request(app).get('/api/quiz/categories?niveau=lycee').expect(200);
  const lyceeRow = lycee.body.categories.find((c) => c.slug === CAT);
  assert.equal(lyceeRow.questionCount, 2);
  assert.equal(lycee.body.categories.find((c) => c.slug === CAT_BROKEN).questionCount, 0);
  const college = await request(app).get('/api/quiz/categories?niveau=college').expect(200);
  // La question inactive n'est pas comptée.
  assert.equal(college.body.categories.find((c) => c.slug === CAT).questionCount, 1);
  assert.equal(college.body.categories.find((c) => c.slug === CAT_BROKEN).questionCount, 1);
});

test('categories — notion invalide : 400', async () => {
  const res = await request(app).get('/api/quiz/categories?notionId=%21bad').expect(400);
  assert.deepEqual(res.body, { error: 'notionId invalide' });
  const niv = await request(app).get('/api/quiz/categories?notionNiveau=quatrieme').expect(400);
  assert.deepEqual(niv.body, { error: parseNotionNiveauFilter('quatrieme').error });
});

// ---------------------------------------------------------------------------------------
// GET /api/quiz/questions — catalogue public
// ---------------------------------------------------------------------------------------

test('questions — forme exacte, ordre, libellé de difficulté', async () => {
  const res = await request(app).get(`/api/quiz/questions?categorieSlug=${CAT}`).expect(200);
  assert.deepEqual(Object.keys(res.body), ['items']);
  assert.deepEqual(
    res.body.items,
    [Q.collegeEasy, Q.lyceeMedium, Q.lyceeHard].map((q) => ({
      question_code: q.code,
      theme: 'jardinage',
      categorie_slug: CAT,
      numero_dans_categorie: q.num,
      question: `Question ${q.code} ?`,
      niveau: q.niveau,
      difficulte: q.difficulte,
      difficulte_label: q.label,
    })),
  );
});

test('questions — filtres niveau, thème et recherche plein texte (énoncé + tags)', async () => {
  const lycee = await request(app)
    .get(`/api/quiz/questions?categorieSlug=${CAT}&niveau=lycee`)
    .expect(200);
  assert.deepEqual(
    lycee.body.items.map((i) => i.question_code),
    [Q.lyceeMedium.code, Q.lyceeHard.code],
  );
  const byTag = await request(app)
    .get(`/api/quiz/questions?categorieSlug=${CAT}&q=${TAG.toUpperCase()}`)
    .expect(200);
  assert.deepEqual(
    byTag.body.items.map((i) => i.question_code),
    [Q.lyceeHard.code],
  );
  const byText = await request(app)
    .get(`/api/quiz/questions?q=${Q.lyceeMedium.code.toLowerCase()}`)
    .expect(200);
  assert.deepEqual(
    byText.body.items.map((i) => i.question_code),
    [Q.lyceeMedium.code],
  );
  const wrongTheme = await request(app)
    .get(`/api/quiz/questions?categorieSlug=${CAT}&theme=sciences`)
    .expect(200);
  assert.deepEqual(wrongTheme.body.items, []);
});

test('questions — la bonne réponse : gestionnaire seulement ; jeton invalide = public', async () => {
  const admin = await request(app)
    .get(`/api/quiz/questions?categorieSlug=${CAT}`)
    .set(asAdmin())
    .expect(200);
  assert.deepEqual(
    admin.body.items.map((i) => [i.question_code, i.reponse_correcte]),
    ACTIVE_CODES.map((c) => [c, 'A']),
  );
  assert.equal(Object.keys(admin.body.items[0]).at(-1), 'reponse_correcte');
  const garbage = await request(app)
    .get(`/api/quiz/questions?categorieSlug=${CAT}`)
    .set({ Authorization: 'Bearer pas-un-jeton' })
    .expect(200);
  assert.ok(garbage.body.items.every((i) => !('reponse_correcte' in i)));
});

test('questions — notion invalide : 400', async () => {
  const res = await request(app).get('/api/quiz/questions?notionNiveau=quatrieme').expect(400);
  assert.deepEqual(res.body, { error: parseNotionNiveauFilter('quatrieme').error });
});

// ---------------------------------------------------------------------------------------
// GET /api/quiz/questions/:code/present — présentation signée
// ---------------------------------------------------------------------------------------

test('present — question inconnue ou inactive : 404', async () => {
  const unknown = await request(app).get('/api/quiz/questions/QZZZZZZZZ/present').expect(404);
  assert.deepEqual(unknown.body, { error: 'Question introuvable' });
  const inactive = await request(app)
    .get(`/api/quiz/questions/${Q.inactive.code}/present`)
    .expect(404);
  assert.deepEqual(inactive.body, { error: 'Question introuvable' });
});

test('present — forme de la présentation (code en minuscules accepté)', async () => {
  const res = await request(app)
    .get(`/api/quiz/questions/${Q.lyceeMedium.code.toLowerCase()}/present`)
    .expect(200);
  assert.deepEqual(Object.keys(res.body), [
    'presentationToken',
    'questionCode',
    'resource',
    'question',
    'choices',
    'glossaryTerms',
    'photoUrl',
    'photoCredit',
    'photoLicence',
    'photoLegende',
    'wikipediaUrl',
  ]);
  assert.equal(res.body.questionCode, Q.lyceeMedium.code);
  assert.equal(res.body.resource, null);
  assert.equal(res.body.question, `Question ${Q.lyceeMedium.code} ?`);
  assert.deepEqual(
    res.body.choices.map((c) => c.text).sort(),
    ['Bonne', 'Fausse B', 'Fausse C'].sort(),
  );
  assert.deepEqual(
    res.body.choices.map((c) => c.id),
    [0, 1, 2],
  );
  assert.deepEqual(res.body.glossaryTerms, []);
  assert.equal(res.body.photoUrl, Q.lyceeMedium.photo);
  assert.equal(res.body.photoCredit, null);
  assert.equal(res.body.wikipediaUrl, null);
  // Le jeton ne contient jamais l'index de la bonne réponse en clair.
  const claims = JSON.parse(
    Buffer.from(res.body.presentationToken.split('.')[1], 'base64url').toString('utf8'),
  );
  assert.equal(claims.kind, 'fm_quiz_present');
  assert.equal(claims.questionCode, Q.lyceeMedium.code);
  assert.ok(claims.answerHash && claims.nonce && claims.jti);
  assert.ok(!('correctChoiceId' in claims));
});

test('present — choix insuffisants : 400 avec le message de présentation', async () => {
  const res = await request(app).get(`/api/quiz/questions/${BROKEN_CODE}/present`).expect(400);
  assert.deepEqual(res.body, { error: 'Choix insuffisants pour la question' });
});

// ---------------------------------------------------------------------------------------
// POST /api/quiz/questions/:code/answer — vérification de la réponse signée
// ---------------------------------------------------------------------------------------

test('answer — question inconnue : 404 (avant toute lecture du jeton)', async () => {
  const res = await request(app)
    .post('/api/quiz/questions/QZZZZZZZZ/answer')
    .send({ presentationToken: 'x', choiceId: 0 })
    .expect(404);
  assert.deepEqual(res.body, { error: 'Question introuvable' });
});

test('answer — jeton invalide, question incompatible, choix invalide : 400', async () => {
  const invalid = await request(app)
    .post(`/api/quiz/questions/${Q.collegeEasy.code}/answer`)
    .send({ presentationToken: 'pas-un-jeton', choiceId: 0 })
    .expect(400);
  assert.deepEqual(invalid.body, { error: 'Token de présentation invalide ou expiré' });

  const { token, choiceId } = await presentAndPick(Q.collegeEasy.code, 'Bonne');
  const mismatch = await request(app)
    .post(`/api/quiz/questions/${Q.lyceeMedium.code}/answer`)
    .send({ presentationToken: token, choiceId })
    .expect(400);
  assert.deepEqual(mismatch.body, { error: 'Question incompatible avec le token' });

  const badChoice = await request(app)
    .post(`/api/quiz/questions/${Q.collegeEasy.code}/answer`)
    .send({ presentationToken: token, choiceId: -1 })
    .expect(400);
  assert.deepEqual(badChoice.body, { error: 'choiceId invalide' });

  // Aucun de ces refus n'a consommé le jeton : il reste utilisable une fois.
  const ok = await request(app)
    .post(`/api/quiz/questions/${Q.collegeEasy.code}/answer`)
    .send({ presentationToken: token, choiceId })
    .expect(200);
  assert.equal(ok.body.correct, true);
});

test('answer — bonne réponse anonyme : forme exacte, feedback de la question', async () => {
  const { token, choiceId } = await presentAndPick(Q.collegeEasy.code, 'Bonne');
  const before = await queryOne(
    'SELECT COUNT(*) AS n FROM user_quiz_attempts WHERE question_code = ?',
    [Q.collegeEasy.code],
  );
  const res = await request(app)
    .post(`/api/quiz/questions/${Q.collegeEasy.code}/answer`)
    .send({ presentationToken: token, choiceId })
    .expect(200);
  assert.deepEqual(res.body, {
    correct: true,
    feedback: 'Exact : bravo.',
    correctChoiceId: choiceId,
    glossaryTerms: [],
  });
  // Anonyme : aucune tentative enregistrée.
  const afterCount = await queryOne(
    'SELECT COUNT(*) AS n FROM user_quiz_attempts WHERE question_code = ?',
    [Q.collegeEasy.code],
  );
  assert.equal(Number(afterCount.n), Number(before.n));
});

test('answer — mauvaise réponse : feedback du choix, sinon message par défaut', async () => {
  const withFeedback = await presentAndPick(Q.collegeEasy.code, 'Fausse B');
  const res = await request(app)
    .post(`/api/quiz/questions/${Q.collegeEasy.code}/answer`)
    .send({ presentationToken: withFeedback.token, choiceId: withFeedback.choiceId })
    .expect(200);
  assert.deepEqual(res.body, { correct: false, feedback: 'Non : relis la définition.' });

  const noFeedback = await presentAndPick(Q.lyceeMedium.code, 'Fausse C');
  const res2 = await request(app)
    .post(`/api/quiz/questions/${Q.lyceeMedium.code}/answer`)
    .send({ presentationToken: noFeedback.token, choiceId: noFeedback.choiceId })
    .expect(200);
  assert.deepEqual(res2.body, { correct: false, feedback: 'Ce n’est pas la bonne réponse.' });

  // Bonne réponse sans feedback saisi : message par défaut.
  const good = await presentAndPick(Q.lyceeMedium.code, 'Bonne');
  const res3 = await request(app)
    .post(`/api/quiz/questions/${Q.lyceeMedium.code}/answer`)
    .send({ presentationToken: good.token, choiceId: good.choiceId })
    .expect(200);
  assert.equal(res3.body.feedback, 'Bonne réponse !');
});

// ---------------------------------------------------------------------------------------
// Tentatives et statistiques
// ---------------------------------------------------------------------------------------

test('answer connecté → tentatives, puis GET /me/progress', async () => {
  await execute('DELETE FROM user_quiz_attempts WHERE user_id = ?', [studentId]);
  await request(app).get('/api/quiz/me/progress').expect(401);

  const empty = await request(app).get('/api/quiz/me/progress').set(asStudent()).expect(200);
  assert.deepEqual(empty.body, { attempts: 0, correct: 0, byCategory: [], recent: [] });

  const good = await presentAndPick(Q.collegeEasy.code, 'Bonne', asStudent());
  const goodRes = await request(app)
    .post(`/api/quiz/questions/${Q.collegeEasy.code}/answer`)
    .set(asStudent())
    .send({ presentationToken: good.token, choiceId: good.choiceId })
    .expect(200);
  // Hors flux de validation : pas de verrou de re-tentative dans la réponse.
  assert.ok(!('cooldown' in goodRes.body));
  const wrong = await presentAndPick(Q.lyceeHard.code, 'Fausse C', asStudent());
  await request(app)
    .post(`/api/quiz/questions/${Q.lyceeHard.code}/answer`)
    .set(asStudent())
    .send({ presentationToken: wrong.token, choiceId: wrong.choiceId })
    .expect(200);

  const rows = await queryAll(
    `SELECT question_code, categorie_slug, is_correct FROM user_quiz_attempts
      WHERE user_id = ? ORDER BY question_code`,
    [studentId],
  );
  assert.deepEqual(
    rows.map((r) => ({ ...r })),
    [
      { question_code: Q.collegeEasy.code, categorie_slug: CAT, is_correct: 1 },
      { question_code: Q.lyceeHard.code, categorie_slug: CAT, is_correct: 0 },
    ],
  );

  const progress = await request(app).get('/api/quiz/me/progress').set(asStudent()).expect(200);
  assert.deepEqual(Object.keys(progress.body), ['attempts', 'correct', 'byCategory', 'recent']);
  assert.equal(progress.body.attempts, 2);
  assert.equal(progress.body.correct, 1);
  assert.deepEqual(progress.body.byCategory, [{ categorie_slug: CAT, attempts: 2, correct: '1' }]);
  assert.equal(progress.body.recent.length, 2);
  assert.deepEqual(Object.keys(progress.body.recent[0]), [
    'question_code',
    'categorie_slug',
    'is_correct',
    'answered_at',
  ]);
  assert.deepEqual(
    progress.body.recent.map((r) => r.question_code).sort(),
    [Q.collegeEasy.code, Q.lyceeHard.code].sort(),
  );
});

test('GET /stats — 401 sans jeton, 403 élève, agrégats pour stats.read.all', async () => {
  await request(app).get('/api/quiz/stats').expect(401);
  await request(app).get('/api/quiz/stats').set(asStudent()).expect(403);
  const res = await request(app).get('/api/quiz/stats').set(asAdmin()).expect(200);
  assert.deepEqual(Object.keys(res.body), ['byStudent', 'byCategory']);
  const mine = res.body.byStudent.find((r) => r.user_id === studentId);
  assert.deepEqual(mine, {
    user_id: studentId,
    first_name: 'Carac',
    last_name: `Quiz${stamp}`,
    pseudo: `caracquiz${stamp}`,
    attempts: 2,
    correct: '1',
  });
  const cat = res.body.byCategory.find((r) => r.categorie_slug === CAT);
  assert.deepEqual(Object.keys(cat), ['categorie_slug', 'attempts', 'correct']);
  assert.ok(res.body.byCategory.every((r) => r.categorie_slug));
});

test('GET /admin/stats — 403 élève, forme des agrégats du catalogue', async () => {
  await request(app).get('/api/quiz/admin/stats').set(asStudent()).expect(403);
  const res = await request(app).get('/api/quiz/admin/stats').set(asAdmin()).expect(200);
  assert.deepEqual(Object.keys(res.body), [
    'total',
    'glossaryLinks',
    'byTheme',
    'byCategory',
    'byDifficulte',
  ]);
  assert.equal(typeof res.body.total, 'number');
  assert.equal(typeof res.body.glossaryLinks, 'number');
  assert.deepEqual(
    res.body.byCategory.find((r) => r.categorie_slug === CAT),
    { categorie_slug: CAT, effectif: 3 },
  );
  const jardinage = res.body.byTheme.find((r) => r.theme === 'jardinage');
  assert.deepEqual(Object.keys(jardinage), ['theme', 'effectif']);
  const diffs = res.body.byDifficulte.map((r) => r.difficulte);
  assert.deepEqual(
    diffs,
    [...diffs].sort((a, b) => (a ?? -1) - (b ?? -1)),
  );
  const total = res.body.byDifficulte.reduce((s, r) => s + r.effectif, 0);
  assert.equal(total, res.body.total);
});

// ---------------------------------------------------------------------------------------
// Administration du catalogue
// ---------------------------------------------------------------------------------------

test('admin — détail inconnu 404 ; élève 403 ; next-code', async () => {
  await request(app).get('/api/quiz/admin/questions').set(asStudent()).expect(403);
  const unknown = await request(app)
    .get('/api/quiz/admin/questions/QZZZZZZZZ')
    .set(asAdmin())
    .expect(404);
  assert.deepEqual(unknown.body, { error: 'Question introuvable' });
  const detail = await request(app)
    .get(`/api/quiz/admin/questions/${Q.lyceeHard.code}`)
    .set(asAdmin())
    .expect(200);
  assert.equal(detail.body.question.difficulte_label, Q.lyceeHard.label);
  assert.equal(detail.body.question.categorie_nom, 'Caractérisation');
});

test('admin — création, doublon 409, mise à jour 404 / 400, journal d’audit', async () => {
  const newCode = code('F');
  const missing = await request(app)
    .post('/api/quiz/admin/questions')
    .set(asAdmin())
    .send({})
    .expect(400);
  assert.deepEqual(missing.body, { error: 'Code question requis' });

  const body = {
    question_code: newCode,
    categorie_slug: CAT_BROKEN,
    numero_dans_categorie: 7,
    question: 'Créée par la caractérisation ?',
    choix_a: 'Oui',
    choix_b: 'Non',
    choix_c: 'Peut-être',
    reponse_correcte: 'A',
    niveau: 'lycee',
    difficulte: 2,
    difficulte_label: '⭐⭐ Moyen',
  };
  const created = await request(app)
    .post('/api/quiz/admin/questions')
    .set(asAdmin())
    .send(body)
    .expect(201);
  assert.equal(created.body.ok, true);
  assert.equal(created.body.created, true);
  assert.equal(created.body.question.question_code, newCode);
  assert.equal(created.body.question.difficulte_label, '⭐⭐ Moyen');
  const audit = await queryOne(
    "SELECT action, target_type FROM audit_log WHERE action = 'create_quiz' AND target_id = ? LIMIT 1",
    [newCode],
  );
  assert.deepEqual({ ...audit }, { action: 'create_quiz', target_type: 'quiz_question' });

  const dup = await request(app)
    .post('/api/quiz/admin/questions')
    .set(asAdmin())
    .send(body)
    .expect(409);
  assert.deepEqual(dup.body, { error: 'Ce code question existe déjà' });

  const notFound = await request(app)
    .put('/api/quiz/admin/questions/QZZZZZZZZ')
    .set(asAdmin())
    .send(body)
    .expect(404);
  assert.deepEqual(notFound.body, { error: 'Question introuvable' });

  const badCat = await request(app)
    .put(`/api/quiz/admin/questions/${newCode}`)
    .set(asAdmin())
    .send({ ...body, categorie_slug: 'inexistante-zz' })
    .expect(400);
  assert.deepEqual(badCat.body, { error: 'categorie_slug inconnu: inexistante-zz' });

  const updated = await request(app)
    .put(`/api/quiz/admin/questions/${newCode.toLowerCase()}`)
    .set(asAdmin())
    .send({ ...body, question: 'Modifiée ?' })
    .expect(200);
  assert.deepEqual(
    { ok: updated.body.ok, created: updated.body.created, q: updated.body.question.question },
    { ok: true, created: false, q: 'Modifiée ?' },
  );
});

test('admin — export et modèle XLSX : en-têtes de téléchargement', async () => {
  await request(app).get('/api/quiz/admin/export').set(asStudent()).expect(403);
  const exp = await request(app)
    .get(`/api/quiz/admin/export?statut=all&categorieSlug=${CAT}`)
    .set(asAdmin())
    .buffer(true)
    .parse((res, cb) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    })
    .expect(200);
  assert.equal(
    exp.headers['content-type'],
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
  assert.equal(
    exp.headers['content-disposition'],
    'attachment; filename="foretmap-export-qcm.xlsx"',
  );
  assert.equal(exp.body.slice(0, 2).toString('latin1'), 'PK');
  const tpl = await request(app).get('/api/quiz/admin/import/template').set(asAdmin()).expect(200);
  assert.equal(
    tpl.headers['content-disposition'],
    'attachment; filename="foretmap-modele-qcm.xlsx"',
  );
});

test('admin — import : fichier absent ou vide refusé en 400', async () => {
  await request(app).post('/api/quiz/admin/import').set(asStudent()).send({}).expect(403);
  const noFile = await request(app)
    .post('/api/quiz/admin/import')
    .set(asAdmin())
    .send({})
    .expect(400);
  assert.deepEqual(noFile.body, { error: 'Fichier requis' });
  // Classeur illisible : le message de la bibliothèque XLSX est renvoyé tel quel.
  const garbage = await request(app)
    .post('/api/quiz/admin/import')
    .set(asAdmin())
    .send({ fileDataBase64: Buffer.from('pas un classeur').toString('base64') })
    .expect(400);
  assert.deepEqual(Object.keys(garbage.body), ['error']);
  assert.match(garbage.body.error, /central directory/);
});
