'use strict';

/**
 * Ensemble unifié, PR 4 — « une seule monnaie, les gemmes » (M1, M19), ce que les autres suites
 * ne couvrent pas : coût d'un sort (toujours en gemmes, anciennes valeurs comprises), drapeau
 * `monnaieUnique` servi à l'écran, but de l'année (la Consécration, grisée), chapardeur et nid en
 * gemmes, journal sans cœurs, Marché d'une classe « Tenir » (ce qui parlait de cœurs se ferme
 * seul), chargeurs des catalogues (parures de 2 à 8, rares ; sorts en gemmes ; réglage retiré).
 * Fixtures anonymes.
 */

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const request = require('supertest');
const { app } = require('../server');
const db = require('../database');
const { initSchema, execute, queryOne, queryAll, withTransaction } = db;
const {
  createTenirGame,
  readPlayerBourses,
  setPlayerBourses,
} = require('./helpers/glTenirFixtures');
const { createGlClass, createGlPlayer, signTokens } = require('./helpers/glFixtures');
const { resolveRequired } = require('../lib/glSpellCast');
const { chapardeurTx, rendreNidTx } = require('../lib/glChapardeur');
const { presentTenirJournalEvent } = require('../lib/glJournalPresentTenir');
const { butDeLAnnee } = require('../lib/glButDeLAnnee');
const { classeJoueTenir, gemmesDelta } = require('../lib/glTenir');
const { getGameplaySettings } = require('../lib/glSettings');
const { importParures, importSorts, importReglagesDefaut } = require('../lib/glTenirImport');

const EXEMPLE = path.join(__dirname, '..', 'data', 'gl', 'tenir', 'exemple');
const REEL = path.join(__dirname, '..', 'data', 'gl', 'tenir');
const lire = (dossier, nom) =>
  JSON.parse(fs.readFileSync(path.join(dossier, `${nom}.json`), 'utf8'));

let ctx;
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const membres = (teamId) => ctx.players.filter((p) => p.teamId === Number(teamId));

before(async () => {
  await initSchema();
  ctx = await createTenirGame({ stamp: Date.now() });
  await request(app).get(`/api/gl/games/${ctx.game.id}/tenir`).set(auth(ctx.adminToken));
});

test('coût d’un sort « Tenir » : toujours en gemmes, quels que soient le peuple et l’ancienne ressource', () => {
  for (const ressource of ['gemmes', 'coeurs', 'peuple', 'choix', 'pacte', null, undefined]) {
    assert.deepEqual(
      resolveRequired({ tenirV2: true, cout: 3, ressource }),
      { gems: 3, hearts: 0 },
      `ressource ${ressource}`,
    );
  }
  // Sort de classe (`cartes`) : aucune bourse. Sort du jeu classique : son coût d'origine.
  assert.deepEqual(resolveRequired({ tenirV2: true, cout: 0, ressource: 'cartes' }), {
    gems: 0,
    hearts: 0,
  });
  assert.deepEqual(resolveRequired({ tenirV2: false, required: { gems: 1, hearts: 2 } }), {
    gems: 1,
    hearts: 2,
  });
  assert.deepEqual(gemmesDelta(2), { healthDelta: 0, powerDelta: 2 });
});

