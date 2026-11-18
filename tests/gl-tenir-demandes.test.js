'use strict';

/**
 * « Tenir à deux », lot 2, étape 2.8 — file unique du prof (`gl_game_demandes`) et « Tout au
 * tableau ». Chaque flux qui attend le prof y prend une ligne, la plus ancienne en haut ; aucune
 * ne reste sans sortie (garde-fou 11) : changement de phase, tour suivant, Seuil.
 */

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const db = require('../database');
const {
  createTenirGame,
  setPlayerBourses,
  readPlayerBourses,
  ouvrirTourEnJeu,
  ouvrirTablette,
} = require('./helpers/glTenirFixtures');
const { checkTenirInvariantsFromDb } = require('../lib/glTenirInvariants');
const { getGameplaySettings } = require('../lib/glSettings');
const { presentJournalEvent } = require('../lib/glJournalPresent');

let ctx;
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const api = (p) => `/api/gl/games/${ctx.game.id}${p}`;
const team = (i) => ctx.teams[i];
const membres = (i) => ctx.players.filter((p) => Number(p.teamId) === Number(team(i).id));
const file = async () =>
  (await request(app).get(api('/tenir/demandes')).set(auth(ctx.adminToken)).expect(200)).body;
const kinds = async () => (await file()).demandes.map((d) => d.kind);
const phase = (body) =>
  request(app).post(api('/tenir/tour/phase')).set(auth(ctx.adminToken)).send(body);

before(async () => {
  await db.initSchema();
  // Plateau 2 : « Pause » (sort du prof) y est ouverte.
  ctx = await createTenirGame({ stamp: Date.now(), plateau: 2 });
  for (const p of ctx.players) await setPlayerBourses(p.id, 5, 5);
});

test('la file réunit dés à valider, jets en suspens et sorts du prof ; un bouton par ligne les ferme', async () => {
  await ouvrirTourEnJeu(request, app, ctx, { presences: false });
  // Ensemble unifié (M14) : tout le monde est présent d'office, aucune ligne de présence.
  assert.deepEqual(await kinds(), []);
  const eleve = await request(app)
    .get(api('/tenir/demandes'))
    .set(auth(membres(0)[0].token));
  assert.equal(eleve.status, 403, 'la file est celle du prof');

  // Dés physiques saisis par une tablette : une ligne « dés à valider ».
  const jet = await request(app)
    .post(api('/tenir/lancer'))
    .set(auth(membres(0)[0].token))
    .send({ mode: 'physique', faces: [1, 1] });
  assert.equal(jet.status, 202, JSON.stringify(jet.body));
  let f = await file();
  assert.equal(f.total, 1);
  assert.equal(f.demandes[0].kind, 'des_a_valider');
  assert.equal(f.demandes[0].teamName, 'Gnomes A');
  assert.equal(f.demandes[0].action, 'Valider le jet');
  assert.equal(f.demandes[0].detail, '1 + 1 = 2');
  assert.equal(Number(f.demandes[0].refId), jet.body.saisieId);
  const tour = await request(app).get(api('/tenir/tour')).set(auth(ctx.adminToken)).expect(200);
  assert.equal(tour.body.demandesEnAttente, 1, 'compteur visible depuis l’écran du tour');
  const tourEleve = await request(app)
    .get(api('/tenir/tour'))
    .set(auth(membres(0)[0].token));
  assert.equal('demandesEnAttente' in tourEleve.body, false);

  // Valider : la ligne « dés » se ferme ; le jet reste en suspens → ligne « jet en suspens ».
  await request(app)
    .post(api(`/tenir/des/${jet.body.saisieId}/valider`))
    .set(auth(ctx.adminToken))
    .expect(200);
  f = await file();
  assert.deepEqual(
    f.demandes.map((d) => d.kind),
    ['jet_en_suspens'],
  );
  assert.match(f.demandes[0].detail, /^jet de 2/);
  await request(app)
    .post(api('/tenir/arrivee/garder'))
    .set(auth(ctx.adminToken))
    .send({ teamId: team(0).id })
    .expect(200);
  assert.deepEqual(await kinds(), []);

  // Sort du prof (Pause) : payé au lancement, une ligne « sort à honorer », fermée par
  // « Honorer » (M14).
  const d = await request(app)
    .post(api('/spell-casts/drafts'))
    .set(auth(membres(1)[0].token))
    .send({ spellCode: 'SL046', teamId: team(1).id });
  assert.equal(d.status, 201, JSON.stringify(d.body));
  await request(app)
    .post(api(`/spell-casts/drafts/${d.body.draft.id}/launch`))
    .set(auth(membres(1)[0].token))
    .expect(200);
  f = await file();
  assert.deepEqual(
    f.demandes.map((x) => [x.kind, Number(x.refId), x.teamName]),
    [['sort_a_appliquer', d.body.draft.id, 'Gnomes B']],
  );
  assert.match(f.demandes[0].detail, /^Pause/);
  assert.equal(f.demandes[0].titre, 'Sort à honorer');
  assert.equal(f.demandes[0].action, 'Honorer');
  assert.ok(!JSON.stringify(f).includes('joueur-'), 'aucun nom d’élève dans la file');
  await request(app)
    .post(api(`/spell-casts/drafts/${d.body.draft.id}/effect-applied`))
    .set(auth(ctx.adminToken))
    .send({})
    .expect(200);
  assert.deepEqual(await kinds(), []);
});

