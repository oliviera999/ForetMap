'use strict';

/**
 * « Tenir à deux » — une seule monnaie, les gemmes (ensemble unifié, PR 4, M1).
 *
 * Bourses privées et sans cœurs (élève, prof), Trame et Souffle, geste du prof en gemmes,
 * retrait, profil ; puis la bourse de départ (3 gemmes, une fois par année, à la création de la
 * première partie du plateau 1), la conversion des bourses des parties en cours (migration 373, rejouée : idempotente,
 * journalisée sans nom) et l'invariant `COEURS_HORS_JEU`. Fixtures anonymes.
 */

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const fs = require('node:fs');
const path = require('node:path');
const {
  initSchema,
  execute,
  queryAll,
  queryOne,
  pool,
  splitSqlStatements,
} = require('../database');
const { listPresentMembers } = require('../lib/glTenir');
const {
  createTenirGame,
  readPlayerBourses,
  setPlayerBourses,
} = require('./helpers/glTenirFixtures');

let ctx;
const byTeam = (teamId) => ctx.players.filter((p) => p.teamId === Number(teamId));

before(async () => {
  await initSchema();
  ctx = await createTenirGame({ stamp: Date.now() });
});

test('un joueur reçoit sa bourse de gemmes et celles de son équipe, jamais celles des autres équipes ; aucun cœur', async () => {
  const me = ctx.players[0];
  const res = await request(app)
    .get(`/api/gl/games/${ctx.game.id}`)
    .set('Authorization', `Bearer ${me.token}`);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.tenir.enabled, true);
  assert.equal(res.body.tenir.profil, 'complet');
  assert.equal(res.body.tenir.surface, 'tablette');
  const mates = new Set(byTeam(me.teamId).map((p) => p.id));
  for (const row of res.body.roster) {
    // Une seule monnaie (M1) : aucun cœur servi, à personne.
    assert.ok(!('healthPoints' in row), `aucun cœur servi (${row.playerId})`);
    if (mates.has(Number(row.playerId))) {
      assert.ok('powerPoints' in row, `coéquipier ${row.playerId} visible`);
    } else {
      assert.ok(!('powerPoints' in row), `autre équipe ${row.playerId} masquée`);
    }
  }
  const raw = JSON.stringify(res.body);
  assert.equal(
    Object.keys(res.body.vitality.byPlayerId).every((pid) => mates.has(Number(pid))),
    true,
  );
  for (const bourse of Object.values(res.body.vitality.byPlayerId)) {
    assert.deepEqual(Object.keys(bourse), ['power'], 'la bourse ne porte que des gemmes');
  }
  assert.ok(!raw.includes('healthPoints'), 'aucune clé de cœurs dans l’état servi');
  // Réglages résolus : le plafond des cœurs et les cœurs au Marché n'y sont plus.
  assert.equal(res.body.tenir.settings.max_power_points, 8);
  assert.ok(!('max_health_points' in res.body.tenir.settings));
  assert.ok(!('market_hearts_enabled' in res.body.tenir.settings));
  assert.ok(!raw.includes('"motif"'));
  assert.ok(res.body.tenir.permissions, 'permissions servies');
  assert.equal(res.body.tenir.permissions.souffle, false);
});

test('le MJ voit toutes les bourses, en gemmes seulement', async () => {
  const res = await request(app)
    .get(`/api/gl/games/${ctx.game.id}`)
    .set('Authorization', `Bearer ${ctx.adminToken}`);
  assert.equal(res.status, 200);
  assert.ok(res.body.roster.every((row) => 'powerPoints' in row && !('healthPoints' in row)));
  assert.ok(Object.values(res.body.vitality.byPlayerId).every((b) => !('health' in b)));
  // Le roster de la console (assignation des équipes) non plus.
  const roster = await request(app)
    .get(`/api/gl/games/${ctx.game.id}/roster`)
    .set('Authorization', `Bearer ${ctx.adminToken}`);
  assert.equal(roster.status, 200, JSON.stringify(roster.body));
  assert.ok(roster.body.every((row) => 'powerPoints' in row && !('healthPoints' in row)));
  assert.equal(res.body.tenir.permissions.souffle, true);
  assert.equal(Object.keys(res.body.vitality.byPlayerId).length, ctx.players.length);
});

