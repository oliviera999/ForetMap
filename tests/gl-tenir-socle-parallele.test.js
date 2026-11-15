'use strict';

/**
 * « Tenir à deux », lot 2, étape 2.1 — socle du jeu en parallèle : jetons invités (session
 * d'équipe révocable), acteur unique d'une requête de partie, « au nom de », demandes au prof
 * (`gl_game_demandes`), remboursement d'un sort (`rembourserCastTx`, cause `sort_rembourse`).
 */

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const db = require('../database');
const { createTenirGame, setPlayerBourses, ouvrirTourEnJeu } = require('./helpers/glTenirFixtures');
const {
  issueTeamSession,
  findValidTeamSession,
  revokeTeamSessions,
  listTeamSessions,
  hashJti,
} = require('../lib/glGuestToken');
const { buildActor, resolveGameActor, resolveActingPlayer } = require('../lib/glActeur');
const {
  creerDemandeTx,
  resoudreDemandeTx,
  annulerDemandesTx,
  listDemandes,
  compterDemandesEnAttente,
  KINDS_DE_LA_PHASE_JEU,
} = require('../lib/glDemandes');
const { rembourserCastTx } = require('../lib/glSpellCast');
const { creditReserveTx } = require('../lib/glBourses');
const { checkTenirInvariantsFromDb } = require('../lib/glTenirInvariants');
const { getGameplaySettings } = require('../lib/glSettings');
const { verifyJwtToken } = require('../lib/auth/jwtPipeline');
const { JWT_SECRET } = require('../middleware/requireTeacher');

let ctx;
let autre;
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const api = (p, c = ctx) => `/api/gl/games/${c.game.id}${p}`;
const equipe = (i) => ctx.teams[i];
const membres = (teamId) => ctx.players.filter((p) => Number(p.teamId) === Number(teamId));

before(async () => {
  await db.initSchema();
  ctx = await createTenirGame({ stamp: Date.now() });
  autre = await createTenirGame({ stamp: Date.now() + 1 });
  for (const p of ctx.players) await setPlayerBourses(p.id, 5, 5);
});

test('session d’équipe : émise, valide pour sa partie et son équipe, révocable ; rien de nominatif', async () => {
  const team = equipe(2);
  const s = await issueTeamSession(db, {
    gameId: ctx.game.id,
    teamId: team.id,
    classId: ctx.cls.id,
  });
  const claims = verifyJwtToken(s.token, JWT_SECRET);
  assert.equal(claims.userType, 'gl_guest');
  assert.deepEqual(Object.keys(claims.team_session).sort(), ['gameId', 'jti', 'teamId']);
  assert.ok(!JSON.stringify(claims).includes('joueur-'), 'aucun pseudo dans le jeton');
  const row = await db.queryOne('SELECT jti_hash FROM gl_guest_tokens WHERE id = ?', [s.id]);
  assert.equal(row.jti_hash, hashJti(claims.team_session.jti), 'seul le hachage est stocké');
  assert.notEqual(row.jti_hash, claims.team_session.jti);

  const ok = await findValidTeamSession(db, claims.team_session);
  assert.deepEqual(ok, {
    id: s.id,
    gameId: Number(ctx.game.id),
    teamId: Number(team.id),
    classId: Number(ctx.cls.id),
  });
  assert.equal(
    await findValidTeamSession(db, { ...claims.team_session, teamId: equipe(0).id }),
    null,
  );
  assert.equal(
    await findValidTeamSession(db, { ...claims.team_session, gameId: autre.game.id }),
    null,
  );
  assert.equal(await findValidTeamSession(db, { ...claims.team_session, jti: 'inconnu' }), null);
  assert.equal((await listTeamSessions(db, ctx.game.id)).length, 1);

  assert.equal(await revokeTeamSessions(db, { id: s.id }), 1);
  assert.equal(await findValidTeamSession(db, claims.team_session), null);
  await assert.rejects(() => revokeTeamSessions(db, {}), /critère requis/);
});

