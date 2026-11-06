'use strict';

/**
 * « Tenir à deux » v2 — Bestiaire des chimères, missions, badges (prof), plumes et Olu par
 * les routes `/tenir/*` (spec § 12–13). Fixtures anonymes.
 */

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const db = require('../database');
const { initSchema, execute, queryOne, withTransaction } = db;
const { createTenirGame, importExempleChasse } = require('./helpers/glTenirFixtures');
const { proposerPlumeTx } = require('../lib/glVoyageurPlume');

let ctx;
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const api = (path) => `/api/gl/games/${ctx.game.id}${path}`;

before(async () => {
  await initSchema();
  ctx = await createTenirGame({ stamp: Date.now() });
  await importExempleChasse(db, { game: ctx.game });
  await request(app).get(api('/tenir')).set(auth(ctx.adminToken)).expect(200);
  await execute(
    `INSERT INTO gl_tenir_missions (id, texte, type, titre_sceau, actif) VALUES ('mis-chim', 'Mission test', 'absurde', 'Société des Rimes Approximatives', 1) ON DUPLICATE KEY UPDATE actif = 1`,
  );
  await execute(
    `INSERT INTO gl_tenir_badges (code, nom, regle_type, seuil, source, actif) VALUES ('correcteur_du_renard', 'Correcteur du renard', 'saisie_prof', 1, 'olu_corrections', 1)
     ON DUPLICATE KEY UPDATE regle_type = 'saisie_prof', actif = 1`,
  );
});