test('Trame (M3) : +1 gemme à chaque membre, pour les deux peuples, rien d’autre', async () => {
  const trame = ctx.markers.find((m) => m.label === 'Trame 1');
  for (const team of [ctx.teams[0], ctx.teams[2]]) {
    const members = byTeam(team.id);
    for (const m of members) await setPlayerBourses(m.id, 3, 3);
    await execute('UPDATE gl_teams SET position_marker_id = ? WHERE id = ?', [trame.id, team.id]);
    const res = await request(app)
      .post(`/api/gl/games/${ctx.game.id}/markers/${trame.id}/present-arrival`)
      .set('Authorization', `Bearer ${ctx.adminToken}`)
      .send({ teamId: team.id });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.vitality.applied, true);
    for (const m of members) {
      const b = await readPlayerBourses(m.id);
      assert.deepEqual(b, { health: 3, power: 4 }, team.type);
    }
  }
});

test('Souffle (M3) : aucune ressource retirée — au prochain tour, un seul dé', async () => {
  const souffle = ctx.markers.find((m) => m.label === 'Souffle 1');
  const team = ctx.teams[3];
  for (const m of byTeam(team.id)) await setPlayerBourses(m.id, 3, 3);
  await execute('UPDATE gl_teams SET position_marker_id = ? WHERE id = ?', [souffle.id, team.id]);
  const res = await request(app)
    .post(`/api/gl/games/${ctx.game.id}/markers/${souffle.id}/present-arrival`)
    .set('Authorization', `Bearer ${ctx.adminToken}`)
    .send({ teamId: team.id });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  for (const m of byTeam(team.id))
    assert.deepEqual(await readPlayerBourses(m.id), { health: 3, power: 3 });
  assert.equal(res.body.unDe, true);
});

test('geste du prof sur une bourse : gemmes seulement, motif obligatoire, delta borné à ±3, plafond 8, journalisé', async () => {
  const player = ctx.players[1];
  await setPlayerBourses(player.id, 3, 7);
  const post = (body) =>
    request(app)
      .post(`/api/gl/games/${ctx.game.id}/vitality/player`)
      .set('Authorization', `Bearer ${ctx.adminToken}`)
      .send({ playerId: player.id, ...body });
  // Une seule monnaie (M1) : un delta de cœurs est refusé, motif ou non.
  const coeurs = await post({ healthDelta: 1, reason: 'geste en cœurs' });
  assert.equal(coeurs.status, 400, JSON.stringify(coeurs.body));
  assert.match(coeurs.body.error, /gemmes/);
  const lesDeux = await post({ healthDelta: 1, powerDelta: 1, reason: 'geste mixte' });
  assert.equal(lesDeux.status, 400);
  const equipe = await request(app)
    .post(`/api/gl/games/${ctx.game.id}/vitality/team`)
    .set('Authorization', `Bearer ${ctx.adminToken}`)
    .send({ teamId: player.teamId, healthDelta: 1, reason: 'geste en cœurs' });
  assert.equal(equipe.status, 400, JSON.stringify(equipe.body));
  assert.deepEqual(await readPlayerBourses(player.id), { health: 3, power: 7 });

  const noReason = await post({ powerDelta: 1 });
  assert.equal(noReason.status, 400);
  const tooBig = await post({ powerDelta: 4, reason: 'test borne' });
  assert.equal(tooBig.status, 400);
  const ok = await post({ powerDelta: 3, reason: 'geste exceptionnel de test' });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.deepEqual(await readPlayerBourses(player.id), { health: 3, power: 8 });
  const evt = await queryOne(
    "SELECT payload_json FROM gl_game_events WHERE game_id = ? AND event_type = 'vitality_change' ORDER BY id DESC LIMIT 1",
    [ctx.game.id],
  );
  assert.equal(JSON.parse(evt.payload_json).reason, 'geste exceptionnel de test');
  const livre = await queryOne(
    'SELECT cause, delta_health, delta_power FROM gl_resource_ledger WHERE game_id = ? AND player_id = ? ORDER BY id DESC LIMIT 1',
    [ctx.game.id, player.id],
  );
  assert.deepEqual(
    { c: livre.cause, h: Number(livre.delta_health), g: Number(livre.delta_power) },
    { c: 'geste_prof', h: 0, g: 1 },
    'le plafond (8) rogne le gain : + 1 seulement, aucun cœur au livre',
  );
});

