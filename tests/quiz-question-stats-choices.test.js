'use strict';

/**
 * Statistiques d'items du quiz ForetMap (migration `quiz_attempt_choice`, lot C) : répartition
 * des choix sur la version courante, distracteur attracteur, distracteur mort, indice de
 * discrimination, temps médian, effet de position, drapeau `suspect` enrichi. Jeux de
 * tentatives construits à la main pour chaque signal et chaque seuil.
 */

require('./helpers/setup');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute, queryOne, queryAll } = require('../database');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');
const stats = require('../lib/quizQuestionStats');
const { computeQuestionFingerprint } = require('../lib/quizQuestionFingerprint');

const stamp = Date.now();
const short = String(stamp).slice(-7);
const CATEGORY = `qstatc${stamp}`.slice(0, 60);
const Q_ATTR = `QSA${short}`;
const Q_POS = `QSP${short}`;
const Q_NEG = `QSN${short}`;
const Q_OTHER = `QSO${short}`;
const OLD_FP = 'aaaaaaaaaaaa';
const users = [];
const db = { queryAll };

function question(code, numero) {
  return {
    question_code: code,
    question: `Énoncé ${code} ?`,
    choix_a: 'Bonne',
    choix_b: 'Piège',
    choix_c: 'Autre',
    choix_d: 'Morte',
    choix_e: null,
    reponse_correcte: 'A',
    numero,
  };
}

const ROWS = {
  [Q_ATTR]: question(Q_ATTR, 1),
  [Q_POS]: question(Q_POS, 2),
  [Q_NEG]: question(Q_NEG, 3),
  [Q_OTHER]: question(Q_OTHER, 4),
};
const FP = Object.fromEntries(
  Object.entries(ROWS).map(([code, row]) => [code, computeQuestionFingerprint(row)]),
);

async function createUser() {
  const id = `qsc-${crypto.randomUUID().slice(0, 12)}`;
  await execute(
    `INSERT INTO users (id, user_type, first_name, last_name, display_name, password_hash,
                        auth_provider, is_active, created_at, updated_at)
     VALUES (?, 'student', 'Stat', ?, ?, 'x', 'local', 1, NOW(), NOW())`,
    [id, id, id],
  );
  users.push(id);
  return id;
}

/** Insère des tentatives : `[userId, code, isCorrect, lettre, empreinte, durée, ordre]`. */
async function insertAttempts(rows) {
  for (let i = 0; i < rows.length; i += 200) {
    const batch = rows.slice(i, i + 200);
    await execute(
      `INSERT INTO user_quiz_attempts
         (user_id, question_code, categorie_slug, is_correct, choix_lettre, question_empreinte,
          duree_ms, ordre_presente, contexte)
       VALUES ${batch.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, 'libre')").join(', ')}`,
      batch.flatMap(([u, code, ok, letter, fp, ms, order]) => [
        u,
        code,
        CATEGORY,
        ok ? 1 : 0,
        letter,
        fp,
        ms ?? null,
        order ?? null,
      ]),
    );
  }
}

before(async () => {
  await initSchema();
  await execute(
    `INSERT INTO quiz_categories (slug, nom, theme, order_index) VALUES (?, 'Stats choix', 'sciences', 994)`,
    [CATEGORY],
  );
  for (const row of Object.values(ROWS)) {
    await execute(
      `INSERT INTO quiz_questions
        (question_code, categorie_slug, numero_dans_categorie, question,
         choix_a, choix_b, choix_c, choix_d, reponse_correcte, niveau, statut)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'A', 'college', 'actif')`,
      [
        row.question_code,
        CATEGORY,
        row.numero,
        row.question,
        row.choix_a,
        row.choix_b,
        row.choix_c,
        row.choix_d,
      ],
    );
  }

  // Q_ATTR, version courante : A=8, B=12 (attracteur), C=5, D=0 (mort, 25 réponses ≥ 20) ;
  // 3 tentatives historiques sans lettre ni version ; 4 sur une version antérieure.
  const attempts = [];
  const plan = [
    ['A', 8],
    ['B', 12],
    ['C', 5],
  ];
  for (const [letter, n] of plan) {
    for (let i = 0; i < n; i += 1) {
      const u = await createUser();
      const ms = letter === 'A' ? 4000 + i * 1000 : 10000; // bonnes : 4 s … 11 s
      attempts.push([u, Q_ATTR, letter === 'A', letter, FP[Q_ATTR], ms, 'ABCD']);
    }
  }
  const histUser = await createUser();
  for (let i = 0; i < 3; i += 1) attempts.push([histUser, Q_ATTR, i === 0, null, null, null]);
  for (let i = 0; i < 4; i += 1) attempts.push([histUser, Q_ATTR, true, 'D', OLD_FP, 2000]);

  // Discrimination : 40 élèves par question. Force = réussite sur Q_OTHER (4 essais, k bons,
  // k = 0…4 par groupes de 8). Q_POS : juste ssi k ≥ 3 ; Q_NEG : juste ssi k ≤ 1.
  for (const [code, rule] of [
    [Q_POS, (k) => k >= 3],
    [Q_NEG, (k) => k <= 1],
  ]) {
    for (let i = 0; i < 40; i += 1) {
      const u = await createUser();
      const k = Math.floor(i / 8);
      for (let j = 0; j < 4; j += 1)
        attempts.push([u, Q_OTHER, j < k, j < k ? 'A' : 'B', FP[Q_OTHER]]);
      const ok = rule(k);
      // Première réponse = celle qui compte ; une seconde, inverse, ne doit rien changer.
      attempts.push([u, code, ok, ok ? 'A' : 'C', FP[code]]);
      attempts.push([u, code, !ok, ok ? 'C' : 'A', FP[code]]);
    }
  }
  await insertAttempts(attempts);
});

