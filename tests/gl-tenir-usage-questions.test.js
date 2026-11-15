'use strict';

/**
 * « Tenir à deux », questions de case qui stimulent (14 novembre 2026) : la taxonomie générée
 * (« À quelle famille appartient… », « nom scientifique ») sort du tirage d'une partie
 * (`gl_qcm_questions.usage_tenir = 0`, migration 345), sans être désactivée ailleurs. Les
 * questions vives (`VQCM…`, `data/gl/tenir/questions-vives.json`) entrent dans le tirage, et
 * leurs choix sont mélangés à la présentation. Fixtures anonymes.
 */

require('./helpers/setup');
const fs = require('node:fs');
const path = require('node:path');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const db = require('../database');
const { createTenirGame, ensureQuestion, BIOMES } = require('./helpers/glTenirFixtures');
const { queryQuestionPool, buildPoolQueryFilters } = require('../lib/glMarkerQuestionPool');
const { normalizeQuestionPool } = require('../lib/glMarkerEventConfig');
const { presentChasseQuestion } = require('../lib/glChasse');
const { importQuestionsVives } = require('../lib/glTenirImport');
const { presentQuestion } = require('../lib/qcmChoices');
const { findForbiddenString } = require('../lib/shared/glGardeFousCore');

const ROOT = path.join(__dirname, '..');
const CAT = 'tenir-usage-essai';
const CODE_VIVE = 'TUS-VIVE-01';
const TAXONOMIE = [
  {
    code: 'TUS-FAM-01',
    question: 'À quelle famille appartient « Animal d’essai » (Animalus exemplum) ?',
  },
  { code: 'TUS-FAM-02', question: 'À quelle famille appartient « Plante d’essai » ?' },
  { code: 'TUS-NOM-01', question: 'Quel est le nom scientifique de « Animal d’essai » ?' },
  { code: 'TUS-NOM-02', question: 'Retrouve le nom scientifique de cette plante.' },
];
const TOUS = [CODE_VIVE, ...TAXONOMIE.map((q) => q.code)];
const POOL = { biomeMode: 'chapter', biomeSlugs: [], categorieSlugs: [CAT], niveaux: [] };

let ctx;
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const api = (p) => `/api/gl/games/${ctx.game.id}${p}`;

/** L'UPDATE de la migration 345, rejoué tel quel (même découpage que le runner). */
async function rejouerRegleMigration345() {
  const sql = fs.readFileSync(path.join(ROOT, 'migrations', '345_gl_qcm_usage_tenir.sql'), 'utf8');
  const updates = db.splitSqlStatements(sql).filter((s) => /^\s*UPDATE\s/i.test(s));
  assert.equal(updates.length, 1);
  await db.pool.query(updates[0]);
}

before(async () => {
  await db.initSchema();
  ctx = await createTenirGame({ stamp: Date.now() });
  await db.execute(
    `INSERT INTO gl_qcm_categories (slug, nom, order_index, created_at, updated_at)
     VALUES (?, ?, 0, NOW(), NOW()) ON DUPLICATE KEY UPDATE nom = VALUES(nom), updated_at = NOW()`,
    [CAT, 'Essai usage'],
  );
  await ensureQuestion(CODE_VIVE, BIOMES[1][0], CAT);
  for (const q of TAXONOMIE) {
    await ensureQuestion(q.code, BIOMES[1][0], CAT);
    await db.execute('UPDATE gl_qcm_questions SET question = ? WHERE question_code = ?', [
      q.question,
      q.code,
    ]);
  }
  await db.execute(
    `UPDATE gl_qcm_questions SET statut = 'actif', usage_tenir = 1, question = IF(question_code = ?, ?, question)
      WHERE question_code IN (${TOUS.map(() => '?').join(', ')})`,
    [CODE_VIVE, 'Pourquoi le toucan a-t-il un si grand bec ?', ...TOUS],
  );
  await rejouerRegleMigration345();
});

