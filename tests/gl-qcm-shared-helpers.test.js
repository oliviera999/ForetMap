'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const { createQuestionQuery } = require('../lib/shared/questionQueryFactory');
const {
  fisherYates,
  applyTextSearch,
  applySelectedCodes,
  applyExcludedCodes,
} = require('../lib/shared/questionPoolFiltering');
const {
  normalizeMatchKey,
  tokenizeCsvLike,
  buildLookupMap,
  matchTermsForKeywords,
} = require('../lib/shared/glossaryNormalization');

// --- lib/shared/questionQueryFactory.js -----------------------------------

test('createQuestionQuery paramètre le SELECT et le libellé du catalogue', async () => {
  const calls = [];
  const deps = {
    queryOne: async (sql, params) => {
      calls.push({ sql, params });
      return { question_code: params[0] };
    },
  };
  const query = createQuestionQuery({
    select: 'SELECT question_code FROM table_test',
    catalogLabel: 'QCM test',
  });

  const row = await query.loadActiveQuestion(deps, ' qcm0001 ');
  assert.deepStrictEqual(row, { question_code: 'QCM0001' });
  assert.strictEqual(calls.length, 1);
  assert.ok(calls[0].sql.startsWith('SELECT question_code FROM table_test'));
  assert.ok(calls[0].sql.includes("statut = 'actif'"));
  assert.deepStrictEqual(calls[0].params, ['QCM0001']);

  assert.strictEqual(await query.loadActiveQuestion(deps, '   '), null);

  const message = query.presentableQuestionError('qcm0002');
  assert.ok(message.includes('QCM0002'));
  assert.ok(message.includes('catalogue QCM test'));
});

test('les adaptateurs QCM biome/lore gardent leurs messages historiques', () => {
  const { presentableQuestionError } = require('../lib/glQcmQuestionQuery');
  const { presentableLoreQuestionError } = require('../lib/glQcmLoreQuestionQuery');
  assert.strictEqual(
    presentableQuestionError('a1'),
    'Question A1 : choix de réponse incomplets dans le catalogue QCM (au moins 2 choix et une bonne réponse requis)',
  );
  assert.strictEqual(
    presentableLoreQuestionError('a1'),
    'Question A1 : choix de réponse incomplets dans le catalogue QCM lore (au moins 2 choix et une bonne réponse requis)',
  );
});

// --- lib/shared/questionPoolFiltering.js -----------------------------------

test('fisherYates renvoie une permutation sans muter le tableau source', () => {
  const source = [1, 2, 3, 4, 5];
  const shuffled = fisherYates(source);
  assert.deepStrictEqual(source, [1, 2, 3, 4, 5]);
  assert.deepStrictEqual([...shuffled].sort(), [1, 2, 3, 4, 5]);
});

test('applyTextSearch filtre sur question, tags et mots_cles', () => {
  const rows = [
    { question: 'Où pousse le chêne ?', tags: '', mots_cles: '' },
    { question: 'Question 2', tags: 'forêt,CHÊNE', mots_cles: '' },
    { question: 'Question 3', tags: '', mots_cles: 'rivière' },
  ];
  assert.strictEqual(applyTextSearch(rows, ' chêne ').length, 2);
  assert.strictEqual(applyTextSearch(rows, 'rivière').length, 1);
  assert.strictEqual(applyTextSearch(rows, '').length, 3);
});

test('applySelectedCodes et applyExcludedCodes normalisent les codes', () => {
  const rows = [{ question_code: 'QCM0001' }, { question_code: 'QCM0002' }];
  assert.deepStrictEqual(applySelectedCodes(rows, [' qcm0002 ']), [{ question_code: 'QCM0002' }]);
  assert.strictEqual(applySelectedCodes(rows, []).length, 2);
  assert.deepStrictEqual(applyExcludedCodes(rows, ['qcm0001']), [{ question_code: 'QCM0002' }]);
  assert.strictEqual(applyExcludedCodes(rows, null).length, 2);
});

// --- lib/shared/glossaryNormalization.js ------------------------------------

test('normalizeMatchKey et tokenizeCsvLike normalisent accents et séparateurs', () => {
  assert.strictEqual(normalizeMatchKey("  L'Écosystème forestier! "), 'l ecosysteme forestier');
  assert.deepStrictEqual(tokenizeCsvLike('Chêne, érable;  |hêtre\nif'), [
    'chene',
    'erable',
    'hetre',
    'if',
  ]);
  assert.deepStrictEqual(tokenizeCsvLike(''), []);
});

test('matchTermsForKeywords dédoublonne selon le champ code paramétré', () => {
  const rows = [
    { glossary_code: 'GLO1', terme: 'Zone humide', variantes: 'marais', definition_courte: 'd1' },
    { glossary_code: 'GLO2', terme: 'Canopée', variantes: '', definition_courte: 'd2' },
  ];
  const byKey = buildLookupMap(rows);
  const out = matchTermsForKeywords('marais, canopée, Zone humide', byKey, {
    codeField: 'glossary_code',
    toItem: (entry) => ({ glossary_code: entry.glossary_code, terme: entry.terme }),
  });
  // « marais » et « Zone humide » pointent la même entrée → dédoublonnée ; tri fr par terme.
  assert.deepStrictEqual(out, [
    { glossary_code: 'GLO2', terme: 'Canopée' },
    { glossary_code: 'GLO1', terme: 'Zone humide' },
  ]);

  const loreRows = [{ lore_code: 'LORE1', terme: 'Licorne', variantes: 'licornes' }];
  const loreOut = matchTermsForKeywords('licornes', buildLookupMap(loreRows), {
    codeField: 'lore_code',
    toItem: (entry) => ({ lore_code: entry.lore_code, terme: entry.terme }),
  });
  assert.deepStrictEqual(loreOut, [{ lore_code: 'LORE1', terme: 'Licorne' }]);
});
