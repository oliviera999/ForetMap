'use strict';

/**
 * Réponse choisie au quiz ForetMap (migration `quiz_attempt_choice`, lot B) :
 * `POST /api/quiz/questions/:code/answer` enregistre la lettre d'origine du choix retenu,
 * l'ordre présenté, la durée mesurée côté serveur, le contexte et l'empreinte de version —
 * tout lu dans le jeton de présentation, jamais dans le corps. La réponse HTTP ne change pas,
 * et un refus (409 rejeu, 403 verrou) n'écrit toujours rien.
 *
 * Gnomes & Licornes : sans les options facultatives (`extraClaims`, `includeClaims`), le
 * module commun produit exactement la même charge — vérifié ici sur les fonctions, et par les
 * routes dans `tests/quiz-gl-charge-inchangee.test.js`.
 */

require('./helpers/setup');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute, queryOne, queryAll } = require('../database');
const { setSetting } = require('../lib/settings');
const { applyMerge } = require('../lib/accountMerge');
const { computeQuestionFingerprint } = require('../lib/quizQuestionFingerprint');
const { presentQuestion, verifyPresentationAnswer } = require('../lib/qcmChoices');
const quizService = require('../lib/pedago/quizService');

const stamp = Date.now();
const short = String(stamp).slice(-7);
const CATEGORY = `qchoix${stamp}`.slice(0, 60);
const CODE = `QRC${short}`;
const CODE_GATED = `QRG${short}`;
const TEXTS = { A: 'Du sol', B: 'De l’air', C: 'De l’eau', D: 'Des engrais' };
const SESSION_ID = crypto.randomUUID();
const SESSION_SLUG = `seance-choix-${stamp}`;
let tutorialId = 0;
const students = [];

/** Présentation libre servie par l'API, par défaut sans compte. */
async function present(code, { query = '', student = null } = {}) {
  const req = request(app).get(`/api/quiz/questions/${code}/present${query}`);
  if (student) req.set('Authorization', `Bearer ${student.token}`);
  const res = await req;
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body;
}

async function answer(code, presentation, choiceId, { student, extra = {}, status = 200 } = {}) {
  const req = request(app)
    .post(`/api/quiz/questions/${code}/answer`)
    .send({ presentationToken: presentation.presentationToken, choiceId, ...extra });
  if (student) req.set('Authorization', `Bearer ${student.token}`);
  const res = await req;
  assert.equal(res.status, status, JSON.stringify(res.body));
  return res.body;
}

function claimsOf(token) {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
}

/** Lettre d'origine d'un texte de choix. */
function letterOf(text) {
  return Object.keys(TEXTS).find((l) => TEXTS[l] === text);
}

function choiceIdOf(presentation, letter) {
  return presentation.choices.findIndex((c) => c.text === TEXTS[letter]);
}

async function attempts(student, code = CODE) {
  return queryAll(
    `SELECT is_correct, choix_lettre, ordre_presente, duree_ms, contexte, question_empreinte
       FROM user_quiz_attempts WHERE user_id = ? AND question_code = ? ORDER BY id`,
    [student.id, code],
  );
}

async function lastAttempt(student, code = CODE) {
  const rows = await attempts(student, code);
  return rows[rows.length - 1];
}

async function registerStudent(suffix) {
  const reg = await request(app)
    .post('/api/auth/register')
    .send({
      firstName: 'Choix',
      lastName: `Quiz${suffix}${stamp}`,
      pseudo: `choixquiz${suffix}${stamp}`.slice(0, 40),
      password: 'testpass1234',
      affiliation: 'both',
    })
    .expect(201);
  const s = { token: reg.body.authToken, id: String(reg.body.id) };
  students.push(s);
  return s;
}

async function currentRow(code = CODE) {
  return queryOne('SELECT * FROM quiz_questions WHERE question_code = ?', [code]);
}