test('catalogues réels : tout sort se paie en gemmes ; parures de 2 à 8 gemmes, deux ou trois rares, sans ressource', () => {
  const sorts = lire(REEL, 'sorts');
  assert.deepEqual(Object.keys(sorts.vocabulaire.ressource).sort(), ['cartes', 'gemmes']);
  for (const s of sorts.sorts) {
    if (s.peuple === 'classe') continue;
    assert.equal(s.ressource, 'gemmes', s.code);
  }
  const cordee = sorts.sorts.find((s) => s.code === 'SL045');
  assert.deepEqual(
    { cout: cordee.cout, paye: cordee.effet_auto_json.paye },
    { cout: 4, paye: 'lanceuse' },
  );
  assert.doesNotMatch(JSON.stringify(sorts.sorts), /c[œo]eurs?\b/i, 'aucun cœur dans le grimoire');

  const parures = lire(REEL, 'parures').parures;
  assert.ok(parures.every((p) => p.prix >= 2 && p.prix <= 8 && !('ressource' in p)));
  assert.equal(Math.min(...parures.map((p) => p.prix)), 2);
  assert.equal(Math.max(...parures.map((p) => p.prix)), 8);
  const rares = parures.filter((p) => p.rare === true);
  assert.ok(rares.length >= 2 && rares.length <= 3, `${rares.length} parures rares`);
  assert.ok(rares.every((p) => p.prix >= 6));
  assert.deepEqual(rares.map((p) => p.pelage).sort(), ['bestiaire', 'neon']);

  const reglages = lire(REEL, 'reglages-defaut').defaut;
  assert.equal(reglages.max_power_points, 8);
  assert.ok(!('max_health_points' in reglages), 'le plafond des cœurs a quitté les réglages');
});

test('chargeurs : une parure hors 2-8, « rare » à bas prix ou payée en cœurs est refusée ; un sort en cœurs aussi ; max_health_points est ignoré et signalé', async () => {
  const parures = lire(EXEMPLE, 'parures');
  parures.parures[0].prix = 9;
  parures.parures[1].rare = true; // prix 2 : pas une parure rare
  parures.parures[2].ressource = 'coeurs';
  const rep = await importParures(db, parures, { dryRun: true });
  const erreurs = rep.errors.join('\n');
  assert.match(erreurs, /prix hors 2-8/);
  assert.match(erreurs, /rare coûte 6 ou plus/);
  assert.match(erreurs, /se paie en gemmes/);

  const ok = await importParures(db, lire(EXEMPLE, 'parures'), { dryRun: false });
  assert.deepEqual(ok.errors, []);
  const ligne = await queryOne(
    'SELECT ressource, rare FROM gl_tenir_parures WHERE code = ? LIMIT 1',
    [lire(EXEMPLE, 'parures').parures[0].code],
  );
  assert.deepEqual({ r: ligne.ressource, rare: Number(ligne.rare) }, { r: 'gemmes', rare: 0 });

  const sorts = lire(EXEMPLE, 'sorts');
  sorts.sorts[0].ressource = 'coeurs';
  sorts.sorts[1].ressource = 'choix';
  const repSorts = await importSorts(db, sorts, { dryRun: true });
  assert.equal((repSorts.errors.join('\n').match(/ressource inconnue/g) || []).length, 2);

  const reglages = lire(EXEMPLE, 'reglages-defaut');
  reglages.defaut.max_health_points = 8;
  const repReglages = await importReglagesDefaut(db, reglages, { dryRun: true, strict: true });
  assert.deepEqual(repReglages.errors, [], 'un réglage retiré ne bloque pas, même en strict');
  assert.match(repReglages.warnings.join('\n'), /max_health_points est retiré/);
});

test('`monnaieUnique` : vrai pour l’élève d’une classe « Tenir » et pour le prof ; faux pour une classe sans partie ; les cœurs du Marché ne sont jamais annoncés échangeables', async () => {
  const settings = await getGameplaySettings({ forceRefresh: true });
  assert.equal(await classeJoueTenir({ queryOne }, ctx.cls.id, settings), true);
  const eleve = await request(app).get('/api/gl/gameplay-settings').set(auth(ctx.players[0].token));
  assert.equal(eleve.status, 200, JSON.stringify(eleve.body));
  assert.equal(eleve.body.settings.monnaieUnique, true);
  assert.equal(eleve.body.settings.marketHeartsEnabled, false, 'réglage classique sans effet');
  const prof = await request(app).get('/api/gl/gameplay-settings').set(auth(ctx.adminToken));
  assert.equal(prof.body.settings.monnaieUnique, true);

  // Classe restée au jeu classique (aucune partie « Tenir ») : comportement d'avant.
  const stamp = Date.now();
  const classique = await createGlClass({
    name: `classe-classique-${stamp}`,
    adminId: ctx.admin.id,
  });
  const joueur = await createGlPlayer({ classId: classique.id, pseudo: `joueur-c-${stamp}` });
  assert.equal(await classeJoueTenir({ queryOne }, classique.id, settings), false);
  const { playerToken } = await signTokens({
    playerId: joueur.id,
    playerPseudo: `joueur-c-${stamp}`,
  });
  const hors = await request(app).get('/api/gl/gameplay-settings').set(auth(playerToken));
  assert.equal(hors.status, 200, JSON.stringify(hors.body));
  assert.equal(hors.body.settings.monnaieUnique, false);
  assert.equal(hors.body.settings.marketHeartsEnabled, true);
});

