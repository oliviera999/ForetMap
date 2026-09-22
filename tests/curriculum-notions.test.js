'use strict';

// Notions des programmes officiels (lot 8, migration 273).
//
// Le point sensible n'est pas la liste des notions, c'est **l'héritage** : une question
// hérite des notions de sa catégorie, et `quiz_question_notions` n'existe que pour
// l'exception (`ajout` / `exclusion`). Une régression sur cette règle ne se voit pas dans
// l'interface — le tirage rend simplement une question de moins, ou une de trop.

require('./helpers/setup');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute, queryAll, queryOne } = require('../database');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');
const {
  CURRICULUM_NIVEAUX,
  normalizeCurriculumNiveau,
  curriculumNiveauLabel,
  normalizeNotionId,
  normalizeNotionIdList,
  describeQuestionNotions,
} = require('../lib/curriculumNotions');

const stamp = Date.now();
const catSlug = `cnc${stamp}`.slice(0, 64);
const otherCatSlug = `cno${stamp}`.slice(0, 64);
const heritedCode = `QCN${stamp}`.slice(0, 16);
const exceptionCode = `QCX${stamp}`.slice(0, 16);
const otherCode = `QCO${stamp}`.slice(0, 16);
const termCode = `GCN${stamp}`.slice(0, 16);
const otherTermCode = `GCO${stamp}`.slice(0, 16);

/** Notions du référentiel livré, utilisées comme points d'appui. */
const NOTION_A = '2-BIODIV'; // Seconde
const NOTION_B = 'T-DOM'; // Terminale spécialité
const NOTION_C = 'C3-VIV'; // Cycle 3

let token = '';
const auth = () => ({ Authorization: `Bearer ${token}` });
const db = { queryAll, queryOne, execute };

async function insertQuestion(code, slug, numero, niveau = 'lycee') {
  await execute(
    `INSERT IGNORE INTO quiz_questions
       (question_code, categorie_slug, numero_dans_categorie, question,
        choix_a, choix_b, choix_c, reponse_correcte, niveau, statut)
     VALUES (?, ?, ?, 'Question notion ?', 'A', 'B', 'C', 'A', ?, 'actif')`,
    [code, slug, numero, niveau],
  );
}

before(async () => {
  await initSchema();
  token = await ensureAdminTeacherAuthToken();

  for (const [slug, nom, order] of [
    [catSlug, 'Test notions — catégorie porteuse', 991],
    [otherCatSlug, 'Test notions — catégorie voisine', 992],
  ]) {
    await execute(
      `INSERT IGNORE INTO quiz_categories (slug, nom, theme, order_index)
       VALUES (?, ?, 'sciences', ?)`,
      [slug, nom, order],
    );
  }
  await insertQuestion(heritedCode, catSlug, 1);
  await insertQuestion(exceptionCode, catSlug, 2);
  await insertQuestion(otherCode, otherCatSlug, 1);

  for (const [code, terme] of [
    [termCode, 'Terme notion de test'],
    [otherTermCode, 'Terme sans notion de test'],
  ]) {
    await execute(
      `INSERT IGNORE INTO glossary_terms (glossary_code, terme, categorie, niveau, definition_courte, statut)
       VALUES (?, ?, 'ecologie', 'base', 'Définition courte.', 'actif')`,
      [code, terme],
    );
  }
});

after(async () => {
  for (const code of [termCode, otherTermCode]) {
    await execute('DELETE FROM glossary_term_notions WHERE glossary_code = ?', [code]).catch(
      () => {},
    );
    await execute('DELETE FROM glossary_terms WHERE glossary_code = ?', [code]).catch(() => {});
  }
  for (const code of [heritedCode, exceptionCode, otherCode]) {
    await execute('DELETE FROM quiz_question_notions WHERE question_code = ?', [code]).catch(
      () => {},
    );
    await execute('DELETE FROM quiz_questions WHERE question_code = ?', [code]).catch(() => {});
  }
  for (const slug of [catSlug, otherCatSlug]) {
    await execute('DELETE FROM quiz_category_notions WHERE categorie_slug = ?', [slug]).catch(
      () => {},
    );
    await execute('DELETE FROM quiz_categories WHERE slug = ?', [slug]).catch(() => {});
  }
});

