'use strict';

/**
 * Codes d'accès des plans (plan public, plan des personnels, plan e-nov) : règles côté
 * serveur.
 *
 *  - longueur minimale d'un code enregistré (12 caractères) ;
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { initSchema, initDatabase, execute } = require('../database');
const { app } = require('../server');
const { ensureRbacBootstrap } = require('../lib/rbac');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');
const { setSetting, invalidateSettingsCache } = require('../lib/settings');
const { snapshotSetting, restoreSetting } = require('./helpers/settingsSnapshot');
const fx = require('./helpers/fmFixtures');

const TARGETS = Object.freeze([
  { route: 'plan', hashKey: 'security.plan_access_code_hash' },
  { route: 'staff-plan', hashKey: 'security.staff_plan_access_code_hash' },
  { route: 'enov-plan', hashKey: 'security.enov_plan_access_code_hash' },
]);

let adminToken;
let mapId;
const snapshots = [];

function setAccessCode(target, code) {
  return request(app)
    .post(`/api/settings/admin/${target}-access-code`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ code });
}

test.before(async () => {
  await initSchema();
  await initDatabase();
  await ensureRbacBootstrap();
  adminToken = await ensureAdminTeacherAuthToken({ elevated: true });
  mapId = (await fx.createMap({ label: 'Plan codes d’accès' })).id;
  for (const key of [
    'ui.plan.map_id',
    'ui.plan.access_mode',
    'ui.staff_plan.access_mode',
    'ui.enov_plan.access_mode',
    ...TARGETS.map((t) => t.hashKey),
  ]) {
    snapshots.push(await snapshotSetting(key));
  }
  await setSetting('ui.plan.map_id', mapId, { userType: 'teacher', userId: 'test' });
  invalidateSettingsCache();
});

test.beforeEach(async () => {
  adminToken = await ensureAdminTeacherAuthToken({ elevated: true });
  invalidateSettingsCache();
});

test.after(async () => {
  for (const snap of snapshots) await restoreSetting(snap);
  await execute('DELETE FROM maps WHERE id = ?', [mapId]);
  invalidateSettingsCache();
});

// --- Longueur minimale ---------------------------------------------------------------------

test('un code de moins de 12 caractères est refusé à l’enregistrement, sur les trois plans', async () => {
  for (const { route } of TARGETS) {
    const res = await setAccessCode(route, 'onze-carac.');
    assert.equal(res.status, 400, route);
    assert.match(res.body.error, /12 caractères minimum/, route);
  }
});

test('un code de 12 caractères est accepté (et l’effacement reste possible)', async () => {
  for (const { route, hashKey } of TARGETS) {
    const res = await setAccessCode(route, 'douze-carac.');
    assert.equal(res.status, 200, route);
    assert.equal(res.body.hasCode, true, route);
    const cleared = await setAccessCode(route, '');
    assert.equal(cleared.status, 200, route);
    assert.equal(cleared.body.hasCode, false, route);
    await setSetting(hashKey, '', { userType: 'admin', userId: 'test' });
  }
});