test('middleware : une tablette lit sa partie, pas une autre ; révoquée → 401 ; hors route de partie → 403', async () => {
  const team = equipe(2);
  const s = await issueTeamSession(db, { gameId: ctx.game.id, teamId: team.id });
  const lu = await request(app).get(api('/tenir/tour')).set(auth(s.token));
  assert.equal(lu.status, 200, JSON.stringify(lu.body));
  assert.equal('durees' in (lu.body.round || {}), false);

  const ailleurs = await request(app).get(api('/tenir/tour', autre)).set(auth(s.token));
  assert.equal(ailleurs.status, 403, JSON.stringify(ailleurs.body));

  // Une route prof et une route « compte requis » restent fermées.
  const prof = await request(app)
    .put(api('/tenir/sablier'))
    .set(auth(s.token))
    .send({ actif: false });
  assert.equal(prof.status, 403);
  const compte = await request(app).get('/api/gl/rewards/me').set(auth(s.token));
  assert.equal(compte.status, 403, JSON.stringify(compte.body));
  assert.equal(compte.body.guestBlocked, true);

  await revokeTeamSessions(db, { gameId: ctx.game.id, teamId: team.id });
  const apres = await request(app).get(api('/tenir/tour')).set(auth(s.token));
  assert.equal(apres.status, 401, JSON.stringify(apres.body));
  assert.equal(apres.body.code, 'TEAM_SESSION_TERMINEE');
});

test('acteur unique : prof, élève, tablette d’équipe ; « au nom de » vérifié présent et non en retrait', async () => {
  const team = equipe(0);
  const [eleve, camarade] = membres(team.id);
  const reqMj = { glAuth: { userType: 'gl_admin', userId: '7' } };
  const reqEleve = { glAuth: { userType: 'gl_player', userId: String(eleve.id) } };
  const reqTeam = {
    glAuth: {
      userType: 'gl_guest',
      teamSession: { gameId: ctx.game.id, teamId: team.id, jti: 'x' },
      teamSessionValide: true,
    },
  };
  assert.deepEqual(buildActor(reqMj.glAuth), { kind: 'mj' });
  assert.deepEqual(buildActor(reqEleve.glAuth), { kind: 'player', playerId: eleve.id });
  assert.deepEqual(buildActor(reqTeam.glAuth), {
    kind: 'team',
    gameId: Number(ctx.game.id),
    teamId: Number(team.id),
  });
  // Une session non validée n'est qu'un invité.
  assert.deepEqual(buildActor({ ...reqTeam.glAuth, teamSessionValide: false }), { kind: 'guest' });

  const mj = await resolveGameActor(reqMj, ctx.game.id, { teamIdFromBody: team.id });
  assert.deepEqual(
    [mj.kind, mj.actorKind, mj.teamId, mj.actorType],
    ['mj', 'mj', Number(team.id), 'mj'],
  );
  assert.equal((await resolveGameActor(reqMj, ctx.game.id)).status, 400);
  const el = await resolveGameActor(reqEleve, ctx.game.id);
  assert.deepEqual(
    [el.kind, el.teamId, el.playerId, el.actorId],
    ['player', Number(team.id), eleve.id, String(eleve.id)],
  );
  const tab = await resolveGameActor(reqTeam, ctx.game.id);
  assert.deepEqual(
    [tab.kind, tab.actorKind, tab.teamId, tab.playerId, tab.enRetrait, tab.actorType, tab.actorId],
    ['team', 'player', Number(team.id), null, false, 'team', `equipe-${team.id}`],
  );
  assert.equal((await resolveGameActor(reqTeam, autre.game.id)).code, 'TEAM_SESSION_AUTRE_PARTIE');
  assert.equal(
    (await resolveGameActor(reqTeam, ctx.game.id, { teamIdFromBody: equipe(1).id })).code,
    'TEAM_SESSION_AUTRE_EQUIPE',
  );

  // « Au nom de » : la tablette doit dire qui agit, parmi les présents de SON équipe.
  const base = { gameId: ctx.game.id, teamId: team.id };
  assert.equal((await resolveActingPlayer(reqTeam, base)).code, 'QUI_AGIT_REQUIS');
  assert.deepEqual(await resolveActingPlayer(reqTeam, { ...base, onBehalfOfPlayerId: eleve.id }), {
    ok: true,
    playerId: eleve.id,
    onBehalf: true,
  });
  const etranger = membres(equipe(1).id)[0];
  assert.equal(
    (await resolveActingPlayer(reqTeam, { ...base, onBehalfOfPlayerId: etranger.id })).code,
    'QUI_AGIT_INVALIDE',
  );
  await db.execute(
    'INSERT INTO gl_game_retraits (game_id, player_id, motif, entree_at) VALUES (?, ?, NULL, NOW())',
    [ctx.game.id, camarade.id],
  );
  assert.equal(
    (await resolveActingPlayer(reqTeam, { ...base, onBehalfOfPlayerId: camarade.id })).code,
    'QUI_AGIT_INVALIDE',
    'un élève en retrait n’agit pas depuis la tablette',
  );
  await db.execute('DELETE FROM gl_game_retraits WHERE game_id = ? AND player_id = ?', [
    ctx.game.id,
    camarade.id,
  ]);
  // Un élève n'agit que pour lui.
  assert.deepEqual(await resolveActingPlayer(reqEleve, base), {
    ok: true,
    playerId: eleve.id,
    onBehalf: false,
  });
  assert.equal(
    (await resolveActingPlayer(reqEleve, { ...base, onBehalfOfPlayerId: camarade.id })).code,
    'QUI_AGIT_INVALIDE',
  );
});