before(async () => {
  await initSchema();
  await execute(
    `INSERT INTO quiz_categories (slug, nom, theme, order_index) VALUES (?, ?, 'sciences', 993)`,
    [CATEGORY, `Choix ${stamp}`],
  );
  const insert = `INSERT INTO quiz_questions
      (question_code, categorie_slug, numero_dans_categorie, question,
       choix_a, choix_b, choix_c, choix_d, reponse_correcte, niveau, difficulte,
       feedback_correct, feedback_a, statut)
    VALUES (?, ?, ?, 'D’où vient l’essentiel de la matière d’une plante ?', ?, ?, ?, ?, 'B',
            'college', 1, 'Oui : du CO₂ de l’air.', 'Le sol apporte surtout eau et sels.', 'actif')`;
  await execute(insert, [CODE, CATEGORY, 1, TEXTS.A, TEXTS.B, TEXTS.C, TEXTS.D]);
  await execute(insert, [CODE_GATED, CATEGORY, 2, TEXTS.A, TEXTS.B, TEXTS.C, TEXTS.D]);
  const tut = await execute(
    "INSERT INTO tutorials (title, slug, type, is_active, created_at, updated_at) VALUES ('Choix', ?, 'html', 1, NOW(), NOW())",
    [`choix-tuto-${stamp}`.slice(0, 80)],
  );
  tutorialId = tut.insertId;
  await execute(
    `INSERT INTO resource_question_links
      (resource_type, resource_ref, question_code, is_gating, weight, origin, status)
     VALUES ('tutorial', ?, ?, 1, 1, 'manual', 'approved')`,
    [String(tutorialId), CODE_GATED],
  );
  await setSetting('learning.gating.enabled', true, {});
  await setSetting('learning.gating.default_mode', 'any', {});
  await setSetting('learning.gating.allowed_wrong_attempts', 0, {});
  await setSetting('learning.gating.retry_cooldown_hours', 6, {});
  await setSetting('learning.gating.lock_mode', 'strict', {});
  await setSetting('learning.gating.cooldown_scope', 'resource', {});
  await execute(
    `INSERT INTO pedago_sessions (id, slug, title, level, template_key, map_id, config_json, steps_json, is_published)
     VALUES (?, ?, 'Séance choix', 'college', 'custom', NULL, '{}', '[]', 1)`,
    [SESSION_ID, SESSION_SLUG],
  );
});

after(async () => {
  await setSetting('learning.gating.enabled', false, {}).catch(() => {});
  await setSetting('learning.gating.lock_mode', 'flow', {}).catch(() => {});
  for (const s of students) {
    await execute('DELETE FROM resource_gating_cooldowns WHERE user_id = ?', [s.id]).catch(
      () => {},
    );
    await execute('DELETE FROM user_quiz_attempts WHERE user_id = ?', [s.id]).catch(() => {});
    await execute('DELETE FROM pedago_session_runs WHERE user_id = ?', [s.id]).catch(() => {});
    await execute('DELETE FROM users WHERE id = ?', [s.id]).catch(() => {});
  }
  await execute('DELETE FROM pedago_sessions WHERE id = ?', [SESSION_ID]).catch(() => {});
  await execute('DELETE FROM resource_question_links WHERE question_code = ?', [CODE_GATED]).catch(
    () => {},
  );
  await execute('DELETE FROM quiz_questions WHERE categorie_slug = ?', [CATEGORY]).catch(() => {});
  await execute('DELETE FROM quiz_categories WHERE slug = ?', [CATEGORY]).catch(() => {});
  if (tutorialId) await execute('DELETE FROM tutorials WHERE id = ?', [tutorialId]).catch(() => {});
});

// ---------------------------------------------------------------------------------------
// Lettre d'origine et ordre présenté
// ---------------------------------------------------------------------------------------

test('bonne et mauvaise réponse : lettre d’origine, quel que soit le mélange (ordres forcés)', async (t) => {
  const student = await registerStudent('l');
  const orders = new Set();
  for (const r of [0, 0.3, 0.6, 0.99]) {
    const mock = t.mock.method(Math, 'random', () => r);
    let pres;
    try {
      pres = await present(CODE);
    } finally {
      mock.mock.restore();
    }
    const shown = pres.choices.map((c) => letterOf(c.text)).join('');
    orders.add(shown);
    // Ordre présenté = ordre affiché, en lettres d'origine, et identique au jeton.
    assert.equal(claimsOf(pres.presentationToken).choiceLetters.join(''), shown);

    const good = await answer(CODE, pres, choiceIdOf(pres, 'B'), { student });
    assert.equal(good.correct, true);
    let row = await lastAttempt(student);
    assert.equal(row.choix_lettre, 'B');
    assert.equal(Number(row.is_correct), 1);
    assert.equal(row.ordre_presente, shown);

    const pres2 = await present(CODE);
    const wrong = await answer(CODE, pres2, choiceIdOf(pres2, 'D'), { student });
    assert.equal(wrong.correct, false);
    row = await lastAttempt(student);
    assert.equal(row.choix_lettre, 'D');
    assert.equal(Number(row.is_correct), 0);
    assert.equal(row.ordre_presente, pres2.choices.map((c) => letterOf(c.text)).join(''));
  }
  assert.ok(orders.size >= 3, `ordres forcés trop peu variés : ${[...orders].join(', ')}`);
});