test('aucune attente sans sortie : la phase ferme dés et jets ; le tour suivant rend un sort du prof resté sans effet', async () => {
  // Un jet saisi jamais validé, un sort du prof jamais appliqué.
  const jet = await request(app)
    .post(api('/tenir/lancer'))
    .set(auth(membres(2)[0].token))
    .send({ mode: 'physique', faces: [1, 2] });
  assert.equal(jet.status, 202, JSON.stringify(jet.body));
  const avant = [];
  for (const p of membres(3)) avant.push(await readPlayerBourses(p.id));
  const d = await request(app)
    .post(api('/spell-casts/drafts'))
    .set(auth(membres(3)[0].token))
    .send({ spellCode: 'SL046', teamId: team(3).id });
  assert.equal(d.status, 201, JSON.stringify(d.body));
  await request(app)
    .post(api(`/spell-casts/drafts/${d.body.draft.id}/launch`))
    .set(auth(membres(3)[0].token))
    .expect(200);
  assert.deepEqual((await kinds()).sort(), ['des_a_valider', 'sort_a_appliquer']);

  await phase({ phase: 'souffle', dort: true }).expect(200);
  assert.deepEqual(await kinds(), ['sort_a_appliquer'], 'les dés à valider n’attendent plus');
  const saisie = await db.queryOne('SELECT statut FROM gl_game_des_saisies WHERE id = ?', [
    jet.body.saisieId,
  ]);
  assert.equal(saisie.statut, 'refusee', 'la saisie non validée ne reste pas « en attente »');
  await phase({ phase: 'clos' }).expect(200);
  assert.deepEqual(await kinds(), ['sort_a_appliquer'], 'le sort du prof peut encore s’appliquer');

  // Séance suivante : le sort resté sans effet est rendu, la file est vide.
  await ouvrirTourEnJeu(request, app, ctx);
  assert.deepEqual(await kinds(), []);
  const apres = [];
  for (const p of membres(3)) apres.push(await readPlayerBourses(p.id));
  assert.deepEqual(apres, avant, 'remboursement exact');
  const draft = await db.queryOne('SELECT status FROM gl_spell_cast_drafts WHERE id = ?', [
    d.body.draft.id,
  ]);
  assert.equal(draft.status, 'rembourse');
  const evt = await db.queryOne(
    "SELECT payload_json FROM gl_game_events WHERE game_id = ? AND event_type = 'spell_rembourse' ORDER BY id DESC LIMIT 1",
    [ctx.game.id],
  );
  const payload = JSON.parse(evt.payload_json);
  assert.equal(payload.motif, 'seance_suivante');
  const libelle = presentJournalEvent(
    { eventType: 'spell_rembourse', teamId: team(3).id, payload },
    {
      teamsById: { [team(3).id]: { id: team(3).id, name: 'Licornes B' } },
      forPlayer: true,
      tenir: true,
    },
  );
  assert.match(libelle.body, /Rien n’est retiré/);
  const inv = await checkTenirInvariantsFromDb(db, ctx.game.id, {
    settings: await getGameplaySettings(),
  });
  assert.deepEqual(inv.violations || [], []);
});

