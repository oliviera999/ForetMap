'use strict';

/**
 * Audit ForetMap du 19/11/2026, lot 11 — F3 : le service worker ne doit plus appeler
 * `skipWaiting()` à l'installation. Sinon la nouvelle version s'active aussitôt, purge
 * l'ancien cache sous un onglet encore ouvert (bundles chargés à la demande perdus) et le
 * bandeau « une mise à jour est prête » ne trouve jamais de `registration.waiting`.
 * Seul le message `SKIP_WAITING` (déclenché par l'utilisateur) active la version en attente.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { renderServiceWorker } = require('../src/shared/pwa/swTemplate');

function loadWorker(source) {
  const listeners = {};
  const calls = { skipWaiting: 0, claim: 0 };
  const cache = {
    addAll: () => Promise.resolve(),
    add: () => Promise.resolve(),
    match: () => Promise.resolve(undefined),
    put: () => Promise.resolve(),
  };
  const self = {
    location: { origin: 'https://foretmap.test' },
    addEventListener(type, handler) {
      listeners[type] = handler;
    },
    skipWaiting() {
      calls.skipWaiting += 1;
      return Promise.resolve();
    },
    clients: {
      claim() {
        calls.claim += 1;
        return Promise.resolve();
      },
    },
  };
  const context = {
    self,
    caches: {
      open: () => Promise.resolve(cache),
      match: () => Promise.resolve(undefined),
      keys: () => Promise.resolve([]),
      delete: () => Promise.resolve(true),
    },
    fetch: () => Promise.resolve(),
    URL,
    Promise,
    console,
    setTimeout,
    clearTimeout,
  };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: 'sw-lot11.js' });
  return { listeners, calls };
}

async function runInstall(listeners) {
  let pending = null;
  listeners.install({
    waitUntil(p) {
      pending = p;
    },
  });
  assert.ok(pending, 'install doit appeler event.waitUntil');
  await pending;
}

const TEMPLATE_OPTIONS = {
  product: 'foret',
  cacheName: 'foretmap-foret-lot11',
  precache: ['/', '/assets/main-Abc.js'],
  htmlEntries: ['/', '/index.vite.html'],
  apiStaleWhileRevalidate: [],
  apiNetworkFirst: [],
  offlinePath: '/offline.html',
};

for (const [label, getSource] of [
  ['gabarit swTemplate (dist/sw-*.js)', () => renderServiceWorker(TEMPLATE_OPTIONS)],
  [
    'public/sw.js (mode dev)',
    () => fs.readFileSync(path.join(__dirname, '..', 'public', 'sw.js'), 'utf8'),
  ],
]) {
  test(`F3 — ${label} : l'installation n'appelle pas skipWaiting()`, async () => {
    const { listeners, calls } = loadWorker(getSource());
    await runInstall(listeners);
    assert.strictEqual(calls.skipWaiting, 0, 'la nouvelle version doit rester en attente');
  });

  test(`F3 — ${label} : le message SKIP_WAITING active la version en attente`, async () => {
    const { listeners, calls } = loadWorker(getSource());
    await runInstall(listeners);
    listeners.message({ data: { type: 'AUTRE' } });
    assert.strictEqual(calls.skipWaiting, 0);
    listeners.message({ data: { type: 'SKIP_WAITING' } });
    assert.strictEqual(calls.skipWaiting, 1);
  });
}
