'use strict';

/**
 * « Tenir à deux », lot 3, § 8.4 — défis de la Trame : données de partie, API, récompenses.
 * - liste selon le peuple, le plateau et la progression ; les solutions ne quittent jamais le
 *   serveur ; sauvegarde stricte (409 `edit_conflict`) ; bornes d'un état ;
 * - récompense : à la première réussite d'une unité seulement, sous le plafond hebdomadaire de
 *   pages, jamais un feuillet de chasse, **aucune ressource** ;
 * - mode équipe (tablette hors tour, prof) : chaque membre présent est compté ;
 * - suivi du prof : tri alphabétique, export CSV.
 */

require('./helpers/setup');
const fs = require('node:fs');
const path = require('node:path');
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const db = require('../database');
const {
  createTenirGame,
  importExempleChasse,
  ouvrirTourEnJeu,
  readPlayerBourses,
} = require('./helpers/glTenirFixtures');
const { runImports } = require('../scripts/gl-import-tenir');
const { issueTeamSession } = require('../lib/glGuestToken');
const core = require('../lib/shared/glTrameCore');
const { createMetricContext } = require('../lib/glRewardsMetrics');
const { checkTenirInvariantsFromDb } = require('../lib/glTenirInvariants');
const { getGameplaySettings } = require('../lib/glSettings');
const { presentJournalEvent } = require('../lib/glJournalPresent');

const EXEMPLE = path.join(__dirname, '..', 'data', 'gl', 'tenir', 'exemple');
const lire = (nom) => JSON.parse(fs.readFileSync(path.join(EXEMPLE, `${nom}.json`), 'utf8'));
const RESEAUX = lire('trame-reseaux').reseaux;
const reseau = (biome) => RESEAUX.find((r) => r.biome === biome);

let ctx;
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const api = (p) => `/api/gl/games/${ctx.game.id}${p}`;
const team = (i) => ctx.teams[i];
const membres = (i) => ctx.players.filter((p) => Number(p.teamId) === Number(team(i).id));
const lister = (token, q = '') =>
  request(app)
    .get(api(`/defis${q}`))
    .set(auth(token));
const ouvrir = (token, body) => request(app).post(api('/defis')).set(auth(token)).send(body);
const voir = (token, id) =>
  request(app)
    .get(api(`/defis/${id}`))
    .set(auth(token));
const sauver = (token, id, revision, etat) =>
  request(app)
    .put(api(`/defis/${id}`))
    .set(auth(token))
    .send({ revision, etat });

/** Une fin de niveau : les liens acceptés, une flèche vers un décomposeur, les plantes sans mangeur. */
function solution(biome, niveau) {
  const m = core.buildReseau(reseau(biome), niveau);
  const dec = m.decomposeurs[0];
  return [
    ...m.liens.map((l) => ({ de: l.de, vers: l.vers })),
    { de: m.cartes[0].code, vers: dec },
    ...m.cartes
      .filter((c) => c.role === 'producteur' && !m.liens.some((l) => l.de === c.code))
      .map((c) => ({ de: c.code, vers: dec })),
  ];
}

async function reussir(token, type, unite, etat) {
  const cree = await ouvrir(token, { type, unite });
  assert.equal(cree.status, 201, JSON.stringify(cree.body));
  const res = await sauver(token, cree.body.defi.id, cree.body.defi.revision, etat);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.defi.statut, 'reussi', JSON.stringify(res.body.defi).slice(0, 400));
  return res.body;
}

const sommeDesBourses = async () => {
  let total = 0;
  for (const p of ctx.players) {
    const b = await readPlayerBourses(p.id);
    total += b.health + b.power;
  }
  return total;
};
const mouvements = async () =>
  Number(
    (
      await db.queryOne('SELECT COUNT(*) AS n FROM gl_resource_ledger WHERE game_id = ?', [
        ctx.game.id,
      ])
    ).n,
  );

let gnome;
let autreGnome;
let licorne;

before(async () => {
  await db.initSchema();
  ctx = await createTenirGame({ stamp: Date.now(), plateau: 1 });
  await importExempleChasse(db, { game: ctx.game });
  for (const fichier of ['trame-reseaux', 'trame-fils', 'trame-reparer']) {
    const [rep] = await runImports(db, { fichier, dossier: EXEMPLE });
    assert.deepEqual(rep.errors, [], fichier);
  }
  // Trois pages de veillée du plateau 1, hors de toute zone de chasse.
  for (const lettre of ['a', 'b', 'c']) {
    await db.execute(
      `INSERT INTO gl_lore_feuillets (feuillet_code, type, titre, incipit, texte, texte_accessible, biome_slug,
          plateau_number, mode_apparition, ordre_voyage, statut, created_at, updated_at)
       VALUES (?, 'feuillet', ?, 'La forêt respire.', 'La forêt respire.', 'La forêt respire.', 'jungle_afc',
          1, 'boite', ?, 'actif', NOW(), NOW())
       ON DUPLICATE KEY UPDATE statut = 'actif', ordre_voyage = VALUES(ordre_voyage)`,
      [`trame-test-p1-${lettre}`, `Page de veillée ${lettre}`, -10 + lettre.charCodeAt(0) - 97],
    );
  }
  [gnome, autreGnome] = membres(0);
  [licorne] = membres(2);
});