after(async () => {
  await db.execute(
    "DELETE FROM gl_chapter_markers WHERE chapter_id = ? AND label LIKE 'Essai usage %'",
    [ctx.chapter.id],
  );
  await db.execute("DELETE FROM gl_qcm_questions WHERE question_code LIKE 'VQCM9%'");
});

test('migration 345 : la taxonomie passe usage_tenir = 0, reste active ; le reste ne bouge pas', async () => {
  const rows = await db.queryAll(
    `SELECT question_code, usage_tenir, statut FROM gl_qcm_questions
      WHERE question_code IN (${TOUS.map(() => '?').join(', ')})`,
    TOUS,
  );
  const byCode = new Map(rows.map((r) => [r.question_code, r]));
  assert.equal(Number(byCode.get(CODE_VIVE).usage_tenir), 1);
  for (const q of TAXONOMIE) {
    assert.equal(Number(byCode.get(q.code).usage_tenir), 0, q.code);
    assert.equal(byCode.get(q.code).statut, 'actif', 'rien n’est désactivé');
  }
});

test('buildPoolQueryFilters : usage_tenir = 1 seulement en mode tenir', () => {
  const pool = normalizeQuestionPool(POOL);
  assert.doesNotMatch(buildPoolQueryFilters(pool, ['jungle_afc']).sql, /usage_tenir/);
  assert.match(
    buildPoolQueryFilters(pool, ['jungle_afc'], { usageTenir: true }).sql,
    /usage_tenir = 1/,
  );
});

test('pool de case : hors tenir tout sort ; en tenir, aucun énoncé de taxonomie', async () => {
  const classic = await queryQuestionPool(db, { pool: POOL, chapterBiomeSlugs: BIOMES[1] });
  assert.equal(classic.items.length, TOUS.length, 'tirage classique inchangé');
  const tenir = await queryQuestionPool(db, {
    pool: POOL,
    chapterBiomeSlugs: BIOMES[1],
    tenir: true,
  });
  assert.deepEqual(
    tenir.items.map((i) => i.question_code),
    [CODE_VIVE],
  );
  for (const item of tenir.items) {
    assert.doesNotMatch(item.question, /^À quelle famille appartient|nom scientifique/i);
  }
});

test('POST /markers/:id/present-question : dix tirages en tenir, jamais de taxonomie', async () => {
  const cfg = JSON.stringify({
    version: 2,
    question: { mode: 'random', fixedQuestionCode: null, pool: POOL },
  });
  const last = await db.queryOne(
    'SELECT MAX(order_index) AS m FROM gl_chapter_markers WHERE chapter_id = ?',
    [ctx.chapter.id],
  );
  await db.execute(
    `INSERT INTO gl_chapter_markers (chapter_id, x_pct, y_pct, event_type, label, description, event_config_json, order_index, created_at)
     VALUES (?, 91, 91, 'quiz', 'Essai usage A', 'Essai usage A', ?, ?, NOW())`,
    [ctx.chapter.id, cfg, Number(last?.m || 0) + 2000],
  );
  const marker = await db.queryOne(
    "SELECT id FROM gl_chapter_markers WHERE chapter_id = ? AND label = 'Essai usage A' ORDER BY id DESC LIMIT 1",
    [ctx.chapter.id],
  );
  const team = ctx.teams[0];
  await db.execute('UPDATE gl_teams SET position_marker_id = ? WHERE id = ?', [marker.id, team.id]);
  for (let i = 0; i < 10; i += 1) {
    const res = await request(app)
      .post(api(`/markers/${marker.id}/present-question`))
      .set(auth(ctx.adminToken))
      .send({ teamId: team.id });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.questionCode, CODE_VIVE);
  }
});