test('le référentiel des programmes est amorcé par la migration', async () => {
  const res = await request(app).get('/api/curriculum/notions').expect(200);
  const items = res.body?.items || [];
  assert.ok(items.length >= 12, 'les douze notions du lot 8 doivent être présentes');
  const seconde = items.find((n) => n.id === NOTION_A);
  assert.ok(seconde, 'notion 2-BIODIV attendue');
  assert.equal(seconde.niveau, 'seconde');
  assert.equal(seconde.discipline, 'SVT');
  assert.ok(seconde.niveau_label.includes('Seconde'));
  // Ordre de progression scolaire : cycle 3 avant terminale.
  const ids = items.map((n) => n.id);
  assert.ok(ids.indexOf('C3-VIV') < ids.indexOf('T-DOM'));
});

test('la lecture des notions ne demande pas de session, comme le quiz', async () => {
  await request(app).get('/api/curriculum/niveaux').expect(200);
  await request(app).get(`/api/curriculum/notions/${NOTION_A}`).expect(200);
});

test('un niveau hors ENUM est refusé plutôt que silencieusement ignoré', async () => {
  await request(app).get('/api/curriculum/notions?niveau=quatrieme').expect(400);
  const res = await request(app).get('/api/curriculum/notions?niveau=seconde').expect(200);
  assert.ok((res.body?.items || []).every((n) => n.niveau === 'seconde'));
});

test('les rattachements exigent plants.manage', async () => {
  await request(app)
    .put(`/api/curriculum/quiz-categories/${catSlug}/notions`)
    .send({ notion_ids: [NOTION_A] })
    .expect(401);
  await request(app)
    .put(`/api/curriculum/glossary-terms/${termCode}/notions`)
    .send({ notion_ids: [NOTION_A] })
    .expect(401);
});

test('une notion inconnue est refusée en 400, pas en erreur de clé étrangère', async () => {
  const res = await request(app)
    .put(`/api/curriculum/quiz-categories/${catSlug}/notions`)
    .set(auth())
    .send({ notion_ids: ['NOTION-QUI-NEXISTE-PAS'] })
    .expect(400);
  assert.match(res.body?.error || '', /inconnue/i);
});

test('une question hérite des notions de sa catégorie', async () => {
  await request(app)
    .put(`/api/curriculum/quiz-categories/${catSlug}/notions`)
    .set(auth())
    .send({ notion_ids: [NOTION_A, NOTION_B] })
    .expect(200);

  const res = await request(app)
    .get(`/api/curriculum/quiz-questions/${heritedCode}/notions`)
    .expect(200);
  assert.deepEqual(res.body.inherited.map((n) => n.id).sort(), [NOTION_A, NOTION_B].sort());
  assert.deepEqual(res.body.effective.map((n) => n.id).sort(), [NOTION_A, NOTION_B].sort());
  assert.deepEqual(res.body.added, []);
  assert.deepEqual(res.body.excluded, []);
});

test('ajout et exclusion corrigent une question sans toucher à sa catégorie', async () => {
  await request(app)
    .put(`/api/curriculum/quiz-questions/${exceptionCode}/notions`)
    .set(auth())
    .send({ ajouts: [NOTION_C], exclusions: [NOTION_B] })
    .expect(200);

  const described = await describeQuestionNotions(db, exceptionCode);
  assert.deepEqual(
    described.added.map((n) => n.id),
    [NOTION_C],
  );
  assert.deepEqual(
    described.excluded.map((n) => n.id),
    [NOTION_B],
  );
  // (catégorie − exclusion) ∪ ajout
  assert.deepEqual(described.effective.map((n) => n.id).sort(), [NOTION_A, NOTION_C].sort());

  // La question voisine de la même catégorie n'a pas bougé.
  const sibling = await describeQuestionNotions(db, heritedCode);
  assert.deepEqual(sibling.effective.map((n) => n.id).sort(), [NOTION_A, NOTION_B].sort());
});