test('but de l’année : la Consécration se montre grisée dès le chapitre 1, avec son prix (8), sans être lançable', async () => {
  const sorts = await request(app)
    .get(`/api/gl/games/${ctx.game.id}/tenir/sorts?teamId=${ctx.teams[0].id}`)
    .set(auth(ctx.adminToken));
  assert.equal(sorts.status, 200, JSON.stringify(sorts.body));
  assert.deepEqual(
    { code: sorts.body.butDeLAnnee.code, cout: sorts.body.butDeLAnnee.cout },
    { code: 'SL018', cout: 8 },
  );
  assert.ok(sorts.body.butDeLAnnee.nom, 'nom servi');
  const lancables = sorts.body.moments.flatMap((m) => m.sorts.map((s) => s.code));
  assert.ok(!lancables.includes('SL018'), 'au chapitre 1, elle n’est pas dans les sorts lançables');
  assert.ok(sorts.body.moments.flatMap((m) => m.sorts).every((s) => s.ressource === 'gemmes'));
  // Aucun solde dans la carte : un prix, jamais une bourse.
  assert.deepEqual(Object.keys(sorts.body.butDeLAnnee).sort(), [
    'code',
    'cout',
    'effetCourt',
    'emoji',
    'nom',
    'ouverte',
  ]);

  const seuil = await request(app).get('/api/gl/voyageur/me').set(auth(ctx.players[0].token));
  assert.equal(seuil.status, 200, JSON.stringify(seuil.body));
  assert.equal(seuil.body.butDeLAnnee.cout, 8);
  assert.equal(seuil.body.gardeRobe, null, 'garde-robe vide : rien à l’écran');

  // La fenêtre s'ouvre au troisième trimestre (réglage `tenir_trimestres`).
  const avril = await butDeLAnnee({ queryOne }, { date: new Date(2027, 4, 15) });
  const novembre = await butDeLAnnee({ queryOne }, { date: new Date(2026, 10, 18) });
  assert.equal(avril.ouverte, true);
  assert.equal(novembre.ouverte, false);
});

