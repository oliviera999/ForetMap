'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const {
  buildCategoryPayload,
  buildQuestionPayload,
  validateCategoryPayload,
  validateQuestionPayload,
  buildFmQuizTemplateWorkbook,
  parseFmQuizWorkbook,
  applyFmQuizImport,
} = require('../lib/fmQuizImport');

test('buildCategoryPayload exige theme sciences ou jardinage', () => {
  const ok = buildCategoryPayload({
    categorie_slug: 'vivant_classification',
    categorie_nom: 'Le vivant',
    theme: 'sciences',
    ordre: 1,
  });
  assert.strictEqual(ok.theme, 'sciences');
  const errors = validateCategoryPayload(
    buildCategoryPayload({ categorie_slug: 'x', categorie_nom: 'X', theme: 'foo' }),
    2,
  );
  assert.ok(errors.some((e) => e.field === 'theme'));
});

test('buildQuestionPayload génère code QF#### depuis id', () => {
  const payload = buildQuestionPayload({
    id: 42,
    categorie_slug: 'vivant_classification',
    numero_dans_categorie: 1,
    question: 'Test ?',
    choix_a: 'A',
    choix_b: 'B',
    choix_c: 'C',
    choix_d: 'D',
    reponse_correcte: 'A',
    niveau: 'college',
  });
  assert.strictEqual(payload.question_code, 'QF0042');
  assert.strictEqual(payload.niveau, 'college');
});

test('validateQuestionPayload signale categorie inconnue', () => {
  const payload = buildQuestionPayload({
    id: 1,
    categorie_slug: 'inconnue',
    numero_dans_categorie: 1,
    question: 'Test ?',
    choix_a: 'A',
    choix_b: 'B',
    choix_c: 'C',
    reponse_correcte: 'A',
  });
  const errors = validateQuestionPayload(payload, 2, new Set(['vivant_classification']));
  assert.ok(errors.some((e) => e.field === 'categorie_slug'));
});

test('buildFmQuizTemplateWorkbook parse en dry-run', async () => {
  const buffer = await buildFmQuizTemplateWorkbook();
  const { categoryRows, questionRows } = await parseFmQuizWorkbook(buffer);
  assert.ok(categoryRows.length >= 1);
  assert.ok(questionRows.length >= 1);
  const report = await applyFmQuizImport(
    {
      queryAll: async () => [],
      execute: async () => {
        throw new Error('execute ne doit pas être appelé en dry-run sans lignes valides');
      },
    },
    categoryRows,
    questionRows,
    { dryRun: true },
  );
  assert.strictEqual(report.dryRun, true);
  assert.ok(report.totals.valid >= 1);
});