test('fouille de secours : la question tirée est « posée en partie », même thème épuisé', async () => {
  const zone = { id: 990101, zoneKey: 'cz-tus-01', questionCode: null, themeSecours: CAT };
  for (let i = 0; i < 2; i += 1) {
    const q = await presentChasseQuestion(db, {
      gameId: ctx.game.id,
      teamId: ctx.teams[0].id,
      zone,
      chapterId: ctx.chapter.id,
    });
    assert.equal(q.questionCode, CODE_VIVE);
  }
  await db.execute('DELETE FROM gl_game_chasse_questions_vues WHERE game_id = ? AND zone_id = ?', [
    ctx.game.id,
    zone.id,
  ]);
});

test('admin : case « Posée en partie » (PUT) et filtre usageTenir (GET)', async () => {
  const detail = await request(app)
    .get(`/api/gl/admin/qcm/questions/${CODE_VIVE}`)
    .set(auth(ctx.adminToken));
  assert.equal(detail.status, 200, JSON.stringify(detail.body));
  assert.equal(Number(detail.body.question.usage_tenir), 1);

  const off = await request(app)
    .put(`/api/gl/admin/qcm/questions/${CODE_VIVE}`)
    .set(auth(ctx.adminToken))
    .send({ ...detail.body.question, usage_tenir: false });
  assert.equal(off.status, 200, JSON.stringify(off.body));
  assert.equal(Number(off.body.question.usage_tenir), 0);

  const non = await request(app)
    .get(`/api/gl/admin/qcm/questions?categorieSlug=${CAT}&usageTenir=0&statut=actif`)
    .set(auth(ctx.adminToken));
  assert.equal(non.status, 200);
  assert.equal(non.body.items.length, TOUS.length);
  assert.ok(non.body.items.every((i) => i.usage_tenir === false));
  const oui = await request(app)
    .get(`/api/gl/admin/qcm/questions?categorieSlug=${CAT}&usageTenir=1&statut=actif`)
    .set(auth(ctx.adminToken));
  assert.equal(oui.body.items.length, 0);

  // Un enregistrement qui ne précise rien garde la valeur (pas de retour silencieux à 1).
  const { usage_tenir: _omit, ...sansUsage } = detail.body.question;
  const garde = await request(app)
    .put(`/api/gl/admin/qcm/questions/${CODE_VIVE}`)
    .set(auth(ctx.adminToken))
    .send(sansUsage);
  assert.equal(garde.status, 200, JSON.stringify(garde.body));
  assert.equal(Number(garde.body.question.usage_tenir), 0);

  const on = await request(app)
    .put(`/api/gl/admin/qcm/questions/${CODE_VIVE}`)
    .set(auth(ctx.adminToken))
    .send({ ...detail.body.question, usage_tenir: true });
  assert.equal(Number(on.body.question.usage_tenir), 1);
});

const viveJson = (extra = {}) => ({
  format: 'gl.qcm.questions-vives/1',
  niveau: '6ème',
  questions: [
    {
      question_code: 'VQCM9101',
      biome_slug: BIOMES[1][0],
      categorie_slug: CAT,
      question: 'Pourquoi le calao s’emmure-t-il dans son nid ?',
      choix: [
        'Pour protéger ses petits',
        'Pour dormir tout l’hiver',
        'Pour fuir la pluie',
        'Par jeu',
      ],
      reponse: 'A',
      explication: 'La femelle ferme l’entrée du nid : les petits y grandissent à l’abri.',
      ...extra,
    },
  ],
});

