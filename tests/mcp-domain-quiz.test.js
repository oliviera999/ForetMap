'use strict';

/**
 * `foretmap_quiz` action `stats` : champ `distractors` (migration `quiz_attempt_choice`,
 * lot D). Par question, sur la version courante : répartition, attracteurs, distracteurs
 * morts, discrimination, temps médian — mêmes fonctions que
 * `GET /api/quiz/admin/questions/stats`. Aucun identifiant d'élève dans la réponse.
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const fx = require('./helpers/mcpFixtures');
const { initSchema, execute } = require('../database');
const { computeQuestionFingerprint } = require('../lib/quizQuestionFingerprint');

fx.enableMcpEnv();

const { app } = require('../server');

const stamp = Date.now();
const short = String(stamp).slice(-7);
const CATEGORY = `mcpqd${stamp}`.slice(0, 60);
const CODE = `QMD${short}`;
const ROW = {
  question_code: CODE,
  question: 'Un décomposeur est-il un consommateur ?',
  choix_a: 'Non, il recycle la matière morte',
  choix_b: 'Oui, il mange des animaux vivants',
  choix_c: 'Oui, c’est un herbivore',
  choix_d: null,
  choix_e: null,
  reponse_correcte: 'A',
};
const studentIds = [];
let adminToken;

const call = (name, args) => fx.callTool(app, adminToken, name, args);

test.before(async () => {
  await initSchema();
  const admin = await fx.createAccount('admin');
  adminToken = (await fx.obtainTokens(app, admin)).access_token;
  await execute(
    `INSERT INTO quiz_categories (slug, nom, theme, order_index) VALUES (?, 'MCP distracteurs', 'sciences', 996)`,
    [CATEGORY],
  );
  await execute(
    `INSERT INTO quiz_questions
       (question_code, categorie_slug, numero_dans_categorie, question, choix_a, choix_b, choix_c,
        reponse_correcte, niveau, statut)
     VALUES (?, ?, 1, ?, ?, ?, ?, 'A', 'college', 'actif')`,
    [CODE, CATEGORY, ROW.question, ROW.choix_a, ROW.choix_b, ROW.choix_c],
  );
  const fp = computeQuestionFingerprint(ROW);
  // Version courante : A=3, B=6 (attracteur), C=1 ; une tentative historique sans lettre.
  const plan = [
    ['A', 3],
    ['B', 6],
    ['C', 1],
  ];
  for (const [letter, n] of plan) {
    for (let i = 0; i < n; i += 1) {
      const s = await fx.createAccount('eleve_novice', { userType: 'student' });
      studentIds.push(s.id);
      await execute(
        `INSERT INTO user_quiz_attempts
           (user_id, question_code, categorie_slug, is_correct, choix_lettre, ordre_presente,
            duree_ms, contexte, question_empreinte)
         VALUES (?, ?, ?, ?, ?, 'BCA', ?, 'libre', ?)`,
        [s.id, CODE, CATEGORY, letter === 'A' ? 1 : 0, letter, 5000 + i * 1000, fp],
      );
    }
  }
  await execute(
    'INSERT INTO user_quiz_attempts (user_id, question_code, categorie_slug, is_correct) VALUES (?, ?, ?, 1)',
    [studentIds[0], CODE, CATEGORY],
  );
});

test.after(async () => {
  await execute('DELETE FROM user_quiz_attempts WHERE question_code = ?', [CODE]);
  await execute('DELETE FROM quiz_questions WHERE question_code = ?', [CODE]);
  await execute('DELETE FROM quiz_categories WHERE slug = ?', [CATEGORY]);
  await fx.cleanupAccounts();
});

test.beforeEach(() => fx.enableMcpEnv());

test('stats : distractors disponible, détail par question sur la version courante', async () => {
  const st = await call('foretmap_quiz', { action: 'stats', categorie_slug: CATEGORY });
  assert.equal(st.isError, false, st.text);
  assert.equal(st.data.distractors.available, true);
  assert.equal(st.data.distractors.raison, undefined);
  assert.equal(st.data.distractors.seuils.distracteur_mort_min_reponses, 20);
  assert.ok(Array.isArray(st.data.distractors.effet_position));

  const q = st.data.by_question.find((r) => r.question_code === CODE);
  assert.ok(q, 'question listée');
  assert.equal(q.attempts, 11, 'la réussite compte aussi la tentative historique');
  assert.equal(q.version.tentatives, 10);
  assert.equal(q.version.choix_connus, 10);
  assert.equal(q.version.tentatives_sans_version, 1);
  assert.deepEqual(
    q.repartition.map((r) => [r.lettre, r.effectif, r.pourcentage, r.correcte]),
    [
      ['A', 3, 30, true],
      ['B', 6, 60, false],
      ['C', 1, 10, false],
    ],
  );
  assert.deepEqual(q.attracteurs, ['B']);
  assert.equal(q.signaux.attracteur, true);
  // Moins de 20 réponses : distracteurs morts non évalués ; moins de 30 répondants.
  assert.equal(q.distracteurs_morts_evalues, false);
  assert.equal(q.discrimination.disponible, false);
  assert.equal(q.temps_median_ms.mesures, 10);
  assert.equal(q.temps_median_ms.bonnes_reponses, 6000);
});

test('stats : agrégats seulement, aucun identifiant d’élève', async () => {
  const st = await call('foretmap_quiz', { action: 'stats', categorie_slug: CATEGORY });
  const text = JSON.stringify(st.data);
  for (const id of studentIds) assert.ok(!text.includes(id), 'identifiant d’élève exposé');
});