// ---------------------------------------------------------------------------------------
// Durée côté serveur
// ---------------------------------------------------------------------------------------

test('durée mesurée côté serveur ; les valeurs du corps sont ignorées', async (t) => {
  const student = await registerStudent('d');
  const pres = await present(CODE);
  const before = Date.now();
  const realNow = Date.now.bind(Date);
  // Dix minutes plus tard (le jeton reste valable 15 min).
  t.mock.method(Date, 'now', () => realNow() + 10 * 60 * 1000);
  await answer(CODE, pres, choiceIdOf(pres, 'A'), {
    student,
    extra: { duree: 1, duree_ms: 1, dureeMs: 1, contexte: 'seance', ordre_presente: 'ABCD' },
  });
  t.mock.restoreAll();
  const row = await lastAttempt(student);
  assert.ok(row.duree_ms >= 10 * 60 * 1000 - 50, `durée ${row.duree_ms}`);
  assert.ok(row.duree_ms <= 10 * 60 * 1000 + (Date.now() - before) + 50, `durée ${row.duree_ms}`);
  assert.equal(row.contexte, 'libre');
  assert.notEqual(row.ordre_presente, null);
  assert.equal(row.ordre_presente, claimsOf(pres.presentationToken).choiceLetters.join(''));
});

test('durée bornée à [0, 15 min], repli sur iat sans instant de présentation', () => {
  const now = 1_800_000_000_000;
  const { measuredDurationMs, MAX_ANSWER_DURATION_MS } = quizService;
  assert.equal(MAX_ANSWER_DURATION_MS, 900000);
  assert.equal(measuredDurationMs({ pat: now - 1234 }, now), 1234);
  assert.equal(measuredDurationMs({ pat: now - 20 * 60 * 1000 }, now), 900000);
  assert.equal(measuredDurationMs({ pat: now + 5000 }, now), 0);
  assert.equal(measuredDurationMs({ iat: Math.floor((now - 7000) / 1000) }, now), 7000);
  assert.equal(measuredDurationMs({}, now), null);
  assert.equal(measuredDurationMs({ pat: 'x', iat: null }, now), null);
});

// ---------------------------------------------------------------------------------------
// Contexte
// ---------------------------------------------------------------------------------------

test('contexte : libre, tirage, séance confirmée, validation ; étiquettes inconnues ignorées', async () => {
  const student = await registerStudent('c');
  const run = async (query, code = CODE, withAuth = false) => {
    const pres = await present(code, { query, student: withAuth ? student : null });
    await answer(code, pres, choiceIdOf(pres, 'B'), { student });
    return (await lastAttempt(student, code)).contexte;
  };
  assert.equal(await run(''), 'libre');
  assert.equal(await run('?origine=tirage'), 'tirage');
  // Étiquettes déclarées par le client : une valeur inconnue est ignorée, sans 400.
  assert.equal(await run('?origine=autre'), 'libre');
  assert.equal(await run(`?pedagoSession=${SESSION_SLUG}`), 'libre', 'séance non démarrée');
  assert.equal(await run('?pedagoSession=inconnue&origine=tirage'), 'tirage');

  await execute(
    `INSERT INTO pedago_session_runs (session_id, user_id, first_started_at, last_started_at, start_count)
     VALUES (?, ?, NOW(), NOW(), 1)`,
    [SESSION_ID, student.id],
  );
  assert.equal(await run(`?pedagoSession=${SESSION_SLUG}`), 'seance');
  assert.equal(await run(`?pedagoSession=${SESSION_ID}&origine=tirage`), 'seance');
  // Séance terminée depuis : plus retenue.
  await execute(
    'UPDATE pedago_session_runs SET last_completed_at = DATE_ADD(NOW(), INTERVAL 1 MINUTE) WHERE user_id = ?',
    [student.id],
  );
  assert.equal(await run(`?pedagoSession=${SESSION_SLUG}`), 'libre');

  const ctx = `?resourceType=tutorial&resourceRef=${tutorialId}&origine=tirage`;
  assert.equal(await run(ctx, CODE_GATED, true), 'validation');
});

// ---------------------------------------------------------------------------------------
// Empreinte de version
// ---------------------------------------------------------------------------------------