test('liste : les défis de son peuple, sur les deux biomes du plateau, niveaux ouverts l’un après l’autre', async () => {
  const g = await lister(gnome.token);
  assert.equal(g.status, 200, JSON.stringify(g.body));
  assert.equal(g.body.actifs, true);
  assert.equal(g.body.mode, 'individuel');
  assert.deepEqual(
    g.body.types.map((t) => t.type),
    ['retisser', 'reparer'],
  );
  const retisser = g.body.defis.filter((d) => d.type === 'retisser');
  assert.deepEqual(
    retisser.map((d) => [d.unite, d.disponible]),
    [
      ['jungle_afc:5', true],
      ['jungle_afc:7', false],
      ['jungle_afc:9', false],
      ['jungle_afc:12', false],
      ['savane:5', true],
      ['savane:7', false],
      ['savane:9', false],
      ['savane:12', false],
    ],
  );
  assert.deepEqual(
    g.body.defis.filter((d) => d.type === 'reparer').map((d) => d.unite),
    ['p1'],
  );
  assert.deepEqual(g.body.pages, { utilisees: 0, plafond: 2 });
  const l = await lister(licorne.token);
  assert.deepEqual(
    l.body.types.map((t) => t.type),
    ['alteree', 'fils'],
  );
  assert.equal(l.body.defis.filter((d) => d.type === 'alteree').length, 6);
  // La liste ne dit rien des solutions.
  assert.ok(
    !/liens_acceptes|"liens"|"effets"|categorie/.test(
      JSON.stringify(g.body) + JSON.stringify(l.body),
    ),
  );
});

