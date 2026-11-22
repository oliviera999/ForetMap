'use strict';

// Chantier collège (novembre 2026), flux C6 — quiz par palier.
//
// 1. Palier d'entrée d'une question de collège déduit de ses notions effectives (catégorie +
//    ajouts − exclusions) : une notion de cycle 3 → palier 1, sinon palier 2. Même règle en
//    JS (`quizQuestionEntryPalier`) et en SQL (`quizQuestionEntryPalierSql`).
// 2. Verrouillage : un collégien n'est jamais interrogé au-delà du cycle 4 ; une fiche
//    gardée seulement par du lycée n'est pas verrouillée pour lui.
// 3. Tirage et compteurs du quiz bornés par `palierMax` (affichage collège).

require('./helpers/setup');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const db = require('../database');
const { initSchema, execute, queryAll } = db;
const { app } = require('../server');
const { setSetting } = require('../lib/settings');
const scales = require('../lib/pedagoScales');
const {
  quizQuestionEntryPalierSql,
  buildQuizEntryPalierFilter,
  describeQuestionNotions,
} = require('../lib/curriculumNotions');
const { filterGatingLinksByLevel, linkEntryPalier } = require('../lib/pedago/eligibility');
const { getChallengeState } = require('../lib/learningGatingAcknowledge');

const { quizQuestionEntryPalier, quizEntryPalierCap, collegeQuizPalierMax, COLLEGE_MAX_PALIER } =
  scales;

// ---------------------------------------------------------------------------------------
// Fonctions pures
// ---------------------------------------------------------------------------------------

test('quizQuestionEntryPalier — collège : cycle 3 si une notion de cycle 3, sinon cycle 4', () => {
  assert.equal(quizQuestionEntryPalier({ niveau: 'college', notionNiveaux: ['cycle3'] }), 1);
  assert.equal(
    quizQuestionEntryPalier({ niveau: 'college', notionNiveaux: ['cycle4', 'cycle3'] }),
    1,
  );
  assert.equal(quizQuestionEntryPalier({ niveau: 'college', notionNiveaux: ['cycle4'] }), 2);
  // Révision d'une notion de lycée par une question de collège : cycle 4.
  assert.equal(quizQuestionEntryPalier({ niveau: 'college', notionNiveaux: ['seconde'] }), 2);
  assert.equal(quizQuestionEntryPalier({ niveau: 'college', notionNiveaux: [] }), 2);
  // Notions inconnues : palier historique du niveau.
  assert.equal(quizQuestionEntryPalier({ niveau: 'college' }), 1);
  assert.equal(quizQuestionEntryPalier({ niveau: 'Collège', notionNiveaux: null }), 1);
});

test('quizQuestionEntryPalier — lycée et niveau inconnu : les notions ne changent rien', () => {
  assert.equal(quizQuestionEntryPalier({ niveau: 'lycee', notionNiveaux: ['cycle3'] }), 3);
  assert.equal(quizQuestionEntryPalier({ niveau: 'lycee' }), 3);
  assert.equal(quizQuestionEntryPalier({ niveau: 'x', notionNiveaux: ['cycle3'] }), null);
  assert.equal(quizQuestionEntryPalier(), null);
});

test('quizEntryPalierCap — le plus bas du niveau et de la règle de palier', () => {
  assert.equal(quizEntryPalierCap({ maxPalier: 2, ruleCap: 1 }), 1);
  assert.equal(quizEntryPalierCap({ maxPalier: 1, ruleCap: 2 }), 1);
  assert.equal(quizEntryPalierCap({ maxPalier: 3, ruleCap: null }), 3);
  assert.equal(quizEntryPalierCap({ maxPalier: null, ruleCap: 2 }), 2);
  assert.equal(quizEntryPalierCap({ maxPalier: null, ruleCap: null }), null);
  assert.equal(quizEntryPalierCap({ maxPalier: 'x', ruleCap: 0 }), null);
  assert.equal(quizEntryPalierCap(), null);
});

test('collegeQuizPalierMax — borné au cycle 4 au collège, rien ailleurs', () => {
  assert.equal(collegeQuizPalierMax({ etape: 'college', maxPalier: 1 }), 1);
  assert.equal(collegeQuizPalierMax({ etape: 'college', maxPalier: 2 }), 2);
  assert.equal(collegeQuizPalierMax({ etape: 'college', maxPalier: 3 }), COLLEGE_MAX_PALIER);
  assert.equal(collegeQuizPalierMax({ etape: 'college', maxPalier: null }), COLLEGE_MAX_PALIER);
  assert.equal(collegeQuizPalierMax({ etape: 'college', maxPalier: 2, ruleCap: 1 }), 1);
  assert.equal(collegeQuizPalierMax({ etape: 'lycee', maxPalier: 3 }), null);
  assert.equal(collegeQuizPalierMax({ etape: 'universite', maxPalier: null }), null);
  assert.equal(collegeQuizPalierMax({}), null);
});

