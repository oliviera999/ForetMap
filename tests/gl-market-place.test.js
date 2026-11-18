'use strict';

require('./helpers/setup');
const path = require('node:path');
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const db = require('../database');
const { initSchema, queryOne, queryAll, execute } = db;
const { runImports } = require('../scripts/gl-import-tenir');
const { upsertPlayerFeuilletState } = require('../lib/glLoreFeuillets');
const { getGameplaySettings } = require('../lib/glSettings');
const {
  createTenirGame,
  readPlayerBourses,
  setPlayerBourses,
} = require('./helpers/glTenirFixtures');

const EXEMPLE = path.join(__dirname, '..', 'data', 'gl', 'tenir', 'exemple');
let ctx;
let a;
let b;
let c;
const auth = (p) => ({ Authorization: `Bearer ${p.token}` });

/** Garde-robe d'un élève en base (`gl_player_parures`), la plus ancienne d'abord. */
const gardeRobeEnBase = (playerId) =>
  queryAll(
    'SELECT parure_code, prix, game_id FROM gl_player_parures WHERE player_id = ? ORDER BY id ASC',
    [playerId],
  );

/** Poses d'une parure par un élève sur la mascotte de son équipe (`gl_game_parures`). */
const posesEnBase = (player, code) =>
  queryAll(
    `SELECT id, team_id, ressource, prix, rendue_at FROM gl_game_parures
      WHERE game_id = ? AND achetee_par = ? AND parure_code = ? ORDER BY id ASC`,
    [ctx.game.id, player.id, code],
  );

before(async () => {
  await initSchema();
  // Le Seuil (garde-robe) est une route du voyageur : module ouvert pour cette suite.
  ctx = await createTenirGame({
    stamp: Date.now(),
    settings: { 'modules.voyageur_enabled': true },
  });
  await runImports(db, { fichier: 'parures', dossier: EXEMPLE });
  // a et b dans des équipes différentes, c coéquipier de a.
  a = ctx.players[0];
  b = ctx.players[1];
  c = ctx.players[4];
  assert.equal(a.teamId, c.teamId);
  assert.notEqual(a.teamId, b.teamId);
  for (const p of [a, b, c]) await setPlayerBourses(p.id, 3, 3);
});

test('/classmates : aucune bourse d’une autre équipe, les gemmes de l’équipe visibles, aucun cœur servi (une seule monnaie)', async () => {
  const res = await request(app).get('/api/gl/market/classmates').set(auth(a));
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const rowB = res.body.items.find((m) => m.id === b.id);
  const rowC = res.body.items.find((m) => m.id === c.id);
  assert.ok(rowB && !('healthPoints' in rowB) && !('powerPoints' in rowB));
  assert.ok(rowC, 'le coéquipier est listé');
  assert.equal(rowC.powerPoints, 3, 'les gemmes du coéquipier sont visibles');
  assert.ok(!('healthPoints' in rowC), 'les cœurs ne sont plus servis, même dans l’équipe');
  assert.ok(
    res.body.items.every((m) => !('healthPoints' in m)),
    'aucune ligne de la classe ne porte de cœurs',
  );
  assert.ok(rowB.teamName);
});

