'use strict';

// `quiz_questions.difficulte_label` dérivé de `difficulte` (audit du 25/09/2026, § 3.5 :
// retrait en trois temps ; piste C). L'import XLSX et l'éditeur admin ignorent le libellé
// saisi et écrivent celui du référentiel (`quizDifficulteLabel`, src/shared/enums/
// pedagoEnums.js) ; la liste admin et l'export le dérivent aussi à la lecture. La colonne
// reste écrite (valeur dérivée) tant que routes/quiz.js la lit : aucun DROP ici.

require('./helpers/setup');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { initSchema, queryAll, queryOne, execute } = require('../database');
const fmQuizImport = require('../lib/fmQuizImport');
const fmQuizCrud = require('../lib/fmQuizCrud');

const deps = { queryAll, queryOne, execute };
const stamp = Date.now().toString(36).toUpperCase();
const catSlug = `difflbl${stamp.toLowerCase()}`.slice(0, 64);
const codeA = `QD${stamp}A`.slice(0, 16);
const codeB = `QD${stamp}B`.slice(0, 16);

function questionRow(overrides) {
  return {
    categorie_slug: catSlug,
    question: 'Combien de pattes a un insecte ?',
    choix_a: 'Six',
    choix_b: 'Huit',
    choix_c: 'Quatre',
    reponse_correcte: 'A',
    niveau: 'college',
    statut: 'actif',
    ...overrides,
  };
}

before(async () => {
  await initSchema();
});

after(async () => {
  await execute('DELETE FROM resource_question_links WHERE question_code IN (?, ?)', [
    codeA,
    codeB,
  ]);
  await execute('DELETE FROM quiz_questions WHERE question_code IN (?, ?)', [codeA, codeB]);
  await execute('DELETE FROM quiz_categories WHERE slug = ?', [catSlug]);
});

test('import : le libellé du fichier est ignoré, celui du référentiel est écrit', () => {
  const p2 = fmQuizImport.buildQuestionPayload(
    questionRow({ question_code: codeA, difficulte: '2', difficulte_label: 'Assez dur' }),
  );
  assert.equal(p2.difficulte, 2);
  assert.equal(p2.difficulte_label, '⭐⭐ Moyen');

  const empty = fmQuizImport.buildQuestionPayload(
    questionRow({ difficulte: '', difficulte_label: '★ Facile' }),
  );
  assert.equal(empty.difficulte, null);
  assert.equal(empty.difficulte_label, null);

  // Hors échelle : la difficulté est gardée telle quelle (comportement inchangé), sans libellé.
  const five = fmQuizImport.buildQuestionPayload(questionRow({ difficulte: '5' }));
  assert.equal(five.difficulte, 5);
  assert.equal(five.difficulte_label, null);
});

test('éditeur admin : le libellé saisi est remplacé par le libellé dérivé', () => {
  const body = fmQuizCrud.normalizeQuestionApiBody(
    questionRow({ question_code: codeB, difficulte: 3, difficulte_label: 'n’importe quoi' }),
  );
  assert.equal(body.difficulte, 3);
  assert.equal(body.difficulte_label, '⭐⭐⭐ Difficile');
  assert.equal(
    fmQuizCrud.normalizeQuestionApiBody(questionRow({ difficulte: '' })).difficulte_label,
    null,
  );
});

test('import puis édition puis lecture : libellés dérivés en base, en liste et à l’export', async () => {
  const report = await fmQuizImport.applyFmQuizImport(
    deps,
    [{ categorie_slug: catSlug, categorie_nom: 'Libellés', theme: 'sciences', ordre: '990' }],
    [
      questionRow({
        question_code: codeA,
        numero_dans_categorie: '1',
        difficulte: '1',
        difficulte_label: '★ Facile',
      }),
    ],
  );
  assert.equal(report.totals.valid, 1, JSON.stringify(report.errors || []));
  const stored = await queryOne(
    'SELECT difficulte, difficulte_label FROM quiz_questions WHERE question_code = ?',
    [codeA],
  );
  assert.equal(stored.difficulte, 1);
  assert.equal(stored.difficulte_label, '⭐ Facile');

  await fmQuizCrud.upsertQuizQuestion(
    deps,
    questionRow({
      question_code: codeB,
      numero_dans_categorie: 2,
      difficulte: 2,
      difficulte_label: 'Libellé libre',
    }),
  );
  const edited = await queryOne(
    'SELECT difficulte_label FROM quiz_questions WHERE question_code = ?',
    [codeB],
  );
  assert.equal(edited.difficulte_label, '⭐⭐ Moyen');

  // Lecture : la liste admin et l'export dérivent le libellé, même si la colonne diverge.
  await execute("UPDATE quiz_questions SET difficulte_label = 'périmé' WHERE question_code = ?", [
    codeB,
  ]);
  const list = await fmQuizCrud.listAdminQuestions(deps, { categorieSlug: catSlug });
  const itemB = list.find((q) => q.question_code === codeB);
  assert.ok(itemB, 'question éditée absente de la liste admin');
  assert.equal(itemB.difficulte_label, '⭐⭐ Moyen');

  const exported = await fmQuizImport.loadFmQuizExportRows(deps, { categorieSlug: catSlug });
  const rowB = exported.questions.find((q) => q.question_code === codeB);
  assert.equal(rowB.difficulte_label, '⭐⭐ Moyen');
});

test('le modèle de fichier d’import propose le libellé du référentiel', async () => {
  const buffer = await fmQuizImport.buildFmQuizTemplateWorkbook();
  const { questionRows } = await fmQuizImport.parseFmQuizWorkbook(buffer);
  assert.equal(questionRows.length, 1);
  assert.equal(questionRows[0].difficulte_label, '⭐ Facile');
});
