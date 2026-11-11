'use strict';

/**
 * Typographie française dans les écritures **paramétrées** du connecteur (exploitation, lot 5) :
 * points de suspension `…`, indices et exposants (`CO₂`, `m²`), espace fine insécable (U+202F)
 * et espace insécable (U+00A0) passent tels quels par `foretmap_quiz` (`create`, `update`),
 * `foretmap_content_change` et `foretmap_api` — la valeur est un paramètre lié, jamais du SQL.
 *
 * Le refus des caractères non canoniques (NFKC) reste, lui, en place sur le SQL brut
 * (`foretmap_sql_select`, `foretmap_sql_execute`) : contre-vérification B1 de la PR #616.
 * Agrégations (`GROUP BY`, `HAVING`, fonctions d'agrégat) admises en lecture.
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const fx = require('./helpers/mcpFixtures');
const { initSchema, queryOne, execute } = require('../database');
const { analyzeSelect, assertPlainSqlText } = require('../lib/mcp/sqlAst');
const { readableSqlError } = require('../lib/mcp/tools/sqlSelect');

fx.enableMcpEnv();

const { app } = require('../server');

const stamp = Date.now().toString(36);
const NNBSP = ' ';
const NBSP = ' ';
const TYPO = `Le CO₂ fixé par m² de sol${NNBSP}: environ 2${NBSP}kg… et «${NNBSP}plus${NNBSP}»${NNBSP}?`;

let adminToken;
let categorySlug;
let questionCode;

const call = (name, args) => fx.callTool(app, adminToken, name, args);

test.before(async () => {
  await initSchema();
  const admin = await fx.createAccount('admin');
  adminToken = (await fx.obtainTokens(app, admin)).access_token;
  categorySlug = (await queryOne('SELECT slug FROM quiz_categories ORDER BY slug LIMIT 1')).slug;
});

test.after(async () => {
  if (questionCode) {
    await execute('DELETE FROM quiz_questions WHERE question_code = ?', [questionCode]);
  }
  await fx.cleanupAccounts();
});

test.beforeEach(() => fx.enableMcpEnv());

test('le texte de test n’est pas canonique en NFKC (sinon le test ne prouverait rien)', () => {
  assert.notEqual(TYPO.normalize('NFKC'), TYPO);
});

test('foretmap_quiz create puis update : typographie conservée', async () => {
  const c = await call('foretmap_quiz', {
    action: 'create',
    data: {
      categorie_slug: categorySlug,
      question: `${TYPO} (${stamp})`,
      choix_a: 'Quelques kg…',
      choix_b: `1${NNBSP}t de CO₂`,
      choix_c: '10 m²',
      reponse_correcte: 'A',
      niveau: 'college',
      difficulte: 1,
    },
  });
  assert.equal(c.isError, false, c.text);
  questionCode = c.data.question_code || c.data.question?.question_code;
  assert.ok(questionCode, c.text);

  let row = await queryOne(
    'SELECT question, choix_a, choix_b, choix_c FROM quiz_questions WHERE question_code = ?',
    [questionCode],
  );
  assert.equal(row.question, `${TYPO} (${stamp})`);
  assert.equal(row.choix_a, 'Quelques kg…');
  assert.equal(row.choix_b, `1${NNBSP}t de CO₂`);
  assert.equal(row.choix_c, '10 m²');

  const up = await call('foretmap_quiz', {
    action: 'update',
    question_code: questionCode,
    data: { feedback_correct: TYPO },
  });
  assert.equal(up.isError, false, up.text);
  row = await queryOne('SELECT feedback_correct FROM quiz_questions WHERE question_code = ?', [
    questionCode,
  ]);
  assert.equal(row.feedback_correct, TYPO);
});

test('foretmap_content_change : typographie conservée', async () => {
  const value = `Bravo${NNBSP}! ${TYPO}`;
  const r = await call('foretmap_content_change', {
    operations: [
      {
        op: 'set_field',
        table: 'quiz_questions',
        key: { question_code: questionCode },
        column: 'feedback_a',
        value,
      },
    ],
    note: 'test typographie',
  });
  assert.equal(r.isError, false, r.text);
  const row = await queryOne('SELECT feedback_a FROM quiz_questions WHERE question_code = ?', [
    questionCode,
  ]);
  assert.equal(row.feedback_a, value);
});

test('foretmap_api : typographie conservée', async () => {
  const get = await call('foretmap_api', {
    method: 'GET',
    path: `/api/quiz/admin/questions/${encodeURIComponent(questionCode)}`,
  });
  assert.equal(get.isError, false, get.text);
  const current = get.data.json?.question || get.data.json;
  const value = `Presque${NNBSP}: ${TYPO}`;
  const put = await call('foretmap_api', {
    method: 'PUT',
    path: `/api/quiz/admin/questions/${encodeURIComponent(questionCode)}`,
    body: { ...current, feedback_b: value },
  });
  assert.equal(put.isError, false, put.text);
  assert.ok(put.data.status < 300, put.text);
  const row = await queryOne('SELECT feedback_b FROM quiz_questions WHERE question_code = ?', [
    questionCode,
  ]);
  assert.equal(row.feedback_b, value);
});

test('SQL brut : le refus NFKC reste en place (select et execute)', () => {
  assert.throws(
    () => assertPlainSqlText("SELECT question FROM quiz_questions WHERE question = 'CO₂'"),
    /NFKC/,
  );
  assert.throws(
    () => assertPlainSqlText("UPDATE quiz_questions SET feedback_a = 'kg…' WHERE id = 1"),
    /NFKC/,
  );
});

test('SQL en lecture : GROUP BY, HAVING et agrégats admis', () => {
  const r = analyzeSelect(
    'SELECT categorie_slug, COUNT(*) AS n, MIN(difficulte) AS dmin, MAX(difficulte) AS dmax, AVG(difficulte) AS dmoy, SUM(difficulte) AS dsum FROM quiz_questions GROUP BY categorie_slug HAVING COUNT(*) > 1 ORDER BY n DESC',
  );
  assert.deepEqual(r.tables, ['quiz_questions']);
});

test('erreur de la requête (colonne inconnue) : message MySQL rendu, le reste générique', () => {
  const e = readableSqlError(
    Object.assign(new Error('x'), {
      code: 'ER_BAD_FIELD_ERROR',
      sqlMessage: "Unknown column 'difficulty' in 'field list'",
    }),
  );
  assert.equal(e.name, 'McpToolError');
  assert.equal(e.code, 'ER_BAD_FIELD_ERROR');
  assert.match(e.message, /Unknown column 'difficulty'/);
  const other = Object.assign(new Error('connexion'), { code: 'ECONNREFUSED' });
  assert.equal(readableSqlError(other), other);
});