test('chapardeur : une gemme de la bourse de gemmes la plus pleine part au nid ; le nid revient en gemme au moins riche ; les cœurs ne bougent jamais', async () => {
  const jeu = await createTenirGame({ stamp: Date.now() + 3 });
  await request(app).get(`/api/gl/games/${jeu.game.id}/tenir`).set(auth(jeu.adminToken));
  for (const p of jeu.players) await setPlayerBourses(p.id, 3, 2);
  const riche = jeu.players[0];
  const coeursPleins = jeu.players[1];
  await setPlayerBourses(riche.id, 0, 6);
  await setPlayerBourses(coeursPleins.id, 9, 1); // beaucoup de cœurs : ils ne comptent plus
  await execute('UPDATE gl_game_tenir_state SET chapardeur_round = 2 WHERE game_id = ?', [
    jeu.game.id,
  ]);
  let pris;
  await withTransaction(async (tx) => {
    pris = await chapardeurTx(tx, {
      gameId: jeu.game.id,
      roundNumber: 2,
      resolved: { chapardeur: true },
    });
  });
  assert.ok(pris, 'le chapardeur est passé');
  assert.deepEqual({ p: pris.nid.playerId, r: pris.nid.ressource }, { p: riche.id, r: 'power' });
  assert.deepEqual(await readPlayerBourses(riche.id), { health: 0, power: 5 });
  assert.deepEqual(await readPlayerBourses(coeursPleins.id), { health: 9, power: 1 });

  // Le nid est rendu au membre le moins riche EN GEMMES de l'équipe découvreuse.
  const equipe = jeu.players.filter((p) => p.teamId === coeursPleins.teamId);
  let rendu;
  await withTransaction(async (tx) => {
    rendu = await rendreNidTx(tx, {
      gameId: jeu.game.id,
      teamId: coeursPleins.teamId,
      settings: await getGameplaySettings(),
    });
  });
  assert.equal(rendu.playerId, coeursPleins.id, 'le moins riche en gemmes, malgré ses cœurs');
  assert.deepEqual(await readPlayerBourses(coeursPleins.id), { health: 9, power: 2 });
  assert.ok(equipe.length >= 2);
  const livre = await queryAll(
    "SELECT cause, delta_health, delta_power FROM gl_resource_ledger WHERE game_id = ? AND cause IN ('chapardeur', 'nid') ORDER BY id ASC",
    [jeu.game.id],
  );
  assert.deepEqual(
    livre.map((l) => [l.cause, Number(l.delta_health), Number(l.delta_power)]),
    [
      ['chapardeur', 0, -1],
      ['nid', 0, 1],
    ],
  );
});

test('journal « Tenir » : aucun cœur nommé, même pour un évènement d’avant la conversion', () => {
  const lire1 = (type, payload) => presentTenirJournalEvent(type, payload, { teamLabel: 'A' });
  const chapardeur = lire1('chapardeur', { roundNumber: 2, ressource: 'health' });
  assert.match(chapardeur.body, /une gemme en moins/);
  const don = lire1('don', { coeurs: 2 });
  assert.match(don.body, /2 gemmes/);
  const donGemme = lire1('don', { gemmes: 1 });
  assert.match(donGemme.body, /1 gemme\)/);
  for (const [type, payload] of [
    ['chapardeur', { ressource: 'health' }],
    ['don', { coeurs: 1 }],
    ['marker_effect', { healthDelta: 1, powerDelta: 1, markerLabel: 'Case' }],
    ['page_reparee', { titre: 'Page', vitality: [{ health: 4 }] }],
    ['parure', { nom: 'Couronne de lianes' }],
  ]) {
    const vue = lire1(type, payload);
    assert.doesNotMatch(`${vue?.title || ''} ${vue?.body || ''}`, /c[œo]eur/i, type);
  }
});

