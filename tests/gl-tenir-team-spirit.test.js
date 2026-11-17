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

/**
 * Ensemble unifié (M17) : la Lumière, version simple — une jauge qui ne descend jamais ; chaque
 * carte gardée ajoute 1 ; au palier, le voile recule d'office et la jauge repart de zéro.
 */
test('bilan stocké par séance ; Lumière désactivée par la partie : rien ne compte ; aucune ressource', async () => {
  await request(app)
    .put(api('/tenir/profil'))
    .set(auth(ctx.adminToken))
    .send({ profil: 'complet', overrides: { lumiere: false } })
    .expect(200);
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

test('réglages (M17) : Lumière active, palier 100 ; cartes → cases et le choix au palier ont disparu', async () => {
  const { DEFAULT_GAMEPLAY, GL_SETTINGS_REGISTRY } = require('../lib/glSettings');
  assert.equal(DEFAULT_GAMEPLAY.tenirLumiere, true);
  assert.equal(DEFAULT_GAMEPLAY.tenirLumierePalier, 100);
  assert.equal(DEFAULT_GAMEPLAY.tenirReculLumiere, 5);
  assert.equal(GL_SETTINGS_REGISTRY['gameplay.tenir_cartes_vers_cases'], undefined);
  const choix = await request(app)
    .post(api('/tenir/lumiere/choix'))
    .set(auth(ctx.adminToken))
    .send({ palier: 10, choix: 'voile' });
  assert.equal(choix.status, 404, 'plus de route de choix');
  const surcharge = await request(app)
    .put(api('/tenir/profil'))
    .set(auth(ctx.adminToken))
    .send({ profil: 'complet', overrides: { cartes_vers_cases: true } });
  assert.equal(surcharge.status, 400, 'surcharge inconnue');
});

test('Lumière : chaque carte ajoute 1, la jauge ne descend jamais ; au palier, le voile recule d’office et la jauge repart de zéro', async () => {
  await closeRound();
  await request(app)
    .put(api('/tenir/profil'))
    .set(auth(ctx.adminToken))
    .send({ profil: 'complet', overrides: { lumiere: true } })
    .expect(200);
  await execute(
    "INSERT INTO gl_settings (`key`, value_json, updated_at) VALUES ('gameplay.tenir_lumiere_palier', '10', NOW()) ON DUPLICATE KEY UPDATE value_json = '10'",
  );
  require('../lib/glSettings').invalidateGameplayCache();
  try {
    await openRound();
    await execute('UPDATE gl_game_tenir_state SET voile_position = 8 WHERE game_id = ?', [
      ctx.game.id,
    ]);
    const res = await request(app)
      .put(api('/tenir/tour/team-spirit'))
      .set(auth(ctx.adminToken))
      .send({ bilans: ctx.teams.map((t) => ({ teamId: t.id, cartesGardees: 3 })) });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    // 12 cartes : un palier (10) franchi → recul de 5 d'office, la jauge repart à 2.
    assert.deepEqual(
      { total: res.body.lumiere.total, paliers: res.body.lumiere.paliers },
      { total: 2, paliers: 1 },
    );
    const palierEvt = await queryOne(
      "SELECT payload_json FROM gl_game_events WHERE game_id = ? AND event_type = 'lumiere_palier' ORDER BY id DESC LIMIT 1",
      [ctx.game.id],
    );
    assert.equal(JSON.parse(palierEvt.payload_json).recul, 5);
    const recul = await queryOne(
      "SELECT payload_json FROM gl_game_events WHERE game_id = ? AND event_type = 'voile_recul' ORDER BY id DESC LIMIT 1",
      [ctx.game.id],
    );
    const p = JSON.parse(recul.payload_json);
    assert.deepEqual([p.reason, p.cases, p.from, p.to, p.oluId], ['lumiere', 5, 8, 3, 'olu-38']);
    // Bilan revu à la baisse : la jauge ne descend pas ; remonté : rien de plus que ce qui a déjà
    // été compté ; au-delà, seule la différence.
    const baisse = await request(app)
      .put(api('/tenir/tour/team-spirit'))
      .set(auth(ctx.adminToken))
      .send({ bilans: ctx.teams.map((t) => ({ teamId: t.id, cartesGardees: 1 })) });
    assert.equal(baisse.status, 200);
    let lum = await queryOne('SELECT total FROM gl_game_lumiere WHERE game_id = ?', [ctx.game.id]);
    assert.equal(Number(lum.total), 2, 'jamais décrémentée');
    await request(app)
      .put(api('/tenir/tour/team-spirit'))
      .set(auth(ctx.adminToken))
      .send({ bilans: [{ teamId: ctx.teams[0].id, cartesGardees: 3 }] })
      .expect(200);
    lum = await queryOne('SELECT total FROM gl_game_lumiere WHERE game_id = ?', [ctx.game.id]);
    assert.equal(Number(lum.total), 2, 'remonté à 3 : déjà compté, rien de plus');
    await request(app)
      .put(api('/tenir/tour/team-spirit'))
      .set(auth(ctx.adminToken))
      .send({ bilans: [{ teamId: ctx.teams[0].id, cartesGardees: 5 }] })
      .expect(200);
    lum = await queryOne('SELECT total FROM gl_game_lumiere WHERE game_id = ?', [ctx.game.id]);
    assert.equal(
      Number(lum.total),
      4,
      'seule la différence au-delà de ce qui a été compté (3 → 5)',
    );
  } finally {
    await execute(
      "UPDATE gl_settings SET value_json = '100' WHERE `key` = 'gameplay.tenir_lumiere_palier'",
    );
    require('../lib/glSettings').invalidateGameplayCache();
  }
});