test('chimères : un élève propose (visible de lui et du prof seulement), le prof valide → visible de tous ; mots interdits refusés', async () => {
  const bad = await request(app)
    .post(api('/tenir/chimeres'))
    .set(auth(ctx.players[0].token))
    .send({ nom: 'Le corbeau de minuit', histoire: 'Une histoire assez longue pour passer.' });
  assert.equal(bad.status, 400, JSON.stringify(bad.body));

  const res = await request(app).post(api('/tenir/chimeres')).set(auth(ctx.players[0].token)).send({
    nom: 'Le Lièvre-Lanterne',
    histoire: 'Un lièvre qui éclaire les sentiers la nuit, sans jamais se tromper de direction.',
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(res.body.chimere.statut, 'proposee');
  const id = res.body.chimere.id;

  const autre = await request(app).get(api('/tenir/chimeres')).set(auth(ctx.players[1].token));
  assert.equal(autre.body.chimeres.length, 0, 'invisible des autres tant que non validée');
  const auteur = await request(app).get(api('/tenir/chimeres')).set(auth(ctx.players[0].token));
  assert.equal(auteur.body.chimeres.length, 1);

  const validee = await request(app)
    .put(api(`/tenir/chimeres/${id}`))
    .set(auth(ctx.adminToken))
    .send({ decision: 'valider' });
  assert.equal(validee.status, 200, JSON.stringify(validee.body));
  assert.equal(validee.body.chimere.statut, 'validee');
  const tous = await request(app).get(api('/tenir/chimeres')).set(auth(ctx.players[1].token));
  assert.equal(tous.body.chimeres.length, 1);
  assert.equal(
    tous.body.chimeres[0].proposeeParPlayerId,
    undefined,
    'identifiant d’élève non servi',
  );
  const evt = await queryOne(
    "SELECT id FROM gl_game_events WHERE game_id = ? AND event_type = 'chimere_validee'",
    [ctx.game.id],
  );
  assert.ok(evt);
  const refus = await request(app)
    .put(api(`/tenir/chimeres/${id}`))
    .set(auth(ctx.players[0].token))
    .send({ decision: 'valider' });
  assert.equal(refus.status, 403);
});

test('mission réussie (prof) : sceau + titre aux membres, une seule fois ; badge prof ; honneurs lisibles', async () => {
  const team = ctx.teams[1];
  const res = await request(app)
    .post(api('/tenir/missions'))
    .set(auth(ctx.adminToken))
    .send({ teamId: team.id, missionCode: 'mis-chim' });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(res.body.titre, 'Société des Rimes Approximatives');
  const again = await request(app)
    .post(api('/tenir/missions'))
    .set(auth(ctx.adminToken))
    .send({ teamId: team.id, missionCode: 'mis-chim' });
  assert.equal(again.status, 409);
  const titre = await queryOne(
    "SELECT libelle FROM gl_player_titres WHERE player_id = ? AND famille = 'mission'",
    [ctx.players[1].id],
  );
  assert.equal(titre.libelle, 'Société des Rimes Approximatives');
  const joueur = await request(app)
    .post(api('/tenir/missions'))
    .set(auth(ctx.players[1].token))
    .send({ teamId: team.id, missionCode: 'mis-chim' });
  assert.equal(joueur.status, 403);

  const badge = await request(app)
    .post(api('/tenir/badges'))
    .set(auth(ctx.adminToken))
    .send({ playerId: ctx.players[2].id, badgeCode: 'correcteur_du_renard' });
  assert.equal(badge.status, 201, JSON.stringify(badge.body));
  const badgeAgain = await request(app)
    .post(api('/tenir/badges'))
    .set(auth(ctx.adminToken))
    .send({ playerId: ctx.players[2].id, badgeCode: 'correcteur_du_renard' });
  assert.equal(badgeAgain.status, 200);
  assert.equal(badgeAgain.body.awarded, false);

  const honneurs = await request(app).get(api('/tenir/honneurs')).set(auth(ctx.players[0].token));
  assert.equal(honneurs.status, 200);
  assert.ok(honneurs.body.honneurs.some((h) => h.honneur === 'mission'));
  assert.equal(honneurs.body.apercu, undefined, 'l’aperçu est réservé au prof');
  const missions = await request(app).get(api('/tenir/missions')).set(auth(ctx.players[0].token));
  assert.equal(missions.body.missions.length, 0, 'le catalogue (secret) reste au prof');
  assert.equal(missions.body.reussies.length, 1);
});

test('plume : proposée par l’élève, validée par le prof → page vierge au carnet de la classe', async () => {
  const author = ctx.players[2];
  const plume = await withTransaction((tx) =>
    proposerPlumeTx(tx, {
      playerId: author.id,
      gameId: ctx.game.id,
      titre: 'La page du vent',
      texte: 'Le vent a plié les herbes vers la rivière, et les herbes ont montré le chemin.',
    }),
  );
  const list = await request(app).get(api('/tenir/plumes')).set(auth(ctx.adminToken));
  assert.ok(list.body.plumes.some((p) => p.id === plume.id && p.statut === 'proposee'));
  const other = await request(app).get(api('/tenir/plumes')).set(auth(ctx.players[0].token));
  assert.equal(other.body.plumes.length, 0, 'un élève ne voit que ses propres plumes');

  const ok = await request(app)
    .put(api(`/tenir/plumes/${plume.id}`))
    .set(auth(ctx.adminToken))
    .send({ decision: 'valider' });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(ok.body.feuilletCode, `plume-${plume.id}`);
  const feuillet = await queryOne(
    'SELECT type, vierge, statut FROM gl_lore_feuillets WHERE feuillet_code = ?',
    [ok.body.feuilletCode],
  );
  assert.equal(feuillet.type, 'vierge');
  assert.equal(Number(feuillet.vierge), 1);
  const states = await queryOne(
    'SELECT COUNT(*) AS c FROM gl_game_feuillet_states WHERE game_id = ? AND feuillet_code = ?',
    [ctx.game.id, ok.body.feuilletCode],
  );
  assert.equal(Number(states.c), 4, 'visible des quatre équipes');
  const again = await request(app)
    .put(api(`/tenir/plumes/${plume.id}`))
    .set(auth(ctx.adminToken))
    .send({ decision: 'valider' });
  assert.equal(again.status, 409);
});

test('Olu : GET /tenir/olu sert les lignes et la table événement → moment', async () => {
  const res = await request(app).get(api('/tenir/olu')).set(auth(ctx.players[0].token));
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.lignes));
  assert.equal(res.body.moments.fouille, 'fouille');
  assert.equal(res.body.moments.chapardeur, 'oiseau');
  assert.ok(
    res.body.lignes.every((l) => l.correction === undefined),
    'la correction n’est jamais servie d’avance',
  );
});