test('Marché d’une classe « Tenir » : une annonce et un échange restés en cœurs se ferment seuls ; un don ou une offre en cœurs est refusé, même si le réglage classique les autorise', async () => {
  const [a, b, c] = membres(ctx.teams[0].id).concat(membres(ctx.teams[1].id));
  for (const p of [a, b, c]) await setPlayerBourses(p.id, 4, 4);
  // Restes d'avant la conversion, posés directement en base.
  const annonce = await execute(
    `INSERT INTO gl_market_annonces (class_id, player_id, type, cherche_json, offre_json, statut, created_at)
     VALUES (?, ?, 'offre', NULL, ?, 'ouverte', NOW())`,
    [ctx.cls.id, a.id, JSON.stringify({ gemmes: 0, coeurs: 2, feuillets: [] })],
  );
  const gemmes = await execute(
    `INSERT INTO gl_market_annonces (class_id, player_id, type, cherche_json, offre_json, statut, created_at)
     VALUES (?, ?, 'offre', NULL, ?, 'ouverte', NOW())`,
    [ctx.cls.id, a.id, JSON.stringify({ gemmes: 1, feuillets: [] })],
  );
  const low = Math.min(a.id, b.id);
  const high = Math.max(a.id, b.id);
  const trade = await execute(
    `INSERT INTO gl_market_trades (class_id, player_low_id, player_high_id, status, initiator_player_id, created_at, updated_at)
     VALUES (?, ?, ?, 'negotiating', ?, NOW(), NOW())`,
    [ctx.cls.id, low, high, a.id],
  );
  await execute(
    `INSERT INTO gl_market_trade_sides (trade_id, player_id, offer_health, offer_power, accepted)
     VALUES (?, ?, 1, 0, 0), (?, ?, 0, 1, 0)`,
    [trade.insertId, a.id, trade.insertId, b.id],
  );

  const place = await request(app).get('/api/gl/market/annonces').set(auth(c.token));
  assert.equal(place.status, 200, JSON.stringify(place.body));
  const ids = place.body.items.map((x) => Number(x.id));
  assert.ok(!ids.includes(Number(annonce.insertId)), 'l’annonce en cœurs n’est plus servie');
  assert.ok(ids.includes(Number(gemmes.insertId)), 'l’annonce en gemmes reste');
  const expiree = await queryOne('SELECT statut, closed_at FROM gl_market_annonces WHERE id = ?', [
    annonce.insertId,
  ]);
  assert.equal(expiree.statut, 'expiree');
  assert.ok(expiree.closed_at);
  const repondre = await request(app)
    .post(`/api/gl/market/annonces/${annonce.insertId}/repondre`)
    .set(auth(c.token));
  assert.equal(repondre.status, 409, JSON.stringify(repondre.body));
  const ferme = await queryOne('SELECT status FROM gl_market_trades WHERE id = ?', [
    trade.insertId,
  ]);
  assert.equal(ferme.status, 'cancelled', 'l’échange en cœurs est fermé, rien n’attend');

  const don = await request(app)
    .post('/api/gl/market/dons')
    .set(auth(a.token))
    .send({ receveurId: b.id, coeurs: 1 });
  assert.equal(don.status, 409, JSON.stringify(don.body));
  const annonceCoeurs = await request(app)
    .post('/api/gl/market/annonces')
    .set(auth(a.token))
    .send({ type: 'offre', offre: { coeurs: 1 } });
  assert.equal(annonceCoeurs.status, 409, JSON.stringify(annonceCoeurs.body));
  assert.deepEqual(await readPlayerBourses(a.id), { health: 4, power: 4 });
  assert.deepEqual(await readPlayerBourses(b.id), { health: 4, power: 4 });

  // Une annonce neuve ne porte que des gemmes (pas de clé `coeurs`).
  const neuve = await request(app)
    .post('/api/gl/market/annonces')
    .set(auth(b.token))
    .send({ type: 'cherche', cherche: { gemmes: 1 } });
  assert.equal(neuve.status, 201, JSON.stringify(neuve.body));
  assert.ok(!('coeurs' in (neuve.body.cherche || {})));
});

// ---------------------------------------------------------------------
// Relecture des garde-fous (bourses privées, droits rejoués, aucun cœur nommé)
// ---------------------------------------------------------------------

test('aucun message d’erreur du Marché ne nomme les cœurs', () => {
  const { resolveMarketError } = require('../lib/glMarket');
  const { resolveMarketPlaceError } = require('../lib/glMarketPlace');
  for (const code of ['EMPTY_TRADE', 'HEARTS_NOT_TRADABLE', 'VITALITY_CAP_EXCEEDED']) {
    const vu = resolveMarketError(new Error(code));
    assert.ok(vu?.error, code);
    assert.doesNotMatch(vu.error, /c[œo]eur/i, code);
  }
  for (const code of [
    'ANNONCE_EMPTY',
    'DON_EMPTY',
    'DON_MULTIPLE',
    'HEARTS_NOT_TRADABLE',
    'PARURE_RESSOURCE',
    'PARURE_INSUFFICIENT',
    'PARURE_DEJA_ACQUISE',
    'GARDE_ROBE_SPECTATEUR',
  ]) {
    const vu = resolveMarketPlaceError(new Error(code));
    assert.ok(vu?.error, code);
    assert.doesNotMatch(vu.error, /c[œo]eur/i, code);
  }
});

