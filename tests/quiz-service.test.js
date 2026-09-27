'use strict';

// Service du quiz ForetMap (`lib/pedago/quizService.js`) et son dépôt SQL
// (`lib/pedago/quizRepository.js`) — étape B2 de la piste B. Tests unitaires, sans base :
// lecture des filtres de requête, clause de tirage, tirage à hasard injecté, et les gardes
// statiques qui suivaient jusqu'ici `routes/quiz.js` (tirage sans tri complet, import en
// transaction). Le comportement HTTP est figé par `quiz-route-characterization.test.js`.

require('./helpers/setup');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const quizService = require('../lib/pedago/quizService');
const quizRepository = require('../lib/pedago/quizRepository');
const { parseNotionNiveauFilter } = require('../lib/curriculumNotions');

const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
const withoutComments = (src) =>
  src
    .split('\n')
    .filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
    .join('\n');

test('parseDrawQuery — filtres normalisés, difficulté entière ≥ 1', () => {
  assert.deepEqual(
    quizService.parseDrawQuery({
      categorieSlug: ' vivant ',
      niveau: 'lycee',
      difficulte: '2',
      illustrated: 'TRUE',
    }),
    {
      filters: {
        categorieSlug: 'vivant',
        niveau: 'lycee',
        difficulte: 2,
        illustratedOnly: true,
        notionFilter: null,
      },
    },
  );
  assert.deepEqual(quizService.parseDrawQuery({}).filters, {
    categorieSlug: null,
    niveau: null,
    difficulte: null,
    illustratedOnly: false,
    notionFilter: null,
  });
  assert.equal(quizService.parseDrawQuery({ illustrated: ' 1 ' }).filters.illustratedOnly, true);
  assert.equal(quizService.parseDrawQuery({ difficulte: '' }).filters.difficulte, null);
  for (const bad of ['0', '-2', 'x', '2.5']) {
    assert.deepEqual(quizService.parseDrawQuery({ difficulte: bad }), {
      error: 'difficulte invalide',
    });
  }
  // La difficulté est contrôlée avant la notion.
  assert.deepEqual(quizService.parseDrawQuery({ difficulte: 'x', notionId: '!!' }), {
    error: 'difficulte invalide',
  });
  assert.deepEqual(quizService.parseDrawQuery({ notionId: '!!' }), { error: 'notionId invalide' });
});

test('parseDrawQuery — la notion produit un fragment paramétré', () => {
  const { filters } = quizService.parseDrawQuery({ notionNiveau: 'college' });
  assert.ok(filters.notionFilter);
  assert.match(filters.notionFilter.sql, /EXISTS/);
  assert.ok(!filters.notionFilter.sql.includes('cycle3'), 'valeurs passées en paramètres');
  assert.deepEqual(quizService.parseDrawQuery({ notion_niveau: 'quatrieme' }), {
    error: parseNotionNiveauFilter('quatrieme').error,
  });
});

test('parseCategoriesQuery et parseCatalogQuery', () => {
  const cat = quizService.parseCategoriesQuery({ theme: 'sciences', niveau: 'college' });
  assert.deepEqual(cat, {
    filters: {
      theme: 'sciences',
      niveau: 'college',
      categoryNotionFilter: null,
      questionNotionFilter: null,
    },
  });
  const withNotion = quizService.parseCategoriesQuery({ notionId: 'c4-viv' });
  assert.match(withNotion.filters.categoryNotionFilter.sql, /quiz_categories\.slug/);
  assert.match(withNotion.filters.questionNotionFilter.sql, /quiz_questions/);
  assert.deepEqual(quizService.parseCategoriesQuery({ notionId: '!' }), {
    error: 'notionId invalide',
  });

  assert.deepEqual(quizService.parseCatalogQuery({ q: '  Abeille ', categorieSlug: 'x' }), {
    filters: {
      theme: null,
      categorieSlug: 'x',
      niveau: null,
      q: 'Abeille',
      notionFilter: null,
    },
  });
  assert.match(
    quizService.parseCatalogQuery({ notionId: 'C4-VIV' }).filters.notionFilter.sql,
    /q\./,
  );
});

test('buildDrawWhere — ordre des conditions et paramètres', () => {
  const where = quizRepository.buildDrawWhere({
    categorieSlug: 'cat',
    niveau: 'college',
    difficulte: 1,
    illustratedOnly: true,
    notionFilter: { sql: ' AND EXISTS (x = ?)', params: ['N1'] },
    excludedCodes: ['QF0001', 'QF0002'],
  });
  assert.equal(
    where.sql,
    "WHERE statut = 'actif' AND categorie_slug = ? AND niveau = ? AND difficulte = ?" +
      " AND photo_url IS NOT NULL AND TRIM(photo_url) <> '' AND EXISTS (x = ?)" +
      ' AND question_code NOT IN (?, ?)',
  );
  assert.deepEqual(where.params, ['cat', 'college', 1, 'N1', 'QF0001', 'QF0002']);
  assert.deepEqual(quizRepository.buildDrawWhere(), { sql: "WHERE statut = 'actif'", params: [] });
});