test('Retisser : classement de ses flèches, sauvegarde stricte, fin de niveau — sans jamais recevoir la solution', async () => {
  const bourses = await sommeDesBourses();
  const livre = await mouvements();
  const cree = await ouvrir(gnome.token, { type: 'retisser', unite: 'jungle_afc:5' });
  assert.equal(cree.status, 201, JSON.stringify(cree.body));
  const defi = cree.body.defi;
  assert.equal(defi.mode, 'individuel');
  assert.equal(defi.statut, 'en_cours');
  assert.equal(defi.revision, 0);
  assert.equal(defi.cartes.length, 5);
  assert.deepEqual(defi.fleches, []);
  assert.match(defi.critere, /chaque plante a une suite/);
  assert.equal(defi.liens, undefined, 'les liens acceptés restent au serveur');
  assert.ok(!JSON.stringify(defi).includes('pourquoi'));
  // Reprendre : même défi.
  const repris = await ouvrir(gnome.token, { type: 'retisser', unite: 'jungle_afc:5' });
  assert.equal(repris.body.defi.id, defi.id);

  // Une flèche à l'envers et une flèche non prévue : expliquées, jamais refusées.
  const essai = await sauver(gnome.token, defi.id, 0, {
    fleches: [
      { de: 'SP0023', vers: 'SP0045' },
      { de: 'DEC', vers: 'SP0045' },
      { de: 'SP0045', vers: 'INCONNUE' },
    ],
    positions: { SP0045: { x: 250, y: 12.34 } },
    intrus: 'écarté',
  });
  assert.equal(essai.status, 200, JSON.stringify(essai.body));
  assert.deepEqual(
    essai.body.defi.fleches.map((f) => f.classement),
    ['inversee', 'a_discuter'],
  );
  assert.match(essai.body.defi.fleches[0].message, /de celui qui est mangé vers celui qui mange/);
  assert.deepEqual(essai.body.defi.positions, { SP0045: { x: 100, y: 12.3 } });
  assert.equal(essai.body.defi.revision, 1);
  assert.equal(essai.body.defi.complet, false);
  assert.equal(essai.body.reussite, null);

  // Révision dépassée (un autre appareil a enregistré) : 409, rien n'est écrit.
  const conflit = await sauver(gnome.token, defi.id, 0, { fleches: [] });
  assert.equal(conflit.status, 409, JSON.stringify(conflit.body));
  assert.equal(conflit.body.code, 'edit_conflict');
  assert.equal(conflit.body.revision, 1);
  assert.equal((await voir(gnome.token, defi.id)).body.defi.fleches.length, 2);
  const sansRevision = await request(app)
    .put(api(`/defis/${defi.id}`))
    .set(auth(gnome.token))
    .send({ etat: {} });
  assert.equal(sansRevision.status, 400);

  // Au plus 60 flèches gardées.
  const trop = [];
  for (const de of defi.cartes)
    for (const vers of defi.cartes) trop.push({ de: de.code, vers: vers.code });
  const borne = await sauver(gnome.token, defi.id, 1, { fleches: [...trop, ...trop, ...trop] });
  assert.ok(borne.body.defi.fleches.length <= 60);

  const fin = await sauver(gnome.token, defi.id, 2, { fleches: solution('jungle_afc', 5) });
  assert.equal(fin.status, 200, JSON.stringify(fin.body));
  assert.equal(fin.body.defi.statut, 'reussi');
  assert.equal(fin.body.defi.complet, true);
  assert.deepEqual(fin.body.reussite, {
    premiere: true,
    page: true,
    pagesEpuisees: false,
    message: null,
  });

  // Récompense : une page de veillée à son nom, hors zones de chasse ; aucune ressource.
  const ligne = await db.queryOne(
    'SELECT page_feuillet_code, mode FROM gl_trame_reussites WHERE game_id = ? AND player_id = ?',
    [ctx.game.id, gnome.id],
  );
  assert.ok(ligne.page_feuillet_code);
  const chasse = await db.queryOne(
    'SELECT COUNT(*) AS n FROM gl_chasse_zones WHERE feuillet_code = ?',
    [ligne.page_feuillet_code],
  );
  assert.equal(Number(chasse.n), 0, 'jamais un feuillet de chasse');
  const page = await db.queryOne(
    'SELECT discovered_source, discovered_by_player_id FROM gl_game_feuillet_states WHERE game_id = ? AND team_id = ? AND feuillet_code = ?',
    [ctx.game.id, team(0).id, ligne.page_feuillet_code],
  );
  assert.equal(page.discovered_source, 'defi');
  assert.equal(String(page.discovered_by_player_id), String(gnome.id));
  assert.equal(await sommeDesBourses(), bourses, 'aucun cœur, aucune gemme');
  assert.equal(await mouvements(), livre, 'aucun mouvement au grand livre');
  const inv = await checkTenirInvariantsFromDb(db, ctx.game.id, {
    settings: await getGameplaySettings(),
  });
  assert.deepEqual(inv.violations || [], []);

  // Évènement libellé, sans nom d'élève.
  const evt = await db.queryOne(
    "SELECT team_id, actor_id, payload_json FROM gl_game_events WHERE game_id = ? AND event_type = 'defi_trame_reussi' ORDER BY id DESC LIMIT 1",
    [ctx.game.id],
  );
  const payload = JSON.parse(evt.payload_json);
  assert.deepEqual(
    [payload.type, payload.unite, payload.mode],
    ['retisser', 'jungle_afc:5', 'individuel'],
  );
  const libelle = presentJournalEvent(
    { eventType: 'defi_trame_reussi', teamId: team(0).id, payload },
    {
      teamsById: { [team(0).id]: { id: team(0).id, name: 'Gnomes A' } },
      forPlayer: true,
      tenir: true,
    },
  );
  assert.match(libelle.body, /« Retisser » réussi/);
  assert.ok(!libelle.body.includes('joueur-'));

  // Enregistrer à nouveau un défi réussi ne récompense pas deux fois ; le niveau 7 s'ouvre.
  const encore = await sauver(gnome.token, defi.id, 3, { fleches: solution('jungle_afc', 5) });
  assert.equal(encore.body.reussite, null);
  const liste = await lister(gnome.token);
  const niveau7 = liste.body.defis.find((d) => d.unite === 'jungle_afc:7');
  assert.equal(niveau7.disponible, true);
  assert.equal(liste.body.defis.find((d) => d.unite === 'jungle_afc:5').statut, 'reussi');
  assert.deepEqual(liste.body.pages, { utilisees: 1, plafond: 2 });
});

test('plafond : deux pages par semaine par cette voie ; la troisième unité compte, sans page', async () => {
  const deux = await reussir(gnome.token, 'retisser', 'jungle_afc:7', {
    fleches: solution('jungle_afc', 7),
  });
  assert.equal(deux.reussite.page, true);
  const trois = await reussir(gnome.token, 'retisser', 'savane:5', {
    fleches: solution('savane', 5),
  });
  assert.deepEqual(trois.reussite, {
    premiere: true,
    page: false,
    pagesEpuisees: false,
    message: null,
  });
  const pages = await db.queryOne(
    'SELECT COUNT(*) AS n FROM gl_trame_reussites WHERE player_id = ? AND page_feuillet_code IS NOT NULL',
    [gnome.id],
  );
  assert.equal(Number(pages.n), 2);
  // Trois unités : le badge Tisserand et le regard les comptent.
  assert.equal(await createMetricContext(db, gnome.id).value('trame_retisser'), 3);
  assert.equal(await createMetricContext(db, gnome.id).value('trame_alteree'), 0);
  const { TENIR_BADGE_SOURCES } = require('../lib/glTenirBadges');
  assert.equal(await TENIR_BADGE_SOURCES.defis_trame_retisser(db, gnome.id), 3);
  assert.equal(await TENIR_BADGE_SOURCES.defis_trame(db, gnome.id), 3);
  const moi = await request(app).get('/api/gl/voyageur/me').set(auth(gnome.token));
  if (moi.status === 200) {
    const source = moi.body.regards.proche.sources.find((s) => s.key === 'defi');
    assert.equal(source.count, 3, 'un point de regard par unité réussie');
  }
});