test('retrait : entrée/sortie, exclu du pot, 403 Marché, bourses intactes, motif vu du prof seul', async () => {
  const player = ctx.players[2];
  const mate = byTeam(player.teamId).find((p) => p.id !== player.id);
  const before = await readPlayerBourses(player.id);
  const entree = await request(app)
    .post(`/api/gl/games/${ctx.game.id}/tenir/retrait`)
    .set('Authorization', `Bearer ${ctx.adminToken}`)
    .send({ playerId: player.id, entree: true, motif: 'motif confidentiel de test' });
  assert.equal(entree.status, 200, JSON.stringify(entree.body));
  const dup = await request(app)
    .post(`/api/gl/games/${ctx.game.id}/tenir/retrait`)
    .set('Authorization', `Bearer ${ctx.adminToken}`)
    .send({ playerId: player.id, entree: true });
  assert.equal(dup.status, 409);

  const self = await request(app)
    .get(`/api/gl/games/${ctx.game.id}/tenir`)
    .set('Authorization', `Bearer ${player.token}`);
  assert.equal(self.status, 200);
  assert.equal(self.body.enRetrait, true);
  assert.ok(!JSON.stringify(self.body).includes('motif confidentiel'));
  assert.equal(self.body.permissions.marche, false);

  const other = await request(app)
    .get(`/api/gl/games/${ctx.game.id}/tenir`)
    .set('Authorization', `Bearer ${mate.token}`);
  assert.equal(other.body.enRetrait, false);
  assert.deepEqual(other.body.retraits, []);

  const prof = await request(app)
    .get(`/api/gl/games/${ctx.game.id}/tenir`)
    .set('Authorization', `Bearer ${ctx.adminToken}`);
  assert.equal(prof.body.retraits[0].motif, 'motif confidentiel de test');

  const market = await request(app)
    .get('/api/gl/market/classmates')
    .set('Authorization', `Bearer ${player.token}`);
  assert.equal(market.status, 403);
  assert.equal(market.body.code, 'MARCHE_RETRAIT');

  const present = await listPresentMembers({ queryAll }, Number(ctx.game.id), player.teamId, 1);
  assert.ok(!present.includes(player.id));
  assert.ok(present.includes(mate.id));

  // Journal : l'événement `retrait` est privé pour un joueur (pas d'identité), lisible du prof.
  const journalPlayer = await request(app)
    .get(`/api/gl/journal/games/${ctx.game.id}`)
    .set('Authorization', `Bearer ${mate.token}`);
  const retraitEvt = journalPlayer.body.events.find((e) => e.eventType === 'retrait');
  assert.ok(retraitEvt);
  assert.equal(retraitEvt.payload.playerId, undefined);
  assert.equal(retraitEvt.payload.redacted, true);
  const journalProf = await request(app)
    .get(`/api/gl/journal/games/${ctx.game.id}`)
    .set('Authorization', `Bearer ${ctx.adminToken}`);
  assert.equal(
    journalProf.body.events.find((e) => e.eventType === 'retrait').payload.playerId,
    player.id,
  );

  assert.deepEqual(await readPlayerBourses(player.id), before);
  const sortie = await request(app)
    .post(`/api/gl/games/${ctx.game.id}/tenir/retrait`)
    .set('Authorization', `Bearer ${ctx.adminToken}`)
    .send({ playerId: player.id, entree: false });
  assert.equal(sortie.status, 200);
  const after = await request(app)
    .get('/api/gl/market/classmates')
    .set('Authorization', `Bearer ${player.token}`);
  assert.equal(after.status, 200);
});