test('miroir ESM : mêmes résultats pour les fonctions du chantier collège', async () => {
  const ui = await import('../src/utils/pedagoScales.js');
  assert.equal(ui.COLLEGE_MAX_PALIER, COLLEGE_MAX_PALIER);
  const samples = [
    ['quizQuestionEntryPalier', [{ niveau: 'college', notionNiveaux: ['cycle4'] }]],
    ['quizQuestionEntryPalier', [{ niveau: 'college', notionNiveaux: ['cycle3'] }]],
    ['quizQuestionEntryPalier', [{ niveau: 'lycee' }]],
    ['quizEntryPalierCap', [{ maxPalier: 2, ruleCap: 1 }]],
    ['collegeQuizPalierMax', [{ etape: 'college', maxPalier: 5 }]],
    ['collegeQuizPalierMax', [{ etape: 'lycee', maxPalier: 3 }]],
  ];
  for (const [name, args] of samples) {
    assert.deepEqual(ui[name](...args), scales[name](...args), `résultat divergent : ${name}`);
  }
});

// ---------------------------------------------------------------------------------------
// Éligibilité du verrouillage : 6e, 3e, 2de
// ---------------------------------------------------------------------------------------

const SIXIEME = { niveau: 'cycle3', contentEtape: 'college', etape: 'college', maxPalier: 1 };
const TROISIEME = { niveau: 'cycle4', contentEtape: 'college', etape: 'college', maxPalier: 2 };
const SECONDE = { niveau: 'seconde', contentEtape: 'lycee', etape: 'lycee', maxPalier: 3 };

const C3 = { question_code: 'QC3', question_niveau: 'college', question_entry_palier: 1 };
const C4 = { question_code: 'QC4', question_niveau: 'college', question_entry_palier: 2 };
const LY = { question_code: 'QLY', question_niveau: 'lycee', question_entry_palier: 3 };

const codes = (out) => out.links.map((l) => l.question_code);

test('linkEntryPalier — palier effectif s’il est connu, sinon celui du niveau', () => {
  assert.equal(linkEntryPalier(C4), 2);
  assert.equal(linkEntryPalier({ question_niveau: 'college' }), 1);
  assert.equal(linkEntryPalier({ question_niveau: 'college', question_entry_palier: '2' }), 2);
  assert.equal(linkEntryPalier({}), null);
});

test('6e : seules les questions de cycle 3', () => {
  const out = filterGatingLinksByLevel([C3, C4, LY], SIXIEME);
  assert.deepEqual(codes(out), ['QC3']);
  assert.equal(out.levelFallback, 'none');
  assert.equal(out.outOfLevel, 2);
});

test('6e, fiche sans question de cycle 3 : repli sur le cycle 4, jamais sur le lycée', () => {
  const out = filterGatingLinksByLevel([C4, LY], SIXIEME);
  assert.deepEqual(codes(out), ['QC4']);
  assert.equal(out.levelFallback, 'college_levels');
  assert.equal(out.outOfLevel, 1);
});

test('6e et 3e, fiche gardée seulement par du lycée : non verrouillée', () => {
  for (const learner of [SIXIEME, TROISIEME]) {
    const out = filterGatingLinksByLevel([LY], learner);
    assert.deepEqual(out.links, []);
    assert.equal(out.levelFallback, 'unlocked');
    assert.equal(out.outOfLevel, 1);
  }
});

test('3e : cycles 3 et 4, pas le lycée', () => {
  const out = filterGatingLinksByLevel([C3, C4, LY], TROISIEME);
  assert.deepEqual(codes(out), ['QC3', 'QC4']);
  assert.equal(out.levelFallback, 'none');
});

test('2de : toutes les questions ; repli « toutes » conservé hors collège', () => {
  const out = filterGatingLinksByLevel([C3, C4, LY], SECONDE);
  assert.deepEqual(codes(out), ['QC3', 'QC4', 'QLY']);
  assert.equal(out.levelFallback, 'none');
  // Élève sans étape de contenu connue (ancien appelant) : repli historique (décision Q1).
  const legacy = filterGatingLinksByLevel([LY], { maxPalier: 2 });
  assert.deepEqual(codes(legacy), ['QLY']);
  assert.equal(legacy.levelFallback, 'all_levels');
});