test('droits : défi de l’autre peuple, niveau fermé, défi d’un autre, mode équipe depuis un compte', async () => {
  const autrePeuple = await ouvrir(gnome.token, { type: 'alteree', unite: 'savane:SP0095' });
  assert.equal(autrePeuple.status, 403, JSON.stringify(autrePeuple.body));
  assert.equal(autrePeuple.body.code, 'DEFI_AUTRE_PEUPLE');
  const ferme = await ouvrir(gnome.token, { type: 'retisser', unite: 'savane:9' });
  assert.equal(ferme.status, 409);
  assert.equal(ferme.body.code, 'DEFI_NIVEAU_FERME');
  const inconnu = await ouvrir(gnome.token, { type: 'retisser', unite: 'taiga:5' });
  assert.equal(inconnu.status, 404);
  assert.equal((await ouvrir(gnome.token, { type: 'tricot', unite: 'p1' })).status, 400);
  const enEquipe = await ouvrir(gnome.token, { type: 'reparer', unite: 'p1', mode: 'equipe' });
  assert.equal(enEquipe.status, 403);
  assert.equal(enEquipe.body.code, 'DEFI_EQUIPE_RESERVE');

  const mien = (await lister(gnome.token)).body.defis.find((d) => d.unite === 'jungle_afc:5');
  const lecture = await voir(autreGnome.token, mien.defiId);
  assert.equal(lecture.status, 403);
  assert.equal(lecture.body.code, 'DEFI_AUTRE_PORTEUR');
  const ecriture = await sauver(autreGnome.token, mien.defiId, 0, { fleches: [] });
  assert.equal(ecriture.status, 403);
  // Le prof lit un défi individuel, mais ne le joue pas à la place de l'élève.
  assert.equal((await voir(ctx.adminToken, mien.defiId)).status, 200);
  assert.equal((await sauver(ctx.adminToken, mien.defiId, 0, { fleches: [] })).status, 403);
  assert.equal((await voir(gnome.token, 99999999)).status, 404);
  // Sans compte ni session : refusé.
  assert.equal((await request(app).get(api('/defis'))).status, 401);
});

test('La trame altérée : réseau déjà tissé, « Pas encore » sans la réponse, puis la cascade expliquée', async () => {
  const model = core.buildReseau(reseau('savane'), 9);
  const lion = model.cartes.find((c) => c.nom.startsWith('Lion')).code;
  const cree = await ouvrir(licorne.token, { type: 'alteree', unite: `savane:${lion}` });
  assert.equal(cree.status, 201, JSON.stringify(cree.body));
  const defi = cree.body.defi;
  assert.equal(defi.retiree, lion);
  assert.equal(defi.cartes.length, 9);
  assert.ok(defi.liens.length > 0, 'le réseau du niveau 9 est donné tissé');
  assert.equal(defi.verification, null);
  assert.ok(
    !/augmente|diminue|disparait/.test(JSON.stringify(defi)),
    'la cascade reste au serveur',
  );

  const attendu = core.cascade(model, lion).effets;
  const justes = Object.fromEntries(
    model.cartes.filter((c) => c.code !== lion).map((c) => [c.code, attendu[c.code] || 'rien']),
  );
  const zebre = model.cartes.find((c) => c.nom.startsWith('Zèbre')).code;
  // Sans « Vérifier », rien n'est jugé.
  const brouillon = await sauver(licorne.token, defi.id, 0, { predictions: justes });
  assert.equal(brouillon.body.defi.verification, null);
  assert.equal(brouillon.body.defi.statut, 'en_cours');
  const presque = await sauver(licorne.token, defi.id, 1, {
    predictions: { ...justes, [zebre]: 'disparait' },
    verifie: true,
  });
  assert.equal(presque.body.defi.complet, false);
  const carte = presque.body.defi.verification.find((c) => c.code === zebre);
  assert.deepEqual(carte, { code: zebre, juste: false, message: 'Pas encore.' });
  assert.equal(presque.body.defi.pourAllerPlusLoin, null);
  const fin = await sauver(licorne.token, defi.id, 2, { predictions: justes, verifie: true });
  assert.equal(fin.body.defi.statut, 'reussi');
  assert.ok(fin.body.defi.verification.every((c) => c.juste && c.message !== 'Pas encore.'));
  assert.match(fin.body.defi.pourAllerPlusLoin, /^Avec plus de /);
  assert.equal(fin.body.reussite.premiere, true);
  assert.equal(await createMetricContext(db, licorne.id).value('trame_alteree'), 1);
});