after(async () => {
  await execute('DELETE FROM user_quiz_attempts WHERE categorie_slug = ?', [CATEGORY]).catch(
    () => {},
  );
  for (let i = 0; i < users.length; i += 200) {
    const batch = users.slice(i, i + 200);
    await execute(
      `DELETE FROM users WHERE id IN (${batch.map(() => '?').join(', ')})`,
      batch,
    ).catch(() => {});
  }
  await execute('DELETE FROM quiz_questions WHERE categorie_slug = ?', [CATEGORY]).catch(() => {});
  await execute('DELETE FROM quiz_categories WHERE slug = ?', [CATEGORY]).catch(() => {});
});

// ---------------------------------------------------------------------------------------
// Fonctions pures
// ---------------------------------------------------------------------------------------

test('seuils : constantes nommées (5 %, 20 réponses, 30 répondants, 27 %)', () => {
  assert.equal(stats.DEAD_DISTRACTOR_RATE, 0.05);
  assert.equal(stats.DEAD_DISTRACTOR_MIN_ANSWERS, 20);
  assert.equal(stats.DISCRIMINATION_MIN_RESPONDENTS, 30);
  assert.equal(stats.DISCRIMINATION_GROUP_SHARE, 0.27);
});

test('répartition : pourcentages, bonne réponse marquée, attracteur', () => {
  const r = stats.computeChoiceSignals({
    counts: { A: 3, B: 5, C: 2 },
    correctLetter: 'A',
    letters: ['A', 'B', 'C'],
  });
  assert.equal(r.choix_connus, 10);
  assert.deepEqual(
    r.repartition.map((x) => [x.lettre, x.effectif, x.pourcentage, x.correcte]),
    [
      ['A', 3, 30, true],
      ['B', 5, 50, false],
      ['C', 2, 20, false],
    ],
  );
  assert.deepEqual(r.attracteurs, ['B']);
  // Sous 20 réponses, les distracteurs morts ne sont pas évalués.
  assert.equal(r.distracteurs_morts_evalues, false);
  assert.deepEqual(r.distracteurs_morts, []);
});

test('distracteur à égalité avec la bonne réponse : pas un attracteur', () => {
  const r = stats.computeChoiceSignals({
    counts: { A: 4, B: 4 },
    correctLetter: 'A',
    letters: ['A', 'B'],
  });
  assert.deepEqual(r.attracteurs, []);
});

test('distracteur mort : < 5 % à partir de 20 réponses, pas avant', () => {
  const at19 = stats.computeChoiceSignals({
    counts: { A: 15, B: 4, C: 0 },
    correctLetter: 'A',
    letters: ['A', 'B', 'C'],
  });
  assert.equal(at19.distracteurs_morts_evalues, false);
  assert.deepEqual(at19.distracteurs_morts, []);
  const at20 = stats.computeChoiceSignals({
    counts: { A: 15, B: 4, C: 1 },
    correctLetter: 'A',
    letters: ['A', 'B', 'C'],
  });
  // C = 1/20 = 5 % : pas « moins de 5 % ».
  assert.equal(at20.distracteurs_morts_evalues, true);
  assert.deepEqual(at20.distracteurs_morts, []);
  const dead = stats.computeChoiceSignals({
    counts: { A: 16, B: 4, C: 0, D: 1 },
    correctLetter: 'A',
    letters: ['A', 'B', 'C', 'D'],
  });
  assert.deepEqual(dead.distracteurs_morts, ['C', 'D']);
});

