'use strict';

require('./helpers/setup');

/**
 * Audit ForetMap du 19/11/2026, lot 1 — S4 et S10 (`server.js`).
 *
 * S4 : le middleware CSP attendait la lecture SQL de `privacy.external_assets_mode` avant
 * `next()`. Monté avant les statiques et `/api/health`, il bloquait toutes les réponses dès
 * que la base ne répondait plus. Rejeu : la lecture du réglage ne rend jamais la main.
 *
 * S10 : le journal fatal `unhandledRejection` passait `{ reason }` ; Pino ne sérialise que
 * `err`, la cause était perdue (`{}`).
 */
const { test } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');

const settings = require('../lib/settings');

let hangCspSetting = false;
const realGetSettingValue = settings.getSettingValue;
settings.getSettingValue = (key, fallback) => {
  if (hangCspSetting && key === 'privacy.external_assets_mode') {
    return new Promise(() => {}); // base qui ne répond plus : la promesse ne se règle jamais
  }
  return realGetSettingValue(key, fallback);
};

const logger = require('../lib/logger');
const { initDatabase } = require('../database');
const { app } = require('../server');
const { createCspAssetsModeCache } = require('../lib/cspAssetsModeCache');

test('S4 — base qui ne répond plus : /api/health et /health répondent sans attendre la CSP', async () => {
  await initDatabase(); // base « prête » : avant le correctif, la lecture SQL était attendue
  hangCspSetting = true;
  try {
    for (const path of ['/api/health', '/health']) {
      const started = Date.now();
      const res = await request(app).get(path).timeout({ deadline: 3000 });
      assert.ok(res.status < 500, `${path} répond (${res.status})`);
      assert.ok(Date.now() - started < 3000, `${path} ne doit pas attendre la base`);
      assert.match(
        String(res.headers['content-security-policy'] || ''),
        /default-src/,
        `${path} porte toujours une CSP`,
      );
    }
  } finally {
    hangCspSetting = false;
  }
});

test('S4 — cache du mode CSP : valeur immédiate, rafraîchie en arrière-plan', async () => {
  let clock = 0;
  let reads = 0;
  let nextValue = 'external';
  let behaviour = 'resolve';
  const cache = createCspAssetsModeCache({
    readMode: () => {
      reads += 1;
      if (behaviour === 'reject') return Promise.reject(new Error('Pool is closed.'));
      if (behaviour === 'hang') return new Promise(() => {});
      return Promise.resolve(nextValue);
    },
    refreshMs: 1000,
    readTimeoutMs: 30,
    now: () => clock,
  });

  // Première lecture : la plus stricte tant que rien n'a abouti, sans attendre.
  assert.strictEqual(cache.get(), 'local');
  await cache.refresh();
  assert.strictEqual(cache.get(), 'external');
  assert.strictEqual(reads, 1, 'une valeur fraîche ne provoque pas de relecture');

  // Erreur SQL : la dernière valeur connue reste servie.
  clock = 2000;
  behaviour = 'reject';
  assert.strictEqual(cache.get(), 'external');
  await cache.refresh();
  assert.strictEqual(cache.get(), 'external');

  // Lecture qui pend : abandonnée au délai, puis une nouvelle lecture redevient possible.
  behaviour = 'hang';
  const pending = cache.refresh();
  assert.strictEqual(cache.refresh(), pending, 'une seule lecture à la fois');
  assert.strictEqual(await pending, 'external');
  behaviour = 'resolve';
  nextValue = 'local';
  await cache.refresh();
  assert.strictEqual(cache.get(), 'local');
});

test('S4 — base non prête : aucune lecture tentée', async () => {
  let reads = 0;
  const cache = createCspAssetsModeCache({
    readMode: async () => {
      reads += 1;
      return 'external';
    },
    isReady: () => false,
  });
  assert.strictEqual(cache.get(), 'local');
  await cache.refresh();
  assert.strictEqual(reads, 0);
});

test('S10 — le journal fatal unhandledRejection garde la cause sous `err`', async () => {
  const handler = process
    .listeners('unhandledRejection')
    .find((fn) => /recordCrash\('unhandledRejection'/.test(String(fn)));
  assert.ok(handler, 'server.js pose un gestionnaire unhandledRejection');

  const calls = [];
  const realFatal = logger.fatal;
  const realExit = process.exit;
  logger.fatal = (...args) => calls.push(args);
  process.exit = () => {};
  try {
    const reason = new Error('cause du rejet');
    handler(reason, Promise.resolve());
    await new Promise((resolve) => setTimeout(resolve, 80));
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0][0].err, reason, 'la cause est passée sous `err`');
    assert.ok(!('reason' in calls[0][0]), '`reason` n’est pas sérialisé par Pino');
  } finally {
    logger.fatal = realFatal;
    process.exit = realExit;
  }
});
