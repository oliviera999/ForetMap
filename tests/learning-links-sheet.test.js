'use strict';

// Caractérisation des lecteurs et des écrivains de liens question ↔ ressource
// (audit du 25/09/2026, § 1.3.3 et § 3.3 ligne 3 ; piste C, tranche « liens »).
//
// Figé AVANT la bascule vers la source unique `resource_question_links` (RQL) :
//   - `GET /api/plants/:id/quiz-questions` (fiche espèce) ;
//   - `GET /api/tutorials/:id/quiz-questions` (aucun consommateur front, mais public) ;
//   - `GET /api/glossary/terms/:code` → `linkedQuizQuestions` (lit déjà RQL) ;
//   - l'édition d'une question (`PUT /api/quiz/admin/questions/:code`) et l'import QCM, qui
//     ne purgent que leurs propres liens par mots-clés (`origin = 'keyword'`, lot P0).
//
// Les cas « nominaux » (données alignées dans les tables historiques et dans RQL) doivent
// passer avant comme après la bascule. Les cas « écart » décrivent les divergences relevées
// par l'audit ; ils basculent explicitement avec le passage des lecteurs sur RQL.
// Tests BDD partagée : exécution séquentielle.

require('./helpers/setup');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute, queryAll, queryOne } = require('../database');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');
const { applyFmQuizImport } = require('../lib/fmQuizImport');

const stamp = Date.now().toString(36).toUpperCase();
const catSlug = `lnkcat${stamp.toLowerCase()}`.slice(0, 64);
const code = (suffix) => `QL${stamp}${suffix}`.slice(0, 16);

// Numéro dans la catégorie volontairement désordonné : l'ordre de la fiche suit
// (categorie_slug, numero_dans_categorie), pas l'ordre d'insertion.
const Q = {
  A: { code: code('A'), numero: 2, statut: 'actif' }, // lié partout, bloquant
  B: { code: code('B'), numero: 1, statut: 'actif' }, // lié partout, non bloquant
  I: { code: code('I'), numero: 3, statut: 'inactif' }, // lié partout, question inactive
  S: { code: code('S'), numero: 4, statut: 'actif' }, // RQL « suggested » seulement
  R: { code: code('R'), numero: 5, statut: 'actif' }, // RQL « rejected » seulement
  M: { code: code('M'), numero: 6, statut: 'actif' }, // écart : RQL approuvé, absent de qqs/qqt
  X: { code: code('X'), numero: 7, statut: 'actif' }, // écart : qqs/qqt seulement, absent de RQL
};
const ALL_CODES = Object.values(Q).map((q) => q.code);

const glossaryCode = `GLK${stamp}`.slice(0, 32);
let plantId = 0;
let emptyPlantId = 0;
let tutorialId = 0;
let inactiveTutorialId = 0;
let token = '';

const PLANT_KEYS = [
  'categorie_slug',
  'difficulte',
  'niveau',
  'photo_legende',
  'photo_url',
  'question',
  'question_code',
];
const TUTORIAL_KEYS = ['categorie_slug', 'difficulte', 'niveau', 'question', 'question_code'];

