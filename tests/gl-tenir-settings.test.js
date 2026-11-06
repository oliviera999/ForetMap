'use strict';

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute, queryOne, withTransaction } = require('../database');
const {
  getGameplaySettings,
  invalidateGameplayCache,
  TENIR_SETTING_KEYS,
  camelKeyFor,
  DEFAULT_GAMEPLAY,
} = require('../lib/glSettings');
const { ALLOWED_GAMEPLAY_SETTINGS } = require('../lib/gl/adminRouteHelpers');
const { applyPlayerVitalityDelta, resolveVitalityCaps } = require('../lib/glVitality');
const {
  resolveTenirSettings,
  resolveDesMode,
  isTenirGame,
  isoWeekOf,
  trimestreOf,
  anneeScolaireOf,
  validateOverrides,
} = require('../lib/glTenir');
const {
  createGlAdmin,
  createGlClass,
  createGlPlayer,
  signTokens,
} = require('./helpers/glFixtures');
const { enableTenirSettings, setGlSetting } = require('./helpers/glTenirFixtures');

let adminToken = '';
let classId = null;
const stamp = Date.now();

before(async () => {
  await initSchema();
  await enableTenirSettings();
  const admin = await createGlAdmin({ email: `mj.tenir.settings.${stamp}@ecole.local` });
  const cls = await createGlClass({ name: `Classe TS ${stamp}`, adminId: admin.id });
  classId = Number(cls.id);
  adminToken = (await signTokens({ adminId: admin.id })).adminToken;
});

test('chaque clé tenir_* est déclarée (registre, camelKeyFor, liste blanche, défaut)', async () => {
  assert.ok(TENIR_SETTING_KEYS.length >= 32);
  for (const key of TENIR_SETTING_KEYS) {
    const camel = camelKeyFor(key);
    assert.ok(camel, `camelKeyFor(${key})`);
    assert.ok(camel in DEFAULT_GAMEPLAY, `défaut de ${camel}`);
    assert.ok(ALLOWED_GAMEPLAY_SETTINGS.has(key), `liste blanche ${key}`);
  }
  assert.ok(ALLOWED_GAMEPLAY_SETTINGS.has('gameplay.feuillet_zone_traversal_enabled'));
  const settings = await getGameplaySettings({ forceRefresh: true });
  assert.equal(typeof settings.tenirEnabled, 'boolean');
  assert.deepEqual(settings.tenirFouillesParTour, { gnome: 1, unicorn: 2 });
});

test('PUT /api/gl/admin/settings/:key lit et écrit une clé json, refuse un json mal formé', async () => {
  const ok = await request(app)
    .put('/api/gl/admin/settings/gameplay.tenir_fouilles_par_tour')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ value: { gnome: 2, unicorn: 3 } });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  const settings = await getGameplaySettings({ forceRefresh: true });
  assert.deepEqual(settings.tenirFouillesParTour, { gnome: 2, unicorn: 3 });

  const bad = await request(app)
    .put('/api/gl/admin/settings/gameplay.tenir_fouilles_par_tour')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ value: { gnome: 2 } });
  assert.equal(bad.status, 400);
  assert.match(bad.body.error, /tenir_fouilles_par_tour/);

  const badEnum = await request(app)
    .put('/api/gl/admin/settings/gameplay.tenir_surface')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ value: 'papier' });
  assert.equal(badEnum.status, 400);

  const badTrim = await request(app)
    .put('/api/gl/admin/settings/gameplay.tenir_trimestres')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ value: { 1: ['09-01'], 2: ['01-05', '03-31'], 3: ['04-01', '07-10'] } });
  assert.equal(badTrim.status, 400);

  await setGlSetting('gameplay.tenir_fouilles_par_tour', { gnome: 1, unicorn: 2 });
  const exposed = await request(app)
    .get('/api/gl/gameplay-settings')
    .set('Authorization', `Bearer ${adminToken}`);
  assert.equal(exposed.status, 200);
  assert.equal(exposed.body.settings.tenirEnabled, true);
  assert.equal(exposed.body.settings.tenirDesCount, 2);
});

test('les plafonds 8/8 sont effectifs sur applyPlayerVitalityDelta', async () => {
  const player = await createGlPlayer({ classId, pseudo: `joueur-cap-${stamp}` });
  await execute('UPDATE gl_players SET health_points = 7, power_points = 7 WHERE id = ?', [
    player.id,
  ]);
  const settings = await getGameplaySettings({ forceRefresh: true });
  const caps = resolveVitalityCaps(settings);
  assert.equal(caps.maxHealth, 8);
  assert.equal(caps.maxPower, 8);
  let result;
  await withTransaction(async (tx) => {
    result = await applyPlayerVitalityDelta(tx, {
      playerId: player.id,
      healthDelta: 3,
      powerDelta: 3,
      caps,
    });
  });
  assert.equal(result.health, 8);
  assert.equal(result.power, 8);
  assert.equal(result.healthCapped, true);
});