test('bourses privées hors partie en cours : `/classmates` d’une classe « Tenir » en pause ne sert aucune bourse d’une autre équipe ; un échange ne sert aucun solde', async () => {
  const jeu = await createTenirGame({ stamp: Date.now() + 11 });
  const [moi, autre] = [jeu.players[0], jeu.players[1]];
  assert.notEqual(moi.teamId, autre.teamId);
  const { buildTradePayload } = require('../lib/glMarket');
  const low = Math.min(moi.id, autre.id);
  const high = Math.max(moi.id, autre.id);
  const trade = await execute(
    `INSERT INTO gl_market_trades (class_id, player_low_id, player_high_id, status, initiator_player_id, created_at, updated_at)
     VALUES (?, ?, ?, 'negotiating', ?, NOW(), NOW())`,
    [jeu.cls.id, low, high, moi.id],
  );
  await execute(
    `INSERT INTO gl_market_trade_sides (trade_id, player_id, offer_health, offer_power, accepted)
     VALUES (?, ?, 0, 1, 0), (?, ?, 0, 0, 0)`,
    [trade.insertId, moi.id, trade.insertId, autre.id],
  );
  const charge = await buildTradePayload(trade.insertId);
  for (const side of charge.sides) {
    assert.ok(!('powerPoints' in side) && !('healthPoints' in side), 'aucun solde dans un échange');
    assert.equal(typeof side.offerPower, 'number');
  }

  await execute("UPDATE gl_games SET status = 'paused' WHERE id = ?", [jeu.game.id]);
  const res = await request(app).get('/api/gl/market/classmates').set(auth(moi.token));
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.ok(res.body.items.length >= 2);
  assert.ok(
    res.body.items.every((m) => !('powerPoints' in m) && !('healthPoints' in m)),
    'partie en pause : aucune bourse servie (ni autre équipe, ni cœurs)',
  );
  await execute("UPDATE gl_games SET status = 'ended' WHERE id = ?", [jeu.game.id]);
  const apres = await request(app).get('/api/gl/market/classmates').set(auth(moi.token));
  assert.ok(
    apres.body.items.every((m) => !('powerPoints' in m)),
    'partie close : idem',
  );
});

