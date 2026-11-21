'use strict';

/**
 * Rattachements saisis avec une question du quiz (`plant_ids`, `glossary_codes`,
 * `tutorial_ids`) : `POST` / `PUT /api/quiz/admin/questions` et l'outil `foretmap_quiz`
 * (`create`, `update`). Les liens passent par le service unique (`resource_question_links`) :
 * approuvés, non bloquants, `origin = 'manual'`, ajout seulement, sans effet au rejeu.
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const fx = require('./helpers/mcpFixtures');
const { initSchema, queryOne, queryAll, execute } = require('../database');

fx.enableMcpEnv();

const { app } = require('../server');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');
const { parseResourceLinkFields } = require('../lib/fmQuizCrud');

const stamp = Date.now().toString(36);
const CATEGORY = `liens${stamp}`.slice(0, 60);
const GLOSSARY_CODE = `GL${stamp}`.slice(0, 16).toUpperCase();
let teacherToken;
let mcpToken;
let plantIds;
let tutorialId;
let nextNumero = 1;

function questionBody(extra = {}) {
  const numero = nextNumero;
  nextNumero += 1;
  return {
    categorie_slug: CATEGORY,
    numero_dans_categorie: numero,
    question: `Question liens ${stamp} n° ${numero} : que mange la coccinelle ?`,
    choix_a: 'Des pucerons',
    choix_b: 'Des cailloux',
    choix_c: 'Des nuages',
    reponse_correcte: 'A',
    niveau: 'college',
    difficulte: 1,
    ...extra,
  };
}

async function nextCode() {
  const res = await request(app)
    .get('/api/quiz/admin/questions/next-code')
    .set('Authorization', `Bearer ${teacherToken}`)
    .expect(200);
  return res.body.question_code;
}

async function linksOf(code) {
  return queryAll(
    `SELECT resource_type, resource_ref, is_gating, origin, status, created_by_user_id
       FROM resource_question_links WHERE question_code = ?
      ORDER BY resource_type, resource_ref`,
    [code],
  );
}

const byType = (rows, type) => rows.filter((r) => r.resource_type === type);

test.before(async () => {
  await initSchema();
  teacherToken = await ensureAdminTeacherAuthToken();
  const admin = await fx.createAccount('admin');
  mcpToken = (await fx.obtainTokens(app, admin)).access_token;
  await execute(
    `INSERT INTO quiz_categories (slug, nom, theme, order_index)
     VALUES (?, ?, 'sciences', 990)`,
    [CATEGORY, `Liens ${stamp}`],
  );
  await execute(
    `INSERT INTO glossary_terms
       (glossary_code, terme, variantes, categorie, niveau, definition_courte, statut,
        created_at, updated_at)
     VALUES (?, ?, '', 'faune', 'base', 'Terme de test des rattachements', 'actif', NOW(), NOW())`,
    [GLOSSARY_CODE, `zzterme${stamp}`],
  );
  plantIds = (await queryAll('SELECT id FROM plants ORDER BY id LIMIT 3')).map((r) => Number(r.id));
  assert.equal(plantIds.length, 3, 'trois fiches espèce attendues dans la base de test');
  await execute(
    `INSERT INTO tutorials (title, slug, type, html_content, is_active)
     VALUES (?, ?, 'html', '<p>Test</p>', 1)`,
    [`Tutoriel liens ${stamp}`, `tuto-liens-${stamp}`],
  );
  tutorialId = Number(
    (await queryOne('SELECT id FROM tutorials WHERE slug = ?', [`tuto-liens-${stamp}`])).id,
  );
});

test.after(async () => {
  await execute(
    `DELETE FROM resource_question_links
      WHERE question_code IN (SELECT question_code FROM quiz_questions WHERE categorie_slug = ?)`,
    [CATEGORY],
  );
  await execute('DELETE FROM quiz_questions WHERE categorie_slug = ?', [CATEGORY]);
  await execute('DELETE FROM quiz_categories WHERE slug = ?', [CATEGORY]);
  await execute('DELETE FROM glossary_terms WHERE glossary_code = ?', [GLOSSARY_CODE]);
  await execute('DELETE FROM tutorials WHERE id = ?', [tutorialId]);
});

test('parseResourceLinkFields : champ absent ignoré, doublons retirés, valeurs refusées', () => {
  assert.deepEqual(parseResourceLinkFields({}), []);
  assert.deepEqual(parseResourceLinkFields({ plant_ids: null }), []);
  const parsed = parseResourceLinkFields({ plant_ids: [3, '3', 4], glossary_codes: ['Ab', 'ab'] });
  assert.deepEqual(
    parsed.map((p) => [p.field, p.refs]),
    [
      ['plant_ids', ['3', '4']],
      ['glossary_codes', ['Ab']],
    ],
  );
  assert.throws(() => parseResourceLinkFields({ plant_ids: '3' }), /tableau attendu/);
  assert.throws(() => parseResourceLinkFields({ plant_ids: [0] }), /valeur invalide/);
  assert.throws(() => parseResourceLinkFields({ tutorial_ids: ['1 OR 1=1'] }), /valeur invalide/);
  assert.throws(() => parseResourceLinkFields({ glossary_codes: [''] }), /valeur invalide/);
  assert.throws(
    () => parseResourceLinkFields({ plant_ids: Array.from({ length: 51 }, (_, i) => i + 1) }),
    /50 éléments au plus/,
  );
});

test('POST : la question est créée avec ses liens, approuvés, non bloquants, « manual »', async () => {
  const code = await nextCode();
  const res = await request(app)
    .post('/api/quiz/admin/questions')
    .set('Authorization', `Bearer ${teacherToken}`)
    .send(
      questionBody({
        question_code: code,
        plant_ids: [plantIds[0], plantIds[1]],
        glossary_codes: [GLOSSARY_CODE.toLowerCase()],
        tutorial_ids: [tutorialId],
      }),
    )
    .expect(201);
  assert.equal(res.body.question.question_code, code);
  assert.equal(res.body.links.created.length, 4);
  assert.deepEqual(res.body.links.unchanged, []);
  assert.deepEqual(res.body.links.approved, []);
  // La fiche de la question ne porte pas les champs de rattachement (ce ne sont pas des colonnes).
  assert.ok(!('plant_ids' in res.body.question));

  const rows = await linksOf(code);
  assert.deepEqual(
    byType(rows, 'plant').map((r) => r.resource_ref),
    [String(plantIds[0]), String(plantIds[1])].sort(),
  );
  // Code du glossaire : la référence enregistrée est celle de la base, pas la casse reçue.
  assert.deepEqual(
    byType(rows, 'glossary').map((r) => r.resource_ref),
    [GLOSSARY_CODE],
  );
  assert.deepEqual(
    byType(rows, 'tutorial').map((r) => r.resource_ref),
    [String(tutorialId)],
  );
  for (const row of rows) {
    assert.equal(Number(row.is_gating), 0, 'non bloquant par défaut');
    assert.equal(row.origin, 'manual');
    assert.equal(row.status, 'approved');
    assert.ok(row.created_by_user_id, 'auteur du lien enregistré');
  }
});

test('PUT : rejeu sans effet, ajout sans retrait, lien bloquant ou relu conservé', async () => {
  const code = await nextCode();
  const body = questionBody({ question_code: code });
  await request(app)
    .post('/api/quiz/admin/questions')
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({ ...body, plant_ids: [plantIds[0]] })
    .expect(201);
  // Un professeur a rendu ce lien bloquant, avec une note : rien de cela ne doit bouger.
  await execute(
    `UPDATE resource_question_links SET is_gating = 1, origin = 'import', note = 'relu', weight = 3
      WHERE question_code = ? AND resource_type = 'plant' AND resource_ref = ?`,
    [code, String(plantIds[0])],
  );
  // Un lien seulement proposé vers une autre fiche.
  await execute(
    `INSERT INTO resource_question_links
       (resource_type, resource_ref, question_code, is_gating, weight, origin, status)
     VALUES ('plant', ?, ?, 0, 1, 'auto', 'suggested')`,
    [String(plantIds[2]), code],
  );

  const put = (extra) =>
    request(app)
      .put(`/api/quiz/admin/questions/${code}`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ ...body, ...extra });

  const first = await put({ plant_ids: [plantIds[0], plantIds[1], plantIds[2]] }).expect(200);
  assert.deepEqual(first.body.links.unchanged, [
    { resource_type: 'plant', resource_ref: String(plantIds[0]) },
  ]);
  assert.deepEqual(first.body.links.created, [
    { resource_type: 'plant', resource_ref: String(plantIds[1]) },
  ]);
  assert.deepEqual(first.body.links.approved, [
    { resource_type: 'plant', resource_ref: String(plantIds[2]) },
  ]);

  const snapshot = await queryAll(
    `SELECT resource_ref, is_gating, origin, status, note, weight
       FROM resource_question_links WHERE question_code = ? ORDER BY resource_ref`,
    [code],
  );
  const kept = snapshot.find((r) => r.resource_ref === String(plantIds[0]));
  assert.equal(Number(kept.is_gating), 1);
  assert.equal(kept.origin, 'import');
  assert.equal(kept.note, 'relu');
  assert.equal(Number(kept.weight), 3);
  const approved = snapshot.find((r) => r.resource_ref === String(plantIds[2]));
  assert.equal(approved.status, 'approved');
  assert.equal(approved.origin, 'auto', 'origine du lien proposé conservée');

  // Rejeu de la même demande : aucun lien créé, aucune ligne modifiée.
  const second = await put({ plant_ids: [plantIds[0], plantIds[1], plantIds[2]] }).expect(200);
  assert.deepEqual(second.body.links.created, []);
  assert.deepEqual(second.body.links.approved, []);
  assert.equal(second.body.links.unchanged.length, 3);
  assert.deepEqual(
    await queryAll(
      `SELECT resource_ref, is_gating, origin, status, note, weight
         FROM resource_question_links WHERE question_code = ? ORDER BY resource_ref`,
      [code],
    ),
    snapshot,
  );

  // Une liste plus courte, ou vide, ne détache rien ; sans champ, la réponse n'a pas `links`.
  const shorter = await put({ plant_ids: [] }).expect(200);
  assert.deepEqual(shorter.body.links, { created: [], approved: [], unchanged: [] });
  const without = await put({}).expect(200);
  assert.ok(!('links' in without.body));
  assert.equal((await linksOf(code)).length, 3);
});

test('référence inconnue ou mal formée : 400, et la question n’est pas enregistrée', async () => {
  const code = await nextCode();
  const unknown = await request(app)
    .post('/api/quiz/admin/questions')
    .set('Authorization', `Bearer ${teacherToken}`)
    .send(questionBody({ question_code: code, plant_ids: [plantIds[0], 999999999] }))
    .expect(400);
  assert.match(unknown.body.error, /Fiche\(s\) espèce introuvable\(s\) : 999999999/);
  // Transaction annulée : ni question, ni lien vers la fiche valide de la même demande.
  assert.ok(!(await queryOne('SELECT 1 AS x FROM quiz_questions WHERE question_code = ?', [code])));
  assert.deepEqual(await linksOf(code), []);

  const malformed = await request(app)
    .post('/api/quiz/admin/questions')
    .set('Authorization', `Bearer ${teacherToken}`)
    .send(questionBody({ question_code: code, tutorial_ids: 'tous' }))
    .expect(400);
  assert.match(malformed.body.error, /tutorial_ids : tableau attendu/);

  const noTerm = await request(app)
    .post('/api/quiz/admin/questions')
    .set('Authorization', `Bearer ${teacherToken}`)
    .send(questionBody({ question_code: code, glossary_codes: ['INCONNU-XYZ'] }))
    .expect(400);
  assert.match(noTerm.body.error, /Terme\(s\) du glossaire introuvable\(s\) : INCONNU-XYZ/);
});

test('foretmap_quiz create / update : plant_ids en paramètre ou dans data', async () => {
  const call = (args) => fx.callTool(app, mcpToken, 'foretmap_quiz', args);
  const { numero_dans_categorie: _numero, ...data } = questionBody();
  nextNumero += 50; // l'outil attribue le numéro suivant de la catégorie
  const created = await call({
    action: 'create',
    data,
    plant_ids: [plantIds[0]],
    glossary_codes: [GLOSSARY_CODE],
  });
  assert.equal(created.isError, false, created.text);
  const code = created.data.question.question_code;
  assert.equal(created.data.links.created.length, 2);
  assert.deepEqual(
    (await linksOf(code)).map((r) => [r.resource_type, r.origin, Number(r.is_gating)]),
    [
      ['glossary', 'manual', 0],
      ['plant', 'manual', 0],
    ],
  );

  // `update` relit la fiche puis fusionne : les rattachements voyagent avec le changement.
  const updated = await call({
    action: 'update',
    question_code: code,
    data: { difficulte: 2, tutorial_ids: [tutorialId] },
    plant_ids: [plantIds[0], plantIds[1]],
  });
  assert.equal(updated.isError, false, updated.text);
  assert.equal(updated.data.question.difficulte, 2);
  assert.deepEqual(updated.data.links.unchanged, [
    { resource_type: 'plant', resource_ref: String(plantIds[0]) },
  ]);
  assert.equal(updated.data.links.created.length, 2);
  assert.equal((await linksOf(code)).length, 4);

  // Sans rattachement : la modification ne touche à aucun lien et ne renvoie pas `links`.
  const plain = await call({ action: 'update', question_code: code, data: { difficulte: 1 } });
  assert.equal(plain.isError, false, plain.text);
  assert.ok(!('links' in plain.data));
  assert.equal((await linksOf(code)).length, 4);

  const refused = await call({ action: 'update', question_code: code, data: {}, plant_ids: [0] });
  assert.equal(refused.isError, true, 'identifiant non positif refusé par le schéma');
});