test('empreinte : celle de la question ; inchangée par un feedback, changée par un choix', async () => {
  const student = await registerStudent('e');
  const one = async () => {
    const pres = await present(CODE);
    await answer(CODE, pres, choiceIdOf(pres, 'B'), { student });
    return (await lastAttempt(student)).question_empreinte;
  };
  const v1 = await one();
  assert.equal(v1, computeQuestionFingerprint(await currentRow()));

  await execute('UPDATE quiz_questions SET feedback_a = ? WHERE question_code = ?', [
    'Autre retour.',
    CODE,
  ]);
  assert.equal(await one(), v1, 'un feedback ne change pas la version');

  await execute('UPDATE quiz_questions SET choix_c = ? WHERE question_code = ?', [
    'De la pluie',
    CODE,
  ]);
  TEXTS.C = 'De la pluie';
  try {
    const v2 = await one();
    assert.notEqual(v2, v1, 'un choix modifié change la version');
    assert.equal(v2, computeQuestionFingerprint(await currentRow()));

    // Question modifiée ENTRE la présentation et la réponse : version inconnue (NULL), mais
    // la lettre d'origine reste enregistrée.
    const pres = await present(CODE);
    await execute('UPDATE quiz_questions SET choix_d = ? WHERE question_code = ?', [
      'Du terreau',
      CODE,
    ]);
    await answer(CODE, pres, choiceIdOf(pres, 'B'), { student });
    const row = await lastAttempt(student);
    assert.equal(row.question_empreinte, null);
    assert.equal(row.choix_lettre, 'B');
  } finally {
    await execute(
      'UPDATE quiz_questions SET choix_c = ?, choix_d = ?, feedback_a = ? WHERE question_code = ?',
      ['De l’eau', 'Des engrais', 'Le sol apporte surtout eau et sels.', CODE],
    );
    TEXTS.C = 'De l’eau';
  }
});

test('le jeton ne porte pas l’empreinte en clair (elle donnerait la bonne réponse)', async () => {
  const pres = await present(CODE);
  const claims = claimsOf(pres.presentationToken);
  const row = await currentRow();
  for (const letter of ['A', 'B', 'C', 'D', 'E']) {
    const candidate = computeQuestionFingerprint({ ...row, reponse_correcte: letter });
    assert.ok(!pres.presentationToken.includes(candidate));
    assert.ok(!JSON.stringify(claims).includes(candidate));
  }
  assert.match(claims.qfp, /^[0-9a-f]{24}$/);
  assert.equal(typeof claims.pat, 'number');
});

// ---------------------------------------------------------------------------------------
// Refus : rien n'est écrit
// ---------------------------------------------------------------------------------------

test('rejeu (409) : aucune tentative écrite', async () => {
  const student = await registerStudent('r');
  const pres = await present(CODE);
  await answer(CODE, pres, choiceIdOf(pres, 'A'), { student });
  const count = (await attempts(student)).length;
  await answer(CODE, pres, choiceIdOf(pres, 'B'), { student, status: 409 });
  assert.equal((await attempts(student)).length, count);
});

test('verrou (403) posé entre la présentation et la réponse : aucune tentative écrite', async () => {
  const student = await registerStudent('v');
  const ctx = `?resourceType=tutorial&resourceRef=${tutorialId}`;
  const first = await present(CODE_GATED, { query: ctx, student });
  const second = await present(CODE_GATED, { query: ctx, student });
  const res = await answer(CODE_GATED, first, choiceIdOf(first, 'A'), { student });
  assert.equal(res.correct, false);
  assert.ok(res.cooldown, 'verrou posé');
  const count = (await attempts(student, CODE_GATED)).length;
  assert.equal(count, 1);
  assert.equal((await lastAttempt(student, CODE_GATED)).contexte, 'validation');
  await answer(CODE_GATED, second, choiceIdOf(second, 'B'), { student, status: 403 });
  assert.equal((await attempts(student, CODE_GATED)).length, count);
});

// ---------------------------------------------------------------------------------------
// Réponse HTTP inchangée, anonyme sans écriture
// ---------------------------------------------------------------------------------------