test('Les fils cachés et Réparer : mêmes règles ; la leçon n’arrive qu’une fois les six espèces rangées', async () => {
  const fils = core.buildFils(lire('trame-fils').chapitres[0]);
  const f = await ouvrir(licorne.token, { type: 'fils', unite: 'p1' });
  assert.equal(f.status, 201, JSON.stringify(f.body));
  assert.equal(f.body.defi.cartes.length, 9);
  assert.equal(f.body.defi.liens, undefined);
  const inverse = await sauver(licorne.token, f.body.defi.id, 0, {
    fleches: [{ de: 'B', vers: 'A' }],
  });
  assert.equal(inverse.body.defi.fleches[0].classement, 'inversee');
  assert.match(inverse.body.defi.fleches[0].message, /de la cause vers son effet/);
  const finFils = await sauver(licorne.token, f.body.defi.id, 1, {
    fleches: fils.liens.map((l) => ({ de: l.de, vers: l.vers })),
  });
  assert.equal(finFils.body.defi.statut, 'reussi');

  const ch = lire('trame-reparer').chapitres[0];
  const r = await ouvrir(autreGnome.token, { type: 'reparer', unite: 'p1' });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const defi = r.body.defi;
  assert.equal(defi.aClasser.length, 6);
  assert.ok(
    defi.aClasser.every((e) => e.categorie === undefined),
    'les catégories restent au serveur',
  );
  assert.equal(defi.lecon, null);
  assert.deepEqual(defi.especes, []);
  const bon = Object.fromEntries(ch.a_classer.map((e) => [e.code, e.categorie]));
  const mal = await sauver(autreGnome.token, defi.id, 0, {
    rangement: { ...bon, [ch.a_classer[0].code]: 'pas_menace' },
  });
  assert.equal(mal.body.defi.rangementComplet, false);
  assert.equal(mal.body.defi.lecon, null);
  assert.equal(
    mal.body.defi.rangementVerifie.find((c) => c.code === ch.a_classer[0].code).message,
    'Pas encore.',
  );
  const range = await sauver(autreGnome.token, defi.id, 1, { rangement: bon });
  assert.equal(range.body.defi.rangementComplet, true);
  assert.equal(range.body.defi.lecon, ch.lecon);
  assert.equal(range.body.defi.especes.length, ch.especes.length);
  assert.ok(
    range.body.defi.especes.every((e) => e.mesures === undefined),
    'mesures acceptées non servies',
  );
  assert.equal(range.body.defi.mesures.length, 11);
  assert.equal(range.body.defi.requises, 2);
  assert.equal(range.body.defi.statut, 'en_cours');
  const [e1, e2] = ch.especes;
  const fin = await sauver(autreGnome.token, defi.id, 2, {
    rangement: bon,
    leconLue: true,
    mesures: { [e1.code]: [e1.mesures[0]], [e2.code]: [e2.mesures[0]] },
    pourquoi: 'p'.repeat(400),
  });
  assert.equal(fin.body.defi.statut, 'reussi');
  assert.equal(fin.body.defi.pourquoi.length, 280);

  // Lien entre les peuples : une espèce menacée signalée par une trame altérée réussie est
  // proposée en premier au prochain Réparer, et paraît dans « À réparer » du carnet. Aucun gain.
  const derniere = ch.especes[ch.especes.length - 1].code;
  await db.execute(
    `INSERT INTO gl_trame_reussites (game_id, player_id, team_id, type, unite, mode, semaine_iso, created_at)
     VALUES (?, ?, ?, 'alteree', ?, 'individuel', '2026-W01', NOW())`,
    [ctx.game.id, licorne.id, team(2).id, `jungle_afc:${derniere}`],
  );
  const relu = await voir(autreGnome.token, defi.id);
  assert.equal(relu.body.defi.especes[0].code, derniere);
  assert.equal(relu.body.defi.especes[0].signalee, true);
  const carnet = await request(app).get(api('/chasse')).set(auth(gnome.token));
  assert.equal(carnet.status, 200, JSON.stringify(carnet.body).slice(0, 200));
  assert.deepEqual(
    carnet.body.aReparer.map((e) => e.code),
    [derniere],
  );
  assert.deepEqual(
    (await lister(gnome.token)).body.aReparer.map((e) => e.code),
    [derniere],
  );
});

test('indices : gratuits, en échelle, sans effet sur la récompense', async () => {
  const cree = await ouvrir(autreGnome.token, { type: 'retisser', unite: 'jungle_afc:5' });
  const id = cree.body.defi.id;
  const demander = () =>
    request(app)
      .post(api(`/defis/${id}/indice`))
      .set(auth(autreGnome.token));
  const un = await demander();
  assert.equal(un.status, 200, JSON.stringify(un.body));
  assert.equal(un.body.indice.genre, 'consigne');
  assert.equal((await demander()).body.indice.genre, 'structure');
  assert.equal((await demander()).body.indice.genre, 'piste');
  const quatre = await demander();
  assert.equal(quatre.body.indice.genre, 'revelation');
  assert.ok(quatre.body.indice.lien.de && quatre.body.indice.lien.vers);
  assert.equal(quatre.body.indices, 4);
  // L'écran ne remet pas le compteur à zéro, et les indices ne retirent rien.
  const fin = await sauver(autreGnome.token, id, 0, {
    fleches: solution('jungle_afc', 5),
    indices: 0,
  });
  assert.equal(fin.body.defi.indices, 4);
  assert.equal(fin.body.reussite.premiere, true);
  assert.equal(fin.body.reussite.page, true);
  const autre = await request(app)
    .post(api(`/defis/${id}/indice`))
    .set(auth(gnome.token));
  assert.equal(autre.status, 403);
  // Altérée et Réparer ont leur propre échelle.
  const alteree = (await lister(licorne.token)).body.defis.find(
    (d) => d.type === 'alteree' && d.statut === 'reussi',
  );
  const aide = await request(app)
    .post(api(`/defis/${alteree.defiId}/indice`))
    .set(auth(licorne.token));
  assert.match(aide.body.indice.message, /la carte grisée a disparu/);
});