test('applyFmQuizImport écrit les liens glossaire dans resource_question_links (origin=import)', async () => {
  // Glossaire actif : terme « Photosynthèse » dont la clé normalisée matche le tag de la question.
  const glossaryRows = [
    {
      glossary_code: 'GLFM01',
      terme: 'Photosynthèse',
      variantes: '',
      categorie: 'flore',
      definition_courte: 'Production de matière par la lumière',
    },
  ];

  const executed = [];
  const deps = {
    queryAll: async (sql) => {
      if (/FROM glossary_terms/i.test(sql)) return glossaryRows;
      // SELECT question_code FROM quiz_questions (existants) → aucun
      return [];
    },
    execute: async (sql, params) => {
      executed.push({ sql, params });
      return { insertId: 0 };
    },
  };

  const categoryRows = [
    {
      categorie_slug: 'vivant_classification',
      categorie_nom: 'Le vivant',
      theme: 'sciences',
      ordre: 1,
    },
  ];
  const questionRows = [
    {
      id: 9001,
      categorie_slug: 'vivant_classification',
      numero_dans_categorie: 1,
      question: 'Comment les plantes fabriquent-elles leur matière ?',
      choix_a: 'Photosynthèse',
      choix_b: 'Respiration',
      choix_c: 'Digestion',
      reponse_correcte: 'A',
      niveau: 'college',
      tags: 'photosynthese',
    },
  ];

  const report = await applyFmQuizImport(deps, categoryRows, questionRows, { dryRun: false });
  assert.strictEqual(report.totals.glossary_links_synced, 1);

  // (a) Plus aucune écriture sur l'ancienne table de jonction.
  assert.ok(
    !executed.some((e) => /quiz_question_glossary/i.test(e.sql)),
    'aucune écriture ne doit cibler quiz_question_glossary',
  );

  // DELETE global scopé origin='import' + resource_type='glossary', sans clause status.
  const del = executed.find((e) => /DELETE FROM resource_question_links/i.test(e.sql));
  assert.ok(del, 'un DELETE sur resource_question_links est attendu');
  assert.match(del.sql, /resource_type\s*=\s*'glossary'/i);
  assert.match(del.sql, /origin\s*=\s*'import'/i);
  assert.ok(!/status/i.test(del.sql), 'le DELETE ne doit PAS être scopé sur status');

  // INSERT IGNORE vers RQL avec origin='import' et resource_ref = glossary_code.
  const ins = executed.find((e) => /INSERT IGNORE INTO resource_question_links/i.test(e.sql));
  assert.ok(ins, 'un INSERT IGNORE sur resource_question_links est attendu');
  assert.match(ins.sql, /'glossary'/i);
  assert.match(ins.sql, /'import'/i);
  assert.deepStrictEqual(ins.params, ['GLFM01', 'QF9001']);
});

test('import quiz interrompu après le DELETE des liens : le rollback les restaure', async () => {
  // Même contrat que l'import GL (G4) : vider `resource_question_links` origin=import
  // puis reconstruire. Sans transaction, une panne à ce stade effaçait tous les
  // rattachements auto-générés. On rejoue le flux avec une base factice.
  const store = {
    links: [{ question_code: 'QF0001', resource_ref: 'GLFM99', origin: 'import' }],
  };
  const initial = structuredClone(store);
  let deleteApplied = false;

  const deps = {
    queryAll: async (sql) => {
      if (/FROM glossary_terms/i.test(sql)) {
        return [
          {
            glossary_code: 'GLFM01',
            terme: 'Photosynthèse',
            variantes: '',
            categorie: 'flore',
            definition_courte: 'Production de matière par la lumière',
          },
        ];
      }
      return [];
    },
    execute: async (sql) => {
      if (/DELETE FROM resource_question_links/i.test(sql)) {
        store.links = store.links.filter((row) => row.origin !== 'import');
        deleteApplied = true;
        return { insertId: 0 };
      }
      if (/INSERT IGNORE INTO resource_question_links/i.test(sql)) {
        throw new Error('PANNE_INJECTEE_LIENS');
      }
      return { insertId: 0 };
    },
  };

  async function fakeWithTransaction(work) {
    const snapshot = structuredClone(store);
    try {
      return await work(deps);
    } catch (err) {
      store.links = snapshot.links;
      throw err;
    }
  }

  const categoryRows = [
    {
      categorie_slug: 'vivant_classification',
      categorie_nom: 'Le vivant',
      theme: 'sciences',
      ordre: 1,
    },
  ];
  const questionRows = [
    {
      id: 9001,
      categorie_slug: 'vivant_classification',
      numero_dans_categorie: 1,
      question: 'Comment les plantes fabriquent-elles leur matière ?',
      choix_a: 'Photosynthèse',
      choix_b: 'Respiration',
      choix_c: 'Digestion',
      reponse_correcte: 'A',
      niveau: 'college',
      tags: 'photosynthese',
    },
  ];

  await assert.rejects(
    fakeWithTransaction((tx) =>
      applyFmQuizImport(tx, categoryRows, questionRows, { dryRun: false }),
    ),
    /PANNE_INJECTEE_LIENS/,
  );
  assert.strictEqual(deleteApplied, true, 'la panne doit arriver APRÈS le DELETE des liens');
  assert.deepStrictEqual(
    store,
    initial,
    'après rollback, les rattachements glossaire origin=import doivent être restaurés',
  );
});
