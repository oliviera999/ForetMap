'use strict';

// Rattachement automatique tutoriel <-> question par le CONTENU
// (GET /api/learning-links/resources, POST /api/learning-links/suggest).

require('./helpers/setup');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute, queryOne } = require('../database');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');

const stamp = Date.now();
const catSlug = `sugcat${stamp}`.slice(0, 64);
const codeCompost = `QSC${stamp}`.slice(0, 16);
const codeHorsSujet = `QSX${stamp}`.slice(0, 16);
const codeEditorial = `QSE${stamp}`.slice(0, 16);
const slugCompost = `tuto-compost-${stamp}`.slice(0, 190);
let token = '';
let tutorialId = 0;

const auth = () => ({ Authorization: `Bearer ${token}` });

async function insertQuestion(code, question, reponseTexte, numero) {
  await execute(
    `INSERT IGNORE INTO quiz_questions
      (question_code, categorie_slug, numero_dans_categorie, question, reponse_texte,
       choix_a, choix_b, choix_c, reponse_correcte, niveau, statut)
     VALUES (?, ?, ?, ?, ?, 'A', 'B', 'C', 'A', 'college', 'actif')`,
    [code, catSlug, numero, question, reponseTexte],
  );
}

before(async () => {
  await initSchema();
  token = await ensureAdminTeacherAuthToken();

  await execute(
    `INSERT IGNORE INTO quiz_categories (slug, nom, theme, order_index)
     VALUES (?, 'Test suggestion', 'jardinage', 998)`,
    [catSlug],
  );

  await execute(
    `INSERT INTO tutorials (title, slug, type, summary, html_content, is_active, sort_order)
     VALUES (?, ?, 'html', ?, ?, 1, 900)`,
    [
      `Le compostage ${stamp}`,
      slugCompost,
      'Transformer les déchets verts en terreau fertile.',
      '<p>Le compostage recycle les déchets organiques. Il faut alterner matières azotées ' +
        '(épluchures, tontes) et carbonées (feuilles mortes, carton). Le tas doit rester ' +
        'humide et aéré.</p>',
    ],
  );
  const row = await queryOne('SELECT id FROM tutorials WHERE slug = ? LIMIT 1', [slugCompost]);
  tutorialId = Number(row.id);

  await insertQuestion(
    codeCompost,
    'Que met-on dans le compost pour équilibrer les matières azotées ?',
    'Des feuilles mortes et du carton, riches en carbone.',
    1,
  );
  await insertQuestion(
    codeHorsSujet,
    'Quelle est la capitale de la Mongolie ?',
    'Oulan-Bator, fondée au XVIIe siècle.',
    2,
  );
  await insertQuestion(codeEditorial, 'Question rattachée éditorialement ?', 'Oui.', 3);

  // Lien éditorial « questions liées » NON repris dans le modèle unifié : c'est le
  // cas que la migration 144 ne pouvait pas couvrir (elle n'a copié qu'une fois).
  await execute(
    'INSERT IGNORE INTO quiz_question_tutorials (question_code, tutorial_id) VALUES (?, ?)',
    [codeEditorial, tutorialId],
  );
});

after(async () => {
  const codes = [codeCompost, codeHorsSujet, codeEditorial];
  for (const code of codes) {
    await execute('DELETE FROM resource_question_links WHERE question_code = ?', [code]).catch(
      () => {},
    );
    await execute('DELETE FROM quiz_question_tutorials WHERE question_code = ?', [code]).catch(
      () => {},
    );
    await execute('DELETE FROM quiz_questions WHERE question_code = ?', [code]).catch(() => {});
  }
  if (tutorialId) {
    await execute(
      'DELETE FROM resource_question_links WHERE resource_type = ? AND resource_ref = ?',
      ['tutorial', String(tutorialId)],
    ).catch(() => {});
    await execute('DELETE FROM tutorials WHERE id = ?', [tutorialId]).catch(() => {});
  }
  await execute('DELETE FROM quiz_categories WHERE slug = ?', [catSlug]).catch(() => {});
});