test('mode équipe : tablette hors tour ou prof ; chaque membre présent est compté', async () => {
  const equipe = team(1);
  const tablette = await issueTeamSession(db, { gameId: ctx.game.id, teamId: equipe.id });
  // Pendant un tour, les défis attendent.
  await ouvrirTourEnJeu(request, app, ctx);
  const liste = await lister(tablette.token);
  assert.equal(liste.status, 200, JSON.stringify(liste.body));
  assert.equal(liste.body.mode, 'equipe');
  assert.equal(liste.body.tourOuvert, true);
  const pendant = await ouvrir(tablette.token, { type: 'retisser', unite: 'jungle_afc:5' });
  assert.equal(pendant.status, 409, JSON.stringify(pendant.body));
  assert.equal(pendant.body.code, 'DEFI_TOUR_OUVERT');
  for (const body of [{ phase: 'souffle', dort: true }, { phase: 'clos' }]) {
    await request(app)
      .post(api('/tenir/tour/phase'))
      .set(auth(ctx.adminToken))
      .send(body)
      .expect(200);
  }
  const bourses = await sommeDesBourses();
  const cree = await ouvrir(tablette.token, { type: 'retisser', unite: 'jungle_afc:5' });
  assert.equal(cree.status, 201, JSON.stringify(cree.body));
  assert.equal(cree.body.defi.mode, 'equipe');
  // Un élève de l'équipe ne joue pas le défi d'équipe depuis son compte ; une autre tablette non plus.
  const membre = membres(1)[0];
  assert.equal((await sauver(membre.token, cree.body.defi.id, 0, { fleches: [] })).status, 403);
  const autreTablette = await issueTeamSession(db, { gameId: ctx.game.id, teamId: team(0).id });
  assert.equal((await voir(autreTablette.token, cree.body.defi.id)).status, 403);
  const fin = await sauver(tablette.token, cree.body.defi.id, 0, {
    fleches: solution('jungle_afc', 5),
  });
  assert.equal(fin.status, 200, JSON.stringify(fin.body));
  assert.equal(fin.body.defi.statut, 'reussi');
  const lignes = await db.queryAll(
    "SELECT player_id, mode FROM gl_trame_reussites WHERE game_id = ? AND type = 'retisser' AND unite = 'jungle_afc:5' AND mode = 'equipe'",
    [ctx.game.id],
  );
  assert.deepEqual(
    lignes.map((l) => Number(l.player_id)).sort(),
    membres(1)
      .map((p) => Number(p.id))
      .sort(),
    'une ligne par membre présent',
  );
  assert.equal(await sommeDesBourses(), bourses, 'aucune ressource');

  // Le prof lance pour une équipe (teamId obligatoire) et joue le défi d'équipe.
  assert.equal((await ouvrir(ctx.adminToken, { type: 'fils', unite: 'p1' })).status, 400);
  const prof = await ouvrir(ctx.adminToken, { type: 'fils', unite: 'p1', teamId: team(3).id });
  assert.equal(prof.status, 201, JSON.stringify(prof.body));
  assert.equal(prof.body.defi.mode, 'equipe');
  const parLeProf = await sauver(ctx.adminToken, prof.body.defi.id, 0, {
    fleches: [{ de: 'A', vers: 'B' }],
  });
  assert.equal(parLeProf.status, 200);
  assert.equal(parLeProf.body.defi.trouvees, 1);
  const listeProf = await lister(ctx.adminToken, `?teamId=${team(3).id}`);
  assert.equal(listeProf.body.mode, 'equipe');
  assert.deepEqual(
    listeProf.body.types.map((t) => t.type),
    ['alteree', 'fils'],
  );
});