test('annonce → réponse → échange pré-rempli → double acceptation ferme l’annonce (en gemmes)', async () => {
  const created = await request(app)
    .post('/api/gl/market/annonces')
    .set(auth(a))
    .send({ type: 'propose', offre: { gemmes: 2 }, cherche: { gemmes: 1 } });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const annonceId = created.body.id;
  assert.deepEqual(created.body.offre, { gemmes: 2, feuillets: [] }, 'aucune clé `coeurs`');
  assert.deepEqual(created.body.cherche, { gemmes: 1, feuillets: [] }, 'aucune clé `coeurs`');
  const empty = await request(app)
    .post('/api/gl/market/annonces')
    .set(auth(a))
    .send({ type: 'cherche', cherche: {} });
  assert.equal(empty.status, 400);
  const list = await request(app).get('/api/gl/market/annonces').set(auth(b));
  assert.ok(list.body.items.some((x) => x.id === annonceId && x.pseudo === a.pseudo));
  const own = await request(app).post(`/api/gl/market/annonces/${annonceId}/repondre`).set(auth(a));
  assert.equal(own.status, 409);

  const trade = await request(app)
    .post(`/api/gl/market/annonces/${annonceId}/repondre`)
    .set(auth(b));
  assert.equal(trade.status, 201, JSON.stringify(trade.body));
  const sideA = trade.body.sides.find((s) => s.playerId === a.id);
  const sideB = trade.body.sides.find((s) => s.playerId === b.id);
  assert.equal(sideA.offerPower, 2, 'offre de l’auteur pré-remplie');
  assert.equal(sideB.offerPower, 1, 'côté du répondant pré-rempli');
  for (const side of [sideA, sideB]) {
    assert.ok(!('offerHealth' in side), 'un échange « Tenir » ne sert aucune offre en cœurs');
    assert.ok(!('healthPoints' in side), 'un échange « Tenir » ne sert aucune bourse de cœurs');
  }
  const linked = await queryOne('SELECT trade_id, statut FROM gl_market_annonces WHERE id = ?', [
    annonceId,
  ]);
  assert.equal(Number(linked.trade_id), trade.body.id);

  const accA = await request(app)
    .patch(`/api/gl/market/trades/${trade.body.id}/accept`)
    .set(auth(a))
    .send({ accepted: true });
  assert.equal(accA.status, 200, JSON.stringify(accA.body));
  const accB = await request(app)
    .patch(`/api/gl/market/trades/${trade.body.id}/accept`)
    .set(auth(b))
    .send({ accepted: true });
  assert.equal(accB.status, 200, JSON.stringify(accB.body));
  // Les gemmes changent de main ; les cœurs, eux, ne bougent pas.
  assert.deepEqual(await readPlayerBourses(a.id), { health: 3, power: 2 });
  assert.deepEqual(await readPlayerBourses(b.id), { health: 3, power: 4 });
  const closed = await queryOne('SELECT statut FROM gl_market_annonces WHERE id = ?', [annonceId]);
  assert.equal(closed.statut, 'conclue');
});

test('une seule monnaie : annonce, don et offre en cœurs refusés (409), même si `market_hearts_enabled` est vrai', async () => {
  assert.equal(
    (await getGameplaySettings()).marketHeartsEnabled,
    true,
    'le réglage du jeu classique est ouvert : le refus vient bien de la classe « Tenir »',
  );
  await setPlayerBourses(a.id, 3, 3);
  await setPlayerBourses(b.id, 3, 3);
  const annoncesAvant = await queryOne(
    'SELECT COUNT(*) AS n FROM gl_market_annonces WHERE class_id = ?',
    [ctx.cls.id],
  );
  const corps = [
    { type: 'propose', offre: { gemmes: 1 }, cherche: { coeurs: 1 } },
    { type: 'propose', offre: { coeurs: 1 }, cherche: { gemmes: 1 } },
    { type: 'offre', offre: { coeurs: 1 } },
    { type: 'cherche', cherche: { coeurs: 1 } },
  ];
  for (const body of corps) {
    const res = await request(app).post('/api/gl/market/annonces').set(auth(a)).send(body);
    assert.equal(res.status, 409, `${JSON.stringify(body)} → ${JSON.stringify(res.body)}`);
    assert.match(res.body.error, /que des gemmes et des pages/);
    assert.doesNotMatch(res.body.error, /c[œo]eur/i, 'le refus ne nomme pas les cœurs');
  }
  const annoncesApres = await queryOne(
    'SELECT COUNT(*) AS n FROM gl_market_annonces WHERE class_id = ?',
    [ctx.cls.id],
  );
  assert.equal(Number(annoncesApres.n), Number(annoncesAvant.n), 'aucune annonce en cœurs posée');

  const don = await request(app)
    .post('/api/gl/market/dons')
    .set(auth(a))
    .send({ receveurId: b.id, coeurs: 1 });
  assert.equal(don.status, 409, JSON.stringify(don.body));
  assert.match(don.body.error, /que des gemmes et des pages/);

  const trade = await request(app)
    .post('/api/gl/market/trades')
    .set(auth(a))
    .send({ peerPlayerId: b.id });
  assert.equal(trade.status, 201, JSON.stringify(trade.body));
  const enCoeurs = await request(app)
    .patch(`/api/gl/market/trades/${trade.body.id}/offer`)
    .set(auth(a))
    .send({ offerHealth: 1, offerPower: 0 });
  assert.equal(enCoeurs.status, 409, JSON.stringify(enCoeurs.body));
  assert.match(enCoeurs.body.error, /que des gemmes et des pages/);
  const enGemmes = await request(app)
    .patch(`/api/gl/market/trades/${trade.body.id}/offer`)
    .set(auth(a))
    .send({ offerHealth: 0, offerPower: 1 });
  assert.equal(enGemmes.status, 200, JSON.stringify(enGemmes.body));
  const side = await queryOne(
    'SELECT offer_health, offer_power FROM gl_market_trade_sides WHERE trade_id = ? AND player_id = ?',
    [trade.body.id, a.id],
  );
  assert.equal(Number(side.offer_health), 0, 'aucun cœur n’est entré dans l’échange');
  assert.equal(Number(side.offer_power), 1);
  const lu = await request(app).get(`/api/gl/market/trades/${trade.body.id}`).set(auth(b));
  assert.equal(lu.status, 200, JSON.stringify(lu.body));
  assert.ok(lu.body.sides.every((s) => !('offerHealth' in s) && !('healthPoints' in s)));
  const cancel = await request(app)
    .post(`/api/gl/market/trades/${trade.body.id}/cancel`)
    .set(auth(a));
  assert.equal(cancel.status, 200, JSON.stringify(cancel.body));
  // Rien n'a bougé : ni cœurs, ni gemmes.
  assert.deepEqual(await readPlayerBourses(a.id), { health: 3, power: 3 });
  assert.deepEqual(await readPlayerBourses(b.id), { health: 3, power: 3 });
});

