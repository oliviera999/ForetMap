'use strict';

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute, queryAll, queryOne } = require('../database');
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

test('un joueur reçoit ses bourses et celles de son équipe, jamais celles des autres équipes', async () => {
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
    if (mates.has(Number(row.playerId))) {
      assert.ok(
        'healthPoints' in row && 'powerPoints' in row,
        `coéquipier ${row.playerId} visible`,
      );
    } else {
      assert.ok(
        !('healthPoints' in row) && !('powerPoints' in row),
        `autre équipe ${row.playerId} masquée`,
      );
    }
  }
  const raw = JSON.stringify(res.body);
  assert.equal(
    Object.keys(res.body.vitality.byPlayerId).every((pid) => mates.has(Number(pid))),
    true,
  );
  assert.ok(!raw.includes('"motif"'));
  assert.ok(res.body.tenir.permissions, 'permissions servies');
  assert.equal(res.body.tenir.permissions.souffle, false);
});

test('le MJ voit toutes les bourses', async () => {
  const res = await request(app)
    .get(`/api/gl/games/${ctx.game.id}`)
    .set('Authorization', `Bearer ${ctx.adminToken}`);
  assert.equal(res.status, 200);
  assert.ok(res.body.roster.every((row) => 'healthPoints' in row));
  assert.equal(res.body.tenir.permissions.souffle, true);
  assert.equal(Object.keys(res.body.vitality.byPlayerId).length, ctx.players.length);
});

test('Trame : +1 de SA ressource à chaque membre (cœur gnome, gemme licorne), rien d’autre', async () => {
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
      if (team.type === 'gnome') assert.deepEqual(b, { health: 4, power: 3 });
      else assert.deepEqual(b, { health: 3, power: 4 });
    }
  }
});

test('Souffle : l’effet du plateau s’applique tel quel (−1 gemme aux licornes)', async () => {
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
    assert.deepEqual(await readPlayerBourses(m.id), { health: 3, power: 2 });
});

test('geste du prof sur une bourse : motif obligatoire, delta borné à ±3, plafond 8, journalisé', async () => {
  const player = ctx.players[1];
  await setPlayerBourses(player.id, 7, 3);
  const noReason = await request(app)
    .post(`/api/gl/games/${ctx.game.id}/vitality/player`)
    .set('Authorization', `Bearer ${ctx.adminToken}`)
    .send({ playerId: player.id, healthDelta: 1 });
  assert.equal(noReason.status, 400);
  const tooBig = await request(app)
    .post(`/api/gl/games/${ctx.game.id}/vitality/player`)
    .set('Authorization', `Bearer ${ctx.adminToken}`)
    .send({ playerId: player.id, healthDelta: 4, reason: 'test borne' });
  assert.equal(tooBig.status, 400);
  const ok = await request(app)
    .post(`/api/gl/games/${ctx.game.id}/vitality/player`)
    .set('Authorization', `Bearer ${ctx.adminToken}`)
    .send({ playerId: player.id, healthDelta: 3, reason: 'geste exceptionnel de test' });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.deepEqual(await readPlayerBourses(player.id), { health: 8, power: 3 });
  const evt = await queryOne(
    "SELECT payload_json FROM gl_game_events WHERE game_id = ? AND event_type = 'vitality_change' ORDER BY id DESC LIMIT 1",
    [ctx.game.id],
  );
  assert.equal(JSON.parse(evt.payload_json).reason, 'geste exceptionnel de test');
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

test('profil : PUT /tenir/profil passe en prologue (voile, Marché, chapardeur coupés), surcharge de surface', async () => {
  const res = await request(app)
    .put(`/api/gl/games/${ctx.game.id}/tenir/profil`)
    .set('Authorization', `Bearer ${ctx.adminToken}`)
    .send({ profil: 'prologue', overrides: { surface: 'hybride' } });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.settings.voile, false);
  assert.equal(res.body.settings.marche, false);
  assert.equal(res.body.surface, 'hybride');
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
  // 3 cases (2 Trame + 1 Souffle) + 1 geste MJ motivé : rien d'autre n'a touché une bourse.
  assert.equal(reasons.length, 4, JSON.stringify(reasons));
  assert.ok(reasons.includes('geste exceptionnel de test'));
});
