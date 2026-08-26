'use strict';

// Écran de rattachement : trois types de ressources, approbation groupée, garde-fou.
//
// Avant ce lot : la route `/resources` refusait tout type autre que `tutorial`, donc
// fiches espèces et glossaire n'avaient aucun point d'entrée ; et un lien bloquant sur un
// type non validable était accepté sans un mot, pour rester inerte à jamais.

require('./helpers/setup');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute, queryOne } = require('../database');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');

const stamp = Date.now();
const qcode = `QG${stamp}`.slice(0, 16);
const catSlug = `gcat${stamp}`.slice(0, 64);
const tutoRef = `G${stamp}`.slice(0, 64);
let token = '';

const auth = () => ({ Authorization: `Bearer ${token}` });

before(async () => {
  await initSchema();
  token = await ensureAdminTeacherAuthToken();
  await execute(
    `INSERT IGNORE INTO quiz_categories (slug, nom, theme, order_index)
     VALUES (?, 'Test garde-fou', 'sciences', 998)`,
    [catSlug],
  );
  await execute(
    `INSERT IGNORE INTO quiz_questions
      (question_code, categorie_slug, numero_dans_categorie, question, choix_a, choix_b, choix_c, reponse_correcte, niveau)
     VALUES (?, ?, 1, 'Question garde-fou ?', 'A', 'B', 'C', 'A', 'college')`,
    [qcode, catSlug],
  );
});

after(async () => {
  await execute('DELETE FROM resource_question_links WHERE question_code = ?', [qcode]).catch(
    () => {},
  );
  await execute('DELETE FROM quiz_questions WHERE question_code = ?', [qcode]).catch(() => {});
  await execute('DELETE FROM quiz_categories WHERE slug = ?', [catSlug]).catch(() => {});
});

test('GET /resources sert les trois types, et dit lesquels sont validables', async () => {
  for (const [type, markable] of [
    ['tutorial', true],
    ['plant', true],
    ['glossary', false],
  ]) {
    const res = await request(app)
      .get(`/api/learning-links/resources?type=${type}`)
      .set(auth())
      .expect(200);
    assert.equal(res.body.resource_type, type, `${type} doit être servi`);
    assert.ok(Array.isArray(res.body.resources), `${type} doit renvoyer une liste`);
    assert.equal(
      res.body.markable,
      markable,
      `${type} : l'écran doit savoir s'il peut rendre un lien bloquant`,
    );
    for (const r of res.body.resources.slice(0, 3)) {
      assert.equal(typeof r.ref, 'string');
      assert.ok('gating_count' in r && 'suggested_count' in r, 'compteurs attendus par l’écran');
    }
  }
});

test('POST refuse un lien BLOQUANT sur un type non validable, et l’accepte sinon', async () => {
  const refuse = await request(app)
    .post('/api/learning-links')
    .set(auth())
    .send({
      resource_type: 'glossary',
      resource_ref: `GL${stamp}`.slice(0, 64),
      question_code: qcode,
      is_gating: true,
    })
    .expect(400);
  assert.match(refuse.body.error, /glossary/);
  assert.match(refuse.body.error, /non bloquant/, 'le refus doit dire ce qui reste possible');

  // Le même lien, documentaire, reste permis : il dit quelle question parle de quel terme.
  const accepte = await request(app)
    .post('/api/learning-links')
    .set(auth())
    .send({
      resource_type: 'glossary',
      resource_ref: `GL${stamp}`.slice(0, 64),
      question_code: qcode,
      is_gating: false,
    })
    .expect(201);
  assert.equal(Number(accepte.body.link.is_gating), 0);
});

test('PATCH refuse de rendre bloquant un lien sur un type non validable', async () => {
  const ref = `GP${stamp}`.slice(0, 64);
  const created = await request(app)
    .post('/api/learning-links')
    .set(auth())
    .send({
      resource_type: 'glossary',
      resource_ref: ref,
      question_code: qcode,
      is_gating: false,
    })
    .expect(201);

  const refuse = await request(app)
    .patch(`/api/learning-links/${created.body.link.id}`)
    .set(auth())
    .send({ is_gating: true })
    .expect(400);
  assert.match(refuse.body.error, /glossary/);

  // La ligne n'a pas bougé : un refus ne doit rien écrire au passage.
  const row = await queryOne('SELECT is_gating FROM resource_question_links WHERE id = ?', [
    created.body.link.id,
  ]);
  assert.equal(Number(row.is_gating), 0);
});

test('POST /review approuve toutes les propositions d’une ressource en un geste', async () => {
  for (let i = 0; i < 2; i += 1) {
    await execute(
      `INSERT IGNORE INTO resource_question_links
        (resource_type, resource_ref, question_code, is_gating, weight, origin, status)
       VALUES ('tutorial', ?, ?, 1, 1, 'auto', 'suggested')`,
      [`${tutoRef}${i}`, qcode],
    );
  }
  // Deux ressources distinctes : l'approbation groupée ne doit toucher QUE celle visée.
  const res = await request(app)
    .post('/api/learning-links/review')
    .set(auth())
    .send({ action: 'approve', resourceType: 'tutorial', resourceRef: `${tutoRef}0` })
    .expect(200);
  assert.equal(res.body.updated, 1);

  const touchee = await queryOne(
    'SELECT status FROM resource_question_links WHERE resource_type = ? AND resource_ref = ? AND question_code = ?',
    ['tutorial', `${tutoRef}0`, qcode],
  );
  assert.equal(touchee.status, 'approved');
  const intacte = await queryOne(
    'SELECT status FROM resource_question_links WHERE resource_type = ? AND resource_ref = ? AND question_code = ?',
    ['tutorial', `${tutoRef}1`, qcode],
  );
  assert.equal(intacte.status, 'suggested', 'les autres ressources ne bougent pas');
});

test('POST /review sans identifiant ni ressource reste une erreur explicite', async () => {
  const res = await request(app)
    .post('/api/learning-links/review')
    .set(auth())
    .send({ action: 'approve' })
    .expect(400);
  assert.match(res.body.error, /identifiant/i);
});