test('résolution : profil prologue → voile/marche/chapardeur faux et 8 zones ; override par partie prioritaire', async () => {
  const settings = await getGameplaySettings({ forceRefresh: true });
  const prologue = resolveTenirSettings(settings, { tenir_profil: 'prologue' });
  assert.equal(prologue.voile, false);
  assert.equal(prologue.marche, false);
  assert.equal(prologue.chapardeur, false);
  assert.deepEqual(prologue.zones_par_plateau, { 1: 8, 2: 8, 3: 8, 4: 8 });
  assert.equal(prologue.vent, true);
  const override = resolveTenirSettings(settings, {
    tenir_profil: 'prologue',
    tenir_overrides_json: JSON.stringify({ voile: true, surface: 'tablette' }),
  });
  assert.equal(override.voile, true);
  assert.equal(override.surface, 'tablette');
  assert.equal(override.marche, false);
  assert.equal(override.max_health_points, 8);
  assert.equal(override.lore_gemme_costs_enabled, false);
});

test('des_mode : serveur par défaut sur tablette, physique ailleurs, surcharge des_mode prioritaire', async () => {
  const settings = await getGameplaySettings({ forceRefresh: true });
  const tablette = resolveTenirSettings(settings, {
    tenir_profil: 'complet',
    tenir_overrides_json: '{"surface":"tablette"}',
  });
  assert.equal(resolveDesMode(tablette), 'serveur');
  const tableau = resolveTenirSettings(settings, { tenir_profil: 'complet' });
  assert.equal(resolveDesMode(tableau), 'physique');
  const force = resolveTenirSettings(settings, {
    tenir_profil: 'complet',
    tenir_overrides_json: '{"surface":"tablette","des_mode":"physique"}',
  });
  assert.equal(resolveDesMode(force), 'physique');
});

test('isTenirGame : drapeau global ET profil de partie ; une partie sans profil reste classique', async () => {
  const settings = await getGameplaySettings({ forceRefresh: true });
  assert.equal(isTenirGame(settings, { tenir_profil: null }), false);
  assert.equal(isTenirGame(settings, { tenir_profil: 'complet' }), true);
  assert.equal(
    isTenirGame({ ...settings, tenirEnabled: false }, { tenir_profil: 'complet' }),
    false,
  );
});

test('validateOverrides refuse une clé inconnue ou une valeur hors vocabulaire', () => {
  assert.ok(validateOverrides({ surface: 'tablette', vent: false }).value);
  assert.ok(validateOverrides({ surface: 'papier' }).error);
  assert.ok(validateOverrides({ foo: true }).error);
  assert.ok(validateOverrides({ zones_par_plateau: { 1: 8 } }).error);
});

test('semaine ISO, trimestre, année scolaire', () => {
  assert.equal(isoWeekOf(new Date(2026, 10, 6)), '2026-W45');
  assert.equal(isoWeekOf(new Date(2027, 0, 1)), '2026-W53');
  const r = resolveTenirSettings(DEFAULT_GAMEPLAY, null);
  assert.equal(trimestreOf(new Date(2026, 10, 6), r), 1);
  assert.equal(trimestreOf(new Date(2027, 1, 10), r), 2);
  assert.equal(trimestreOf(new Date(2027, 4, 10), r), 3);
  assert.equal(trimestreOf(new Date(2027, 6, 20), r), null);
  assert.equal(anneeScolaireOf(new Date(2026, 10, 6)), '2026-2027');
  assert.equal(anneeScolaireOf(new Date(2027, 4, 6)), '2026-2027');
});

test('la migration 330 est rejouable : les colonnes et tables existent après deux initSchema', async () => {
  await initSchema();
  const col = await queryOne(
    "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'gl_games' AND COLUMN_NAME = 'tenir_profil'",
  );
  assert.ok(col);
  for (const table of [
    'gl_chasse_zones',
    'gl_tenir_questions_lecture',
    'gl_market_annonces',
    'gl_game_retraits',
    'gl_game_tenir_state',
  ]) {
    const row = await queryOne(
      'SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?',
      [table],
    );
    assert.ok(row, table);
  }
  invalidateGameplayCache();
});