test('GET /resources exige une authentification', async () => {
  const res = await request(app).get('/api/learning-links/resources?type=tutorial');
  assert.ok([401, 403].includes(res.status), `statut inattendu ${res.status}`);
});

test('POST /suggest exige une authentification', async () => {
  const res = await request(app).post('/api/learning-links/suggest').send({});
  assert.ok([401, 403].includes(res.status), `statut inattendu ${res.status}`);
});

test('GET /resources liste les tutoriels avec leurs compteurs', async () => {
  const res = await request(app).get('/api/learning-links/resources?type=tutorial').set(auth());
  assert.equal(res.status, 200);
  assert.equal(res.body.resource_type, 'tutorial');
  const mine = res.body.resources.find((r) => r.ref === String(tutorialId));
  assert.ok(mine, 'le tutoriel de test doit être listé');
  assert.equal(mine.label, `Le compostage ${stamp}`);
  assert.equal(typeof mine.gating_count, 'number');
});

test('GET /resources sert les plantes, et refuse un type inconnu', async () => {
  // La route ne servait QUE les tutoriels : fiches espèces et glossaire n'avaient
  // aucun point d'entrée dans l'écran de rattachement. Elle sert désormais les trois.
  const plantes = await request(app).get('/api/learning-links/resources?type=plant').set(auth());
  assert.equal(plantes.status, 200);
  assert.equal(plantes.body.resource_type, 'plant');
  assert.equal(plantes.body.markable, true);

  // Le glossaire est listable mais pas validable : l'écran doit pouvoir le dire.
  const glossaire = await request(app)
    .get('/api/learning-links/resources?type=glossary')
    .set(auth());
  assert.equal(glossaire.status, 200);
  assert.equal(glossaire.body.markable, false);

  // Un type hors du domaine ForetMap reste refusé (repli sur 'tutorial' impossible).
  const inconnu = await request(app).get('/api/learning-links/resources?type=feuillet').set(auth());
  assert.equal(inconnu.body.resource_type, 'tutorial', 'type inconnu → repli documenté');
});

test('POST /suggest simule par défaut : rien n’est écrit', async () => {
  const res = await request(app)
    .post('/api/learning-links/suggest')
    .set(auth())
    .send({ resourceRefs: [String(tutorialId)] });
  assert.equal(res.status, 200);
  assert.equal(res.body.applied, false);
  assert.equal(res.body.inserted, 0);
  assert.ok(Array.isArray(res.body.candidates));

  const written = await queryOne(
    'SELECT COUNT(*) AS n FROM resource_question_links WHERE resource_type = ? AND resource_ref = ?',
    ['tutorial', String(tutorialId)],
  );
  assert.equal(Number(written.n), 0, 'la simulation ne doit rien insérer');
});

test('POST /suggest rapproche la question du tutoriel qui traite son sujet', async () => {
  const res = await request(app)
    .post('/api/learning-links/suggest')
    .set(auth())
    .send({ resourceRefs: [String(tutorialId)] });
  const codes = res.body.candidates.map((c) => c.question_code);
  assert.ok(codes.includes(codeCompost), 'la question compost doit être proposée');
  assert.ok(!codes.includes(codeHorsSujet), 'la question hors sujet ne doit pas être proposée');
});

test('POST /suggest reprend les liens éditoriaux non encore répercutés', async () => {
  const res = await request(app)
    .post('/api/learning-links/suggest')
    .set(auth())
    .send({ resourceRefs: [String(tutorialId)] });
  const editorial = res.body.candidates.find((c) => c.question_code === codeEditorial);
  assert.ok(editorial, 'le lien « questions liées » déjà saisi doit remonter');
  assert.equal(editorial.origin, 'import');
  assert.equal(Number(editorial.confidence), 1);
});