// ---------------------------------------------------------------------------------------
// Base : SQL ↔ JS, tirage, compteurs, verrouillage
// ---------------------------------------------------------------------------------------

const stamp = String(Date.now()).slice(-7);
const catA = `c6a${stamp}`;
const catB = `c6b${stamp}`;
const Q = {
  a1: `C6A1${stamp}`, // collège, catégorie cycle 3 + cycle 4 → 1
  a2: `C6A2${stamp}`, // collège, notion de cycle 3 exclue → 2
  a3: `C6A3${stamp}`, // lycée → 3
  b1: `C6B1${stamp}`, // collège, catégorie cycle 4 seule → 2
  b2: `C6B2${stamp}`, // collège, ajout d'une notion de cycle 3 → 1
};
const EXPECTED = { a1: 1, a2: 2, a3: 3, b1: 2, b2: 1 };
const studentId = `c6-student-${stamp}`;
let notionC3 = null;
let notionC4 = null;
let plantId = null;

before(async () => {
  await initSchema();
  const notions = await queryAll(
    "SELECT niveau, MIN(id) AS id FROM curriculum_notions WHERE niveau IN ('cycle3', 'cycle4') GROUP BY niveau",
  );
  notionC3 = notions.find((n) => n.niveau === 'cycle3').id;
  notionC4 = notions.find((n) => n.niveau === 'cycle4').id;
  for (const slug of [catA, catB]) {
    await execute(
      "INSERT IGNORE INTO quiz_categories (slug, nom, theme, order_index) VALUES (?, 'C6', 'sciences', 999)",
      [slug],
    );
  }
  await execute(
    'INSERT IGNORE INTO quiz_category_notions (categorie_slug, notion_id) VALUES (?, ?)',
    [catA, notionC3],
  );
  for (const slug of [catA, catB]) {
    await execute(
      'INSERT IGNORE INTO quiz_category_notions (categorie_slug, notion_id) VALUES (?, ?)',
      [slug, notionC4],
    );
  }
  const rows = [
    [Q.a1, catA, 1, 'college'],
    [Q.a2, catA, 2, 'college'],
    [Q.a3, catA, 3, 'lycee'],
    [Q.b1, catB, 1, 'college'],
    [Q.b2, catB, 2, 'college'],
  ];
  for (const [code, slug, n, niveau] of rows) {
    await execute(
      `INSERT IGNORE INTO quiz_questions
        (question_code, categorie_slug, numero_dans_categorie, question, choix_a, choix_b, choix_c, reponse_correcte, niveau)
       VALUES (?, ?, ?, 'Q ?', 'A', 'B', 'C', 'A', ?)`,
      [code, slug, n, niveau],
    );
  }
  await execute(
    "INSERT IGNORE INTO quiz_question_notions (question_code, notion_id, mode) VALUES (?, ?, 'exclusion')",
    [Q.a2, notionC3],
  );
  await execute(
    "INSERT IGNORE INTO quiz_question_notions (question_code, notion_id, mode) VALUES (?, ?, 'ajout')",
    [Q.b2, notionC3],
  );
  plantId = (await execute("INSERT INTO plants (name, emoji) VALUES (?, '🌿')", [`C6 ${stamp}`]))
    .insertId;
  for (const code of [Q.a2, Q.a3]) {
    await execute(
      `INSERT IGNORE INTO resource_question_links
        (resource_type, resource_ref, question_code, is_gating, weight, origin, status)
       VALUES ('plant', ?, ?, 1, 1, 'manual', 'approved')`,
      [String(plantId), code],
    );
  }
  await execute(
    `INSERT IGNORE INTO users (id, user_type, pseudo, display_name, is_active, created_at, updated_at)
     VALUES (?, 'student', ?, 'C6', 1, NOW(), NOW())`,
    [studentId, `c6${stamp}`],
  );
  await setSetting('learning.gating.enabled', true, {});
});