test('profil : PUT /tenir/profil coupe le voile et le Marché par surcharge, surcharge de surface ; le profil prologue n’existe plus', async () => {
  const res = await request(app)
    .put(`/api/gl/games/${ctx.game.id}/tenir/profil`)
    .set('Authorization', `Bearer ${ctx.adminToken}`)
    .send({ profil: 'complet', overrides: { surface: 'hybride', voile: false, marche: false } });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.settings.voile, false);
  assert.equal(res.body.settings.marche, false);
  assert.equal(res.body.surface, 'hybride');
  // Ensemble unifié (M8) : l'escalier du chapitre 1 remplace le profil `prologue`.
  const prologue = await request(app)
    .put(`/api/gl/games/${ctx.game.id}/tenir/profil`)
    .set('Authorization', `Bearer ${ctx.adminToken}`)
    .send({ profil: 'prologue' });
  assert.equal(prologue.status, 400);
  const bad = await request(app)
    .put(`/api/gl/games/${ctx.game.id}/tenir/profil`)
    .set('Authorization', `Bearer ${ctx.adminToken}`)
    .send({ profil: 'expert' });
  assert.equal(bad.status, 400);
  const forbidden = await request(app)
    .put(`/api/gl/games/${ctx.game.id}/tenir/profil`)
    .set('Authorization', `Bearer ${ctx.players[0].token}`)
    .send({ profil: 'complet' });
  assert.equal(forbidden.status, 403);
  await request(app)
    .put(`/api/gl/games/${ctx.game.id}/tenir/profil`)
    .set('Authorization', `Bearer ${ctx.adminToken}`)
    .send({ profil: 'complet', overrides: {} });
});

test('aucune écriture de vitalité hors des chemins autorisés dans cette suite', async () => {
  const events = await queryAll(
    "SELECT event_type, payload_json FROM gl_game_events WHERE game_id = ? AND event_type IN ('vitality_change', 'marker_effect')",
    [ctx.game.id],
  );
  const reasons = events
    .filter((e) => e.event_type === 'vitality_change')
    .map((e) => JSON.parse(e.payload_json).reason);
  // 2 cases Trame + 1 geste MJ motivé (la case Souffle ne touche plus aucune bourse, M3) :
  // rien d'autre n'a touché une bourse.
  assert.equal(reasons.length, 3, JSON.stringify(reasons));
  assert.ok(reasons.includes('geste exceptionnel de test'));
});

// ---------------------------------------------------------------------
// Bourse de départ, conversion, invariant
// ---------------------------------------------------------------------