test('don : une ressource à la fois, plafond du receveur, surplus au donneur, événement `don`', async () => {
  await setPlayerBourses(a.id, 3, 5);
  await setPlayerBourses(b.id, 3, 7);
  const both = await request(app)
    .post('/api/gl/market/dons')
    .set(auth(a))
    .send({ receveurId: b.id, gemmes: 1, coeurs: 1 });
  assert.equal(both.status, 400);
  const don = await request(app)
    .post('/api/gl/market/dons')
    .set(auth(a))
    .send({ receveurId: b.id, gemmes: 3 });
  assert.equal(don.status, 201, JSON.stringify(don.body));
  assert.equal(don.body.transferred, 1);
  assert.equal(don.body.surplus, 2);
  assert.deepEqual(await readPlayerBourses(a.id), { health: 3, power: 4 });
  assert.deepEqual(await readPlayerBourses(b.id), { health: 3, power: 8 });
  const full = await request(app)
    .post('/api/gl/market/dons')
    .set(auth(a))
    .send({ receveurId: b.id, gemmes: 1 });
  assert.equal(full.status, 409);
  const evt = await queryOne(
    "SELECT payload_json FROM gl_game_events WHERE game_id = ? AND event_type = 'don' ORDER BY id DESC LIMIT 1",
    [ctx.game.id],
  );
  assert.equal(JSON.parse(evt.payload_json).gemmes, 1);
  const row = await queryOne(
    'SELECT gemmes, coeurs FROM gl_market_dons WHERE donneur_id = ? ORDER BY id DESC LIMIT 1',
    [a.id],
  );
  assert.equal(Number(row.gemmes), 1);
});

test('don d’une page : copie à l’équipe du receveur, le découvreur garde son nom', async () => {
  await upsertPlayerFeuilletState(db, {
    playerId: a.id,
    feuilletCode: 'tenir-ex-p1-1',
    status: 'discovered',
    discoveredByName: 'Équipe A',
  });
  const don = await request(app)
    .post('/api/gl/market/dons')
    .set(auth(a))
    .send({ receveurId: b.id, feuilletCode: 'tenir-ex-p1-1' });
  assert.equal(don.status, 201, JSON.stringify(don.body));
  const teamState = await queryOne(
    'SELECT status, discovered_by_name FROM gl_game_feuillet_states WHERE game_id = ? AND team_id = ? AND feuillet_code = ?',
    [ctx.game.id, b.teamId, 'tenir-ex-p1-1'],
  );
  assert.ok(teamState);
  assert.equal(teamState.discovered_by_name, 'Équipe A');
  const personal = await queryOne(
    'SELECT status FROM gl_player_feuillet_states WHERE player_id = ? AND feuillet_code = ?',
    [b.id, 'tenir-ex-p1-1'],
  );
  assert.ok(personal);
});

// Parures (ensemble unifié, M19) : `achetee` et `autre` sont partagées par les cas qui suivent.
let achetee;
let autre;