test('suivi du prof : tri alphabétique, unités et indices par élève, phrases à parcourir, export CSV', async () => {
  const eleve = await request(app).get(api('/defis/suivi')).set(auth(gnome.token));
  assert.equal(eleve.status, 403);
  const res = await request(app).get(api('/defis/suivi')).set(auth(ctx.adminToken));
  assert.equal(res.status, 200, JSON.stringify(res.body).slice(0, 300));
  const noms = res.body.eleves.map((e) => e.nom);
  assert.deepEqual(
    noms,
    [...noms].sort((a, b) => a.localeCompare(b, 'fr')),
    'tri alphabétique',
  );
  assert.equal(res.body.eleves.length, ctx.players.length);
  const ligne = res.body.eleves.find((e) => e.playerId === Number(gnome.id));
  assert.deepEqual(ligne.defis.retisser.reussies, ['jungle_afc:5', 'jungle_afc:7', 'savane:5']);
  assert.equal(ligne.pages, 2);
  const aide = res.body.eleves.find((e) => e.playerId === Number(autreGnome.id));
  assert.equal(aide.defis.retisser.indices, 4);
  assert.equal(res.body.phrases.length, 1);
  assert.equal(res.body.phrases[0].texte.length, 280);
  assert.ok(!/"(?:rank|rang|classement|score|position)"/.test(JSON.stringify(res.body)));
  const csv = await request(app).get(api('/defis/suivi?format=csv')).set(auth(ctx.adminToken));
  assert.equal(csv.status, 200);
  assert.match(csv.headers['content-type'], /text\/csv/);
  const lignes = csv.text.replace(/^﻿/, '').split('\n');
  assert.equal(lignes.length, ctx.players.length + 1);
  assert.match(lignes[0], /^Élève;Équipe;Retisser : unités réussies/);
});

test('réglages : défis fermés, défis ouverts aux deux peuples, mode équipe fermé', async () => {
  const profil = (overrides) =>
    request(app)
      .put(api('/tenir/profil'))
      .set(auth(ctx.adminToken))
      .send({ profil: 'complet', overrides: { surface: 'tablette', ...overrides } })
      .expect(200);
  await profil({ defis_par_peuple: false });
  assert.deepEqual(
    (await lister(gnome.token)).body.types.map((t) => t.type),
    ['retisser', 'reparer', 'alteree', 'fils'],
  );
  await profil({ defis_mode_equipe: false });
  const tablette = await issueTeamSession(db, { gameId: ctx.game.id, teamId: team(1).id });
  const equipe = await ouvrir(tablette.token, { type: 'reparer', unite: 'p1' });
  assert.equal(equipe.status, 409, JSON.stringify(equipe.body));
  assert.equal(equipe.body.code, 'DEFIS_EQUIPE_FERMES');
  await profil({ defis: false });
  const liste = await lister(gnome.token);
  assert.equal(liste.body.actifs, false);
  assert.deepEqual(liste.body.defis, []);
  const ferme = await ouvrir(gnome.token, { type: 'retisser', unite: 'jungle_afc:9' });
  assert.equal(ferme.status, 409);
  assert.equal(ferme.body.code, 'DEFIS_FERMES');
  await profil({});
});

test('pages de veillée : ni page de route, ni page de l’oiseau, ni titre interdit ; la note d’auteur ne sort pas', async () => {
  const defis = require('../lib/glTrameDefis');
  // Le mot interdit est composé ici : aucun fichier du dépôt ne le porte dans un titre.
  const oiseau = ['cor', 'beau'].join('');
  const pages = [
    ['trame-test-p1-oiseau', `Le ${oiseau} du matin`, 'boite', -104],
    ['trame-test-p1-route', 'Sur la route', 'carnet_route', -103],
    ['trame-test-p1-apporte', 'Une page apportée', 'corbeau', -102],
    ['trame-test-p1-d', 'Page de veillée d', 'boite', -101],
  ];
  for (const [code, titre, mode, ordre] of pages) {
    await db.execute(
      `INSERT INTO gl_lore_feuillets (feuillet_code, type, titre, incipit, texte, texte_accessible, biome_slug,
          plateau_number, mode_apparition, ordre_voyage, statut, created_at, updated_at)
       VALUES (?, 'feuillet', ?, 'La forêt respire.', 'La forêt respire.', 'La forêt respire.', 'jungle_afc',
          1, ?, ?, 'actif', NOW(), NOW())
       ON DUPLICATE KEY UPDATE statut = 'actif', titre = VALUES(titre),
          mode_apparition = VALUES(mode_apparition), ordre_voyage = VALUES(ordre_voyage)`,
      [code, titre, mode, ordre],
    );
  }
  const tirables = (await defis.pagesTirables(db, ctx.game)).map((f) => String(f.feuillet_code));
  // Les trois premières du voyage sont écartées : la quatrième passe en tête.
  assert.equal(tirables[0], 'trame-test-p1-d');
  for (const code of ['trame-test-p1-oiseau', 'trame-test-p1-route', 'trame-test-p1-apporte']) {
    assert.ok(!tirables.includes(code), `${code} ne se gagne pas par un défi`);
  }
  const chasse = await db.queryAll(
    'SELECT feuillet_code FROM gl_chasse_zones WHERE feuillet_code IS NOT NULL',
  );
  assert.ok(chasse.length > 0);
  for (const z of chasse) assert.ok(!tirables.includes(String(z.feuillet_code)));

  // La note d'un réseau est une note d'auteur : elle peut citer un lien accepté.
  await db.execute("UPDATE gl_trame_reseaux SET note = ? WHERE biome = 'jungle_afc'", [
    'NOTE-AUTEUR : la flèche A vers B est juste.',
  ]);
  const [licorneB] = membres(3);
  const cree = await ouvrir(licorneB.token, { type: 'alteree', unite: 'jungle_afc:DEC' });
  assert.equal(cree.status, 201, JSON.stringify(cree.body));
  const lu = await voir(licorneB.token, cree.body.defi.id);
  for (const corps of [cree.body, lu.body]) {
    assert.ok(!JSON.stringify(corps).includes('NOTE-AUTEUR'), 'la note ne quitte pas le serveur');
    assert.equal('note' in corps.defi, false);
  }
  await db.execute("UPDATE gl_trame_reseaux SET note = NULL WHERE biome = 'jungle_afc'");

  // Carte retirée = décomposeurs : l'échelle d'indices parle des plantes, pas de « moins mangé ».
  const indice = () =>
    request(app)
      .post(api(`/defis/${cree.body.defi.id}/indice`))
      .set(auth(licorneB.token));
  await indice();
  const deux = await indice();
  assert.match(deux.body.indice.message, /transforment la matière morte/);
  const trois = await indice();
  assert.doesNotMatch(trois.body.indice.message, /moins mangé/);
});