test('demandes au prof : création idempotente, file dans l’ordre, résolution, sortie automatique', async () => {
  const g = ctx.game.id;
  const a = await db.withTransaction((tx) =>
    creerDemandeTx(tx, {
      gameId: g,
      roundNumber: 1,
      teamId: equipe(0).id,
      kind: 'des_a_valider',
      refId: 11,
    }),
  );
  const bis = await db.withTransaction((tx) =>
    creerDemandeTx(tx, {
      gameId: g,
      roundNumber: 1,
      teamId: equipe(0).id,
      kind: 'des_a_valider',
      refId: 11,
    }),
  );
  assert.equal(bis, a, 'même source : une seule demande en attente');
  await db.withTransaction((tx) =>
    creerDemandeTx(tx, {
      gameId: g,
      roundNumber: 1,
      teamId: equipe(1).id,
      kind: 'sort_a_appliquer',
      refId: 5,
      payload: { spellCode: 'SL046' },
    }),
  );
  await db.withTransaction((tx) =>
    creerDemandeTx(tx, {
      gameId: g,
      roundNumber: 1,
      teamId: equipe(2).id,
      kind: 'presence_a_confirmer',
      refId: `1:${equipe(2).id}`,
    }),
  );
  await assert.rejects(
    () => db.withTransaction((tx) => creerDemandeTx(tx, { gameId: g, kind: 'inconnue', refId: 1 })),
    /Demande inconnue/,
  );
  const file = await listDemandes(db, g);
  assert.deepEqual(
    file.map((d) => d.kind),
    ['des_a_valider', 'sort_a_appliquer', 'presence_a_confirmer'],
  );
  assert.deepEqual(file[1].payload, { spellCode: 'SL046' });
  assert.equal(await compterDemandesEnAttente(db, g), 3);

  assert.equal(
    await db.withTransaction((tx) =>
      resoudreDemandeTx(tx, { gameId: g, kind: 'des_a_valider', refId: 11 }),
    ),
    1,
  );
  // Sortie de la phase « jeu » : ce qui n'a plus d'objet s'annule ; le sort du prof reste.
  const annulees = await db.withTransaction((tx) =>
    annulerDemandesTx(tx, { gameId: g, kinds: KINDS_DE_LA_PHASE_JEU }),
  );
  assert.equal(annulees, 1);
  assert.deepEqual(
    (await listDemandes(db, g)).map((d) => d.kind),
    ['sort_a_appliquer'],
  );
  // Seuil : tout se ferme.
  assert.equal(await db.withTransaction((tx) => annulerDemandesTx(tx, { gameId: g })), 1);
  assert.equal(await compterDemandesEnAttente(db, g), 0);
  const toutes = await listDemandes(db, g, { statut: null });
  assert.deepEqual(toutes.map((d) => d.statut).sort(), ['annulee', 'annulee', 'traitee']);
});