test('parure : payée en gemmes seulement, entre dans la garde-robe et se pose sur la mascotte ; asset null = achetable en pastille (C10)', async () => {
  await setPlayerBourses(a.id, 3, 8);
  const list = await request(app).get('/api/gl/market/parures').set(auth(a));
  assert.equal(list.status, 200, JSON.stringify(list.body));
  const buyable = list.body.catalogue.find((p) => p.disponible);
  const sansImage = list.body.catalogue.find((p) => !p.asset);
  assert.ok(buyable && sansImage);
  assert.equal(sansImage.achetable, true, 'une parure sans image reste achetable');
  assert.equal(sansImage.typeEffectif, 'pastille');
  assert.ok(sansImage.pastille?.texte, 'pastille texte (initiale) tant que l’asset est nul');
  assert.ok(
    list.body.catalogue.every((p) => p.ressource === 'gemmes'),
    'tout le comptoir se paie en gemmes',
  );
  assert.ok(
    list.body.catalogue.every((p) => p.acquise === false),
    'rien n’est encore acquis',
  );
  assert.deepEqual(list.body.gardeRobe, [], 'garde-robe vide avant le premier achat');
  achetee = buyable;
  autre = list.body.catalogue.find((p) => p.disponible && p.code !== buyable.code);
  assert.ok(autre, 'une deuxième parure disponible au comptoir');

  // Une parure ne se paie pas en cœurs : 400, rien n'est débité, rien n'entre dans la garde-robe.
  const enCoeurs = await request(app)
    .post(`/api/gl/market/parures/${buyable.code}/acheter`)
    .set(auth(a))
    .send({ ressource: 'coeurs' });
  assert.equal(enCoeurs.status, 400, JSON.stringify(enCoeurs.body));
  assert.match(enCoeurs.body.error, /gemmes/);
  assert.deepEqual(await readPlayerBourses(a.id), { health: 3, power: 8 });
  assert.deepEqual(await gardeRobeEnBase(a.id), []);
  assert.deepEqual(await posesEnBase(a, buyable.code), []);

  const bought = await request(app)
    .post(`/api/gl/market/parures/${buyable.code}/acheter`)
    .set(auth(a))
    .send({ ressource: 'gemmes' });
  assert.equal(bought.status, 201, JSON.stringify(bought.body));
  assert.equal(bought.body.teamId, a.teamId);
  assert.equal(bought.body.ressource, 'gemmes');
  assert.equal(bought.body.prix, buyable.prix);
  // Le membre est débité en gemmes ; ses cœurs ne bougent pas.
  assert.deepEqual(await readPlayerBourses(a.id), { health: 3, power: 8 - buyable.prix });
  const ligne = await queryOne(
    `SELECT delta_health, delta_power, cause FROM gl_resource_ledger
      WHERE player_id = ? AND game_id = ? ORDER BY id DESC LIMIT 1`,
    [a.id, ctx.game.id],
  );
  assert.equal(ligne.cause, 'parure', 'l’achat est au grand livre');
  assert.equal(Number(ligne.delta_power), -buyable.prix);
  assert.equal(Number(ligne.delta_health), 0);

  // Garde-robe de l'élève (`gl_player_parures`) + pose sur la mascotte (`gl_game_parures`).
  const garde = await gardeRobeEnBase(a.id);
  assert.equal(garde.length, 1);
  assert.equal(garde[0].parure_code, buyable.code);
  assert.equal(Number(garde[0].prix), buyable.prix);
  assert.equal(Number(garde[0].game_id), Number(ctx.game.id));
  const poses = await posesEnBase(a, buyable.code);
  assert.equal(poses.length, 1);
  assert.equal(Number(poses[0].team_id), a.teamId);
  assert.equal(poses[0].ressource, 'gemmes');
  assert.equal(poses[0].rendue_at, null, 'posée aussitôt sur la mascotte');

  const worn = await request(app).get('/api/gl/market/parures').set(auth(c));
  assert.ok(
    worn.body.portees.some((p) => p.code === buyable.code),
    'portée par l’équipe de a (vue de c)',
  );
  const other = await request(app).get('/api/gl/market/parures').set(auth(b));
  assert.ok(!other.body.portees.some((p) => p.code === buyable.code));
});

