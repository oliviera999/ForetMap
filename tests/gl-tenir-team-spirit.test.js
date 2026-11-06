'use strict';

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute, queryOne, queryAll } = require('../database');
const { createTenirGame, readPlayerBourses } = require('./helpers/glTenirFixtures');

let ctx;
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const api = (path) => `/api/gl/games/${ctx.game.id}${path}`;

async function openRound() {
  const r = await request(app).post(api('/tenir/tour/ouvrir')).set(auth(ctx.adminToken));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body;
}
async function closeRound() {
  for (const phase of ['jeu', 'souffle', 'clos']) {
    const r = await request(app)
      .post(api('/tenir/tour/phase'))
      .set(auth(ctx.adminToken))
      .send({ phase, dort: true });
    assert.equal(r.status, 200, JSON.stringify(r.body));
  }
}

before(async () => {
  await initSchema();
  ctx = await createTenirGame({ stamp: Date.now() });
  await execute('UPDATE gl_teams SET position_marker_id = ? WHERE game_id = ?', [
    ctx.markers[2].id,
    ctx.game.id,
  ]);
});

test('bilan stocké par séance ; Lumière ne compte pas tant qu’elle est désactivée ; aucune ressource', async () => {
  await openRound();
  const before = await Promise.all(ctx.players.map((p) => readPlayerBourses(p.id)));
  const bad = await request(app)
    .put(api('/tenir/tour/team-spirit'))
    .set(auth(ctx.adminToken))
    .send({ bilans: [{ teamId: ctx.teams[0].id, cartesGardees: 7 }] });
  assert.equal(bad.status, 400);
  const res = await request(app)
    .put(api('/tenir/tour/team-spirit'))
    .set(auth(ctx.adminToken))
    .send({
      bilans: ctx.teams.map((t, i) => ({
        teamId: t.id,
        cartesGardees: 6 - i,
        note: i === 0 ? 'note confidentielle' : null,
      })),
    });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.lumiere, null, 'Lumière désactivée');
  const rows = await queryAll(
    'SELECT team_id, cartes_gardees, note FROM gl_game_team_spirit WHERE game_id = ? AND round_number = 1',
    [ctx.game.id],
  );
  assert.equal(rows.length, 4);
  const lum = await queryOne('SELECT total FROM gl_game_lumiere WHERE game_id = ?', [ctx.game.id]);
  assert.ok(!lum);
  const after = await Promise.all(ctx.players.map((p) => readPlayerBourses(p.id)));
  assert.deepEqual(after, before, 'jamais de delta de vitalité');
  // La note est privée : un joueur ne la voit pas dans le journal.
  const journal = await request(app)
    .get(`/api/gl/journal/games/${ctx.game.id}`)
    .set(auth(ctx.players[0].token));
  const evt = journal.body.events.find((e) => e.eventType === 'team_spirit');
  assert.ok(evt);
  assert.equal(evt.payload.notes, undefined);
  assert.ok(!JSON.stringify(journal.body).includes('note confidentielle'));
  assert.equal(evt.payload.bilans.length, 4);
});

test('cartes → cases : appliquées à l’ouverture suivante seulement si le réglage est activé', async () => {
  await closeRound();
  const r2 = await openRound();
  assert.equal(r2.roundNumber, 2);
  const unchanged = await queryOne('SELECT position_marker_id FROM gl_teams WHERE id = ?', [
    ctx.teams[0].id,
  ]);
  assert.equal(Number(unchanged.position_marker_id), ctx.markers[2].id, 'réglage inactif : rien');
  await request(app)
    .put(api('/tenir/tour/team-spirit'))
    .set(auth(ctx.adminToken))
    .send({
      bilans: [
        { teamId: ctx.teams[0].id, cartesGardees: 6 },
        { teamId: ctx.teams[1].id, cartesGardees: 4 },
        { teamId: ctx.teams[2].id, cartesGardees: 2 },
      ],
    });
  await request(app)
    .put(api('/tenir/profil'))
    .set(auth(ctx.adminToken))
    .send({ overrides: { cartes_vers_cases: true } });
  await closeRound();
  await openRound();
  const t0 = await queryOne('SELECT position_marker_id FROM gl_teams WHERE id = ?', [
    ctx.teams[0].id,
  ]);
  const t1 = await queryOne('SELECT position_marker_id FROM gl_teams WHERE id = ?', [
    ctx.teams[1].id,
  ]);
  const t2 = await queryOne('SELECT position_marker_id FROM gl_teams WHERE id = ?', [
    ctx.teams[2].id,
  ]);
  assert.equal(Number(t0.position_marker_id), ctx.markers[4].id, '6 cartes → +2');
  assert.equal(Number(t1.position_marker_id), ctx.markers[3].id, '4 cartes → +1');
  assert.equal(Number(t2.position_marker_id), ctx.markers[2].id, '2 cartes → rien');
  const evts = await queryAll(
    "SELECT id FROM gl_game_events WHERE game_id = ? AND event_type = 'cartes_vers_cases'",
    [ctx.game.id],
  );
  assert.equal(evts.length, 2);
});

test('Lumière activée : somme des cartes, palier → choix de la classe → recul du voile', async () => {
  await request(app)
    .put(api('/tenir/profil'))
    .set(auth(ctx.adminToken))
    .send({ overrides: { cartes_vers_cases: false, lumiere: true } });
  await execute(
    "INSERT INTO gl_settings (`key`, value_json, updated_at) VALUES ('gameplay.tenir_lumiere_palier', '10', NOW()) ON DUPLICATE KEY UPDATE value_json = '10'",
  );
  require('../lib/glSettings').invalidateGameplayCache();
  const res = await request(app)
    .put(api('/tenir/tour/team-spirit'))
    .set(auth(ctx.adminToken))
    .send({ bilans: ctx.teams.map((t) => ({ teamId: t.id, cartesGardees: 3 })) });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.lumiere.total, 12);
  assert.equal(res.body.lumiere.atteint, 1);
  const palierEvt = await queryOne(
    "SELECT id FROM gl_game_events WHERE game_id = ? AND event_type = 'lumiere_palier'",
    [ctx.game.id],
  );
  assert.ok(palierEvt);
  const tooHigh = await request(app)
    .post(api('/tenir/lumiere/choix'))
    .set(auth(ctx.adminToken))
    .send({ palier: 20, choix: 'voile' });
  assert.equal(tooHigh.status, 409);
  const choix = await request(app)
    .post(api('/tenir/lumiere/choix'))
    .set(auth(ctx.adminToken))
    .send({ palier: 10, choix: 'voile' });
  assert.equal(choix.status, 200, JSON.stringify(choix.body));
  const recul = await queryOne(
    "SELECT payload_json FROM gl_game_events WHERE game_id = ? AND event_type = 'voile_recul' ORDER BY id DESC LIMIT 1",
    [ctx.game.id],
  );
  assert.ok(recul);
  assert.equal(JSON.parse(recul.payload_json).reason, 'lumiere');
  const again = await request(app)
    .post(api('/tenir/lumiere/choix'))
    .set(auth(ctx.adminToken))
    .send({ palier: 10, choix: 'sort' });
  assert.equal(again.status, 409, 'un palier n’a qu’un choix');
  await execute(
    "UPDATE gl_settings SET value_json = '25' WHERE `key` = 'gameplay.tenir_lumiere_palier'",
  );
  require('../lib/glSettings').invalidateGameplayCache();
});
