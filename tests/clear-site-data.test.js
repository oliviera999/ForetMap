'use strict';

/**
 * Lot A — Clear-Site-Data à la déconnexion (traceurs RGPD).
 */

const { describe, test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const {
  buildClearSiteDataHeader,
  normalizeLogoutClearSiteDataScope,
  SCOPES,
} = require('../lib/clearSiteData');
const { PRIVACY_SETTINGS } = require('../lib/settings/privacy');
const { initSchema, initDatabase } = require('../database');
const { app } = require('../server');
const { setSetting, invalidateSettingsCache } = require('../lib/settings');
const { snapshotSetting, restoreSetting } = require('./helpers/settingsSnapshot');
const { PWA_PROFILES } = require('../scripts/build-pwa');

describe('clearSiteData helper', () => {
  test('normalise le réglage et refuse cookies / executionContexts', () => {
    assert.equal(normalizeLogoutClearSiteDataScope('cache'), 'cache');
    assert.equal(normalizeLogoutClearSiteDataScope('cache_storage'), 'cache_storage');
    assert.equal(normalizeLogoutClearSiteDataScope('cookies'), 'cache');
    assert.equal(normalizeLogoutClearSiteDataScope(''), 'cache');
    assert.deepEqual([...SCOPES], ['cache', 'cache_storage']);
  });

  test('en-tête : cache seul ou cache+storage, jamais cookies ni executionContexts', () => {
    assert.equal(buildClearSiteDataHeader('cache'), '"cache"');
    assert.equal(buildClearSiteDataHeader('cache_storage'), '"cache", "storage"');
    for (const scope of ['cache', 'cache_storage', 'cookies', null]) {
      const header = buildClearSiteDataHeader(scope);
      assert.doesNotMatch(header, /cookies/i);
      assert.doesNotMatch(header, /executionContexts/i);
    }
  });

  test('réglage privacy.logout_clear_site_data_scope déclaré', () => {
    const meta = PRIVACY_SETTINGS['privacy.logout_clear_site_data_scope'];
    assert.ok(meta);
    assert.equal(meta.scope, 'public');
    assert.equal(meta.default, 'cache');
    assert.deepEqual(meta.values, ['cache', 'cache_storage']);
  });
});

describe('Clear-Site-Data sur les routes de déconnexion', () => {
  let snapshot;

  before(async () => {
    await initSchema();
    await initDatabase();
  });

  beforeEach(async () => {
    snapshot = await snapshotSetting('privacy.logout_clear_site_data_scope');
    invalidateSettingsCache();
  });

  after(async () => {
    if (snapshot) await restoreSetting(snapshot);
    invalidateSettingsCache();
  });

  async function assertLogoutHeaders(path, expectedHeader) {
    const res = await request(app).post(path).expect(200);
    assert.equal(res.body?.ok, true);
    assert.equal(res.headers['cache-control'], 'no-store');
    assert.equal(res.headers['clear-site-data'], expectedHeader);
  }

  test('POST /api/auth/logout : 200 sans session, Clear-Site-Data cache', async () => {
    await setSetting('privacy.logout_clear_site_data_scope', 'cache', {});
    invalidateSettingsCache();
    await assertLogoutHeaders('/api/auth/logout', '"cache"');
  });

  test('POST /api/auth/logout : mode cache_storage', async () => {
    await setSetting('privacy.logout_clear_site_data_scope', 'cache_storage', {});
    invalidateSettingsCache();
    await assertLogoutHeaders('/api/auth/logout', '"cache", "storage"');
  });

  test('plans : même en-tête sur les trois POST /logout', async () => {
    await setSetting('privacy.logout_clear_site_data_scope', 'cache', {});
    invalidateSettingsCache();
    for (const path of ['/api/plan/logout', '/api/enov/logout', '/api/staff-plan/logout']) {
      await assertLogoutHeaders(path, '"cache"');
    }
  });
});

test('PWA staff : aucune API mise en cache (figé pour le lot A)', () => {
  assert.deepEqual([...PWA_PROFILES.staff.apiStaleWhileRevalidate], []);
  assert.deepEqual([...PWA_PROFILES.staff.apiNetworkFirst], []);
});