test('fermer les défis en cours de séance arrête aussi un défi déjà ouvert ; une partie terminée n’en donne plus', async () => {
  const defis = require('../lib/glTrameDefis');
  const [licorneB] = membres(3);
  const cree = await ouvrir(licorneB.token, { type: 'alteree', unite: 'jungle_afc:DEC' });
  const id = cree.body.defi.id;
  const profil = (overrides) =>
    request(app)
      .put(api('/tenir/profil'))
      .set(auth(ctx.adminToken))
      .send({ profil: 'complet', overrides: { surface: 'tablette', ...overrides } })
      .expect(200);
  await profil({ defis: false });
  const sauve = await sauver(licorneB.token, id, cree.body.defi.revision, { predictions: {} });
  assert.equal(sauve.status, 409, JSON.stringify(sauve.body));
  assert.equal(sauve.body.code, 'DEFIS_FERMES');
  const aide = await request(app)
    .post(api(`/defis/${id}/indice`))
    .set(auth(licorneB.token));
  assert.equal(aide.status, 409);
  assert.equal(aide.body.code, 'DEFIS_FERMES');
  // La lecture reste permise : rien n'est perdu.
  assert.equal((await voir(licorneB.token, id)).status, 200);
  await profil({});
  const repris = await sauver(licorneB.token, id, cree.body.defi.revision, { predictions: {} });
  assert.equal(repris.status, 200, JSON.stringify(repris.body));

  const jouable = (game) =>
    defis.assertDefiJouable({
      game,
      resolved: {},
      teamType: 'gnome',
      mode: 'individuel',
      type: 'retisser',
    });
  assert.doesNotThrow(() => jouable({ status: 'live' }));
  assert.doesNotThrow(() => jouable({ status: 'paused' }));
  assert.throws(() => jouable({ status: 'ended' }), /DEFIS_FERMES/);
});

test('une page décidée mais pas encore écrite au carnet est rattrapée à la lecture, une seule fois, sans ressource', async () => {
  const [licorneB] = membres(3);
  const teamId = Number(team(3).id);
  const avant = await sommeDesBourses();
  // Une réussite inscrite avec sa page, dont l'écriture au carnet a été interrompue.
  const cree = await ouvrir(licorneB.token, { type: 'fils', unite: 'p1' });
  await db.execute(
    `INSERT INTO gl_trame_reussites
       (game_id, player_id, team_id, type, unite, defi_id, mode, page_feuillet_code, semaine_iso, created_at)
     VALUES (?, ?, ?, 'fils', 'p1', ?, 'individuel', 'trame-test-p1-d', '1999-W01', NOW())`,
    [ctx.game.id, licorneB.id, teamId, cree.body.defi.id],
  );
  const etats = async () =>
    db.queryAll(
      `SELECT feuillet_code FROM gl_game_feuillet_states
        WHERE game_id = ? AND team_id = ? AND feuillet_code = 'trame-test-p1-d'
          AND (discovered_at IS NOT NULL OR status <> 'locked')`,
      [ctx.game.id, teamId],
    );
  assert.equal((await etats()).length, 0);
  assert.equal((await lister(licorneB.token)).status, 200);
  assert.equal((await etats()).length, 1, 'la page promise est au carnet de l’équipe');
  assert.equal((await lister(licorneB.token)).status, 200);
  assert.equal((await etats()).length, 1);
  const decouvertes = await db.queryAll(
    `SELECT id FROM gl_game_events
      WHERE game_id = ? AND team_id = ? AND event_type = 'feuillet_discovered'
        AND payload_json LIKE '%trame-test-p1-d%'`,
    [ctx.game.id, teamId],
  );
  assert.equal(decouvertes.length, 1, 'écrite une seule fois');
  assert.equal(await sommeDesBourses(), avant, 'aucune ressource');
});
