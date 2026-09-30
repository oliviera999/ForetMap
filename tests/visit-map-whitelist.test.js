'use strict';

/**
 * Liste blanche des cartes de la Visite publique — régression du 30/09/2026.
 *
 * En production, la Visite sans compte ne servait plus que deux cartes : n³ (carte de visite
 * par défaut) et la forêt comestible étaient proposées au changement de carte d'un plan gardé
 * (`ui.*.selectable_map_ids`), et `allowedVisitMapIds` les comptait comme **réservées**.
 * `GET /api/visit/content` sans `map_id` répondait alors « Carte introuvable » et la Visite
 * restait vide.
 *
 * Règles vérifiées :
 * - seule la carte des plans gardés (`ui.plan.map_id`) est réservée ;
 * - la carte de visite par défaut reste servie ;
 * - sans `map_id`, une carte par défaut hors liste ouvre la première carte publiée ;
 * - une carte demandée hors liste reste « Carte introuvable ».
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { initSchema, initDatabase, execute } = require('../database');
const { app } = require('../server');
const { setSetting, invalidateSettingsCache } = require('../lib/settings');
const { allowedVisitMapIds } = require('../lib/surfaceAccess');
const { snapshotSetting, restoreSetting } = require('./helpers/settingsSnapshot');
const fx = require('./helpers/fmFixtures');

const by = { userType: 'teacher', userId: 'test' };
const snapshots = [];
/** Carte des plans gardés (`ui.plan.map_id`, partagée) : la seule réservée. */
let planMainId;
/** Carte proposée au changement sur le plan des personnels : reste publique. */
let staffSelectableId;
/** Carte proposée au changement sur le plan public : reste publique. */
let planSelectableId;

async function set(key, value) {
  await setSetting(key, value, by);
  invalidateSettingsCache();
}

test.before(async () => {
  await initSchema();
  await initDatabase();
  planMainId = (await fx.createMap({ label: 'Plan principal (réservé)' })).id;
  staffSelectableId = (await fx.createMap({ label: 'Proposée au plan des personnels' })).id;
  planSelectableId = (await fx.createMap({ label: 'Proposée au plan public' })).id;
  for (const key of [
    'ui.plan.map_id',
    'ui.plan.selectable_map_ids',
    'ui.staff_plan.selectable_map_ids',
    'ui.visit.selectable_map_ids',
    'ui.map.default_map_visit',
  ]) {
    snapshots.push(await snapshotSetting(key));
  }
  await set('ui.visit.selectable_map_ids', '');
  await set('ui.plan.map_id', planMainId);
  await set('ui.plan.selectable_map_ids', planSelectableId);
  await set('ui.staff_plan.selectable_map_ids', staffSelectableId);
});

test.after(async () => {
  for (const snap of snapshots) await restoreSetting(snap);
  invalidateSettingsCache();
  for (const id of [planMainId, staffSelectableId, planSelectableId]) {
    await execute('DELETE FROM maps WHERE id = ?', [id]);
  }
});

test('une carte proposée au changement sur un plan gardé reste servie en visite', async () => {
  await set('ui.map.default_map_visit', planSelectableId);
  const allowed = await allowedVisitMapIds();
  assert.ok(!allowed.includes(planMainId), 'la carte principale du plan reste réservée');
  assert.ok(allowed.includes(planSelectableId), 'carte proposée sur le plan public');
  assert.ok(allowed.includes(staffSelectableId), 'carte proposée sur le plan des personnels');

  for (const id of [planSelectableId, staffSelectableId]) {
    const res = await request(app).get(`/api/visit/content?map_id=${id}`).expect(200);
    assert.equal(res.body.map_id, id);
  }
  const maps = await request(app).get('/api/maps').expect(200);
  const ids = maps.body.map((m) => m.id);
  assert.ok(ids.includes(planSelectableId));
  assert.ok(!ids.includes(planMainId));
});

test('carte demandée hors liste blanche : toujours « Carte introuvable »', async () => {
  const res = await request(app).get(`/api/visit/content?map_id=${planMainId}`).expect(400);
  assert.equal(res.body.error, 'Carte introuvable');
});

test('la carte de visite par défaut est servie, même principale d’un plan gardé', async () => {
  await set('ui.map.default_map_visit', planMainId);
  try {
    assert.ok((await allowedVisitMapIds()).includes(planMainId));
    const res = await request(app).get('/api/visit/content').expect(200);
    assert.equal(res.body.map_id, planMainId);
  } finally {
    await set('ui.map.default_map_visit', planSelectableId);
  }
});

test('sans map_id, une carte par défaut hors liste ouvre la première carte publiée', async () => {
  await set('ui.visit.selectable_map_ids', `${staffSelectableId};${planSelectableId}`);
  await set('ui.map.default_map_visit', planMainId);
  try {
    const res = await request(app).get('/api/visit/content').expect(200);
    assert.equal(res.body.map_id, staffSelectableId);
    await request(app).get(`/api/visit/content?map_id=${planMainId}`).expect(400);
  } finally {
    await set('ui.visit.selectable_map_ids', '');
    await set('ui.map.default_map_visit', planSelectableId);
  }
});