test('bourse de départ : la première partie « Tenir » du plateau 1 d’une classe pose chaque élève à 3 gemmes, cœurs intacts ; une seule fois par année ; rien au plateau 2', async () => {
  const { createGlClass, createGlPlayer } = require('./helpers/glFixtures');
  const { checkTenirInvariants } = require('../lib/glTenirInvariants');
  const stamp = Date.now();
  const classe = await createGlClass({ name: `classe-depart-${stamp}`, adminId: ctx.admin.id });
  const eleves = [];
  for (const lettre of ['a', 'b', 'c']) {
    eleves.push(
      await createGlPlayer({ classId: classe.id, pseudo: `joueur-${lettre}-depart-${stamp}` }),
    );
  }
  await setPlayerBourses(eleves[0].id, 5, 8);
  await setPlayerBourses(eleves[1].id, 0, 0);
  await setPlayerBourses(eleves[2].id, 2, 3);
  const chapitre = async (plateau) =>
    queryOne('SELECT id FROM gl_chapters WHERE slug = ? LIMIT 1', [`tenir-ex-plateau-${plateau}`]);
  const creer = async (plateau, name) =>
    request(app)
      .post('/api/gl/games')
      .set('Authorization', `Bearer ${ctx.adminToken}`)
      .send({ classId: classe.id, chapterId: (await chapitre(plateau)).id, name });

  const p2 = await creer(2, 'Partie plateau 2');
  assert.equal(p2.status, 201, JSON.stringify(p2.body));
  assert.deepEqual(await readPlayerBourses(eleves[0].id), { health: 5, power: 8 }, 'plateau 2');

  const p1 = await creer(1, 'Partie plateau 1');
  assert.equal(p1.status, 201, JSON.stringify(p1.body));
  const gameId = Number(p1.body.game.id);
  assert.deepEqual(await readPlayerBourses(eleves[0].id), { health: 5, power: 3 });
  assert.deepEqual(await readPlayerBourses(eleves[1].id), { health: 0, power: 3 });
  assert.deepEqual(await readPlayerBourses(eleves[2].id), { health: 2, power: 3 });
  const livre = await queryAll(
    "SELECT id, player_id, delta_health, delta_power, solde_health_apres, solde_power_apres, cause FROM gl_resource_ledger WHERE game_id = ? AND cause = 'depart' ORDER BY id ASC",
    [gameId],
  );
  const parJoueur = new Map(livre.map((l) => [Number(l.player_id), l]));
  assert.equal(Number(parJoueur.get(Number(eleves[0].id)).delta_power), -5);
  assert.equal(Number(parJoueur.get(Number(eleves[1].id)).delta_power), 3);
  assert.ok(!parJoueur.has(Number(eleves[2].id)), 'déjà à 3 : aucune ligne');
  assert.ok(livre.every((l) => Number(l.delta_health) === 0 && Number(l.solde_power_apres) === 3));
  // `depart` est une source admise de gemmes : l'invariant ne la signale pas.
  const gain = parJoueur.get(Number(eleves[1].id));
  const violations = checkTenirInvariants({
    players: [{ id: Number(eleves[1].id), teamId: 1, health: 0, power: 3 }],
    teams: [{ id: 1, type: 'gnome', pathIndex: 0 }],
    campIndex: 11,
    voilePosition: -1,
    ledger: [
      {
        id: Number(gain.id),
        playerId: Number(eleves[1].id),
        deltaHealth: 0,
        deltaPower: 3,
        soldeHealthApres: 0,
        soldePowerApres: 3,
        cause: 'depart',
      },
    ],
    coeursHorsJeuDepuis: 0,
  }).violations.map((v) => v.code);
  assert.ok(!violations.includes('GAIN_NON_DOCUMENTE'), JSON.stringify(violations));

  // Gardée toute l'année : une autre partie du plateau 1 (essai, re-création) ne remet rien.
  await setPlayerBourses(eleves[0].id, 5, 8);
  await setPlayerBourses(eleves[1].id, 0, 1);
  const encore = await creer(1, 'Partie plateau 1, bis');
  assert.equal(encore.status, 201, JSON.stringify(encore.body));
  assert.deepEqual(await readPlayerBourses(eleves[0].id), { health: 5, power: 8 });
  assert.deepEqual(await readPlayerBourses(eleves[1].id), { health: 0, power: 1 });
  const bis = await queryOne(
    "SELECT COUNT(*) AS n FROM gl_resource_ledger WHERE game_id = ? AND cause = 'depart'",
    [Number(encore.body.game.id)],
  );
  assert.equal(Number(bis.n), 0);
  await execute("UPDATE gl_games SET status = 'ended' WHERE id IN (?, ?, ?)", [
    gameId,
    Number(p2.body.game.id),
    Number(encore.body.game.id),
  ]);
});

/** Rejoue la migration 373 sur une seule connexion (variables de session, PREPARE). */
async function rejouerMigration373() {
  const sql = fs.readFileSync(
    path.join(__dirname, '..', 'migrations', '373_gl_ensemble_unifie_une_monnaie.sql'),
    'utf8',
  );
  const conn = await pool.getConnection();
  try {
    for (const stmt of splitSqlStatements(sql)) await conn.query(stmt);
  } finally {
    conn.release();
  }
}