async function insertRql(resourceType, resourceRef, questionCode, fields = {}) {
  await execute(
    `INSERT INTO resource_question_links
       (resource_type, resource_ref, question_code, is_gating, origin, status)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      resourceType,
      String(resourceRef),
      questionCode,
      fields.is_gating ?? 1,
      fields.origin || 'import',
      fields.status || 'approved',
    ],
  );
}

before(async () => {
  await initSchema();
  token = await ensureAdminTeacherAuthToken();

  await execute(
    `INSERT IGNORE INTO quiz_categories (slug, nom, theme, order_index)
     VALUES (?, 'Caractérisation liens', 'sciences', 997)`,
    [catSlug],
  );
  for (const q of Object.values(Q)) {
    await execute(
      `INSERT INTO quiz_questions
         (question_code, categorie_slug, numero_dans_categorie, question, reponse_texte,
          choix_a, choix_b, choix_c, reponse_correcte, niveau, difficulte, statut,
          photo_url, photo_legende)
       VALUES (?, ?, ?, ?, 'Réponse.', 'A', 'B', 'C', 'A', 'college', 2, ?, ?, ?)`,
      [
        q.code,
        catSlug,
        q.numero,
        `Question ${q.code} ?`,
        q.statut,
        q === Q.A ? '/uploads/test-lien.jpg' : null,
        q === Q.A ? 'Légende de test' : null,
      ],
    );
  }

  plantId = (
    await execute('INSERT INTO plants (name, emoji, description) VALUES (?, ?, ?)', [
      `Espèce liens ${stamp}`,
      '🌱',
      'caractérisation des liens',
    ])
  ).insertId;
  emptyPlantId = (
    await execute('INSERT INTO plants (name, emoji, description) VALUES (?, ?, ?)', [
      `Espèce sans question ${stamp}`,
      '🌿',
      'aucun lien',
    ])
  ).insertId;
  tutorialId = (
    await execute(
      `INSERT INTO tutorials (title, slug, type, summary, html_content, is_active, sort_order)
       VALUES (?, ?, 'html', NULL, '<p>liens</p>', 1, 950)`,
      [`Tutoriel liens ${stamp}`, `tuto-liens-${stamp}`],
    )
  ).insertId;
  inactiveTutorialId = (
    await execute(
      `INSERT INTO tutorials (title, slug, type, summary, html_content, is_active, sort_order)
       VALUES (?, ?, 'html', NULL, '<p>inactif</p>', 0, 951)`,
      [`Tutoriel inactif ${stamp}`, `tuto-liens-off-${stamp}`],
    )
  ).insertId;
  await execute(
    `INSERT INTO glossary_terms
       (glossary_code, terme, variantes, categorie, niveau, definition_courte, statut)
     VALUES (?, ?, '', 'flore', 'base', 'Terme de caractérisation', 'actif')`,
    [glossaryCode, `lienterme${stamp}`],
  );

  // Tables historiques : A, B, I et l'écart X (absent de RQL).
  for (const q of [Q.A, Q.B, Q.I, Q.X]) {
    await execute('INSERT INTO quiz_question_species (question_code, plant_id) VALUES (?, ?)', [
      q.code,
      plantId,
    ]);
    await execute(
      'INSERT INTO quiz_question_tutorials (question_code, tutorial_id) VALUES (?, ?)',
      [q.code, tutorialId],
    );
  }
  await execute('INSERT INTO quiz_question_tutorials (question_code, tutorial_id) VALUES (?, ?)', [
    Q.A.code,
    inactiveTutorialId,
  ]);

  // Source unique : A, B, I alignés ; S et R non approuvés ; l'écart M (absent de qqs/qqt).
  for (const [type, ref] of [
    ['plant', plantId],
    ['tutorial', tutorialId],
  ]) {
    await insertRql(type, ref, Q.A.code, { is_gating: 1, origin: 'import' });
    await insertRql(type, ref, Q.B.code, { is_gating: 0, origin: 'manual' });
    await insertRql(type, ref, Q.I.code, { is_gating: 1, origin: 'import' });
    await insertRql(type, ref, Q.S.code, { is_gating: 0, origin: 'auto', status: 'suggested' });
    await insertRql(type, ref, Q.R.code, { is_gating: 0, origin: 'auto', status: 'rejected' });
    await insertRql(type, ref, Q.M.code, { is_gating: 1, origin: 'manual' });
  }
  await insertRql('tutorial', inactiveTutorialId, Q.A.code);
  await insertRql('glossary', glossaryCode, Q.A.code, { is_gating: 1, origin: 'import' });
  await insertRql('glossary', glossaryCode, Q.B.code, { is_gating: 0, origin: 'manual' });
  await insertRql('glossary', glossaryCode, Q.I.code, { is_gating: 1, origin: 'import' });
  await insertRql('glossary', glossaryCode, Q.S.code, {
    is_gating: 0,
    origin: 'auto',
    status: 'suggested',
  });
});

after(async () => {
  const marks = ALL_CODES.map(() => '?').join(', ');
  await execute(
    `DELETE FROM resource_question_links WHERE question_code IN (${marks})`,
    ALL_CODES,
  ).catch(() => {});
  await execute(
    `DELETE FROM quiz_question_species WHERE question_code IN (${marks})`,
    ALL_CODES,
  ).catch(() => {});
  await execute(
    `DELETE FROM quiz_question_tutorials WHERE question_code IN (${marks})`,
    ALL_CODES,
  ).catch(() => {});
  await execute(`DELETE FROM quiz_questions WHERE question_code IN (${marks})`, ALL_CODES).catch(
    () => {},
  );
  await execute('DELETE FROM quiz_categories WHERE slug = ?', [catSlug]).catch(() => {});
  await execute('DELETE FROM plants WHERE id IN (?, ?)', [plantId, emptyPlantId]).catch(() => {});
  await execute('DELETE FROM tutorials WHERE id IN (?, ?)', [tutorialId, inactiveTutorialId]).catch(
    () => {},
  );
  await execute('DELETE FROM glossary_terms WHERE glossary_code LIKE ?', [`GLK${stamp}%`]).catch(
    () => {},
  );
});

const codesOf = (res) => res.body.questions.map((q) => q.question_code);

// ---------------------------------------------------------------------------------------
// Fiche espèce — GET /api/plants/:id/quiz-questions
// ---------------------------------------------------------------------------------------

test('fiche espèce : format de réponse et ordre (catégorie, numéro)', async () => {
  const res = await request(app).get(`/api/plants/${plantId}/quiz-questions`).expect(200);
  assert.deepEqual(Object.keys(res.body).sort(), ['plantId', 'questions']);
  assert.equal(res.body.plantId, plantId);
  const mine = res.body.questions.filter((q) => ALL_CODES.includes(q.question_code));
  for (const row of mine) assert.deepEqual(Object.keys(row).sort(), PLANT_KEYS);
  // B (numéro 1) avant A (numéro 2), quel que soit l'ordre d'insertion.
  const ab = codesOf(res).filter((c) => c === Q.A.code || c === Q.B.code);
  assert.deepEqual(ab, [Q.B.code, Q.A.code]);
  const a = res.body.questions.find((q) => q.question_code === Q.A.code);
  assert.deepEqual(a, {
    question_code: Q.A.code,
    question: `Question ${Q.A.code} ?`,
    categorie_slug: catSlug,
    niveau: 'college',
    difficulte: 2,
    photo_url: '/uploads/test-lien.jpg',
    photo_legende: 'Légende de test',
  });
});

test('fiche espèce : une question inactive n’est jamais affichée', async () => {
  const res = await request(app).get(`/api/plants/${plantId}/quiz-questions`).expect(200);
  assert.ok(!codesOf(res).includes(Q.I.code));
});

test('fiche espèce : une proposition non approuvée n’est jamais affichée', async () => {
  const res = await request(app).get(`/api/plants/${plantId}/quiz-questions`).expect(200);
  assert.ok(!codesOf(res).includes(Q.S.code), 'lien « suggested » absent');
  assert.ok(!codesOf(res).includes(Q.R.code), 'lien « rejected » absent');
});

test('fiche espèce : caractère bloquant sans effet sur l’affichage', async () => {
  const res = await request(app).get(`/api/plants/${plantId}/quiz-questions`).expect(200);
  assert.ok(codesOf(res).includes(Q.B.code), 'lien non bloquant affiché');
  assert.ok(codesOf(res).includes(Q.A.code), 'lien bloquant affiché');
});

test('fiche espèce sans lien : liste vide', async () => {
  const res = await request(app).get(`/api/plants/${emptyPlantId}/quiz-questions`).expect(200);
  assert.deepEqual(res.body, { plantId: emptyPlantId, questions: [] });
});

test('fiche espèce : identifiant invalide (400) ou inconnu (404)', async () => {
  for (const bad of ['abc', '0', '-3', '1.5']) {
    const res = await request(app).get(`/api/plants/${bad}/quiz-questions`).expect(400);
    assert.deepEqual(res.body, { error: 'Identifiant invalide' });
  }
  const res = await request(app).get('/api/plants/2147480000/quiz-questions').expect(404);
  assert.deepEqual(res.body, { error: 'Plante introuvable' });
});

test('écart (avant bascule) : fiche espèce — liste exacte lue dans quiz_question_species', async () => {
  // Écart n° 2 de l'audit : un lien approuvé dans l'écran des liens (M) n'apparaît pas sur la
  // fiche ; un lien de la table historique absent de RQL (X) y apparaît, sans verrouiller.
  const res = await request(app).get(`/api/plants/${plantId}/quiz-questions`).expect(200);
  assert.deepEqual(codesOf(res), [Q.B.code, Q.A.code, Q.X.code]);
});

// ---------------------------------------------------------------------------------------
// Tutoriel — GET /api/tutorials/:id/quiz-questions
// ---------------------------------------------------------------------------------------

test('tutoriel : format de réponse, ordre, filtres actif / approuvé', async () => {
  const res = await request(app).get(`/api/tutorials/${tutorialId}/quiz-questions`).expect(200);
  assert.deepEqual(Object.keys(res.body).sort(), ['questions', 'tutorialId']);
  assert.equal(res.body.tutorialId, tutorialId);
  for (const row of res.body.questions) assert.deepEqual(Object.keys(row).sort(), TUTORIAL_KEYS);
  const codes = codesOf(res);
  assert.deepEqual(
    codes.filter((c) => c === Q.A.code || c === Q.B.code),
    [Q.B.code, Q.A.code],
  );
  for (const hidden of [Q.I.code, Q.S.code, Q.R.code]) assert.ok(!codes.includes(hidden));
});

test('tutoriel : inactif (404), identifiant invalide (400) ou inconnu (404)', async () => {
  const off = await request(app)
    .get(`/api/tutorials/${inactiveTutorialId}/quiz-questions`)
    .expect(404);
  assert.deepEqual(off.body, { error: 'Tutoriel introuvable' });
  await request(app).get('/api/tutorials/abc/quiz-questions').expect(400);
  const unknown = await request(app).get('/api/tutorials/2147480000/quiz-questions').expect(404);
  assert.deepEqual(unknown.body, { error: 'Tutoriel introuvable' });
});

test('écart (avant bascule) : tutoriel — liste exacte lue dans quiz_question_tutorials', async () => {
  const res = await request(app).get(`/api/tutorials/${tutorialId}/quiz-questions`).expect(200);
  assert.deepEqual(codesOf(res), [Q.B.code, Q.A.code, Q.X.code]);
});

// ---------------------------------------------------------------------------------------
// Terme de glossaire — GET /api/glossary/terms/:code (lit déjà RQL)
// ---------------------------------------------------------------------------------------

test('glossaire : questions liées approuvées et actives, dans l’ordre du catalogue', async () => {
  const res = await request(app).get(`/api/glossary/terms/${glossaryCode}`).expect(200);
  const linked = res.body.linkedQuizQuestions;
  assert.deepEqual(
    linked.map((q) => q.question_code),
    [Q.B.code, Q.A.code],
  );
  for (const row of linked) assert.deepEqual(Object.keys(row).sort(), TUTORIAL_KEYS);
});

// ---------------------------------------------------------------------------------------
// Écrivains : l'édition et l'import ne remplacent que leurs liens par mots-clés
// ---------------------------------------------------------------------------------------

async function glossaryLinksOf(questionCode) {
  return queryAll(
    `SELECT resource_ref, origin, status, is_gating FROM resource_question_links
      WHERE resource_type = 'glossary' AND question_code = ?
      ORDER BY resource_ref`,
    [questionCode],
  );
}

async function insertTerm(suffix, terme) {
  const gcode = `${glossaryCode}${suffix}`.slice(0, 32);
  await execute(
    `INSERT INTO glossary_terms
       (glossary_code, terme, variantes, categorie, niveau, definition_courte, statut)
     VALUES (?, ?, '', 'flore', 'base', 'Terme de caractérisation', 'actif')`,
    [gcode, terme],
  );
  return gcode;
}

test('édition d’une question : seuls les liens par mots-clés sont remplacés', async () => {
  const tag = `motcle${stamp}`;
  const gKeyword = await insertTerm('K', tag);
  const gCurated = await insertTerm('C', `relu${stamp}`);
  const gManual = await insertTerm('H', `manuel${stamp}`);
  const gStale = await insertTerm('O', `ancien${stamp}`);
  // Curation relue (migration 227 : origin='import', bloquante), saisie manuelle, et un
  // ancien lien par mots-clés qui ne correspond plus aux tags.
  await insertRql('glossary', gCurated, Q.X.code, { is_gating: 1, origin: 'import' });
  await insertRql('glossary', gManual, Q.X.code, { is_gating: 0, origin: 'manual' });
  await insertRql('glossary', gStale, Q.X.code, { is_gating: 0, origin: 'keyword' });

  const detail = await request(app)
    .get(`/api/quiz/admin/questions/${Q.X.code}`)
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  await request(app)
    .put(`/api/quiz/admin/questions/${Q.X.code}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ ...detail.body.question, tags: tag })
    .expect(200);

  const links = await glossaryLinksOf(Q.X.code);
  const byRef = Object.fromEntries(links.map((l) => [l.resource_ref, l]));
  assert.deepEqual(
    { origin: byRef[gCurated]?.origin, is_gating: Number(byRef[gCurated]?.is_gating) },
    { origin: 'import', is_gating: 1 },
    'la curation relue survit, toujours bloquante',
  );
  assert.equal(byRef[gManual]?.origin, 'manual', 'le lien manuel survit');
  assert.ok(!byRef[gStale], 'l’ancien lien par mots-clés est purgé');
  assert.deepEqual(
    {
      origin: byRef[gKeyword]?.origin,
      status: byRef[gKeyword]?.status,
      is_gating: Number(byRef[gKeyword]?.is_gating),
    },
    { origin: 'keyword', status: 'approved', is_gating: 0 },
    'le nouveau lien par mots-clés est créé, non bloquant',
  );
});