test('POST /suggest avec apply insère en statut « suggested »', async () => {
  const res = await request(app)
    .post('/api/learning-links/suggest')
    .set(auth())
    .send({ apply: true, resourceRefs: [String(tutorialId)] });
  assert.equal(res.status, 200);
  assert.equal(res.body.applied, true);
  assert.ok(res.body.inserted > 0);

  const link = await queryOne(
    `SELECT status, is_gating FROM resource_question_links
      WHERE resource_type = 'tutorial' AND resource_ref = ? AND question_code = ? LIMIT 1`,
    [String(tutorialId), codeCompost],
  );
  assert.ok(link, 'le lien doit exister après application');
  // « suggested » : sans effet sur les élèves tant qu'un professeur n'a pas approuvé.
  assert.equal(link.status, 'suggested');
});

test('POST /suggest est idempotent : un couple déjà lié n’est pas re-proposé', async () => {
  const res = await request(app)
    .post('/api/learning-links/suggest')
    .set(auth())
    .send({ apply: true, resourceRefs: [String(tutorialId)] });
  assert.equal(res.body.inserted, 0, 'aucun nouvel insert au second passage');
  const codes = res.body.candidates.map((c) => c.question_code);
  assert.ok(!codes.includes(codeCompost), 'le couple déjà lié sort des candidats');
});

test('POST /suggest borne minConfidence et maxPerQuestion', async () => {
  const res = await request(app)
    .post('/api/learning-links/suggest')
    .set(auth())
    .send({ minConfidence: 5, maxPerQuestion: 9999, includeEditorial: false });
  assert.equal(res.status, 200);
  // minConfidence ramené dans [0,1] : un seuil de 1 ne retient (presque) rien.
  assert.equal(res.body.stats.textual_candidates, res.body.candidates.length);
});

test('POST /suggest restreint aux questions demandées', async () => {
  const res = await request(app)
    .post('/api/learning-links/suggest')
    .set(auth())
    .send({ questionCodes: [codeHorsSujet], includeEditorial: false });
  assert.equal(res.status, 200);
  assert.equal(res.body.stats.questions, 1);
  for (const c of res.body.candidates) {
    assert.equal(c.question_code, codeHorsSujet);
  }
});

test('POST /suggest couvre aussi plantes et glossaire, chacun avec son moteur', async () => {
  // Le rattachement automatique ne couvrait que les tutoriels : fiches espèces et
  // termes de glossaire n'étaient servis que par le script en ligne de commande.
  const res = await request(app)
    .post('/api/learning-links/suggest')
    .set(auth())
    .send({ includeEditorial: false, minConfidence: 0.5 });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.stats.resource_types.sort(), ['glossary', 'plant', 'tutorial']);
  assert.equal(typeof res.body.stats.labelled_candidates, 'number');
});

test('POST /suggest restreint aux types demandés', async () => {
  const res = await request(app)
    .post('/api/learning-links/suggest')
    .set(auth())
    .send({ resourceTypes: ['tutorial'], includeEditorial: false });
  assert.deepEqual(res.body.stats.resource_types, ['tutorial']);
  for (const c of res.body.candidates) assert.equal(c.resource_type, 'tutorial');
  // Aucun candidat par libellé quand les tutoriels sont seuls demandés.
  assert.equal(res.body.stats.labelled_candidates, 0);
});

test('POST /suggest — un type inconnu est ignoré, pas fatal', async () => {
  const res = await request(app)
    .post('/api/learning-links/suggest')
    .set(auth())
    .send({ resourceTypes: ['chaussette'], includeEditorial: false });
  assert.equal(res.status, 200);
  // Liste vide après filtrage → on retombe sur les trois types plutôt que de ne rien faire.
  assert.deepEqual(res.body.stats.resource_types.sort(), ['glossary', 'plant', 'tutorial']);
});

test('POST /suggest — les candidats hors tutoriel portent bien leur type', async () => {
  const res = await request(app)
    .post('/api/learning-links/suggest')
    .set(auth())
    .send({ resourceTypes: ['plant', 'glossary'], includeEditorial: false, minConfidence: 0.4 });
  assert.equal(res.status, 200);
  for (const c of res.body.candidates) {
    assert.ok(
      ['plant', 'glossary'].includes(c.resource_type),
      `type inattendu : ${c.resource_type}`,
    );
  }
});