test('une notion à la fois ajoutée et exclue est une consigne contradictoire', async () => {
  const res = await request(app)
    .put(`/api/curriculum/quiz-questions/${exceptionCode}/notions`)
    .set(auth())
    .send({ ajouts: [NOTION_C], exclusions: [NOTION_C] })
    .expect(400);
  assert.match(res.body?.error || '', /ajoutée et exclue/i);
});

test('le catalogue de questions se filtre par notion, héritage compris', async () => {
  const res = await request(app)
    .get(`/api/quiz/questions?categorieSlug=${catSlug}&notionId=${NOTION_B}`)
    .expect(200);
  const codes = (res.body?.items || []).map((i) => i.question_code);
  assert.ok(codes.includes(heritedCode), 'la question qui hérite de T-DOM doit remonter');
  assert.ok(!codes.includes(exceptionCode), 'la question qui exclut T-DOM ne doit pas remonter');

  const byNiveau = await request(app)
    .get(`/api/quiz/questions?categorieSlug=${catSlug}&notionNiveau=terminale_spe`)
    .expect(200);
  const niveauCodes = (byNiveau.body?.items || []).map((i) => i.question_code);
  assert.ok(niveauCodes.includes(heritedCode));
  assert.ok(!niveauCodes.includes(exceptionCode));

  const added = await request(app)
    .get(`/api/quiz/questions?categorieSlug=${catSlug}&notionId=${NOTION_C}`)
    .expect(200);
  assert.deepEqual(
    (added.body?.items || []).map((i) => i.question_code),
    [exceptionCode],
    'seule la question porteuse de l’ajout remonte',
  );
});

test('le tirage par notion ne sort jamais d’une notion non demandée', async () => {
  const res = await request(app)
    .get(`/api/quiz/draw?categorieSlug=${catSlug}&notionId=${NOTION_C}`)
    .expect(200);
  assert.equal(res.body?.question_code, exceptionCode);

  await request(app).get('/api/quiz/draw?notionId=NOTION%20INVALIDE%21').expect(400);
  await request(app).get('/api/quiz/draw?notionNiveau=quatrieme').expect(400);
});

test('les catégories proposées se restreignent à la notion choisie', async () => {
  const res = await request(app).get(`/api/quiz/categories?notionId=${NOTION_B}`).expect(200);
  const slugs = (res.body?.categories || []).map((c) => c.slug);
  assert.ok(slugs.includes(catSlug));
  assert.ok(!slugs.includes(otherCatSlug), 'une catégorie sans la notion ne doit pas être offerte');
});

test('un terme de glossaire porte ses notions et se filtre dessus', async () => {
  await request(app)
    .put(`/api/curriculum/glossary-terms/${termCode}/notions`)
    .set(auth())
    .send({ notion_ids: [NOTION_A] })
    .expect(200);

  const detail = await request(app).get(`/api/glossary/terms/${termCode}`).expect(200);
  assert.deepEqual(
    (detail.body?.notions || []).map((n) => n.id),
    [NOTION_A],
  );

  const filtered = await request(app).get(`/api/glossary/terms?notionId=${NOTION_A}`).expect(200);
  assert.ok((filtered.body?.items || []).some((t) => t.glossary_code === termCode));

  const other = await request(app).get(`/api/glossary/terms?notionId=${NOTION_B}`).expect(200);
  assert.ok(!(other.body?.items || []).some((t) => t.glossary_code === termCode));

  await request(app).get('/api/glossary/terms?notionNiveau=quatrieme').expect(400);
});

test('le filtre notion ne sert jamais de réponse mise en cache', async () => {
  // La liste sans filtre est cachée 30 s ; une liste filtrée par notion ne doit pas
  // prendre sa place, sinon le glossaire entier se réduirait pour tout le monde.
  const filtered = await request(app).get(`/api/glossary/terms?notionId=${NOTION_A}`).expect(200);
  const filteredCodes = (filtered.body?.items || []).map((t) => t.glossary_code);
  assert.ok(!filteredCodes.includes(otherTermCode));

  const all = await request(app).get('/api/glossary/terms').expect(200);
  const allCodes = (all.body?.items || []).map((t) => t.glossary_code);
  assert.ok(allCodes.includes(termCode) && allCodes.includes(otherTermCode));
});