test('« Tout au tableau » : les jets en suspens s’appliquent, les tablettes restent connectées sous les droits du tableau, et retour', async () => {
  const s = await ouvrirTablette({ gameId: ctx.game.id, teamId: team(0).id });
  // Un jet en suspens (tirage serveur du prof pour Gnomes A).
  const jet = await request(app)
    .post(api('/tenir/lancer'))
    .set(auth(ctx.adminToken))
    .send({ mode: 'physique', teamId: team(0).id, faces: [1, 1] });
  assert.equal(jet.status, 201, JSON.stringify(jet.body));
  const enSuspens = jet.body.arrival?.enSuspens === true;

  const eleve = await request(app)
    .post(api('/tenir/surface'))
    .set(auth(membres(0)[0].token))
    .send({ tableau: true });
  assert.equal(eleve.status, 403);
  const bascule = await request(app)
    .post(api('/tenir/surface'))
    .set(auth(ctx.adminToken))
    .send({ tableau: true });
  assert.equal(bascule.status, 200, JSON.stringify(bascule.body));
  assert.deepEqual(
    { surface: bascule.body.surface, from: bascule.body.from },
    { surface: 'tableau', from: 'tablette' },
  );
  const vue = await request(app).get(api('/tenir/tour')).set(auth(ctx.adminToken)).expect(200);
  assert.equal(vue.body.surface, 'tableau');
  assert.equal(vue.body.surfaceAvantTableau, 'tablette');
  assert.deepEqual(vue.body.round.arriveesEnSuspens, [], 'jets en suspens appliqués');
  if (enSuspens) assert.ok(!(await kinds()).includes('jet_en_suspens'));

  // La tablette reste connectée, mais les gestes du tour sont ceux du prof.
  const lecture = await request(app).get(api('')).set(auth(s.token));
  assert.equal(lecture.status, 200, JSON.stringify(lecture.body));
  assert.equal(lecture.body.tenir.surface, 'tableau');
  assert.equal(lecture.body.tenir.permissions.lancer, false);
  const geste = await request(app)
    .post(api('/chasse/fouiller'))
    .set(auth(s.token))
    .send({ x: 0.5, y: 0.5 });
  assert.equal(geste.status, 403, JSON.stringify(geste.body));
  assert.equal(geste.body.code, 'TENIR_PERMISSION');

  const deja = await request(app)
    .post(api('/tenir/surface'))
    .set(auth(ctx.adminToken))
    .send({ tableau: true });
  assert.equal(deja.status, 409);

  const retour = await request(app)
    .post(api('/tenir/surface'))
    .set(auth(ctx.adminToken))
    .send({ tableau: false });
  assert.equal(retour.status, 200, JSON.stringify(retour.body));
  assert.equal(retour.body.surface, 'tablette');
  const apres = await request(app).get(api('')).set(auth(s.token));
  assert.equal(apres.body.tenir.surface, 'tablette');
  assert.equal(apres.body.tenir.permissions.fouiller, true);
  const evts = await db.queryAll(
    "SELECT payload_json FROM gl_game_events WHERE game_id = ? AND event_type = 'surface_changee' ORDER BY id ASC",
    [ctx.game.id],
  );
  assert.deepEqual(
    evts.map((e) => JSON.parse(e.payload_json).surface),
    ['tableau', 'tablette'],
  );
});

