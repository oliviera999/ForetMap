'use strict';

/**
 * « Tenir à deux » v2 — tenir une page (spec § 6) : lecture par le même peuple (sans gain),
 * question de lecture pour l'autre peuple, « pas encore » sans perte, page tenue → +1 ressource
 * du peuple aux membres des deux équipes (plafond), carnet complet (+1 à tous, voile −3, une
 * seule fois), limite de veillée. Fixtures anonymes.
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
  setPlayerBourses,
  setGlSetting,
} = require('./helpers/glTenirFixtures');

let ctx;
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const api = (path) => `/api/gl/games/${ctx.game.id}${path}`;
const gnomeA = () => ctx.players[0];
const gnomeB = () => ctx.players[1];
const licorneA = () => ctx.players[2];
const licorneB = () => ctx.players[3];

async function trouverPage(zoneId, teamId) {
  await execute(
    `UPDATE gl_game_chasse_pages SET etat = 'trouvee', trouvee_par_team_id = ?, trouvee_at = NOW() WHERE game_id = ? AND zone_id = ?`,
    [teamId, ctx.game.id, zoneId],
  );
}

async function zoneId(zoneKey) {
  return Number(
    (await queryOne('SELECT id FROM gl_chasse_zones WHERE zone_key = ?', [zoneKey])).id,
  );
}

before(async () => {
  await initSchema();
  ctx = await createTenirGame({ stamp: Date.now() });
  await importExempleChasse(db, { game: ctx.game });
  await request(app).get(api('/tenir')).set(auth(ctx.adminToken)).expect(200);
  await ouvrirTourEnJeu(request, app, ctx);
  await trouverPage(await zoneId('cz-p1-01'), gnomeA().teamId);
});

test('ouvrir une page qui dort : 409 ; même peuple : lecture sans question ni gain', async () => {
  const dort = await request(app)
    .post(api('/chasse/pages/cz-p1-02/ouvrir'))
    .set(auth(gnomeB().token));
  assert.equal(dort.status, 409);
  assert.equal(dort.body.code, 'PAGE_PAS_TROUVEE');

  const before = await readPlayerBourses(gnomeB().id);
  const res = await request(app)
    .post(api('/chasse/pages/cz-p1-01/ouvrir'))
    .set(auth(gnomeB().token));
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.peutTenir, false);
  assert.equal(res.body.question, null);
  assert.equal(res.body.via, 'tour');
  assert.equal(res.body.feuillet.titre, "Page d'exemple tenir-ex-p1-1");
  assert.deepEqual(await readPlayerBourses(gnomeB().id), before);
  const state = await queryOne(
    'SELECT status FROM gl_game_feuillet_states WHERE game_id = ? AND team_id = ? AND feuillet_code = ?',
    [ctx.game.id, gnomeB().teamId, 'tenir-ex-p1-1'],
  );
  assert.equal(state.status, 'read');
});

test('autre peuple : question de lecture ; « pas encore » ne change rien ; bonne réponse → tenue, +1 ressource aux deux équipes', async () => {
  // Plafond : un membre de Gnomes A à 8 cœurs ne gagne rien de plus.
  await setPlayerBourses(ctx.players[4].id, 8, 3);
  const ouvert = await request(app)
    .post(api('/chasse/pages/cz-p1-01/ouvrir'))
    .set(auth(licorneA().token));
  assert.equal(ouvert.status, 200, JSON.stringify(ouvert.body));
  assert.equal(ouvert.body.peutTenir, true);
  assert.ok(ouvert.body.question?.presentationToken);
  assert.equal(ouvert.body.question.questionCode, 'LECT-cz-p1-01');

  const wrong = ouvert.body.question.choices.find((c) => c.text !== 'Que la forêt respire');
  const avant = {
    licorne: await readPlayerBourses(licorneA().id),
    gnome: await readPlayerBourses(gnomeA().id),
  };
  const raté = await request(app)
    .post(api('/chasse/pages/cz-p1-01/tenir'))
    .set(auth(licorneA().token))
    .send({
      presentationToken: ouvert.body.question.presentationToken,
      questionCode: ouvert.body.question.questionCode,
      choiceId: wrong.id,
    });
  assert.equal(raté.status, 200, JSON.stringify(raté.body));
  assert.equal(raté.body.correct, false);
  assert.match(raté.body.feedback, /^Pas encore/);
  assert.ok(raté.body.question?.presentationToken, 'la question se repose');
  assert.deepEqual(await readPlayerBourses(licorneA().id), avant.licorne);
  assert.deepEqual(await readPlayerBourses(gnomeA().id), avant.gnome);

  const right = raté.body.question.choices.find((c) => c.text === 'Que la forêt respire');
  const tenue = await request(app)
    .post(api('/chasse/pages/cz-p1-01/tenir'))
    .set(auth(licorneA().token))
    .send({
      presentationToken: raté.body.question.presentationToken,
      questionCode: raté.body.question.questionCode,
      choiceId: right.id,
    });
  assert.equal(tenue.status, 200, JSON.stringify(tenue.body));
  assert.equal(tenue.body.correct, true);
  assert.equal(tenue.body.etat, 'tenue');
  assert.equal(tenue.body.kraa.etat, 'page_tenue');
  const apres = {
    licorne: await readPlayerBourses(licorneA().id),
    gnome: await readPlayerBourses(gnomeA().id),
    plafond: await readPlayerBourses(ctx.players[4].id),
    autre: await readPlayerBourses(gnomeB().id),
  };
  assert.equal(apres.licorne.power, avant.licorne.power + 1, 'licorne tenante : +1 gemme');
  assert.equal(apres.licorne.health, avant.licorne.health);
  assert.equal(apres.gnome.health, avant.gnome.health + 1, 'gnome découvreur : +1 cœur');
  assert.equal(apres.plafond.health, 8, 'plafond respecté');
  assert.equal(apres.autre.health, 3, 'les autres équipes ne gagnent rien');

  const evt = await queryOne(
    "SELECT payload_json FROM gl_game_events WHERE game_id = ? AND event_type = 'page_tenue' ORDER BY id DESC LIMIT 1",
    [ctx.game.id],
  );
  const payload = JSON.parse(evt.payload_json);
  assert.equal(payload.tenanteTeamId, licorneA().teamId);
  assert.equal(payload.private, true);
  assert.ok(
    !payload.publicKeys.includes('vitality'),
    'les bourses ne sortent pas du journal public',
  );

  const again = await request(app)
    .post(api('/chasse/pages/cz-p1-01/tenir'))
    .set(auth(licorneB().token))
    .send({ presentationToken: 'x', questionCode: 'LECT-cz-p1-01', choiceId: 0 });
  assert.equal(again.status, 400, 'jeton invalide après la tenue');
});

test('même peuple que la découvreuse : impossible de tenir (409)', async () => {
  await trouverPage(await zoneId('cz-p1-02'), licorneA().teamId);
  const ouvert = await request(app)
    .post(api('/chasse/pages/cz-p1-02/ouvrir'))
    .set(auth(gnomeB().token));
  assert.equal(ouvert.status, 200);
  assert.equal(ouvert.body.peutTenir, true);
  const right = ouvert.body.question.choices.find((c) => c.text === 'Que la forêt respire');
  // Un jeton émis pour Gnomes B ne vaut pas pour Licornes B.
  const vol = await request(app)
    .post(api('/chasse/pages/cz-p1-02/tenir'))
    .set(auth(licorneB().token))
    .send({
      presentationToken: ouvert.body.question.presentationToken,
      questionCode: ouvert.body.question.questionCode,
      choiceId: right.id,
    });
  assert.equal(vol.status, 403);
  assert.equal(vol.body.code, 'JETON_AUTRE_EQUIPE');
});

test('carnet complet : +1 ressource à tout le groupe, voile −3 (jamais sous −1), une seule fois', async () => {
  await execute('UPDATE gl_game_tenir_state SET voile_position = 4 WHERE game_id = ?', [
    ctx.game.id,
  ]);
  const ouvert = await request(app)
    .post(api('/chasse/pages/cz-p1-02/ouvrir'))
    .set(auth(gnomeB().token));
  const right = ouvert.body.question.choices.find((c) => c.text === 'Que la forêt respire');
  const avant = await readPlayerBourses(licorneB().id); // ni découvreuse ni tenante
  const tenue = await request(app)
    .post(api('/chasse/pages/cz-p1-02/tenir'))
    .set(auth(gnomeB().token))
    .send({
      presentationToken: ouvert.body.question.presentationToken,
      questionCode: ouvert.body.question.questionCode,
      choiceId: right.id,
    });
  assert.equal(tenue.status, 200, JSON.stringify(tenue.body));
  const apres = await readPlayerBourses(licorneB().id);
  assert.equal(
    apres.power,
    avant.power + 1,
    'carnet complet : +1 gemme à une licorne hors des deux équipes',
  );
  const state = await queryOne(
    'SELECT voile_position, carnet_complet_at FROM gl_game_tenir_state WHERE game_id = ?',
    [ctx.game.id],
  );
  assert.equal(Number(state.voile_position), 1, '4 − 3');
  assert.ok(state.carnet_complet_at);
  const events = await queryOne(
    "SELECT COUNT(*) AS c FROM gl_game_events WHERE game_id = ? AND event_type = 'carnet_complet'",
    [ctx.game.id],
  );
  assert.equal(Number(events.c), 1);
  const carnet = await request(app).get(api('/chasse/carnet')).set(auth(gnomeA().token));
  assert.equal(carnet.body.tenues, 2);
  assert.ok(carnet.body.carnetCompletAt);
});

test('veillée (tour clos) : la lecture reste ouverte, la limite hebdomadaire de pages tenues est appliquée', async () => {
  await request(app)
    .post(api('/tenir/tour/phase'))
    .set(auth(ctx.adminToken))
    .send({ phase: 'souffle', dort: true })
    .expect(200);
  await request(app)
    .post(api('/tenir/tour/phase'))
    .set(auth(ctx.adminToken))
    .send({ phase: 'clos' })
    .expect(200);
  const lecture = await request(app)
    .post(api('/chasse/pages/cz-p1-01/ouvrir'))
    .set(auth(licorneB().token));
  assert.equal(lecture.status, 200, JSON.stringify(lecture.body));
  assert.equal(lecture.body.via, 'veillee');
  assert.equal(lecture.body.peutTenir, false, 'page déjà tenue : lecture seule');

  // Limite à 0 (réglage global) : une page encore à tenir en veillée est refusée pour cet élève.
  await setGlSetting('gameplay.tenir_pages_veillee_par_semaine', 0);
  await execute(
    "UPDATE gl_game_chasse_pages SET etat = 'trouvee', tenue_par_team_id = NULL, tenue_at = NULL WHERE game_id = ? AND zone_id = ?",
    [ctx.game.id, await zoneId('cz-p1-01')],
  );
  const refus = await request(app)
    .post(api('/chasse/pages/cz-p1-01/ouvrir'))
    .set(auth(licorneB().token));
  assert.equal(refus.status, 409, JSON.stringify(refus.body));
  assert.equal(refus.body.code, 'VEILLEE_LIMITE');
  // Le prof, lui, n'a pas de limite de veillée.
  const mj = await request(app)
    .post(api('/chasse/pages/cz-p1-01/ouvrir'))
    .set(auth(ctx.adminToken))
    .send({ teamId: licorneB().teamId });
  assert.equal(mj.status, 200, JSON.stringify(mj.body));
  await setGlSetting('gameplay.tenir_pages_veillee_par_semaine', 2);
});
