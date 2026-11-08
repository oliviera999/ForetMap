'use strict';

/**
 * « Tenir à deux », règle § 4 : « Pool des cases : tout le biome du chapitre, niveau 6e (les
 * filtres cassés sont remplacés) ». En mode tenir, le tirage d'une case et la question de
 * secours d'une fouille se limitent aux niveaux admis (`lib/glNiveauxAdmis.js`) : jamais une
 * question `lycee` ou `cycle 4`, quels que soient les filtres de la case. Hors mode tenir, le
 * tirage classique ne change pas. Fixtures anonymes (`tests/helpers/glTenirFixtures.js`).
 */

require('./helpers/setup');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const db = require('../database');
const { createTenirGame, ensureQuestion, BIOMES } = require('./helpers/glTenirFixtures');
const { queryQuestionPool, buildPoolQueryFilters } = require('../lib/glMarkerQuestionPool');
const { normalizeQuestionPool } = require('../lib/glMarkerEventConfig');
const { presentChasseQuestion } = require('../lib/glChasse');
const { isNiveauAdmis, NIVEAUX_ADMIS_SQL } = require('../lib/glNiveauxAdmis');

const CAT = 'tenir-niveaux-essai';
const CODE_6E = 'TNV-6E-01';
const HORS_6E = [];
for (let i = 1; i <= 12; i += 1) {
  HORS_6E.push({
    code: `TNV-HX-${String(i).padStart(2, '0')}`,
    niveau: i % 2 ? 'lycee' : 'cycle 4',
  });
}

let ctx;
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const api = (path) => `/api/gl/games/${ctx.game.id}${path}`;

async function insertQuizMarker(label) {
  const cfg = JSON.stringify({
    version: 2,
    question: {
      mode: 'random',
      fixedQuestionCode: null,
      pool: { biomeMode: 'chapter', biomeSlugs: [], categorieSlugs: [CAT], niveaux: [] },
    },
  });
  const last = await db.queryOne(
    'SELECT MAX(order_index) AS m FROM gl_chapter_markers WHERE chapter_id = ?',
    [ctx.chapter.id],
  );
  // Hors chemin numéroté (order_index élevé) : la case sert seulement à la présentation.
  await db.execute(
    `INSERT INTO gl_chapter_markers (chapter_id, x_pct, y_pct, event_type, label, description, event_config_json, order_index, created_at)
     VALUES (?, 90, 90, 'quiz', ?, ?, ?, ?, NOW())`,
    [ctx.chapter.id, label, label, cfg, Number(last?.m || 0) + 1000],
  );
  return db.queryOne(
    'SELECT id FROM gl_chapter_markers WHERE chapter_id = ? AND label = ? ORDER BY id DESC LIMIT 1',
    [ctx.chapter.id, label],
  );
}

async function presentOn(markerId) {
  const team = ctx.teams[0];
  await db.execute('UPDATE gl_teams SET position_marker_id = ? WHERE id = ?', [markerId, team.id]);
  return request(app)
    .post(api(`/markers/${markerId}/present-question`))
    .set(auth(ctx.adminToken))
    .send({ teamId: team.id });
}

before(async () => {
  await db.initSchema();
  ctx = await createTenirGame({ stamp: Date.now() });
  await db.execute(
    `INSERT INTO gl_qcm_categories (slug, nom, order_index, created_at, updated_at)
     VALUES (?, ?, 0, NOW(), NOW()) ON DUPLICATE KEY UPDATE nom = VALUES(nom), updated_at = NOW()`,
    [CAT, 'Essai niveaux'],
  );
  // Une seule question de 6ᵉ, noyée parmi douze questions de lycée / cycle 4 du même biome.
  await ensureQuestion(CODE_6E, BIOMES[1][0], CAT, { niveau: '6ème' });
  for (const q of HORS_6E) await ensureQuestion(q.code, BIOMES[1][0], CAT, { niveau: q.niveau });
  const codes = [CODE_6E, ...HORS_6E.map((q) => q.code)];
  await db.execute(
    `UPDATE gl_qcm_questions SET statut = 'actif' WHERE question_code IN (${codes.map(() => '?').join(', ')})`,
    codes,
  );
  for (const q of HORS_6E) {
    await db.execute('UPDATE gl_qcm_questions SET niveau = ? WHERE question_code = ?', [
      q.niveau,
      q.code,
    ]);
  }
});

after(async () => {
  await db.execute("UPDATE gl_qcm_questions SET statut = 'actif' WHERE question_code = ?", [
    CODE_6E,
  ]);
  // Le chapitre d'exemple est partagé par d'autres suites : on retire les cases d'essai.
  await db.execute(
    "DELETE FROM gl_chapter_markers WHERE chapter_id = ? AND label LIKE 'Essai niveaux %'",
    [ctx.chapter.id],
  );
});