test('clôture du tour : un « Nommer » que le prof n’a pas appliqué est rendu, sa ligne se ferme', async (t) => {
  // Nommer est sorti du grimoire (ensemble unifié, M6) : remis le temps du test pour éprouver
  // la file du prof.
  t.after(await require('./helpers/glTenirFixtures').activerSortRetire(ctx.chapter.id, 'SL041'));
  await require('./helpers/glTenirFixtures').importExempleChasse(db, { game: ctx.game });
  const zone = await db.queryOne(
    `SELECT z.id, z.zone_key FROM gl_chasse_zones z
       INNER JOIN gl_game_chasse_pages p ON p.zone_id = z.id AND p.game_id = ? LIMIT 1`,
    [ctx.game.id],
  );
  assert.ok(zone, 'une page de chasse');
  const etatAvant = await db.queryOne(
    'SELECT etat FROM gl_game_chasse_pages WHERE game_id = ? AND zone_id = ?',
    [ctx.game.id, zone.id],
  );
  await db.execute(
    "UPDATE gl_game_chasse_pages SET etat = 'palie' WHERE game_id = ? AND zone_id = ?",
    [ctx.game.id, zone.id],
  );
  const somme = async () => {
    let coeurs = 0;
    let gemmes = 0;
    for (const p of membres(0)) {
      const b = await readPlayerBourses(p.id);
      coeurs += b.health;
      gemmes += b.power;
    }
    return { coeurs, gemmes };
  };
  const avant = await somme();
  const d = await request(app)
    .post(api('/spell-casts/drafts'))
    .set(auth(membres(0)[0].token))
    .send({ spellCode: 'SL041', teamId: team(0).id, effectParams: { zoneKey: zone.zone_key } });
  assert.equal(d.status, 201, JSON.stringify(d.body));
  const lance = await request(app)
    .post(api(`/spell-casts/drafts/${d.body.draft.id}/launch`))
    .set(auth(membres(0)[0].token));
  assert.equal(lance.status, 200, JSON.stringify(lance.body));
  assert.ok((await kinds()).includes('nommer'));
  // Une seule monnaie : Nommer (sort de Gnomes) se paie en gemmes, les cœurs ne bougent pas.
  assert.deepEqual(d.body.draft.required, { gems: 2, hearts: 0 });
  assert.deepEqual(
    await somme(),
    { coeurs: avant.coeurs, gemmes: avant.gemmes - 2 },
    'Nommer coûte deux gemmes à l’équipe',
  );

  await phase({ phase: 'souffle', dort: true }).expect(200);
  assert.ok(
    (await kinds()).includes('nommer'),
    'le prof peut encore l’appliquer pendant le souffle',
  );
  // Lu après le souffle : ce qui s'y joue (chapardeur…) ne se confond pas avec le rendu.
  const avantCloture = await somme();
  await phase({ phase: 'clos' }).expect(200);
  assert.ok(!(await kinds()).includes('nommer'), 'plus de ligne après la clôture du tour');
  assert.deepEqual(
    await somme(),
    { coeurs: avantCloture.coeurs, gemmes: avantCloture.gemmes + 2 },
    'remboursement exact, en gemmes',
  );
  const draft = await db.queryOne('SELECT status FROM gl_spell_cast_drafts WHERE id = ?', [
    d.body.draft.id,
  ]);
  assert.equal(draft.status, 'rembourse');
  const evt = await db.queryOne(
    "SELECT payload_json FROM gl_game_events WHERE game_id = ? AND event_type = 'spell_rembourse' ORDER BY id DESC LIMIT 1",
    [ctx.game.id],
  );
  assert.equal(JSON.parse(evt.payload_json).motif, 'cloture_tour');
  const inv = await checkTenirInvariantsFromDb(db, ctx.game.id, {
    settings: await getGameplaySettings(),
  });
  assert.deepEqual(inv.violations || [], []);

  await db.execute('UPDATE gl_game_chasse_pages SET etat = ? WHERE game_id = ? AND zone_id = ?', [
    etatAvant.etat,
    ctx.game.id,
    zone.id,
  ]);
  await ouvrirTourEnJeu(request, app, ctx);
});

test('Seuil : plus aucune demande en attente', async () => {
  // Une chimère proposée par un élève attend sa relecture.
  const chimere = await request(app)
    .post(api('/tenir/chimeres'))
    .set(auth(membres(1)[0].token))
    .send({ nom: 'Lapin-hibou', histoire: 'Il dort le jour dans un terrier et chasse la nuit.' });
  assert.equal(chimere.status, 201, JSON.stringify(chimere.body));
  const f = await file();
  const ligne = f.demandes.find((d) => d.kind === 'chimere');
  assert.ok(ligne, JSON.stringify(f));
  assert.equal(ligne.detail, '« Lapin-hibou »');
  assert.equal(
    ligne.payload.nom,
    undefined,
    'le texte de l’élève n’est pas recopié dans la demande',
  );

  await phase({ phase: 'souffle', dort: true }).expect(200);
  await phase({ phase: 'clos' }).expect(200);
  const fin = await request(app).post(api('/end')).set(auth(ctx.adminToken));
  assert.ok([200, 201].includes(fin.status), JSON.stringify(fin.body));
  const restantes = await db.queryOne(
    "SELECT COUNT(*) AS n FROM gl_game_demandes WHERE game_id = ? AND statut = 'en_attente'",
    [ctx.game.id],
  );
  assert.equal(Number(restantes.n), 0);
  // La proposition, elle, reste à relire dans son panneau.
  const c = await db.queryOne('SELECT statut FROM gl_game_chimeres WHERE id = ?', [
    chimere.body.chimere.id,
  ]);
  assert.equal(c.statut, 'proposee');

  // Après le Seuil, une proposition ne rouvre aucune ligne : plus rien ne la fermerait.
  const tardive = await request(app)
    .post(api('/tenir/chimeres'))
    .set(auth(membres(1)[0].token))
    .send({ nom: 'Hérisson-loutre', histoire: 'Il nage dans la rivière et se met en boule.' });
  assert.ok(tardive.status < 500, JSON.stringify(tardive.body));
  const apresSeuil = await db.queryOne(
    "SELECT COUNT(*) AS n FROM gl_game_demandes WHERE game_id = ? AND statut = 'en_attente'",
    [ctx.game.id],
  );
  assert.equal(Number(apresSeuil.n), 0);
});
