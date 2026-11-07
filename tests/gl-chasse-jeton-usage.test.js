'use strict';

/**
 * Un jeton de chasse ou de lecture ne s'essaie qu'une fois. Sans le refus, les quatre
 * choiceId du même presentationToken suffisent à trouver ou tenir la page.
 */

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const db = require('../database');
const { initSchema, execute, queryOne } = db;
const {
  createTenirGame,
  importExempleChasse,
  ouvrirTourEnJeu,
  readPlayerBourses,
} = require('./helpers/glTenirFixtures');

let ctx;
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const api = (path) => `/api/gl/games/${ctx.game.id}${path}`;
const gnomeA = () => ctx.players[0];
const licorneA = () => ctx.players[2];

before(async () => {
  await initSchema();
  ctx = await createTenirGame({ stamp: `jeton-${Date.now()}` });
  await importExempleChasse(db, { game: ctx.game });
  await request(app).get(api('/tenir')).set(auth(ctx.adminToken)).expect(200);
  await ouvrirTourEnJeu(request, app, ctx);
});

test('chasse : rejouer le même jeton, même avec la bonne réponse, ne trouve pas la page', async () => {
  const fouille = await request(app)
    .post(api('/chasse/fouiller'))
    .set(auth(gnomeA().token))
    .send({ x: 0.35, y: 0.3 });
  assert.equal(fouille.status, 201, JSON.stringify(fouille.body));
  const question = fouille.body.question;
  assert.ok(question?.presentationToken);
  const wrong = question.choices.find((c) => c.text !== 'La forêt respire');
  const first = await request(app).post(api('/chasse/repondre')).set(auth(gnomeA().token)).send({
    presentationToken: question.presentationToken,
    questionCode: question.questionCode,
    choiceId: wrong.id,
  });
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal(first.body.correct, false);
  assert.equal(first.body.etat, 'revelee');

  for (const choice of question.choices) {
    if (choice.id === wrong.id) continue;
    const replay = await request(app).post(api('/chasse/repondre')).set(auth(gnomeA().token)).send({
      presentationToken: question.presentationToken,
      questionCode: question.questionCode,
      choiceId: choice.id,
    });
    assert.equal(replay.status, 409, JSON.stringify(replay.body));
    assert.equal(replay.body.code, 'JETON_DEJA_UTILISE');
  }

  const carnet = await request(app).get(api('/chasse')).set(auth(gnomeA().token));
  const page = carnet.body.pages.find((p) => p.zoneKey === 'cz-p1-01');
  assert.equal(page.etat, 'revelee');
  assert.equal(page.feuilletCode, null);
  const state = await queryOne(
    'SELECT status FROM gl_game_feuillet_states WHERE game_id = ? AND feuillet_code = ?',
    [ctx.game.id, 'tenir-ex-p1-1'],
  );
  assert.equal(state ?? null, null);
});

test('lecture : l’ancien jeton ne tient pas la page ; la carte reposée, si', async () => {
  const zone = await queryOne('SELECT id FROM gl_chasse_zones WHERE zone_key = ?', ['cz-p1-01']);
  await execute(
    `UPDATE gl_game_chasse_pages
        SET etat = 'trouvee', trouvee_par_team_id = ?, trouvee_at = NOW()
      WHERE game_id = ? AND zone_id = ?`,
    [gnomeA().teamId, ctx.game.id, zone.id],
  );
  const ouvert = await request(app)
    .post(api('/chasse/pages/cz-p1-01/ouvrir'))
    .set(auth(licorneA().token));
  assert.equal(ouvert.status, 200, JSON.stringify(ouvert.body));
  const question = ouvert.body.question;
  assert.ok(question?.presentationToken);
  const wrong = question.choices.find((c) => c.text !== 'Que la forêt respire');
  const rate = await request(app)
    .post(api('/chasse/pages/cz-p1-01/tenir'))
    .set(auth(licorneA().token))
    .send({
      presentationToken: question.presentationToken,
      questionCode: question.questionCode,
      choiceId: wrong.id,
    });
  assert.equal(rate.status, 200, JSON.stringify(rate.body));
  assert.equal(rate.body.correct, false);
  assert.ok(rate.body.question?.presentationToken);
  assert.notEqual(rate.body.question.presentationToken, question.presentationToken);

  const rightOld = question.choices.find((c) => c.text === 'Que la forêt respire');
  const avant = {
    licorne: await readPlayerBourses(licorneA().id),
    gnome: await readPlayerBourses(gnomeA().id),
  };
  const replay = await request(app)
    .post(api('/chasse/pages/cz-p1-01/tenir'))
    .set(auth(licorneA().token))
    .send({
      presentationToken: question.presentationToken,
      questionCode: question.questionCode,
      choiceId: rightOld.id,
    });
  assert.equal(replay.status, 409, JSON.stringify(replay.body));
  assert.equal(replay.body.code, 'JETON_DEJA_UTILISE');
  assert.deepEqual(await readPlayerBourses(licorneA().id), avant.licorne);
  assert.deepEqual(await readPlayerBourses(gnomeA().id), avant.gnome);
  const encore = await queryOne(
    'SELECT etat FROM gl_game_chasse_pages WHERE game_id = ? AND zone_id = ?',
    [ctx.game.id, zone.id],
  );
  assert.equal(encore.etat, 'trouvee');

  const rightNew = rate.body.question.choices.find((c) => c.text === 'Que la forêt respire');
  const tenue = await request(app)
    .post(api('/chasse/pages/cz-p1-01/tenir'))
    .set(auth(licorneA().token))
    .send({
      presentationToken: rate.body.question.presentationToken,
      questionCode: rate.body.question.questionCode,
      choiceId: rightNew.id,
    });
  assert.equal(tenue.status, 200, JSON.stringify(tenue.body));
  assert.equal(tenue.body.correct, true);
  assert.equal(tenue.body.etat, 'tenue');
});
