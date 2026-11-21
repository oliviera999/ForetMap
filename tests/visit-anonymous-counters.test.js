'use strict';

/**
 * Compteurs anonymes agrégés de la Visite (`visit_anonymous_daily`, migration 374) — audit
 * UI/UX du 19/11/2026, U6 point 5 (« 0 session anonyme sur 30 jours »).
 *
 * Vérifie : une session au premier lieu vu d'un visiteur sans compte, un lieu vu compté une
 * seule fois, une visite terminée quand tous les lieux actifs de la carte sont vus, des
 * compteurs qui survivent à la purge de 24 h de `visit_seen_anonymous`, et une table sans
 * aucun identifiant.
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { initSchema, initDatabase, execute, queryAll } = require('../database');
const { app } = require('../server');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');
const fx = require('./helpers/fmFixtures');

let token;
let mapId;
const zoneIds = [];

async function mapCounters() {
  const res = await request(app)
    .get('/api/visit/stats')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  const block = res.body.breakdown.anonymous_last_30_days;
  assert.ok(block, 'bloc anonymous_last_30_days attendu');
  assert.equal(block.days, 30);
  return (
    block.by_map.find((r) => r.map_id === mapId) || {
      sessions: 0,
      seen_actions: 0,
      completed_visits: 0,
    }
  );
}

test.before(async () => {
  await initSchema();
  await initDatabase();
  token = await ensureAdminTeacherAuthToken({ elevated: true });
  mapId = (await fx.createMap({ label: 'Carte compteurs anonymes' })).id;
  for (const name of ['Mare (test)', 'Haie (test)']) {
    const res = await request(app)
      .post('/api/visit/zones')
      .set('Authorization', `Bearer ${token}`)
      .send({
        map_id: mapId,
        name,
        points: [
          { xp: 10, yp: 10 },
          { xp: 20, yp: 10 },
          { xp: 15, yp: 20 },
        ],
      })
      .expect(201);
    zoneIds.push(res.body.id);
  }
});

test.after(async () => {
  await execute('DELETE FROM visit_anonymous_daily WHERE map_id = ?', [mapId]);
});

test('la table ne porte aucun identifiant : jour, carte et trois compteurs', async () => {
  const cols = await queryAll('SHOW COLUMNS FROM visit_anonymous_daily');
  assert.deepEqual(cols.map((c) => c.Field).sort(), [
    'completed_visits',
    'day',
    'map_id',
    'seen_actions',
    'sessions',
  ]);
});

test('session, lieux vus et visite terminée comptés une seule fois', async () => {
  const visiteur = request.agent(app);
  const mark = (agent, id, seen = true) =>
    agent.post('/api/visit/seen').send({ target_type: 'zone', target_id: id, seen }).expect(200);

  await mark(visiteur, zoneIds[0]);
  let c = await mapCounters();
  assert.equal(c.sessions, 1);
  assert.equal(c.seen_actions, 1);
  assert.equal(c.completed_visits, 0);

  // Le même lieu une seconde fois : rien ne bouge.
  await mark(visiteur, zoneIds[0]);
  c = await mapCounters();
  assert.equal(c.seen_actions, 1);

  // Dernier lieu de la carte : visite terminée, toujours une seule session.
  await mark(visiteur, zoneIds[1]);
  c = await mapCounters();
  assert.equal(c.sessions, 1);
  assert.equal(c.seen_actions, 2);
  assert.equal(c.completed_visits, 1);

  // Un second visiteur : une seconde session.
  const autre = request.agent(app);
  await mark(autre, zoneIds[1]);
  c = await mapCounters();
  assert.equal(c.sessions, 2);
  assert.equal(c.seen_actions, 3);
});

test('les compteurs survivent à la purge des progressions anonymes', async () => {
  const before = await mapCounters();
  await execute('DELETE FROM visit_seen_anonymous');
  const after = await mapCounters();
  assert.deepEqual(after, before);
  assert.ok(after.sessions >= 1);
});
