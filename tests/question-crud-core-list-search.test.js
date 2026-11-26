'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { listAdminQuestionsCore } = require('../lib/shared/questionCrudCore');

const BASE_CONFIG = {
  adminSelect:
    'SELECT q.question_code, q.question, q.tags, q.categorie_slug, q.mots_cles FROM quiz_questions q',
  validSorts: new Set(['code']),
  defaultSort: 'code',
  buildOrderClause: () => 'q.question_code ASC',
  buildFilters: () => [],
  toSummary: (row) => row,
};

test('listAdminQuestionsCore — q repoussé en SQL LIKE (colonnes communes + searchExtraFields)', async () => {
  let capturedSql = '';
  let capturedParams = [];
  const deps = {
    async queryAll(sql, params) {
      capturedSql = sql;
      capturedParams = params;
      return [
        {
          question_code: 'QF0001',
          question: 'Énoncé test',
          tags: 'botanique',
          categorie_slug: 'vivant_classification',
          mots_cles: 'arbre',
        },
      ];
    },
  };
  const config = { ...BASE_CONFIG, searchExtraFields: ['mots_cles'] };
  const items = await listAdminQuestionsCore(deps, { q: 'BoTa', statut: 'all' }, config);

  assert.ok(capturedSql.includes('LOWER(q.question_code) LIKE ?'));
  assert.ok(capturedSql.includes('LOWER(q.question) LIKE ?'));
  assert.ok(capturedSql.includes("LOWER(IFNULL(q.tags,'')) LIKE ?"));
  assert.ok(capturedSql.includes('LOWER(q.categorie_slug) LIKE ?'));
  assert.ok(capturedSql.includes("LOWER(IFNULL(q.mots_cles,'')) LIKE ?"));
  assert.equal(capturedParams.filter((p) => p === '%bota%').length, 5);
  assert.equal(items.length, 1);
  assert.equal(items[0].question_code, 'QF0001');
});

test('listAdminQuestionsCore — sans q, pas de clause LIKE recherche', async () => {
  let capturedSql = '';
  const deps = {
    async queryAll(sql) {
      capturedSql = sql;
      return [];
    },
  };
  await listAdminQuestionsCore(
    deps,
    { statut: 'actif' },
    { ...BASE_CONFIG, searchExtraFields: [] },
  );
  assert.ok(!capturedSql.includes('LOWER(q.question) LIKE'));
});