test('buildPoolQueryFilters : en mode tenir, les niveaux admis remplacent le filtre de la case', () => {
  const pool = normalizeQuestionPool({ biomeMode: 'chapter', niveaux: ['lycee'] });
  const classic = buildPoolQueryFilters(pool, ['jungle_afc']);
  assert.ok(classic.params.includes('lycee'), 'hors tenir : le filtre de la case s’applique');
  const tenir = buildPoolQueryFilters(pool, ['jungle_afc'], { niveauxAdmis: NIVEAUX_ADMIS_SQL });
  assert.ok(!tenir.params.includes('lycee'), 'le filtre cassé est remplacé');
  for (const n of NIVEAUX_ADMIS_SQL) assert.ok(tenir.params.includes(n));
  assert.match(tenir.sql, /niveau IN \(/);
});

test('pool de case : hors tenir, lycée et cycle 4 sortent ; en tenir, seule la 6ᵉ reste', async () => {
  const pool = { biomeMode: 'chapter', biomeSlugs: [], categorieSlugs: [CAT], niveaux: [] };
  const classic = await queryQuestionPool(db, { pool, chapterBiomeSlugs: BIOMES[1] });
  assert.equal(classic.error, null);
  assert.equal(classic.items.length, 1 + HORS_6E.length);
  assert.ok(
    classic.items.some((i) => !isNiveauAdmis(i.niveau)),
    'tirage classique inchangé',
  );

  const tenir = await queryQuestionPool(db, { pool, chapterBiomeSlugs: BIOMES[1], tenir: true });
  assert.deepEqual(
    tenir.items.map((i) => i.question_code),
    [CODE_6E],
  );
  for (const item of tenir.items) assert.ok(isNiveauAdmis(item.niveau));

  // Filtre « cassé » de la case (niveau lycée) : remplacé, pas intersecté.
  const casse = await queryQuestionPool(db, {
    pool: { ...pool, niveaux: ['lycee'] },
    chapterBiomeSlugs: BIOMES[1],
    tenir: true,
  });
  assert.deepEqual(
    casse.items.map((i) => i.question_code),
    [CODE_6E],
  );
});

test('fouille de secours : jamais une question de lycée, même si le thème n’a plus que cela', async () => {
  const zone = { id: 990001, zoneKey: 'cz-tnv-01', questionCode: null, themeSecours: CAT };
  const q = await presentChasseQuestion(db, {
    gameId: ctx.game.id,
    teamId: ctx.teams[0].id,
    zone,
    chapterId: ctx.chapter.id,
  });
  assert.equal(q.questionCode, CODE_6E);

  // La seule question admise a déjà été vue sur cette zone : le repli « thème épuisé, on
  // repart du début » reste borné lui aussi → la même question de 6ᵉ, jamais une de lycée.
  const again = await presentChasseQuestion(db, {
    gameId: ctx.game.id,
    teamId: ctx.teams[0].id,
    zone,
    chapterId: ctx.chapter.id,
  });
  assert.equal(again.questionCode, CODE_6E);
  await db.execute('DELETE FROM gl_game_chasse_questions_vues WHERE game_id = ? AND zone_id = ?', [
    ctx.game.id,
    zone.id,
  ]);
});

test('POST /markers/:id/present-question : en tenir, question admise ou aucune ; hors tenir, inchangé', async () => {
  const markerTenir = await insertQuizMarker('Essai niveaux A');
  const ok = await presentOn(markerTenir.id);
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(ok.body.questionCode, CODE_6E);

  await db.execute("UPDATE gl_qcm_questions SET statut = 'archive' WHERE question_code = ?", [
    CODE_6E,
  ]);
  const markerTenir2 = await insertQuizMarker('Essai niveaux B');
  const none = await presentOn(markerTenir2.id);
  assert.equal(none.status, 404, JSON.stringify(none.body));

  // Même case, partie sans profil tenir : le tirage classique sert le pool tel quel.
  await db.execute('UPDATE gl_games SET tenir_profil = NULL WHERE id = ?', [ctx.game.id]);
  const markerClassic = await insertQuizMarker('Essai niveaux C');
  const classic = await presentOn(markerClassic.id);
  assert.equal(classic.status, 200, JSON.stringify(classic.body));
  assert.ok(HORS_6E.some((q) => q.code === classic.body.questionCode));
  await db.execute("UPDATE gl_games SET tenir_profil = 'complet' WHERE id = ?", [ctx.game.id]);
});