test('parure : `GET /parures` rend `gardeRobe` (avec `posee`) et `acquise` au catalogue, pour l’acheteur seulement', async () => {
  const mine = await request(app).get('/api/gl/market/parures').set(auth(a));
  assert.equal(mine.status, 200, JSON.stringify(mine.body));
  assert.equal(mine.body.gardeRobe.length, 1);
  const piece = mine.body.gardeRobe[0];
  assert.equal(piece.code, achetee.code);
  assert.equal(piece.nom, achetee.nom);
  assert.equal(piece.posee, true, 'achetée, donc posée');
  assert.ok(piece.acquiseLe, 'date d’acquisition servie');
  assert.equal(mine.body.peutPoser, true);
  assert.equal(mine.body.teamId, a.teamId);
  for (const p of mine.body.catalogue) {
    assert.equal(p.acquise, p.code === achetee.code, `acquise (${p.code})`);
  }
  // La garde-robe est personnelle : le coéquipier voit la parure portée, pas « acquise ».
  const coequipier = await request(app).get('/api/gl/market/parures').set(auth(c));
  assert.deepEqual(coequipier.body.gardeRobe, []);
  assert.ok(coequipier.body.catalogue.every((p) => p.acquise === false));
  assert.ok(coequipier.body.portees.some((p) => p.code === achetee.code));
});

test('parure : ne se rachète pas (409 PARURE_DEJA_ACQUISE) ; pas assez de gemmes → 409, sans toucher aux cœurs', async () => {
  await setPlayerBourses(a.id, 8, 8);
  const encore = await request(app)
    .post(`/api/gl/market/parures/${achetee.code}/acheter`)
    .set(auth(a))
    .send({ ressource: 'gemmes' });
  assert.equal(encore.status, 409, JSON.stringify(encore.body));
  assert.match(encore.body.error, /garde-robe/);
  assert.deepEqual(await readPlayerBourses(a.id), { health: 8, power: 8 }, 'rien n’est débité');
  assert.equal((await gardeRobeEnBase(a.id)).length, 1);
  assert.equal((await posesEnBase(a, achetee.code)).length, 1);

  // Bourse de gemmes vide, cœurs au plafond : les cœurs ne paient rien.
  await setPlayerBourses(a.id, 8, autre.prix - 1);
  const pauvre = await request(app)
    .post(`/api/gl/market/parures/${autre.code}/acheter`)
    .set(auth(a))
    .send({ ressource: 'gemmes' });
  assert.equal(pauvre.status, 409, JSON.stringify(pauvre.body));
  assert.match(pauvre.body.error, /gemmes/);
  assert.deepEqual(await readPlayerBourses(a.id), { health: 8, power: autre.prix - 1 });
  assert.equal((await gardeRobeEnBase(a.id)).length, 1, 'la deuxième parure n’est pas acquise');
  assert.deepEqual(await posesEnBase(a, autre.code), []);
});