test('remboursement d’un sort : bourses et réserve à l’identique, livre équilibré, une seule fois', async () => {
  await ouvrirTourEnJeu(request, app, ctx);
  const team = equipe(2); // Licornes : Lanterne coûte 2 gemmes
  const joueurs = membres(team.id);
  // La réserve paie d'abord : 1 gemme en réserve, le reste par le pot.
  await db.withTransaction((tx) =>
    creditReserveTx(tx, { gameId: ctx.game.id, teamId: team.id, dg: 1, cause: 'reserve_entree' }),
  );
  const lire = async () => ({
    bourses: await db.queryAll(
      `SELECT id, health_points, power_points FROM gl_players WHERE id IN (${joueurs.map(() => '?').join(', ')}) ORDER BY id`,
      joueurs.map((j) => j.id),
    ),
    reserve: await db.queryOne(
      'SELECT reserve_health, reserve_power FROM gl_game_team_reserves WHERE game_id = ? AND team_id = ?',
      [ctx.game.id, team.id],
    ),
  });
  const avant = await lire();
  const d = await request(app)
    .post(api('/spell-casts/drafts'))
    .set(auth(joueurs[0].token))
    .send({ spellCode: 'SL037', teamId: team.id });
  assert.equal(d.status, 201, JSON.stringify(d.body));
  const l = await request(app)
    .post(api(`/spell-casts/drafts/${d.body.draft.id}/launch`))
    .set(auth(joueurs[0].token));
  assert.equal(l.status, 200, JSON.stringify(l.body));
  const debite = await lire();
  assert.notDeepEqual(debite, avant, 'le sort a bien été payé');
  assert.equal(Number(debite.reserve.reserve_power), 0, 'la réserve a payé sa part');

  const rendu = await db.withTransaction((tx) =>
    rembourserCastTx(tx, { gameId: ctx.game.id, draftId: d.body.draft.id }),
  );
  assert.equal(rendu.spellCode, 'SL037');
  assert.deepEqual(rendu.reserve, [{ teamId: Number(team.id), gems: 1, hearts: 0 }]);
  assert.equal(
    rendu.contributions.reduce((a, c) => a + c.gems, 0),
    1,
    'le pot rend ce qu’il a versé',
  );
  assert.deepEqual(await lire(), avant, 'bourses et réserve à l’identique');
  const draft = await db.queryOne('SELECT status FROM gl_spell_cast_drafts WHERE id = ?', [
    d.body.draft.id,
  ]);
  assert.equal(draft.status, 'rembourse');
  const livre = await db.queryAll(
    "SELECT cause, delta_power FROM gl_resource_ledger WHERE game_id = ? AND cause = 'sort_rembourse'",
    [ctx.game.id],
  );
  assert.ok(livre.length >= 1 && livre.every((r) => Number(r.delta_power) > 0));
  const inv = await checkTenirInvariantsFromDb(db, ctx.game.id, await getGameplaySettings());
  assert.deepEqual(inv.violations, [], JSON.stringify(inv.violations));

  // Une seule fois ; un sort jamais lancé ne se rembourse pas.
  await assert.rejects(
    () =>
      db.withTransaction((tx) =>
        rembourserCastTx(tx, { gameId: ctx.game.id, draftId: d.body.draft.id }),
      ),
    /DRAFT_NOT_CAST/,
  );
  await assert.rejects(
    () =>
      db.withTransaction((tx) => rembourserCastTx(tx, { gameId: ctx.game.id, draftId: 99999999 })),
    /DRAFT_NOT_FOUND/,
  );
  // Remboursé, le sort ne compte plus dans sa limite : Lanterne se relance dans le tour.
  const d2 = await request(app)
    .post(api('/spell-casts/drafts'))
    .set(auth(joueurs[0].token))
    .send({ spellCode: 'SL037', teamId: team.id });
  assert.equal(d2.status, 201, JSON.stringify(d2.body));
});