test('garde-robe : reposer une parure rangée n’écrit pas un nouvel évènement ; un élève spectateur du tour ouvert ne pose ni ne range ; parures coupées → 409', async () => {
  const marketPlace = require('../lib/glMarketPlace');
  const jeu = await createTenirGame({ stamp: Date.now() + 13 });
  const eleve = jeu.players[0];
  await setPlayerBourses(eleve.id, 3, 8);
  const parure = await queryOne(
    'SELECT code FROM gl_tenir_parures WHERE actif = 1 AND chapitre_min = 1 ORDER BY prix ASC, code ASC LIMIT 1',
  );
  await marketPlace.acheterParure(eleve.id, parure.code);
  const evenements = async () =>
    Number(
      (
        await queryOne(
          "SELECT COUNT(*) AS n FROM gl_game_events WHERE game_id = ? AND event_type = 'parure'",
          [jeu.game.id],
        )
      ).n,
    );
  const lignes = async () =>
    Number(
      (
        await queryOne(
          'SELECT COUNT(*) AS n FROM gl_game_parures WHERE game_id = ? AND achetee_par = ?',
          [jeu.game.id, eleve.id],
        )
      ).n,
    );
  assert.equal(await evenements(), 1, 'l’achat dit « porte une nouvelle parure »');
  const geste = (action) =>
    request(app)
      .post(`/api/gl/voyageur/garde-robe/${parure.code}/${action}`)
      .set(auth(eleve.token));
  for (let i = 0; i < 3; i += 1) {
    assert.equal((await geste('ranger')).status, 200);
    const pose = await geste('poser');
    assert.equal(pose.status, 200, JSON.stringify(pose.body));
    assert.equal(pose.body.posee, true);
  }
  assert.equal(await evenements(), 1, 'ranger puis reposer ne remplit pas le journal');
  assert.equal(await lignes(), 1, 'une seule ligne de pose par parure et par propriétaire');
  assert.deepEqual(await readPlayerBourses(eleve.id), { health: 3, power: 8 - 2 }, 'gratuit');

  // Un autre élève ne pose pas ce qui n'est pas à lui.
  const voisin = jeu.players[4];
  const pasALui = await request(app)
    .post(`/api/gl/voyageur/garde-robe/${parure.code}/poser`)
    .set(auth(voisin.token));
  assert.equal(pasALui.status, 404, JSON.stringify(pasALui.body));

  // Tour ouvert, élève en retrait : spectateur — il regarde, il ne touche à rien.
  const { ouvrirTourEnJeu } = require('./helpers/glTenirFixtures');
  await ouvrirTourEnJeu(request, app, jeu);
  await request(app)
    .post(`/api/gl/games/${jeu.game.id}/tenir/retrait`)
    .set(auth(jeu.adminToken))
    .send({ playerId: eleve.id, entree: true, motif: 'test garde-robe' })
    .expect(200);
  const spectateur = await geste('ranger');
  assert.equal(spectateur.status, 403, JSON.stringify(spectateur.body));
  assert.equal(spectateur.body.code, 'GARDE_ROBE_SPECTATEUR');
  assert.doesNotMatch(spectateur.body.error, /interdit|refus/i);
  await request(app)
    .post(`/api/gl/games/${jeu.game.id}/tenir/retrait`)
    .set(auth(jeu.adminToken))
    .send({ playerId: eleve.id, entree: false })
    .expect(200);
  assert.equal((await geste('ranger')).status, 200, 'retrait levé : la garde-robe rouvre');

  // Parures coupées (réglage `tenir_parures`) : la garde-robe se regarde, rien ne se pose.
  await execute(
    `INSERT INTO gl_settings (\`key\`, value_json, updated_at) VALUES ('gameplay.tenir_parures', 'false', NOW())
     ON DUPLICATE KEY UPDATE value_json = 'false', updated_at = NOW()`,
  );
  require('../lib/glSettings').invalidateGameplayCache();
  try {
    const refus = await geste('poser');
    assert.equal(refus.status, 409, JSON.stringify(refus.body));
    assert.equal(refus.body.code, 'PARURES_DISABLED');
    const lecture = await request(app).get('/api/gl/voyageur/garde-robe').set(auth(eleve.token));
    assert.equal(lecture.status, 200, 'la garde-robe se lit toujours');
  } finally {
    await execute(
      "UPDATE gl_settings SET value_json = 'true', updated_at = NOW() WHERE `key` = 'gameplay.tenir_parures'",
    );
    require('../lib/glSettings').invalidateGameplayCache();
  }
});

test('feuillets : une partie « Tenir » ne crédite jamais de cœur, même si le réglage classique des gains est actif', async () => {
  const { applyFeuilletVitalityEffects } = require('../lib/glLoreFeuilletEffects');
  const settings = await getGameplaySettings({ forceRefresh: true });
  const equipe = ctx.teams[0];
  const avant = [];
  for (const m of membres(equipe.id)) avant.push(await readPlayerBourses(m.id));
  let effet;
  await withTransaction(async (tx) => {
    effet = await applyFeuilletVitalityEffects(tx, {
      gameId: ctx.game.id,
      teamId: equipe.id,
      feuillet: { gain_coeur: 2, cout_gemme: 0, titre: 'Page de test', feuillet_code: 'ep-test' },
      settings,
      loreSettings: { gemmeCostsEnabled: false, heartRewardsEnabled: true },
      actorId: 'test',
      reason: 'test',
    });
  });
  assert.equal(effet.healthDelta, 0);
  const apres = [];
  for (const m of membres(equipe.id)) apres.push(await readPlayerBourses(m.id));
  assert.deepEqual(apres, avant, 'aucune bourse ne bouge');
});
