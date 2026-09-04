'use strict';

// Magasin de réglages paramétré (`lib/shared/settingsStore.js`) — sans base : `queryAll` et
// `execute` sont simulés, la version d'écriture et l'horloge sont pilotées à la main.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createSettingsStore } = require('../lib/shared/settingsStore');

const REGISTRY = {
  'ui.flag': { type: 'boolean', default: true, scope: 'public' },
  'ui.count': { type: 'number', min: 0, max: 10, default: 5, scope: 'public' },
  'ui.mode': { type: 'enum', values: ['a', 'b'], default: 'a', scope: 'teacher' },
  'ui.list': { type: 'json', default: ['x'], scope: 'admin' },
};

/** Fabrique un magasin sur une « base » mémoire, avec compteurs d'appels. */
function makeHarness({ rows = [], ttlMs = 1000, extra = {} } = {}) {
  const state = { version: 0, now: 1_000_000, rows, selects: 0, executes: [] };
  const store = createSettingsStore({
    table: 'app_settings',
    registry: REGISTRY,
    writeVersion: () => state.version,
    now: () => state.now,
    ttlMs,
    queryAll: async (sql, params) => {
      state.selects += 1;
      state.lastSelect = { sql, params };
      if (state.noTable) {
        const err = new Error('no such table');
        err.code = 'ER_NO_SUCH_TABLE';
        throw err;
      }
      return state.rows;
    },
    execute: async (sql, params) => {
      state.executes.push({ sql, params });
      state.version += 1; // comme `database.js` : toute écriture incrémente la version
      return { affectedRows: 1 };
    },
    ...extra,
  });
  return { store, state };
}

test('createSettingsStore refuse une configuration incomplète ou un identifiant SQL douteux', () => {
  assert.throws(() => createSettingsStore({}), TypeError);
  assert.throws(
    () =>
      createSettingsStore({
        table: 'app_settings; DROP',
        registry: REGISTRY,
        writeVersion: () => 0,
        queryAll: async () => [],
        execute: async () => ({}),
      }),
    TypeError,
  );
});

test('loadFlat : défauts + lignes castées ; clé inconnue ignorée ; valeur invalide → défaut', async () => {
  const { store, state } = makeHarness({
    rows: [
      { key: 'ui.flag', value_json: 'false' },
      { key: 'ui.count', value_json: '"7"' },
      { key: 'ui.mode', value_json: '"zzz"' }, // hors enum → défaut
      { key: 'ui.list', value_json: '["p","q"]' },
      { key: 'ui.inconnue', value_json: '1' },
      { key: 'ui.count.bis', value_json: 'pas du json' },
    ],
  });
  const flat = await store.loadFlat();
  assert.deepEqual(flat, {
    'ui.flag': false,
    'ui.count': 7,
    'ui.mode': 'a',
    'ui.list': ['p', 'q'],
  });
  assert.equal(state.selects, 1);
  // Seules les clés du registre sont demandées à la base.
  assert.match(state.lastSelect.sql, /WHERE `key` IN \(\?, \?, \?, \?\)/);
  assert.deepEqual(state.lastSelect.params, Object.keys(REGISTRY));
});

test('loadFlat rend une copie mutable ; loadFlatShared l’instance gelée du cache', async () => {
  const { store } = makeHarness();
  const a = await store.loadFlat();
  const b = await store.loadFlat();
  assert.notEqual(a, b);
  a['ui.flag'] = false;
  assert.equal((await store.loadFlat())['ui.flag'], true, 'la mutation ne touche pas le cache');
  const shared1 = await store.loadFlatShared();
  const shared2 = await store.loadFlatShared();
  assert.equal(shared1, shared2, 'même instance tant que le cache est frais');
  assert.ok(Object.isFrozen(shared1));
});

test('table absente → défauts, sans exception ; autre erreur SQL propagée', async () => {
  const { store, state } = makeHarness();
  state.noTable = true;
  assert.deepEqual(await store.loadFlat(), {
    'ui.flag': true,
    'ui.count': 5,
    'ui.mode': 'a',
    'ui.list': ['x'],
  });
  const boom = createSettingsStore({
    table: 't',
    registry: REGISTRY,
    writeVersion: () => 0,
    queryAll: async () => {
      throw new Error('connexion perdue');
    },
    execute: async () => ({}),
  });
  await assert.rejects(() => boom.loadFlat(), { message: 'connexion perdue' });
});

test('cache versionné par écriture : invalide dès que writeVersion() change', async () => {
  const { store, state } = makeHarness();
  await store.loadFlat();
  await store.loadFlat();
  assert.equal(state.selects, 1, 'servi depuis le cache');
  state.version += 1; // écriture ailleurs dans le process
  await store.loadFlat();
  assert.equal(state.selects, 2, 'recharge après écriture');
  await store.loadFlat();
  assert.equal(state.selects, 2);
});

test('TTL garde-fou : recharge même sans écriture après ttlMs', async () => {
  const { store, state } = makeHarness({ ttlMs: 500 });
  await store.loadFlat();
  state.now += 499;
  await store.loadFlat();
  assert.equal(state.selects, 1);
  state.now += 1;
  await store.loadFlat();
  assert.equal(state.selects, 2);
});