test('questions vives : import idempotent, premier choix = bonne réponse, une explication par retour', async () => {
  const rep = await importQuestionsVives(db, viveJson(), {});
  assert.equal(rep.refuse, false, rep.errors.join(' ; '));
  assert.equal(rep.upserted, 1);
  const row = await db.queryOne('SELECT * FROM gl_qcm_questions WHERE question_code = ?', [
    'VQCM9101',
  ]);
  assert.equal(row.reponse_correcte, 'A');
  assert.equal(row.niveau, '6ème');
  assert.equal(row.statut, 'actif');
  assert.equal(Number(row.usage_tenir), 1);
  assert.equal(row.choix_e, '');
  // Plage réservée : sur une base neuve, une question vive arrive avant le classeur de QCM et ne
  // doit pas occuper un de ses numéros (l'import du classeur échouerait sur la clé d'unicité).
  assert.ok(Number(row.numero_dans_categorie) >= 100001, String(row.numero_dans_categorie));
  assert.equal(row.feedback_a, null, 'le retour de la bonne lettre reste vide');
  for (const col of ['feedback_correct', 'feedback_b', 'feedback_c', 'feedback_d']) {
    assert.equal(row[col], 'La femelle ferme l’entrée du nid : les petits y grandissent à l’abri.');
  }
  assert.equal(row.feedback_e, null);

  // Le prof retire la question du tirage : un nouvel import ne la remet pas.
  await db.execute("UPDATE gl_qcm_questions SET usage_tenir = 0 WHERE question_code = 'VQCM9101'");
  const numero = row.numero_dans_categorie;
  const again = await importQuestionsVives(
    db,
    viveJson({ question: 'Pourquoi le calao ferme-t-il son nid ?' }),
    {},
  );
  assert.equal(again.upserted, 1);
  const after2 = await db.queryOne('SELECT * FROM gl_qcm_questions WHERE question_code = ?', [
    'VQCM9101',
  ]);
  assert.equal(after2.question, 'Pourquoi le calao ferme-t-il son nid ?');
  assert.equal(Number(after2.usage_tenir), 0, 'usage_tenir gardé à la mise à jour');
  assert.equal(after2.numero_dans_categorie, numero);
});

test('questions vives : refus de ligne (taxonomie, réponse ≠ A, choix en double, amorce « Non »)', async () => {
  const bad = viveJson();
  bad.questions.push(
    {
      ...bad.questions[0],
      question_code: 'VQCM9102',
      question: 'À quelle famille appartient le calao ?',
    },
    { ...bad.questions[0], question_code: 'VQCM9103', reponse: 'B' },
    { ...bad.questions[0], question_code: 'VQCM9104', choix: ['Un', 'Un', 'Deux', 'Trois'] },
    { ...bad.questions[0], question_code: 'VQCM9105', explication: 'Non, il protège ses petits.' },
    { ...bad.questions[0], question_code: 'QCM9106' },
  );
  const rep = await importQuestionsVives(db, bad, { dryRun: true, strict: true });
  assert.equal(rep.refuse, true);
  const errors = rep.errors.join('\n');
  assert.match(errors, /taxonomie/);
  assert.match(errors, /premier choix est le bon/);
  assert.match(errors, /choix en double/);
  assert.match(errors, /commence par « Non »/);
  assert.match(errors, /code VQCM0001… attendu/);
});

test('présentation : les choix d’une question vive sont mélangés (la bonne réponse change de place)', async () => {
  const row = await db.queryOne('SELECT * FROM gl_qcm_questions WHERE question_code = ?', [
    'VQCM9101',
  ]);
  const places = new Set();
  for (let i = 0; i < 40; i += 1) {
    const p = presentQuestion(row, []);
    places.add(p.choices.findIndex((c) => c.text === row.choix_a));
    assert.equal(p.choices.length, 4);
  }
  assert.ok(places.size > 1, 'la bonne réponse n’est pas toujours en premier');
});

test('fichier questions-vives.json : 40 questions, 5 par biome joué, aucun mot interdit', () => {
  const json = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'data', 'gl', 'tenir', 'questions-vives.json'), 'utf8'),
  );
  assert.equal(json.questions.length, 40);
  const parBiome = {};
  for (const q of json.questions) {
    parBiome[q.biome_slug] = (parBiome[q.biome_slug] || 0) + 1;
    assert.equal(q.reponse, 'A', q.question_code);
    for (const text of [q.question, q.explication, ...q.choix]) {
      assert.equal(findForbiddenString(text), null, `${q.question_code} : ${text}`);
    }
  }
  assert.deepEqual(Object.values(parBiome), Array(8).fill(5));
});