test('aucune réponse connue : répartition vide de sens, aucun signal', () => {
  const r = stats.computeChoiceSignals({ counts: {}, correctLetter: 'A', letters: ['A', 'B'] });
  assert.equal(r.choix_connus, 0);
  assert.equal(r.repartition[0].pourcentage, null);
  assert.deepEqual(r.attracteurs, []);
});

function respondents(n, correctFor) {
  return Array.from({ length: n }, (_, i) => ({ strength: i / n, correct: correctFor(i, n) }));
}

test('discrimination : positive, nulle, négative ; seuil de 30 répondants', () => {
  const pos = stats.computeDiscrimination(respondents(30, (i, n) => i >= n / 2));
  assert.equal(pos.disponible, true);
  assert.equal(pos.taille_groupes, 8);
  assert.equal(pos.indice, 1);
  assert.equal(pos.negative, false);

  const nulle = stats.computeDiscrimination(respondents(40, () => true));
  assert.equal(nulle.indice, 0);
  assert.equal(nulle.negative, false);

  const neg = stats.computeDiscrimination(respondents(30, (i, n) => i < n / 2));
  assert.equal(neg.indice, -1);
  assert.equal(neg.negative, true);

  const few = stats.computeDiscrimination(respondents(29, (i, n) => i < n / 2));
  assert.equal(few.disponible, false);
  assert.equal(few.indice, null);
  assert.equal(few.negative, false);
  assert.equal(few.repondants, 29);
  assert.equal(few.seuil_repondants, 30);
});

test('médiane', () => {
  assert.equal(stats.median([]), null);
  assert.equal(stats.median([5]), 5);
  assert.equal(stats.median([3, 1, 2]), 2);
  assert.equal(stats.median([1, 2, 3, 10]), 3);
});

test('effet de position : taux par position affichée, par nombre de choix', () => {
  const r = stats.computePositionEffect([
    { nb_choix: 4, position: 1, effectif: 30 },
    { nb_choix: 4, position: 2, effectif: 20 },
    { nb_choix: 4, position: 4, effectif: 50 },
    { nb_choix: 3, position: 2, effectif: 3 },
    { nb_choix: 4, position: 0, effectif: 99 }, // lettre absente de l'ordre : ignorée
  ]);
  assert.deepEqual(
    r.map((x) => x.nb_choix),
    [3, 4],
  );
  const four = r[1];
  assert.equal(four.reponses, 100);
  assert.equal(four.attendu_pourcentage, 25);
  assert.deepEqual(
    four.positions.map((p) => p.pourcentage),
    [30, 20, 0, 50],
  );
});

test('suspect : réussite faible OU attracteur OU discrimination négative', () => {
  const base = { question_code: 'X', suspect: false };
  const analysis = (attr, neg) => ({
    attracteurs: attr ? ['B'] : [],
    discrimination: { negative: neg },
  });
  assert.equal(stats.withItemSignals(base, analysis(false, false)).suspect, false);
  assert.equal(stats.withItemSignals(base, analysis(true, false)).suspect, true);
  assert.equal(stats.withItemSignals(base, analysis(false, true)).suspect, true);
  const low = stats.withItemSignals({ ...base, suspect: true }, analysis(false, false));
  assert.equal(low.suspect, true);
  assert.deepEqual(low.signaux, {
    reussite_faible: true,
    attracteur: false,
    discrimination_negative: false,
  });
  // Sans analyse (question inconnue) : ligne inchangée.
  assert.equal(stats.withItemSignals(base, undefined), base);
});

// ---------------------------------------------------------------------------------------
// Sur la base : SQL groupé, version courante
// ---------------------------------------------------------------------------------------