test('import QCM : purge globale limitée à origin = keyword', async () => {
  // Un lien par mots-clés d'une AUTRE question (hors fichier) est purgé par l'import : c'est
  // la règle actuelle (le rapprochement est recalculé pour les seules lignes importées).
  const gOther = await insertTerm('Z', `autre${stamp}`);
  await insertRql('glossary', gOther, Q.B.code, { is_gating: 0, origin: 'keyword' });
  const before = await glossaryLinksOf(Q.X.code);
  assert.ok(before.some((l) => l.origin === 'keyword'));

  const report = await applyFmQuizImport(
    { queryAll, execute },
    [{ categorie_slug: catSlug, categorie_nom: 'Caractérisation liens', theme: 'sciences' }],
    [
      {
        id: Q.A.code,
        question_code: Q.A.code,
        categorie_slug: catSlug,
        numero_dans_categorie: Q.A.numero,
        question: `Question ${Q.A.code} ?`,
        choix_a: 'A',
        choix_b: 'B',
        choix_c: 'C',
        reponse_correcte: 'A',
        niveau: 'college',
        tags: `motcle${stamp}`,
      },
    ],
    { dryRun: false },
  );
  assert.ok(report.totals.glossary_links_synced >= 1);

  const xLinks = await glossaryLinksOf(Q.X.code);
  assert.deepEqual(
    xLinks.map((l) => l.origin).sort(),
    ['import', 'manual'],
    'la question hors fichier garde ses liens relus et manuels, perd ses liens par mots-clés',
  );
  const bLinks = await glossaryLinksOf(Q.B.code);
  assert.ok(!bLinks.some((l) => l.origin === 'keyword'), 'mots-clés hors fichier purgés');
  assert.ok(
    bLinks.some((l) => l.origin === 'manual' && l.resource_ref === glossaryCode),
    'lien manuel de B conservé',
  );
  const aLinks = await glossaryLinksOf(Q.A.code);
  assert.ok(
    aLinks.some((l) => l.origin === 'keyword' && l.resource_ref === `${glossaryCode}K`),
    'le lien par mots-clés de la question importée est recréé',
  );
  assert.ok(
    aLinks.some((l) => l.origin === 'import' && l.resource_ref === glossaryCode),
    'le lien relu de la question importée est conservé',
  );
  const q = await queryOne('SELECT statut FROM quiz_questions WHERE question_code = ?', [Q.A.code]);
  assert.equal(q.statut, 'actif');
});