test('réponse HTTP inchangée : mêmes clés, aucune revendication renvoyée', async () => {
  const student = await registerStudent('h');
  const pres = await present(CODE);
  assert.deepEqual(Object.keys(pres).sort(), [
    'choices',
    'glossaryTerms',
    'photoCredit',
    'photoLicence',
    'photoUrl',
    'presentationToken',
    'question',
    'questionCode',
    'resource',
    'wikipediaUrl',
  ]);
  const good = await answer(CODE, pres, choiceIdOf(pres, 'B'), { student });
  assert.deepEqual(Object.keys(good).sort(), [
    'correct',
    'correctChoiceId',
    'feedback',
    'glossaryTerms',
  ]);
  const pres2 = await present(CODE);
  const wrong = await answer(CODE, pres2, choiceIdOf(pres2, 'A'), { student });
  assert.deepEqual(Object.keys(wrong).sort(), ['correct', 'feedback']);
  assert.equal(wrong.feedback, 'Le sol apporte surtout eau et sels.');
});

test('anonyme : réponse corrigée, rien n’est écrit', async () => {
  const before = await queryOne(
    'SELECT COUNT(*) AS n FROM user_quiz_attempts WHERE question_code = ?',
    [CODE],
  );
  const pres = await present(CODE);
  const res = await answer(CODE, pres, choiceIdOf(pres, 'B'));
  assert.equal(res.correct, true);
  const after = await queryOne(
    'SELECT COUNT(*) AS n FROM user_quiz_attempts WHERE question_code = ?',
    [CODE],
  );
  assert.equal(Number(after.n), Number(before.n));
});

// ---------------------------------------------------------------------------------------
// Fusion de comptes : les colonnes suivent la ligne
// ---------------------------------------------------------------------------------------

test('fusion de comptes : les tentatives gardent lettre, ordre, durée, contexte, empreinte', async () => {
  const from = await registerStudent('mf');
  const into = await registerStudent('mi');
  const pres = await present(CODE, { query: '?origine=tirage' });
  await answer(CODE, pres, choiceIdOf(pres, 'C'), { student: from });
  const original = await lastAttempt(from);
  assert.equal(original.choix_lettre, 'C');
  const result = await applyMerge({ fromUserId: from.id, intoUserId: into.id });
  assert.ok(result.ok !== false, JSON.stringify(result));
  const moved = await lastAttempt(into);
  assert.deepEqual(moved, original);
});

// ---------------------------------------------------------------------------------------
// Gnomes & Licornes : module commun inchangé sans les options ForetMap
// ---------------------------------------------------------------------------------------

test('G&L : sans option, jeton et vérification ont exactement la forme d’avant', () => {
  const row = {
    question_code: 'GLX1',
    question: 'Qui mange le puceron ?',
    choix_a: 'La coccinelle',
    choix_b: 'Le merle',
    choix_c: 'Le ver de terre',
    reponse_correcte: 'A',
  };
  const pres = presentQuestion(row, [], { jwtKind: 'gl_qcm_present' });
  const claims = claimsOf(pres.presentationToken);
  assert.deepEqual(Object.keys(claims).sort(), [
    'answerHash',
    'choiceLetters',
    'exp',
    'iat',
    'jti',
    'kind',
    'nonce',
    'questionCode',
  ]);
  const result = verifyPresentationAnswer(pres.presentationToken, 'GLX1', 0, {
    jwtKind: 'gl_qcm_present',
  });
  assert.deepEqual(Object.keys(result).sort(), [
    'correct',
    'correctChoiceId',
    'game',
    'jti',
    'resource',
    'selectedChoiceId',
    'selectedLetter',
  ]);
  assert.equal(result.claims, undefined);
});

test('options ForetMap : revendications ajoutées sans écraser les communes', () => {
  const row = {
    question_code: 'FMX1',
    question: 'Q ?',
    choix_a: 'Un',
    choix_b: 'Deux',
    reponse_correcte: 'B',
  };
  const pres = presentQuestion(row, [], {
    jwtKind: 'fm_quiz_present',
    extraClaims: ({ jti }) => ({ qfp: `x${jti}`, kind: 'pirate', jti: 'pirate', nope: undefined }),
  });
  const claims = claimsOf(pres.presentationToken);
  assert.equal(claims.kind, 'fm_quiz_present');
  assert.notEqual(claims.jti, 'pirate');
  assert.equal(claims.qfp, `x${claims.jti}`);
  assert.equal('nope' in claims, false);
  const goodId = pres.choices.findIndex((c) => c.text === 'Deux');
  const result = verifyPresentationAnswer(pres.presentationToken, 'FMX1', goodId, {
    jwtKind: 'fm_quiz_present',
    includeClaims: true,
  });
  assert.equal(result.correct, true);
  assert.equal(result.claims.qfp, claims.qfp);
});