test('version courante seulement ; historiques et versions antérieures comptées à part', async () => {
  const analysis = await stats.loadFmItemAnalysis(db, [Q_ATTR]);
  const a = analysis.get(Q_ATTR);
  assert.equal(a.version.empreinte, FP[Q_ATTR]);
  assert.equal(a.version.tentatives, 25);
  assert.equal(a.version.choix_connus, 25);
  assert.equal(a.version.tentatives_versions_anterieures, 4);
  assert.equal(a.version.tentatives_sans_version, 3);
  assert.equal(a.version.success_rate, 0.32);
  assert.deepEqual(
    a.repartition.map((r) => [r.lettre, r.effectif, r.correcte]),
    [
      ['A', 8, true],
      ['B', 12, false],
      ['C', 5, false],
      ['D', 0, false],
    ],
  );
  assert.deepEqual(a.attracteurs, ['B']);
  assert.equal(a.distracteurs_morts_evalues, true);
  assert.deepEqual(
    a.distracteurs_morts,
    ['D'],
    'les 4 « D » de l’ancienne version ne comptent pas',
  );
  // Temps médian : 25 mesures ; bonnes réponses 4…11 s → médiane 7,5 s.
  assert.equal(a.temps_median_ms.mesures, 25);
  assert.equal(a.temps_median_ms.bonnes_reponses, 7500);
  assert.equal(a.temps_median_ms.global, 10000);
  // Chaque élève n'a répondu qu'à cette question : aucune force calculable.
  assert.equal(a.discrimination.disponible, false);
});

test('discrimination positive et négative, sur la première réponse de chaque élève', async () => {
  const analysis = await stats.loadFmItemAnalysis(db, [Q_POS, Q_NEG]);
  const pos = analysis.get(Q_POS).discrimination;
  assert.equal(pos.disponible, true);
  assert.equal(pos.repondants, 40);
  assert.equal(pos.taille_groupes, 11);
  assert.equal(pos.reussite_groupe_fort, 1);
  assert.equal(pos.reussite_groupe_faible, 0);
  assert.equal(pos.indice, 1);
  assert.equal(pos.negative, false);
  const neg = analysis.get(Q_NEG).discrimination;
  assert.equal(neg.indice, -1);
  assert.equal(neg.negative, true);
});

test('question sans tentative de la version courante : tout à zéro, rien d’inventé', async () => {
  const analysis = await stats.loadFmItemAnalysis(db, ['QINCONNUE0']);
  const a = analysis.get('QINCONNUE0');
  assert.equal(a.version.empreinte, null);
  assert.equal(a.version.tentatives, 0);
  assert.deepEqual(a.repartition, []);
  assert.equal(a.temps_median_ms.global, null);
});

test('GET /api/quiz/admin/questions/stats : champs d’items, effet de position, seuils', async () => {
  const token = await ensureAdminTeacherAuthToken();
  const res = await request(app)
    .get('/api/quiz/admin/questions/stats?minAttempts=1')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  assert.deepEqual(res.body.seuils, {
    distracteur_mort_taux: 0.05,
    distracteur_mort_min_reponses: 20,
    discrimination_min_repondants: 30,
    discrimination_part_groupes: 0.27,
  });
  assert.ok(Array.isArray(res.body.effet_position));
  const four = res.body.effet_position.find((p) => p.nb_choix === 4);
  assert.ok(four && four.reponses >= 25, 'les réponses à ordre connu sont comptées');
  const attr = res.body.stats.find((s) => s.question_code === Q_ATTR);
  assert.ok(attr, 'question présente');
  assert.equal(attr.attempts, 32, 'le taux de réussite global compte aussi l’historique');
  assert.equal(attr.version.tentatives, 25);
  assert.deepEqual(attr.attracteurs, ['B']);
  assert.equal(attr.signaux.attracteur, true);
  assert.equal(attr.suspect, true);
  const neg = res.body.stats.find((s) => s.question_code === Q_NEG);
  assert.equal(neg.signaux.discrimination_negative, true);
  assert.equal(neg.suspect, true);
  // Agrégats seulement : aucun identifiant d'élève dans la réponse.
  const text = JSON.stringify(res.body);
  for (const u of users.slice(0, 20)) assert.ok(!text.includes(u));
});

test('anti-régression : le calcul ne fait pas une requête par élève', async () => {
  let calls = 0;
  const counting = {
    queryAll: (sql, params) => {
      calls += 1;
      return queryAll(sql, params);
    },
  };
  await stats.loadFmItemAnalysis(counting, [Q_ATTR, Q_POS, Q_NEG, Q_OTHER]);
  assert.ok(calls <= 5, `${calls} requêtes`);
  const row = await queryOne('SELECT COUNT(DISTINCT user_id) AS n FROM user_quiz_attempts');
  assert.ok(Number(row.n) > calls);
});
