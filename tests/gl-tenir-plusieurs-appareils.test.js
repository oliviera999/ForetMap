'use strict';

/**
 * « Tenir à deux », ensemble unifié, PR 3 (M13) — plusieurs appareils par équipe :
 * version d'état (`ETAT_PERIME`, sans perte), la main (`MAIN_AILLEURS`, 60 s au plus, aucune
 * attente sans sortie), sessions d'équipe protégées (demande acceptée par un appareil de
 * l'équipe ou par le prof, deux minutes), absent spectateur, délai de débat.
 */

require('./helpers/setup');
const { test, before, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const db = require('../database');
const {
  createTenirGame,
  setPlayerBourses,
  ouvrirTourEnJeu,
  ouvrirTablette,
  importExempleChasse,
} = require('./helpers/glTenirFixtures');
const glClock = require('../lib/glClock');
const equipeEtat = require('../lib/glEquipeEtat');
const core = require('../lib/shared/glMainCore');
const { findForbiddenString } = require('../lib/shared/glGardeFousCore');
const { checkTenirInvariantsFromDb } = require('../lib/glTenirInvariants');
const { getGameplaySettings } = require('../lib/glSettings');
const { resolveTenirPermissions } = require('../lib/shared/glTenirPermissionsCore');

const auth = (t) => ({ Authorization: `Bearer ${t}` });
const api = (ctx, p) => `/api/gl/games/${ctx.game.id}${p}`;
const membres = (ctx, i) => ctx.players.filter((p) => Number(p.teamId) === Number(ctx.teams[i].id));
/** Zone d'exemple `cz-p1-01`, centrée en (0.35, 0.30) ; (0.9, 0.9) est loin de tout. */
const DANS_LA_ZONE = { x: 0.35, y: 0.3 };
const LOIN = { x: 0.9, y: 0.9 };

let serie = 0;
async function nouvellePartie({ tour = true } = {}) {
  serie += 1;
  const ctx = await createTenirGame({ stamp: Date.now() + serie });
  await importExempleChasse(db, { game: ctx.game });
  for (const p of ctx.players) await setPlayerBourses(p.id, 5, 5);
  if (tour) await ouvrirTourEnJeu(request, app, ctx);
  return ctx;
}

async function vue(ctx, token) {
  const res = await request(app).get(api(ctx, '')).set(auth(token));
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body.tenir;
}

/** Un geste, avec la version vue (en-tête posé par l'app) quand elle est donnée. */
function geste(ctx, token, path, body = {}, version = null) {
  let req = request(app).post(api(ctx, path)).set(auth(token));
  if (version != null) req = req.set(equipeEtat.EN_TETE_VERSION, String(version));
  return req.send(body);
}

async function jets(ctx, teamId) {
  const row = await db.queryOne(
    "SELECT COUNT(*) AS n FROM gl_game_events WHERE game_id = ? AND team_id = ? AND event_type = 'dice_roll'",
    [ctx.game.id, teamId],
  );
  return Number(row.n);
}

before(async () => {
  await db.initSchema();
});

afterEach(() => {
  glClock.resetSim();
});

test('noyau : porteur, version, main échue, textes sans mot interdit', () => {
  assert.equal(core.porteurDe({ kind: 'player', playerId: 12 }), 'p:12');
  assert.equal(core.porteurDe({ kind: 'team' }, 'abcd'), 's:abcd');
  assert.equal(core.porteurDe({ kind: 'team' }), null);
  assert.equal(core.porteurDe({ kind: 'mj' }), null);
  assert.equal(core.porteurDe(null), null);
  assert.equal(core.joueurDuPorteur('p:12'), 12);
  assert.equal(core.joueurDuPorteur('s:abcd'), null);

  assert.equal(core.lireVersionVue('7'), 7);
  assert.equal(core.lireVersionVue(0), 0);
  for (const brut of [null, undefined, '', 'x', -1, 1.5]) {
    assert.equal(core.lireVersionVue(brut), null, `version ${brut}`);
  }
  assert.equal(core.versionPerimee(null, 9), false, 'une version absente n’est jamais périmée');
  assert.equal(core.versionPerimee(9, 9), false);
  assert.equal(core.versionPerimee(8, 9), true);

  const row = { main_holder: 'p:12', main_geste: 'repondre', main_expire_ms: 1000 };
  assert.deepEqual(core.mainTenue(row, 999), { holder: 'p:12', geste: 'repondre', expireMs: 1000 });
  assert.equal(core.mainTenue(row, 1000), null, 'une main échue ne compte plus');
  assert.equal(core.mainTenue({ main_holder: null, main_expire_ms: 5000 }, 0), null);
  assert.equal(core.mainTenue({ main_holder: 'p:1', main_expire_ms: null }, 0), null);
  const main = core.mainTenue(row, 0);
  assert.equal(core.peutAgir(null, 'p:1'), true);
  assert.equal(core.peutAgir(main, 'p:12'), true);
  assert.equal(core.peutAgir(main, 'p:13'), false);
  assert.equal(core.peutAgir(main, null), false);

  assert.equal(core.texteMain({ prenom: 'Lina', geste: 'repondre' }), 'Lina répond…');
  assert.equal(core.texteMain({ geste: 'fouiller' }), 'Une autre tablette fouille…');
  assert.equal(core.texteMain({ prenom: 'Lina', geste: 'inconnu' }), 'Lina joue…');
  // Un compte sans prénom n'est pas « une tablette ».
  assert.equal(core.texteMain({ geste: 'repondre', tablette: false }), 'Un autre appareil répond…');
  assert.equal(
    core.messageMainAilleurs({ geste: 'sort', tablette: false }),
    'Un autre appareil prépare un sort… Attendez la fin de son geste.',
  );
  assert.equal(
    core.decrireMain({ main, porteur: 'p:13', prenom: null, nowMs: 0 }).texte,
    'Un autre appareil répond…',
  );
  const autre = core.decrireMain({ main, porteur: 'p:13', prenom: 'Lina', nowMs: 400 });
  assert.deepEqual(autre, {
    moi: false,
    geste: 'repondre',
    tablette: false,
    prenom: 'Lina',
    texte: 'Lina répond…',
    resteSecondes: 1,
  });
  const moi = core.decrireMain({ main, porteur: 'p:12', prenom: 'Lina', nowMs: 0 });
  assert.deepEqual([moi.moi, moi.prenom, moi.texte], [true, null, '']);
  assert.equal(core.decrireMain({ main: null, porteur: 'p:12', nowMs: 0 }), null);
  const tab = core.decrireMain({
    main: { holder: 's:ab', geste: 'sort', expireMs: 10 },
    porteur: 'p:1',
    prenom: 'ignoré',
    nowMs: 0,
  });
  assert.deepEqual(
    [tab.tablette, tab.prenom, tab.texte],
    [true, null, 'Une autre tablette prépare un sort…'],
  );

  assert.equal(core.resteDeDebat({ delaiSecondes: 8, ecouleMs: 0 }), 8);
  assert.equal(core.resteDeDebat({ delaiSecondes: 8, ecouleMs: 2500 }), 6);
  assert.equal(core.resteDeDebat({ delaiSecondes: 8, ecouleMs: 8000 }), 0);
  assert.equal(core.resteDeDebat({ delaiSecondes: 0, ecouleMs: 0 }), 0);
  assert.equal(core.resteDeDebat({}), 0);

  // Tout texte lu par un élève passe le crible des chaînes interdites.
  const textes = [
    core.MESSAGE_ETAT_PERIME,
    core.MESSAGE_SPECTATEUR,
    ...core.GESTES_DE_MAIN.flatMap((g) => [
      core.texteMain({ prenom: 'Lina', geste: g }),
      core.messageMainAilleurs({ geste: g }),
    ]),
  ];
  for (const t of textes) assert.equal(findForbiddenString(t), null, t);
  assert.equal(core.MAIN_DUREE_MS, 60000);
  assert.equal(core.DEMANDE_APPAREIL_SECONDES, 120);
});

test('droits : un spectateur ne joue rien pendant un tour ouvert, et rejoue le tour clos', () => {
  const base = { surface: 'tablette', actorKind: 'player', settings: {} };
  const enJeu = resolveTenirPermissions({ ...base, phase: 'jeu', spectateur: true });
  assert.ok(Object.values(enJeu).every((v) => v === false));
  const clos = resolveTenirPermissions({ ...base, phase: 'clos', spectateur: true });
  assert.equal(clos.lire, true);
  assert.equal(clos.marche, true);
  const present = resolveTenirPermissions({ ...base, phase: 'jeu', spectateur: false });
  assert.equal(present.lancer, true);
  const prof = resolveTenirPermissions({
    ...base,
    actorKind: 'mj',
    phase: 'jeu',
    spectateur: true,
  });
  assert.equal(prof.lancer, true, 'le prof n’est jamais spectateur');
});

test('version d’état : un geste périmé est refusé sans perte ; un geste rejoué ne s’applique pas deux fois', async () => {
  const ctx = await nouvellePartie();
  const team = ctx.teams[0];
  const tablette = await ouvrirTablette({ gameId: ctx.game.id, teamId: team.id });
  const avant = (await vue(ctx, tablette.token)).equipe;
  assert.deepEqual(
    [avant.gameId, avant.teamId, avant.main, avant.appareils],
    [Number(ctx.game.id), Number(team.id), null, []],
  );
  assert.ok(Number.isInteger(avant.version));

  // Le geste part avec la version vue ; la réponse rend la version suivante.
  const fouille = await geste(ctx, tablette.token, '/chasse/fouiller', LOIN, avant.version);
  assert.equal(fouille.status, 201, JSON.stringify(fouille.body));
  assert.deepEqual(fouille.body.etatVersion, {
    gameId: Number(ctx.game.id),
    teamId: Number(team.id),
    version: avant.version + 1,
  });
  assert.equal(fouille.body.fouilles.restantes, 1);

  // Coupure réseau : l'app rejoue le même geste, avec la même version. Rien ne se rejoue.
  const rejoue = await geste(ctx, tablette.token, '/chasse/fouiller', LOIN, avant.version);
  assert.equal(rejoue.status, 409, JSON.stringify(rejoue.body));
  assert.equal(rejoue.body.code, 'ETAT_PERIME');
  assert.equal(rejoue.body.error, 'L’équipe a déjà joué ce geste. Voici où vous en êtes.');
  assert.equal(
    rejoue.body.etatVersion.version,
    avant.version + 1,
    'la version courante est rendue',
  );
  const carnet = await request(app).get(api(ctx, '/chasse')).set(auth(tablette.token));
  assert.equal(carnet.body.fouilles.restantes, 1, 'une seule fouille consommée');
  assert.equal(carnet.body.empreintes.length, 1, 'une seule empreinte');
  assert.equal((await vue(ctx, tablette.token)).equipe.version, avant.version + 1, 'sans perte');

  // Un geste que le moteur refuse rend sa version : personne n'est périmé pour autant.
  const jet = await geste(
    ctx,
    tablette.token,
    '/tenir/lancer',
    { mode: 'serveur' },
    avant.version + 1,
  );
  assert.equal(jet.status, 201, JSON.stringify(jet.body));
  const v = jet.body.etatVersion.version;
  const deuxieme = await geste(ctx, tablette.token, '/tenir/lancer', { mode: 'serveur' }, v);
  assert.equal(deuxieme.status, 409, JSON.stringify(deuxieme.body));
  assert.equal(deuxieme.body.code, 'DICE_ALREADY_ROLLED');
  assert.equal('etatVersion' in deuxieme.body, false);
  assert.equal((await vue(ctx, tablette.token)).equipe.version, v, 'la version refusée est rendue');

  // Un ancien écran, sans version : accepté comme avant (le moteur rejoue toujours ses règles).
  const sansVersion = await geste(ctx, tablette.token, '/tenir/arrivee/garder');
  assert.ok([200, 409].includes(sansVersion.status), JSON.stringify(sansVersion.body));

  // Le geste du prof pour l'équipe avance la version : l'écran de l'équipe le saura périmé.
  const vAvantProf = (await vue(ctx, tablette.token)).equipe.version;
  const prof = await geste(ctx, ctx.adminToken, '/chasse/fouiller', { ...LOIN, teamId: team.id });
  assert.equal(prof.status, 201, JSON.stringify(prof.body));
  assert.equal((await vue(ctx, tablette.token)).equipe.version, vAvantProf + 1);
  const perime = await geste(ctx, tablette.token, '/chasse/fouiller', LOIN, vAvantProf);
  assert.equal(perime.status, 409);
  assert.equal(perime.body.code, 'ETAT_PERIME');
});

test('deux appareils, même version, même instant : un seul geste passe (0 doublon)', async () => {
  const ctx = await nouvellePartie();
  const team = ctx.teams[1];
  const a = await ouvrirTablette({ gameId: ctx.game.id, teamId: team.id });
  const b = await ouvrirTablette({ gameId: ctx.game.id, teamId: team.id });
  const [eleve] = membres(ctx, 1);
  const version = (await vue(ctx, a.token)).equipe.version;
  const resultats = await Promise.all(
    [a.token, b.token, eleve.token].map((t) =>
      geste(ctx, t, '/tenir/lancer', { mode: 'serveur' }, version),
    ),
  );
  const statuts = resultats.map((r) => r.status).sort();
  assert.deepEqual(statuts, [201, 409, 409], JSON.stringify(resultats.map((r) => r.body)));
  for (const r of resultats.filter((x) => x.status === 409)) {
    assert.equal(r.body.code, 'ETAT_PERIME', JSON.stringify(r.body));
  }
  assert.equal(await jets(ctx, team.id), 1, 'un seul jet au journal');
  const inv = await checkTenirInvariantsFromDb(db, ctx.game.id, {
    settings: await getGameplaySettings(),
  });
  assert.deepEqual(inv.violations || [], []);
});

test('la main : un geste décisif la prend, les autres appareils attendent, elle se rend à la fin', async () => {
  const ctx = await nouvellePartie();
  const team = ctx.teams[2];
  const [lina, camarade] = membres(ctx, 2);
  await db.execute("UPDATE gl_players SET first_name = 'Lina', last_name = 'Secret' WHERE id = ?", [
    lina.id,
  ]);
  const tablette = await ouvrirTablette({ gameId: ctx.game.id, teamId: team.id });

  // Lina fouille depuis son compte, dans une zone : la question s'ouvre, elle garde la main.
  const fouille = await geste(ctx, lina.token, '/chasse/fouiller', DANS_LA_ZONE);
  assert.equal(fouille.status, 201, JSON.stringify(fouille.body));
  assert.equal(fouille.body.verdict, 'zone');
  assert.ok(fouille.body.question?.presentationToken);

  const chezLina = (await vue(ctx, lina.token)).equipe.main;
  assert.deepEqual([chezLina.moi, chezLina.geste, chezLina.texte], [true, 'fouiller', '']);
  const chezLaTablette = (await vue(ctx, tablette.token)).equipe.main;
  assert.deepEqual(
    [chezLaTablette.moi, chezLaTablette.prenom, chezLaTablette.texte, chezLaTablette.tablette],
    [false, 'Lina', 'Lina fouille…', false],
  );
  assert.ok(chezLaTablette.resteSecondes > 0 && chezLaTablette.resteSecondes <= 60);
  assert.ok(!JSON.stringify(chezLaTablette).includes('Secret'), 'prénom seul');

  // Les autres appareils de l'équipe refusent proprement ; rien n'est consommé.
  for (const token of [tablette.token, camarade.token]) {
    const refus = await geste(ctx, token, '/chasse/fouiller', LOIN);
    assert.equal(refus.status, 409, JSON.stringify(refus.body));
    assert.equal(refus.body.code, 'MAIN_AILLEURS');
    assert.equal(refus.body.error, 'Lina fouille… Attendez la fin de son geste.');
    assert.equal(refus.body.main.prenom, 'Lina');
    assert.ok(!JSON.stringify(refus.body).includes('Secret'));
    const jet = await geste(ctx, token, '/tenir/lancer', { mode: 'serveur' });
    assert.equal(jet.status, 409);
    assert.equal(jet.body.code, 'MAIN_AILLEURS');
  }
  const carnet = await request(app).get(api(ctx, '/chasse')).set(auth(lina.token));
  assert.equal(carnet.body.fouilles.restantes, 1, 'les refus n’ont rien consommé');
  // Une autre équipe n'est pas concernée, et ne lit pas la main des autres.
  const ailleurs = await geste(ctx, membres(ctx, 0)[0].token, '/chasse/fouiller', LOIN);
  assert.equal(ailleurs.status, 201, JSON.stringify(ailleurs.body));
  assert.equal((await vue(ctx, membres(ctx, 0)[0].token)).equipe.main, null);
  // Le prof n'est jamais retenu par la main.
  const prof = await geste(ctx, ctx.adminToken, '/tenir/lancer', {
    mode: 'serveur',
    teamId: team.id,
  });
  assert.equal(prof.status, 201, JSON.stringify(prof.body));

  // Lina répond : la main se rend à la fin du geste.
  const reponse = await geste(ctx, lina.token, '/chasse/repondre', {
    presentationToken: fouille.body.question.presentationToken,
    questionCode: fouille.body.question.questionCode,
    choiceId: fouille.body.question.choices[0].id,
  });
  assert.equal(reponse.status, 200, JSON.stringify(reponse.body));
  assert.equal((await vue(ctx, tablette.token)).equipe.main, null);
  const libre = await geste(ctx, tablette.token, '/chasse/fouiller', LOIN);
  assert.equal(libre.status, 201, JSON.stringify(libre.body));
  // Une fouille sans question ne garde pas la main.
  assert.equal((await vue(ctx, lina.token)).equipe.main, null);
});

test('la main se rend quand le prof finit le geste à la place de l’équipe', async () => {
  const ctx = await nouvellePartie();
  const team = ctx.teams[2];
  const [lina] = membres(ctx, 2);
  const tablette = await ouvrirTablette({ gameId: ctx.game.id, teamId: team.id });
  // Lina fouille dans une zone : la question s'ouvre, elle tient la main.
  const fouille = await geste(ctx, lina.token, '/chasse/fouiller', DANS_LA_ZONE);
  assert.equal(fouille.status, 201, JSON.stringify(fouille.body));
  assert.ok(fouille.body.question?.presentationToken);
  assert.equal((await vue(ctx, tablette.token)).equipe.main.geste, 'fouiller');
  // Un geste du prof qui ne finit pas celui de l'équipe ne lui retire pas la main.
  const jet = await geste(ctx, ctx.adminToken, '/tenir/lancer', {
    mode: 'serveur',
    teamId: team.id,
  });
  assert.equal(jet.status, 201, JSON.stringify(jet.body));
  assert.equal((await vue(ctx, tablette.token)).equipe.main.geste, 'fouiller');
  // Le prof répond pour l'équipe : le geste est fini, les autres écrans ne restent pas grisés
  // jusqu'à l'échéance de la main.
  const reponse = await geste(ctx, ctx.adminToken, '/chasse/repondre', {
    teamId: team.id,
    presentationToken: fouille.body.question.presentationToken,
    questionCode: fouille.body.question.questionCode,
    choiceId: fouille.body.question.choices[0].id,
  });
  assert.equal(reponse.status, 200, JSON.stringify(reponse.body));
  assert.equal((await vue(ctx, tablette.token)).equipe.main, null);
  const libre = await geste(ctx, tablette.token, '/chasse/fouiller', LOIN);
  assert.equal(libre.status, 201, JSON.stringify(libre.body));
});

test('la main n’attend jamais sans sortie : échéance à 60 s, « rendre », changement de phase, déconnexion', async () => {
  const ctx = await nouvellePartie();
  const team = ctx.teams[3];
  const a = await ouvrirTablette({ gameId: ctx.game.id, teamId: team.id });
  const b = await ouvrirTablette({ gameId: ctx.game.id, teamId: team.id });
  const quiz = ctx.markers.find((m) => m.event_type === 'quiz');
  await db.execute('UPDATE gl_teams SET position_marker_id = ? WHERE id = ?', [quiz.id, team.id]);
  const prendre = async () => {
    const etat = await equipeEtat.prendreGeste(db, {
      gameId: ctx.game.id,
      teamId: team.id,
      porteur: equipeEtat.porteurDeLAuth({
        teamSession: {
          jti: require('../lib/auth/jwtPipeline').verifyJwtToken(
            a.token,
            require('../middleware/requireTeacher').JWT_SECRET,
          ).team_session.jti,
        },
      }),
      prendre: 'repondre',
    });
    assert.equal(etat.ok, true);
  };

  // 1. La question de la case prend la main ; B attend ; 61 s plus tard, la main est échue.
  const question = await geste(ctx, a.token, `/markers/${quiz.id}/present-question`);
  assert.equal(question.status, 200, JSON.stringify(question.body));
  const tenue = (await vue(ctx, b.token)).equipe.main;
  assert.deepEqual(
    [tenue.moi, tenue.tablette, tenue.prenom, tenue.texte],
    [false, true, null, 'Une autre tablette répond…'],
  );
  assert.equal((await geste(ctx, b.token, '/chasse/fouiller', LOIN)).body.code, 'MAIN_AILLEURS');
  glClock.setSimOffsetMs(61 * 1000);
  assert.equal((await vue(ctx, b.token)).equipe.main, null, 'échue : plus personne ne la tient');
  const apresEcheance = await geste(ctx, b.token, '/chasse/fouiller', LOIN);
  assert.equal(apresEcheance.status, 201, JSON.stringify(apresEcheance.body));
  glClock.resetSim();

  // 2. « Rendre » : l'appareil ferme sa question sans répondre.
  await prendre();
  assert.equal((await vue(ctx, b.token)).equipe.main.geste, 'repondre');
  const pasLaMienne = await geste(ctx, b.token, '/tenir/main/rendre');
  assert.deepEqual([pasLaMienne.status, pasLaMienne.body.rendue], [200, false]);
  const rendue = await geste(ctx, a.token, '/tenir/main/rendre');
  assert.deepEqual([rendue.status, rendue.body.rendue], [200, true]);
  assert.equal((await vue(ctx, b.token)).equipe.main, null);

  // 3. Déconnexion de l'appareil (socket fermée, ou tablette déconnectée par le prof).
  await prendre();
  const sessions = await request(app).get(api(ctx, '/tenir/sessions')).set(auth(ctx.adminToken));
  const deconnectee = await request(app)
    .delete(api(ctx, `/tenir/sessions/${a.id}`))
    .set(auth(ctx.adminToken));
  assert.equal(deconnectee.status, 200, JSON.stringify(deconnectee.body));
  assert.ok(sessions.body.sessions.some((s) => s.id === a.id));
  assert.equal(
    (await vue(ctx, b.token)).equipe.main,
    null,
    'une tablette déconnectée rend la main',
  );
  const [eleve] = membres(ctx, 3);
  assert.equal(
    (
      await equipeEtat.prendreGeste(db, {
        gameId: ctx.game.id,
        teamId: team.id,
        porteur: `p:${eleve.id}`,
        prendre: 'sort',
      })
    ).ok,
    true,
  );
  assert.deepEqual(await equipeEtat.rendreLesMainsDuPorteur(db, `p:${eleve.id}`), [
    { gameId: Number(ctx.game.id), teamId: Number(team.id) },
  ]);
  assert.deepEqual(await equipeEtat.rendreLesMainsDuPorteur(db, `p:${eleve.id}`), []);
  assert.equal((await vue(ctx, b.token)).equipe.main, null);

  // 4. Changement de phase : toutes les mains se rendent.
  await equipeEtat.prendreGeste(db, {
    gameId: ctx.game.id,
    teamId: team.id,
    porteur: `p:${eleve.id}`,
    prendre: 'tenir',
  });
  const phase = await request(app)
    .post(api(ctx, '/tenir/tour/phase'))
    .set(auth(ctx.adminToken))
    .send({ phase: 'souffle', dort: true });
  assert.equal(phase.status, 200, JSON.stringify(phase.body));
  const reste = await db.queryOne(
    'SELECT COUNT(*) AS n FROM gl_team_etat WHERE game_id = ? AND main_holder IS NOT NULL',
    [ctx.game.id],
  );
  assert.equal(Number(reste.n), 0);
});

test('sessions d’équipe protégées : une tablette n’entre que si un appareil de l’équipe, ou le prof, l’accepte', async () => {
  const ctx = await nouvellePartie();
  const team = ctx.teams[0];
  const lien = (
    await request(app).get(`/api/gl/classes/${ctx.cls.id}/lien`).set(auth(ctx.adminToken))
  ).body;
  const demander = async (teamId = team.id) => {
    const res = await request(app)
      .post('/api/gl/class-link/session')
      .send({ code: lien.code, teamId });
    assert.equal(res.status, 202, JSON.stringify(res.body));
    assert.equal(res.body.enAttente, true);
    assert.equal(res.body.demandeExpireDansSecondes, 120);
    return res.body;
  };
  const etatDemande = async (token) =>
    (await request(app).get('/api/gl/class-link/demande').set(auth(token))).body;
  const repondre = (token, sessionId, decision) =>
    request(app)
      .post(api(ctx, `/tenir/sessions/${sessionId}/${decision}`))
      .set(auth(token));

  // Première tablette : en attente, elle ne lit ni ne joue rien ; le prof la voit et l'accepte.
  const premiere = await demander();
  assert.equal((await etatDemande(premiere.token)).statut, 'en_attente');
  const lecture = await request(app).get(api(ctx, '')).set(auth(premiere.token));
  assert.equal(lecture.status, 401, JSON.stringify(lecture.body));
  const jet = await geste(ctx, premiere.token, '/tenir/lancer', { mode: 'serveur' });
  assert.equal(jet.status, 401);
  const console1 = await request(app).get(api(ctx, '/tenir/sessions')).set(auth(ctx.adminToken));
  assert.deepEqual(console1.body.sessions, []);
  assert.deepEqual(
    console1.body.demandes.map((d) => [d.id, d.teamId]),
    [[premiere.sessionId, Number(team.id)]],
  );
  assert.ok(!JSON.stringify(console1.body).includes(premiere.token), 'aucun jeton');
  assert.equal((await vue(ctx, ctx.adminToken)).appareilsEnAttente, 1);
  // Elle ne s'accepte pas elle-même.
  assert.equal((await repondre(premiere.token, premiere.sessionId, 'accepter')).status, 401);
  assert.equal((await repondre(ctx.adminToken, premiere.sessionId, 'accepter')).status, 200);
  assert.equal((await etatDemande(premiere.token)).statut, 'acceptee');
  assert.equal((await request(app).get(api(ctx, '')).set(auth(premiere.token))).status, 200);

  // Deuxième tablette : la première la voit arriver et l'accepte.
  const deuxieme = await demander();
  const vueEquipe = (await vue(ctx, premiere.token)).equipe;
  assert.deepEqual(
    vueEquipe.appareils.map((d) => d.id),
    [deuxieme.sessionId],
  );
  assert.ok(
    vueEquipe.appareils[0].resteSecondes > 0 && vueEquipe.appareils[0].resteSecondes <= 120,
  );
  // Une autre équipe ne voit pas la demande et ne peut pas y répondre.
  const [intrus] = membres(ctx, 1);
  assert.deepEqual((await vue(ctx, intrus.token)).equipe.appareils, []);
  assert.equal((await repondre(intrus.token, deuxieme.sessionId, 'accepter')).status, 403);
  assert.equal((await repondre(premiere.token, deuxieme.sessionId, 'accepter')).status, 200);
  assert.equal((await etatDemande(deuxieme.token)).statut, 'acceptee');

  // Troisième : acceptée par le compte d'un membre ; quatrième : refusée.
  const [membre] = membres(ctx, 0);
  const troisieme = await demander();
  assert.equal((await repondre(membre.token, troisieme.sessionId, 'accepter')).status, 200);
  const quatrieme = await demander();
  assert.equal((await repondre(membre.token, quatrieme.sessionId, 'refuser')).status, 200);
  assert.equal((await etatDemande(quatrieme.token)).statut, 'refusee');
  assert.equal((await request(app).get(api(ctx, '')).set(auth(quatrieme.token))).status, 401);
  const dejaRepondu = await repondre(membre.token, quatrieme.sessionId, 'accepter');
  assert.equal(dejaRepondu.status, 404);
  assert.equal(dejaRepondu.body.code, 'DEMANDE_APPAREIL_INTROUVABLE');

  // Sans réponse, une demande expire seule au bout de deux minutes.
  const oubliee = await demander();
  await db.execute(
    'UPDATE gl_guest_tokens SET expires_at = DATE_SUB(NOW(), INTERVAL 1 SECOND) WHERE id = ?',
    [oubliee.sessionId],
  );
  assert.equal((await etatDemande(oubliee.token)).statut, 'expiree');
  assert.equal((await repondre(ctx.adminToken, oubliee.sessionId, 'accepter')).status, 404);
  assert.deepEqual((await vue(ctx, premiere.token)).equipe.appareils, []);

  // « Tout accepter » en début de séance : une demande par équipe, un seul appui.
  const enAttente = [];
  for (const t of ctx.teams.slice(1)) enAttente.push(await demander(t.id));
  const tout = await request(app)
    .post(api(ctx, '/tenir/sessions/accepter-tout'))
    .set(auth(ctx.adminToken));
  assert.deepEqual([tout.status, tout.body.acceptees], [200, 3]);
  for (const d of enAttente) assert.equal((await etatDemande(d.token)).statut, 'acceptee');
  assert.equal((await vue(ctx, ctx.adminToken)).appareilsEnAttente, 0);
  // Réservé au prof.
  assert.equal(
    (await request(app).post(api(ctx, '/tenir/sessions/accepter-tout')).set(auth(membre.token)))
      .status,
    403,
  );
  // Sans jeton de demande, rien à lire.
  assert.equal((await request(app).get('/api/gl/class-link/demande')).status, 401);
  assert.equal(
    (await request(app).get('/api/gl/class-link/demande').set(auth(membre.token))).status,
    404,
  );
});

test('absent spectateur : avec son compte, un élève absent ou en retrait voit tout et ne joue rien', async () => {
  const ctx = await nouvellePartie();
  const team = ctx.teams[0];
  const [absent, present] = membres(ctx, 0);
  const tablette = await ouvrirTablette({ gameId: ctx.game.id, teamId: team.id });
  const declare = await geste(ctx, present.token, '/tenir/presences', { absents: [absent.id] });
  assert.equal(declare.status, 200, JSON.stringify(declare.body));

  const tenir = await vue(ctx, absent.token);
  assert.equal(tenir.spectateur, true);
  assert.ok(
    Object.values(tenir.permissions).every((v) => v === false),
    'aucun geste',
  );
  // Il voit tout : le tour, le carnet, le plateau.
  assert.equal(
    (await request(app).get(api(ctx, '/tenir/tour')).set(auth(absent.token))).status,
    200,
  );
  assert.equal((await request(app).get(api(ctx, '/chasse')).set(auth(absent.token))).status, 200);
  for (const [path, body] of [
    ['/tenir/lancer', { mode: 'serveur' }],
    ['/chasse/fouiller', LOIN],
    ['/tenir/presences/arrivee', { playerId: absent.id }],
    ['/spell-casts/drafts', { spellCode: 'SL043', teamId: team.id }],
  ]) {
    const refus = await geste(ctx, absent.token, path, body);
    assert.equal(refus.status, 403, `${path} : ${JSON.stringify(refus.body)}`);
    assert.equal(refus.body.code, 'SPECTATEUR');
    assert.equal(refus.body.error, core.MESSAGE_SPECTATEUR);
    assert.match(refus.body.error, /^Tu regardes ce tour .* dis-le à ton équipe ou au prof\.$/);
  }
  // Un spectateur ne fait pas entrer un appareil : il jouerait par la tablette qu'il accepte.
  const demande = await ouvrirTablette({
    gameId: ctx.game.id,
    teamId: team.id,
    accepter: false,
  });
  const parLAbsent = await request(app)
    .post(api(ctx, `/tenir/sessions/${demande.id}/accepter`))
    .set(auth(absent.token));
  assert.deepEqual([parLAbsent.status, parLAbsent.body.code], [403, 'SPECTATEUR']);
  const parLePresent = await request(app)
    .post(api(ctx, `/tenir/sessions/${demande.id}/accepter`))
    .set(auth(present.token));
  assert.equal(parLePresent.status, 200, JSON.stringify(parLePresent.body));
  const don = await request(app)
    .post('/api/gl/market/dons')
    .set(auth(absent.token))
    .send({ receveurId: present.id, gemmes: 1 });
  assert.equal(don.status, 403, JSON.stringify(don.body));
  assert.equal(don.body.code, 'SPECTATEUR');
  assert.equal(await jets(ctx, team.id), 0);
  // Les présents, la tablette de l'équipe et le prof jouent comme d'habitude.
  assert.equal((await vue(ctx, present.token)).spectateur, false);
  assert.equal((await vue(ctx, tablette.token)).spectateur, false);
  assert.equal((await geste(ctx, present.token, '/chasse/fouiller', LOIN)).status, 201);

  // « Quelqu'un vient d'arriver » (dit par un camarade) : il rejoue aussitôt.
  const arrivee = await geste(ctx, present.token, '/tenir/presences/arrivee', {
    playerId: absent.id,
  });
  assert.equal(arrivee.status, 200, JSON.stringify(arrivee.body));
  assert.equal((await vue(ctx, absent.token)).spectateur, false);
  assert.equal((await geste(ctx, absent.token, '/tenir/lancer', { mode: 'serveur' })).status, 201);

  // Le Retrait fait le même spectateur, jusqu'à la clôture du tour.
  const retrait = await request(app)
    .post(api(ctx, '/tenir/retrait'))
    .set(auth(ctx.adminToken))
    .send({ playerId: present.id, entree: true, motif: 'test' });
  assert.ok([200, 201].includes(retrait.status), JSON.stringify(retrait.body));
  const enRetrait = await vue(ctx, present.token);
  assert.deepEqual([enRetrait.enRetrait, enRetrait.spectateur], [true, true]);
  const refus = await geste(ctx, present.token, '/chasse/fouiller', LOIN);
  assert.deepEqual([refus.status, refus.body.code], [403, 'SPECTATEUR']);
  for (const p of ['souffle', 'clos']) {
    const res = await request(app)
      .post(api(ctx, '/tenir/tour/phase'))
      .set(auth(ctx.adminToken))
      .send({ phase: p, dort: true });
    assert.equal(res.status, 200, JSON.stringify(res.body));
  }
  const apres = await vue(ctx, present.token);
  assert.deepEqual([apres.enRetrait, apres.spectateur], [false, false], 'le tour clos, il rejoue');
});

test('délai de débat : réglage servi à l’écran (8 s par défaut), réglable de 0 à 60', async () => {
  const ctx = await nouvellePartie({ tour: false });
  const tenir = await vue(ctx, ctx.players[0].token);
  assert.equal(tenir.settings.delai_debat_secondes, 8);
  const { GL_SETTINGS_REGISTRY, validateGlSettingValue } = require('../lib/glSettings');
  const cle = 'gameplay.tenir_delai_debat_secondes';
  assert.deepEqual(
    [
      GL_SETTINGS_REGISTRY[cle].default,
      GL_SETTINGS_REGISTRY[cle].min,
      GL_SETTINGS_REGISTRY[cle].max,
    ],
    [8, 0, 60],
  );
  assert.deepEqual(validateGlSettingValue(cle, 0), { value: 0 }, '0 : allumé tout de suite');
  assert.deepEqual(validateGlSettingValue(cle, 60), { value: 60 });
  assert.ok(validateGlSettingValue(cle, 61).error, 'au-delà d’une minute : refusé');
  assert.ok(validateGlSettingValue(cle, 2.5).error, 'entier seulement');
});