test('garde-robe au Seuil : lire, ranger, reposer (idempotent) ; 404 pour une parure qu’on ne possède pas', async () => {
  const seuil = await request(app).get('/api/gl/voyageur/garde-robe').set(auth(a));
  assert.equal(seuil.status, 200, JSON.stringify(seuil.body));
  assert.deepEqual(
    seuil.body.parures.map((p) => ({ code: p.code, posee: p.posee })),
    [{ code: achetee.code, posee: true }],
  );
  assert.equal(seuil.body.peutPoser, true);
  assert.equal(seuil.body.teamId, a.teamId);
  assert.equal(seuil.body.gameId, Number(ctx.game.id));
  const vide = await request(app).get('/api/gl/voyageur/garde-robe').set(auth(b));
  assert.equal(vide.status, 200, JSON.stringify(vide.body));
  assert.deepEqual(vide.body.parures, [], 'la garde-robe d’un autre élève reste vide');

  // Ranger : la parure quitte la mascotte, elle reste à l'élève.
  const range = await request(app)
    .post(`/api/gl/voyageur/garde-robe/${achetee.code}/ranger`)
    .set(auth(a));
  assert.equal(range.status, 200, JSON.stringify(range.body));
  assert.equal(range.body.posee, false);
  assert.equal(range.body.code, achetee.code);
  const apresRangement = await request(app).get('/api/gl/voyageur/garde-robe').set(auth(a));
  assert.deepEqual(
    apresRangement.body.parures.map((p) => ({ code: p.code, posee: p.posee })),
    [{ code: achetee.code, posee: false }],
  );
  const vueC = await request(app).get('/api/gl/market/parures').set(auth(c));
  assert.ok(
    !vueC.body.portees.some((p) => p.code === achetee.code),
    'la mascotte ne la porte plus',
  );
  assert.equal((await gardeRobeEnBase(a.id)).length, 1, 'rangée, elle reste dans la garde-robe');
  // Ranger une parure déjà rangée ne casse rien.
  const rangeEncore = await request(app)
    .post(`/api/gl/voyageur/garde-robe/${achetee.code}/ranger`)
    .set(auth(a));
  assert.equal(rangeEncore.status, 200, JSON.stringify(rangeEncore.body));
  assert.equal(rangeEncore.body.posee, false);
  // Rangée, elle reste acquise : elle ne se rachète toujours pas.
  await setPlayerBourses(a.id, 3, 8);
  const rachat = await request(app)
    .post(`/api/gl/market/parures/${achetee.code}/acheter`)
    .set(auth(a))
    .send({ ressource: 'gemmes' });
  assert.equal(rachat.status, 409, JSON.stringify(rachat.body));
  assert.deepEqual(await readPlayerBourses(a.id), { health: 3, power: 8 });

  // Poser : gratuit, et rejouer le geste ne pose rien de plus.
  const pose = await request(app)
    .post(`/api/gl/voyageur/garde-robe/${achetee.code}/poser`)
    .set(auth(a));
  assert.equal(pose.status, 200, JSON.stringify(pose.body));
  assert.equal(pose.body.posee, true);
  assert.equal(pose.body.deja, false);
  assert.equal(pose.body.teamId, a.teamId);
  const poseEncore = await request(app)
    .post(`/api/gl/voyageur/garde-robe/${achetee.code}/poser`)
    .set(auth(a));
  assert.equal(poseEncore.status, 200, JSON.stringify(poseEncore.body));
  assert.equal(poseEncore.body.posee, true);
  assert.equal(poseEncore.body.deja, true, 'idempotent');
  const poses = await posesEnBase(a, achetee.code);
  assert.equal(poses.filter((p) => p.rendue_at == null).length, 1, 'une seule pose en cours');
  assert.deepEqual(await readPlayerBourses(a.id), { health: 3, power: 8 }, 'poser ne coûte rien');
  const reposee = await request(app).get('/api/gl/market/parures').set(auth(c));
  assert.equal(
    reposee.body.portees.filter((p) => p.code === achetee.code).length,
    1,
    'de nouveau portée par la mascotte, une seule fois',
  );
  const apresPose = await request(app).get('/api/gl/voyageur/garde-robe').set(auth(a));
  assert.equal(apresPose.body.parures[0].posee, true);

  // Une parure qu'on ne possède pas : 404, que l'on pose ou que l'on range.
  const refus = [
    [a, autre.code, 'poser'],
    [a, autre.code, 'ranger'],
    [b, achetee.code, 'poser'],
    [b, achetee.code, 'ranger'],
    [a, 'parure_inconnue', 'poser'],
  ];
  for (const [joueur, code, geste] of refus) {
    const res = await request(app)
      .post(`/api/gl/voyageur/garde-robe/${code}/${geste}`)
      .set(auth(joueur));
    assert.equal(res.status, 404, `${geste} ${code} → ${JSON.stringify(res.body)}`);
    assert.equal(res.body.code, 'PARURE_PAS_A_TOI');
  }
  assert.deepEqual(await posesEnBase(a, autre.code), []);
  assert.deepEqual(await posesEnBase(b, achetee.code), []);
});

test('retrait → 403 MARCHE_RETRAIT sur toute route du Marché', async () => {
  await execute(
    'INSERT INTO gl_game_retraits (game_id, player_id, motif, entree_at) VALUES (?, ?, NULL, NOW())',
    [ctx.game.id, c.id],
  );
  const res = await request(app).get('/api/gl/market/annonces').set(auth(c));
  assert.equal(res.status, 403);
  assert.equal(res.body.code, 'MARCHE_RETRAIT');
  await execute('UPDATE gl_game_retraits SET sortie_at = NOW() WHERE player_id = ?', [c.id]);
});

test('escalier du chapitre 1 : Marché fermé jusqu’à la séance 4 (403 MARCHE_FERME), puis ouvert', async () => {
  const escalier = (pas) =>
    execute('UPDATE gl_games SET tenir_overrides_json = ? WHERE id = ?', [
      pas ? JSON.stringify({ escalier: true, escalier_pas: pas }) : null,
      ctx.game.id,
    ]);
  for (const pas of [1, 2, 3]) {
    await escalier(pas);
    const res = await request(app).get('/api/gl/market/annonces').set(auth(a));
    assert.equal(res.status, 403, `séance ${pas}`);
    assert.equal(res.body.code, 'MARCHE_FERME');
  }
  await escalier(4);
  assert.equal((await request(app).get('/api/gl/market/annonces').set(auth(a))).status, 200);
  await escalier(null);
});