/** Exécuteur factice : compte `total` candidats, renvoie le code du rang demandé. */
function fakeDrawDb(total) {
  const calls = [];
  return {
    calls,
    async queryAll(sql, params) {
      calls.push({ kind: 'all', sql, params });
      return [];
    },
    async queryOne(sql, params) {
      calls.push({ kind: 'one', sql, params });
      if (/COUNT\(\*\)/.test(sql)) return { c: total };
      const offset = Number(params.at(-1));
      return { question_code: `Q${offset}` };
    },
  };
}

test('drawQuestionCode — décalage = ⌊hasard × total⌋, LIMIT/OFFSET en chaînes', async () => {
  const dbx = fakeDrawDb(10);
  const res = await quizService.drawQuestionCode(
    { niveau: 'lycee', difficulte: null, illustratedOnly: false, notionFilter: null },
    { dbx, random: () => 0.73 },
  );
  assert.deepEqual(res, { question_code: 'Q7' });
  const pick = dbx.calls.find((c) => c.kind === 'one' && /OFFSET/.test(c.sql));
  assert.match(pick.sql, /ORDER BY question_code ASC LIMIT \? OFFSET \?/);
  assert.deepEqual(pick.params.slice(-2), ['1', '7']);
  assert.ok(pick.params.includes('lycee'));
});

test('drawQuestionCode — aucun candidat : erreur 404 attendue', async () => {
  await assert.rejects(
    quizService.drawQuestionCode({}, { dbx: fakeDrawDb(0), random: () => 0 }),
    (err) => {
      assert.ok(quizService.isQuizError(err));
      assert.equal(err.status, 404);
      assert.deepEqual(err.responseBody, { error: 'Aucune question disponible' });
      return true;
    },
  );
});

test('quizError — statut et corps conservés (champs annexes compris)', () => {
  const err = quizService.quizError(403, { error: 'Réservée', reserved_for: ['x'] });
  assert.equal(err.status, 403);
  assert.equal(err.statusCode, 403);
  assert.equal(err.message, 'Réservée');
  assert.deepEqual(err.responseBody, { error: 'Réservée', reserved_for: ['x'] });
  assert.equal(quizService.isQuizError(new Error('x')), false);
});

test('canSeeCatalogAnswers — permission de gestion du catalogue seulement', () => {
  assert.equal(quizService.canSeeCatalogAnswers(null), false);
  assert.equal(quizService.canSeeCatalogAnswers({ permissions: ['stats.read.all'] }), false);
  assert.equal(quizService.canSeeCatalogAnswers({ permissions: ['plants.manage'] }), true);
});

test('garde statique — le tirage ne trie plus tout le catalogue (P5, audit charge 2026-09)', () => {
  for (const file of ['lib/pedago/quizRepository.js', 'lib/pedago/quizService.js']) {
    assert.doesNotMatch(withoutComments(read(file)), /ORDER BY RAND\(\)/, file);
  }
});

test('garde statique — import QCM en transaction, avec les helpers de la transaction (G4)', () => {
  const source = read('lib/pedago/quizService.js');
  assert.match(
    source,
    /withTransaction\(async \(tx\) =>\s*applyFmQuizImport\(\s*\{[^}]*queryAll: tx\.queryAll[^}]*execute: tx\.execute/,
  );
  assert.doesNotMatch(source, /applyFmQuizImport\(\s*\{\s*queryAll\s*,\s*execute\s*\}/);
});

test('garde statique — la route ne contient plus de SQL', () => {
  const route = withoutComments(read('routes/quiz.js'));
  assert.doesNotMatch(route, /\b(SELECT|INSERT|UPDATE|DELETE)\b\s/);
  assert.doesNotMatch(route, /require\('\.\.\/database'\)/);
});

// Retrait de `quiz_questions.difficulte_label` (audit du 25/09/2026, § 3.5, T1) : le quiz
// ne lit plus la colonne, il dérive le libellé de `difficulte`.
test('difficultyLabel — mêmes libellés que les migrations, null hors 1 à 3', () => {
  assert.equal(quizService.difficultyLabel(1), '⭐ Facile');
  assert.equal(quizService.difficultyLabel(2), '⭐⭐ Moyen');
  assert.equal(quizService.difficultyLabel('3'), '⭐⭐⭐ Difficile');
  // Octets exacts des migrations : U+2B50 sans sélecteur de variante (U+FE0F).
  assert.equal(Buffer.from(quizService.difficultyLabel(1)).toString('hex'), 'e2ad9020466163696c65');
  for (const other of [null, undefined, '', 0, 4, 5, 'x']) {
    assert.equal(quizService.difficultyLabel(other), null, String(other));
  }
});

test('garde statique — ni le dépôt ni la route du quiz ne lisent difficulte_label (T1)', () => {
  assert.doesNotMatch(withoutComments(read('lib/pedago/quizRepository.js')), /difficulte_label/);
  assert.doesNotMatch(withoutComments(read('routes/quiz.js')), /difficulte_label/);
});