test('les effectifs par notion comptent les questions héritées', async () => {
  const res = await request(app).get(`/api/curriculum/notions/${NOTION_A}`).expect(200);
  assert.ok(Number(res.body?.question_count) >= 2);
  assert.ok(Number(res.body?.glossary_count) >= 1);
  assert.ok((res.body?.quizCategories || []).some((c) => c.slug === catSlug));
});

test('normalisation des identifiants et des niveaux (utilitaires partagés)', () => {
  assert.equal(normalizeNotionId(' 2-biodiv '), '2-BIODIV');
  assert.equal(normalizeNotionId('DROP TABLE'), null);
  assert.equal(normalizeNotionId(''), null);
  assert.deepEqual(normalizeNotionIdList(['c3-viv', 'C3-VIV', '', null]), ['C3-VIV']);
  assert.equal(normalizeCurriculumNiveau('Seconde'), 'seconde');
  assert.equal(normalizeCurriculumNiveau('college'), null);
  assert.equal(curriculumNiveauLabel('cycle4'), 'Cycle 4 (5e–3e)');
  assert.equal(CURRICULUM_NIVEAUX.length, 7);
});

test('les libellés de niveau de l’UI restent alignés sur l’ENUM SQL', async () => {
  // `src/utils/curriculumNotions.js` duplique volontairement la liste (front ESM / back
  // CJS, même patron que `plantOriginStatus`) : c'est ce test qui garde les deux en phase.
  const ui = await import('../src/utils/curriculumNotions.js');
  assert.deepEqual(
    ui.CURRICULUM_NIVEAUX.map((n) => n.value),
    CURRICULUM_NIVEAUX.map((n) => n.value),
  );
  assert.deepEqual(
    ui.CURRICULUM_NIVEAUX.map((n) => n.label),
    CURRICULUM_NIVEAUX.map((n) => n.label),
  );
  assert.equal(ui.curriculumNiveauLabel('es_terminale'), curriculumNiveauLabel('es_terminale'));
});

test('les options et regroupements de notions de l’UI', async () => {
  const { buildNotionOptions, groupNotionsByNiveau, notionChipLabel } =
    await import('../src/utils/curriculumNotions.js');
  const sample = [
    { id: 'C3-VIV', niveau: 'cycle3', notion: 'Classer les organismes', question_count: 4 },
    { id: '2-BIODIV', niveau: 'seconde', notion: 'Biodiversité', glossary_count: 2 },
  ];

  const options = buildNotionOptions(sample);
  assert.equal(options[0].value, '');
  assert.match(options[1].label, /Cycle 3.*Classer les organismes \(4\)/);
  // Effectif absent pour la clé demandée : pas de « (undefined) » dans le menu.
  assert.ok(!options[2].label.includes('('));

  const glossaryOptions = buildNotionOptions(sample, { countKey: 'glossary_count' });
  assert.match(glossaryOptions[2].label, /Biodiversité \(2\)/);
  assert.deepEqual(buildNotionOptions(null, { emptyLabel: 'Aucune' })[0].label, 'Aucune');

  // Le regroupement suit la progression scolaire, pas l'ordre d'arrivée.
  const groups = groupNotionsByNiveau(sample);
  assert.deepEqual(
    groups.map((g) => g.value),
    ['cycle3', 'seconde'],
  );
  assert.equal(notionChipLabel(sample[0]), 'C3-VIV · Classer les organismes');
});

test('les niveaux annoncés couvrent exactement ceux des notions livrées', async () => {
  const res = await request(app).get('/api/curriculum/niveaux').expect(200);
  const niveaux = res.body?.niveaux || [];
  assert.equal(niveaux.length, CURRICULUM_NIVEAUX.length);
  assert.ok(niveaux.every((n) => Number(n.notion_count) >= 1));
});