after(async () => {
  await setSetting('learning.gating.enabled', false, {}).catch(() => {});
  const codesList = Object.values(Q);
  const marks = codesList.map(() => '?').join(', ');
  await execute(`DELETE FROM resource_question_links WHERE question_code IN (${marks})`, codesList);
  await execute(`DELETE FROM quiz_question_notions WHERE question_code IN (${marks})`, codesList);
  await execute(`DELETE FROM quiz_questions WHERE question_code IN (${marks})`, codesList);
  await execute('DELETE FROM quiz_category_notions WHERE categorie_slug IN (?, ?)', [catA, catB]);
  await execute('DELETE FROM quiz_categories WHERE slug IN (?, ?)', [catA, catB]);
  await execute('DELETE FROM plants WHERE id = ?', [plantId]).catch(() => {});
  await execute('DELETE FROM users WHERE id = ?', [studentId]).catch(() => {});
});

test('SQL et JS donnent le même palier d’entrée effectif', async () => {
  const codesList = Object.values(Q);
  const rows = await queryAll(
    `SELECT q.question_code, ${quizQuestionEntryPalierSql('q')} AS palier
       FROM quiz_questions q
      WHERE q.question_code IN (${codesList.map(() => '?').join(', ')})`,
    codesList,
  );
  const byCode = new Map(rows.map((r) => [r.question_code, Number(r.palier)]));
  for (const [key, code] of Object.entries(Q)) {
    assert.equal(byCode.get(code), EXPECTED[key], `SQL ${key}`);
    const described = await describeQuestionNotions(db, code);
    assert.equal(described.entry_palier, EXPECTED[key], `JS ${key}`);
  }
});

test('buildQuizEntryPalierFilter — paramétré, absent sans plafond', () => {
  assert.equal(buildQuizEntryPalierFilter({ palierMax: null }), null);
  assert.equal(buildQuizEntryPalierFilter({ palierMax: 0 }), null);
  const f = buildQuizEntryPalierFilter({ palierMax: 2, alias: 'q' });
  assert.deepEqual(f.params, [2]);
  assert.match(f.sql, /<= \?/);
});

test('GET /api/quiz/categories?palierMax= : compteurs au palier de l’élève', async () => {
  const count = async (palierMax) => {
    const res = await request(app).get(`/api/quiz/categories?palierMax=${palierMax}`).expect(200);
    const by = new Map(res.body.categories.map((c) => [c.slug, c.questionCount]));
    return [by.get(catA), by.get(catB)];
  };
  assert.deepEqual(await count(1), [1, 1]);
  assert.deepEqual(await count(2), [2, 2]);
  assert.deepEqual(await count(3), [3, 2]);
  const res = await request(app).get('/api/quiz/categories').expect(200);
  const cat = res.body.categories.find((c) => c.slug === catA);
  assert.equal(cat.questionCount, undefined, 'sans niveau ni palier : pas de compteur');
  assert.ok(Object.hasOwn(cat, 'description_college'));
});

test('GET /api/quiz/draw?palierMax= : jamais au-dessus du palier demandé', async () => {
  for (let i = 0; i < 6; i += 1) {
    const a = await request(app)
      .get(`/api/quiz/draw?categorieSlug=${catA}&palierMax=1`)
      .expect(200);
    assert.equal(a.body.question_code, Q.a1);
    const b = await request(app)
      .get(`/api/quiz/draw?categorieSlug=${catB}&palierMax=1`)
      .expect(200);
    assert.equal(b.body.question_code, Q.b2);
    const c = await request(app)
      .get(`/api/quiz/draw?categorieSlug=${catA}&palierMax=2`)
      .expect(200);
    assert.ok([Q.a1, Q.a2].includes(c.body.question_code));
  }
  for (const bad of ['0', '6', 'x', '1.5']) {
    const res = await request(app).get(`/api/quiz/draw?palierMax=${bad}`).expect(400);
    assert.equal(res.body.error, 'palierMax invalide');
  }
});

test('verrouillage en base : 6e → cycle 4 en repli ; 3e → idem ; 2de → tout', async () => {
  const state = (learnerLevel) =>
    getChallengeState(db, {
      product: 'fm',
      resourceType: 'plant',
      resourceRef: String(plantId),
      userId: studentId,
      learnerLevel,
    });
  const six = await state(SIXIEME);
  assert.equal(six.ok, true);
  assert.deepEqual(
    six.questions.map((q) => q.question_code),
    [Q.a2],
  );
  assert.equal(six.level_fallback, 'college_levels');
  const trois = await state(TROISIEME);
  assert.deepEqual(
    trois.questions.map((q) => q.question_code),
    [Q.a2],
  );
  assert.equal(trois.level_fallback, 'none');
  const seconde = await state(SECONDE);
  assert.deepEqual(seconde.questions.map((q) => q.question_code).sort(), [Q.a2, Q.a3].sort());
});