test('migration 373 : gemmes = min(8, gemmes + cœurs) pour les joueurs d’une partie « Tenir » non close ; cœurs laissés ; journal sans nom ; idempotente', async () => {
  const jeu = await createTenirGame({ stamp: Date.now() + 7 });
  const close = await createTenirGame({ stamp: Date.now() + 8 });
  await execute("UPDATE gl_games SET status = 'ended' WHERE id = ?", [close.game.id]);
  const [a, b, c, d] = jeu.players;
  await setPlayerBourses(a.id, 3, 3); // → 6
  await setPlayerBourses(b.id, 5, 7); // → 8 (plafond)
  await setPlayerBourses(c.id, 0, 2); // → 2 (rien à convertir)
  await setPlayerBourses(d.id, 4, 9); // → 9 (jamais confisqué)
  const horsJeu = close.players[0];
  await setPlayerBourses(horsJeu.id, 6, 1);
  // Réserve de la caravane : des cœurs y dormaient encore.
  await execute(
    `INSERT INTO gl_game_team_reserves (game_id, team_id, reserve_health, reserve_power, updated_at)
     VALUES (?, ?, 2, 1, NOW())
     ON DUPLICATE KEY UPDATE reserve_health = 2, reserve_power = 1`,
    [jeu.game.id, jeu.teams[0].id],
  );
  const ids = jeu.players.map((p) => p.id);
  const marks = ids.map(() => '?').join(', ');
  await execute(`DELETE FROM gl_tenir_conversion_monnaie WHERE player_id IN (${marks})`, ids);

  await rejouerMigration373();
  assert.deepEqual(await readPlayerBourses(a.id), { health: 3, power: 6 });
  assert.deepEqual(await readPlayerBourses(b.id), { health: 5, power: 8 });
  assert.deepEqual(await readPlayerBourses(c.id), { health: 0, power: 2 });
  assert.deepEqual(await readPlayerBourses(d.id), { health: 4, power: 9 });
  assert.deepEqual(await readPlayerBourses(horsJeu.id), { health: 6, power: 1 }, 'partie close');
  const reserve = await queryOne(
    'SELECT reserve_health, reserve_power FROM gl_game_team_reserves WHERE game_id = ? AND team_id = ?',
    [jeu.game.id, jeu.teams[0].id],
  );
  assert.deepEqual(
    { h: Number(reserve.reserve_health), g: Number(reserve.reserve_power) },
    { h: 0, g: 3 },
  );

  const journal = await queryAll(
    `SELECT * FROM gl_tenir_conversion_monnaie WHERE player_id IN (${marks}) ORDER BY player_id`,
    ids,
  );
  assert.equal(journal.length, ids.length);
  const ligneA = journal.find((j) => Number(j.player_id) === a.id);
  assert.deepEqual(
    {
      avant: Number(ligneA.gemmes_avant),
      coeurs: Number(ligneA.coeurs),
      apres: Number(ligneA.gemmes_apres),
    },
    { avant: 3, coeurs: 3, apres: 6 },
  );
  assert.ok(ligneA.applique_at, 'conversion marquée appliquée');
  // Aucun nom d'élève : le journal ne porte que des identifiants et des nombres.
  assert.deepEqual(Object.keys(ligneA).sort(), [
    'applique_at',
    'coeurs',
    'created_at',
    'game_id',
    'gemmes_apres',
    'gemmes_avant',
    'player_id',
  ]);
  const livre = await queryAll(
    `SELECT player_id, kind, delta_health, delta_power FROM gl_resource_ledger
      WHERE game_id = ? AND cause = 'migration' ORDER BY id ASC`,
    [jeu.game.id],
  );
  const bourseA = livre.find((l) => Number(l.player_id) === a.id);
  assert.deepEqual(
    { h: Number(bourseA.delta_health), g: Number(bourseA.delta_power) },
    { h: 0, g: 3 },
  );
  assert.ok(!livre.some((l) => Number(l.player_id) === c.id), 'rien à convertir : aucune ligne');
  const ligneReserve = livre.find((l) => l.kind === 'reserve');
  assert.deepEqual(
    { h: Number(ligneReserve.delta_health), g: Number(ligneReserve.delta_power) },
    { h: -2, g: 2 },
  );

  // Rejouée : rien ne bouge (ni bourse, ni livre, ni réserve).
  const lignesAvant = livre.length;
  await rejouerMigration373();
  assert.deepEqual(await readPlayerBourses(a.id), { health: 3, power: 6 });
  assert.deepEqual(await readPlayerBourses(b.id), { health: 5, power: 8 });
  const apres = await queryOne(
    "SELECT COUNT(*) AS n FROM gl_resource_ledger WHERE game_id = ? AND cause = 'migration'",
    [jeu.game.id],
  );
  assert.equal(Number(apres.n), lignesAvant);
  const repere = await queryAll('SELECT id, ledger_id_max FROM gl_tenir_monnaie_unique');
  assert.equal(repere.length, 1, 'repère de conversion posé une seule fois');
});