test('lectures simultanées sur cache périmé : une seule requête', async () => {
  const { store, state } = makeHarness();
  await Promise.all([store.loadFlat(), store.loadFlat(), store.get('ui.flag')]);
  assert.equal(state.selects, 1);
});

test('get(key, fallback)', async () => {
  const { store } = makeHarness({ rows: [{ key: 'ui.count', value_json: '3' }] });
  assert.equal(await store.get('ui.count'), 3);
  assert.equal(await store.get('ui.flag', false), true, 'défaut du registre avant le fallback');
  assert.equal(await store.get('ui.absent', 'repli'), 'repli');
});

test('upsert : INSERT … ON DUPLICATE KEY UPDATE paramétré, colonnes supplémentaires, invalidation', async () => {
  const { store, state } = makeHarness();
  await store.loadFlat();
  const written = await store.upsert('ui.count', '8', {
    extraColumns: { scope: 'public', updated_by_user_type: 'teacher', updated_by_user_id: 42 },
  });
  assert.equal(written, 8, 'valeur castée par le registre');
  assert.equal(state.executes.length, 1);
  const { sql, params } = state.executes[0];
  assert.match(sql, /INSERT INTO `app_settings`/);
  assert.match(
    sql,
    /\(`key`, `value_json`, `scope`, `updated_by_user_type`, `updated_by_user_id`, `updated_at`\)/,
  );
  assert.match(sql, /VALUES \(\?, \?, \?, \?, \?, NOW\(\)\)/);
  assert.match(sql, /ON DUPLICATE KEY UPDATE `value_json` = VALUES\(`value_json`\)/);
  assert.match(sql, /`scope` = VALUES\(`scope`\)/);
  assert.match(sql, /`updated_at` = NOW\(\)/);
  assert.deepEqual(params, ['ui.count', '8', 'public', 'teacher', 42]);
  assert.equal(store.isCached(), false, 'invalidation explicite');
  state.rows = [{ key: 'ui.count', value_json: '8' }];
  assert.equal(await store.get('ui.count'), 8);
});

test('upsert : clé inconnue refusée (message historique), sauf allowUnknownKeys', async () => {
  const { store } = makeHarness();
  await assert.rejects(() => store.upsert('ui.absent', 1), { message: 'Clé de réglage inconnue' });
  await assert.rejects(() => store.upsert('constructor', 1), {
    message: 'Clé de réglage inconnue',
  });
  const gl = makeHarness({ extra: { allowUnknownKeys: true, updatedAtColumn: 'updated_at' } });
  await gl.store.upsert('platform.title', 'Titre', { extraColumns: { updated_by: '7' } });
  assert.deepEqual(gl.state.executes[0].params, ['platform.title', '"Titre"', '7']);
});

test('upsert : validation par le registre (messages), ou valeur brute avec validate:false', async () => {
  const { store, state } = makeHarness();
  await assert.rejects(() => store.upsert('ui.count', 99), {
    message: 'Valeur trop grande (max 10)',
  });
  assert.equal(state.executes.length, 0, 'rien n’est écrit');
  await store.upsert('ui.mode', 'zzz', { validate: false });
  assert.deepEqual(state.executes[0].params, ['ui.mode', '"zzz"']);
});

test('upsert : onAfterWrite et table sans colonne updated_at', async () => {
  const seen = [];
  const { store, state } = makeHarness({
    extra: { updatedAtColumn: null, onAfterWrite: (info) => seen.push(info) },
  });
  await store.upsert('ui.flag', 'false');
  assert.deepEqual(seen, [{ key: 'ui.flag', value: false }]);
  assert.doesNotMatch(state.executes[0].sql, /updated_at|NOW\(\)/);
});

test('invalidate() force la relecture', async () => {
  const { store, state } = makeHarness();
  await store.loadFlat();
  store.invalidate();
  await store.loadFlat();
  assert.equal(state.selects, 2);
});

test('setCacheForTests : snapshot épinglé, insensible aux écritures, périmé par son TTL', async () => {
  const { store, state } = makeHarness({ ttlMs: 1000 });
  store.setCacheForTests({ 'ui.flag': false });
  assert.deepEqual(await store.loadFlat(), {
    'ui.flag': false,
    'ui.count': 5,
    'ui.mode': 'a',
    'ui.list': ['x'],
  });
  state.version += 5;
  assert.equal((await store.loadFlat())['ui.flag'], false, 'épinglé malgré les écritures');
  assert.equal(state.selects, 0);
  state.now += 1000;
  await store.loadFlat();
  assert.equal(state.selects, 1, 'le TTL fait tomber le snapshot');
  store.setCacheForTests({ 'ui.count': 9 }, 100);
  state.now += 99;
  assert.equal(await store.get('ui.count'), 9);
  state.now += 1;
  await store.loadFlat();
  assert.equal(state.selects, 2, 'TTL propre au snapshot respecté');
  store.setCacheForTests({ 'ui.count': 1 });
  store.setCacheForTests(null);
  assert.equal(store.isCached(), false);
});