test('invariant COEURS_HORS_JEU : un mouvement de cœurs écrit au livre d’une partie « Tenir » après la conversion est signalé', async () => {
  const { checkTenirInvariants } = require('../lib/glTenirInvariants');
  const base = {
    caps: { maxPower: 8 },
    players: [{ id: 1, teamId: 1, health: 3, power: 4 }],
    teams: [{ id: 1, type: 'gnome', pathIndex: 0 }],
    campIndex: 11,
    voilePosition: -1,
  };
  const gemmes = {
    id: 12,
    playerId: 1,
    deltaHealth: 0,
    deltaPower: 1,
    soldeHealthApres: 3,
    soldePowerApres: 4,
    cause: 'trame',
  };
  const coeur = {
    id: 13,
    playerId: 1,
    deltaHealth: 1,
    deltaPower: 0,
    soldeHealthApres: 4,
    soldePowerApres: 4,
    cause: 'geste_prof',
  };
  const codes = (snapshot) => checkTenirInvariants(snapshot).violations.map((v) => v.code);
  assert.ok(
    !codes({ ...base, ledger: [gemmes], coeursHorsJeuDepuis: 10 }).includes('COEURS_HORS_JEU'),
  );
  assert.ok(
    codes({
      ...base,
      players: [{ id: 1, teamId: 1, health: 4, power: 4 }],
      ledger: [gemmes, coeur],
      coeursHorsJeuDepuis: 10,
    }).includes('COEURS_HORS_JEU'),
  );
  // Un mouvement d'avant la conversion (identifiant ≤ repère) appartient à l'histoire.
  assert.ok(
    !codes({
      ...base,
      players: [{ id: 1, teamId: 1, health: 4, power: 4 }],
      ledger: [gemmes, coeur],
      coeursHorsJeuDepuis: 13,
    }).includes('COEURS_HORS_JEU'),
  );
  // La réparation ne donne plus rien : un gain « réparation » d'après la conversion est signalé,
  // une ligne d'avant reste de l'histoire.
  const reparation = { ...gemmes, id: 14, cause: 'reparation' };
  assert.ok(
    codes({ ...base, ledger: [reparation], coeursHorsJeuDepuis: 10 }).includes(
      'GAIN_NON_DOCUMENTE',
    ),
  );
  assert.ok(
    !codes({ ...base, ledger: [reparation], coeursHorsJeuDepuis: 20 }).includes(
      'GAIN_NON_DOCUMENTE',
    ),
  );
  // Base en retard (pas de repère) : pas de contrôle.
  assert.ok(
    !codes({
      ...base,
      players: [{ id: 1, teamId: 1, health: 4, power: 4 }],
      ledger: [gemmes, coeur],
    }).includes('COEURS_HORS_JEU'),
  );
});
