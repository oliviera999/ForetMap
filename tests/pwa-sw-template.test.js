'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const vm = require('node:vm');

const { PRODUCTS } = require('../lib/products');
const {
  DEFAULT_NETWORK_TIMEOUT_SECONDS,
  renderServiceWorker,
  renderWebManifest,
  listProductIcons,
  iconUrlPrefix,
} = require('../src/shared/pwa/swTemplate');

const BASE_OPTIONS = Object.freeze({
  product: 'foret',
  cacheName: 'foretmap-foret-abcdef12',
  precache: ['/', '/index.vite.html', '/assets/main-Xyz.js', '/assets/main-Xyz.css', '/'],
  htmlEntries: ['/', '/index.html', '/index.vite.html'],
  apiStaleWhileRevalidate: ['/api/maps', '/api/visit/content'],
  apiNetworkFirst: ['/api/zones', '/api/tasks'],
  offlinePath: '/offline.html',
});

/**
 * Exécute le SW rendu dans un bac à sable minimal (self/caches/fetch factices) et renvoie
 * les écouteurs enregistrés : prouve que la source est du JS valide et complet.
 */
function loadServiceWorker(source, { timers } = {}) {
  const listeners = {};
  const self = {
    addEventListener(type, handler) {
      listeners[type] = handler;
    },
    skipWaiting() {},
    clients: { claim() {} },
  };
  const context = {
    self,
    caches: { open: () => Promise.resolve(), match: () => Promise.resolve(), keys: () => [] },
    fetch: () => Promise.resolve(),
    URL,
    Promise,
    console,
    // Minuteries réelles par défaut ; un test du délai réseau passe les siennes (`fakeTimers`).
    setTimeout: timers ? timers.setTimeout : setTimeout,
    clearTimeout: timers ? timers.clearTimeout : clearTimeout,
  };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: 'sw-test.js' });
  return { listeners, context };
}

test('renderServiceWorker injecte le nom de cache et les listes (sans doublon de précache)', () => {
  const source = renderServiceWorker(BASE_OPTIONS);
  assert.match(source, /const CACHE_NAME = "foretmap-foret-abcdef12";/);
  assert.match(source, /const OFFLINE_PATH = "\/offline\.html";/);
  for (const url of ['/assets/main-Xyz.js', '/assets/main-Xyz.css', '/index.vite.html']) {
    assert.ok(source.includes(JSON.stringify(url)), `précache doit contenir ${url}`);
  }
  // `/` présent deux fois en entrée → une seule occurrence dans PRECACHE_URLS.
  const precacheBlock = source.slice(
    source.indexOf('const PRECACHE_URLS'),
    source.indexOf('const HTML_ENTRIES'),
  );
  assert.strictEqual((precacheBlock.match(/"\/",/g) || []).length, 1);
  assert.ok(source.includes('"/api/maps"') && source.includes('"/api/visit/content"'));
  assert.ok(source.includes('"/api/zones"') && source.includes('"/api/tasks"'));
  assert.ok(source.includes('"/index.html"'));
});

test('renderServiceWorker reprend les stratégies (HTML network-first, SWR, assets cache-first, SKIP_WAITING, purge)', () => {
  const source = renderServiceWorker(BASE_OPTIONS);
  assert.match(source, /function staleWhileRevalidate\(request\)/);
  assert.match(source, /function networkFirst\(request, fallback, options = \{\}\)/);
  assert.match(source, /const NETWORK_TIMEOUT_MS = 4000;/);
  assert.match(source, /function cacheFirst\(request\)/);
  assert.match(source, /isHtmlEntry\(url\.pathname\)/);
  assert.match(source, /caches\.match\(OFFLINE_PATH\)/);
  assert.match(source, /pathname\.includes\('\/assets\/'\)/);
  assert.match(source, /SKIP_WAITING/);
  assert.match(source, /names\.filter\(\(name\) => name !== CACHE_NAME\)/);
  assert.match(source, /self\.clients\.claim\(\)/);
  assert.match(source, /\.woff2/);
  assert.match(source, /GÉNÉRÉ par scripts\/build-pwa\.js/);
  assert.match(source, /Service worker « foret »/);
});

test('le SW rendu est du JavaScript valide et enregistre message/install/activate/fetch', () => {
  const { listeners, context } = loadServiceWorker(renderServiceWorker(BASE_OPTIONS));
  assert.deepStrictEqual(Object.keys(listeners).sort(), [
    'activate',
    'fetch',
    'install',
    'message',
  ]);
  // Les prédicats de routage sont accessibles dans le contexte du script.
  assert.strictEqual(context.isHtmlEntry('/index.vite.html'), true);
  assert.strictEqual(context.isHtmlEntry('/api/zones'), false);
  assert.strictEqual(context.isStaleWhileRevalidateApi('/foretmap/api/maps'), true);
  assert.strictEqual(context.isNetworkFirstApi('/api/zones'), true);
  assert.strictEqual(context.isNetworkFirstApi('/api/zones/1'), false);
  assert.strictEqual(context.isHashedAsset('/assets/main-Xyz.js'), true);
  assert.strictEqual(context.isHashedAsset('/sw.js'), false);
  assert.strictEqual(context.isImageOrFont('/plan/favicon.svg'), true);
});

test('fetch : un GET HTML passe par networkFirst avec repli offline, un asset par cacheFirst', async () => {
  const calls = [];
  const source = renderServiceWorker(BASE_OPTIONS);
  const { listeners, context } = loadServiceWorker(source);
  context.fetch = (request) => {
    calls.push(`fetch:${request.url}`);
    return Promise.reject(new Error('hors ligne'));
  };
  const store = new Map([['/offline.html', { body: 'offline' }]]);
  const cache = {
    match: (request) =>
      Promise.resolve(
        store.get(typeof request === 'string' ? request : new URL(request.url).pathname),
      ),
    put: () => Promise.resolve(),
  };
  context.caches = {
    open: () => Promise.resolve(cache),
    match: (request) => cache.match(request),
    keys: () => Promise.resolve([]),
  };
  let responded;
  listeners.fetch({
    request: { method: 'GET', url: 'https://foretmap.test/' },
    respondWith: (promise) => {
      responded = promise;
    },
  });
  const response = await responded;
  assert.deepStrictEqual(response, { body: 'offline' });
  assert.deepStrictEqual(calls, ['fetch:https://foretmap.test/']);

  // Asset haché déjà en cache : aucun appel réseau.
  store.set('/assets/main-Xyz.js', { body: 'bundle' });
  calls.length = 0;
  listeners.fetch({
    request: { method: 'GET', url: 'https://foretmap.test/assets/main-Xyz.js' },
    respondWith: (promise) => {
      responded = promise;
    },
  });
  assert.deepStrictEqual(await responded, { body: 'bundle' });
  assert.deepStrictEqual(calls, []);

  // POST : jamais intercepté.
  let intercepted = false;
  listeners.fetch({
    request: { method: 'POST', url: 'https://foretmap.test/api/zones' },
    respondWith: () => {
      intercepted = true;
    },
  });
  assert.strictEqual(intercepted, false);
});

/**
 * Bac à sable de cache partagé par les cas de révocation : un `Map` derrière l'API `caches`,
 * pour observer ce que le SW y met et ce qu'il en retire.
 */
function cacheSandbox(context, initial = []) {
  const store = new Map(initial);
  const keyOf = (request) =>
    typeof request === 'string' ? request : new URL(request.url).pathname;
  const cache = {
    match: (request) => Promise.resolve(store.get(keyOf(request))),
    put: (request, response) => {
      store.set(keyOf(request), response);
      return Promise.resolve();
    },
    delete: (request) => Promise.resolve(store.delete(keyOf(request))),
  };
  context.caches = {
    open: () => Promise.resolve(cache),
    match: (request) => cache.match(request),
    keys: () => Promise.resolve([]),
  };
  return store;
}

test('révocation : une 401 au rafraîchissement vide l’entrée mise en cache (S8)', async () => {
  // Le constat S8 : la charge du plan restait sur l'appareil après une révocation du code, et
  // le service worker la rejouait indéfiniment — `stale-while-revalidate` ne mémorise que les
  // réponses valides, donc la 401 ne remplaçait jamais le contenu périmé.
  const source = renderServiceWorker({
    ...BASE_OPTIONS,
    product: 'plan',
    apiStaleWhileRevalidate: ['/api/plan/content'],
    apiNetworkFirst: [],
  });
  const { listeners, context } = loadServiceWorker(source);
  const stale = {
    ok: true,
    status: 200,
    body: 'plan périmé',
    clone: () => ({ body: 'plan périmé' }),
  };
  const store = cacheSandbox(context, [['/api/plan/content', stale]]);

  // Le code a été révoqué : le serveur refuse.
  context.fetch = () => Promise.resolve({ ok: false, status: 401, clone: () => ({}) });

  let responded;
  listeners.fetch({
    request: { method: 'GET', url: 'https://plan.test/api/plan/content' },
    respondWith: (promise) => {
      responded = promise;
    },
  });
  // Le contenu périmé part une dernière fois — la réponse était déjà rendue quand le réseau
  // a tranché. C'est le coût assumé du hors-ligne, documenté dans le gabarit.
  assert.deepStrictEqual(await responded, stale);

  // …mais l'entrée est retirée : le chargement suivant n'a plus rien à servir.
  await new Promise((resolve) => setImmediate(resolve));
  assert.strictEqual(
    store.has('/api/plan/content'),
    false,
    'l’entrée révoquée doit être retirée du cache',
  );
});

test('une réponse en erreur ne devient jamais la réponse hors ligne', async () => {
  // `putInCache` mémorisait toute réponse, 401 et 500 comprises : l'erreur d'un instant se
  // figeait pour la durée du cache.
  const source = renderServiceWorker({ ...BASE_OPTIONS, apiNetworkFirst: ['/api/zones'] });
  const { listeners, context } = loadServiceWorker(source);
  const store = cacheSandbox(context);

  for (const status of [401, 500]) {
    context.fetch = () => Promise.resolve({ ok: false, status, clone: () => ({ status }) });
    let responded;
    listeners.fetch({
      request: { method: 'GET', url: 'https://foretmap.test/api/zones' },
      respondWith: (promise) => {
        responded = promise;
      },
    });
    await responded;
    await new Promise((resolve) => setImmediate(resolve));
    assert.strictEqual(store.has('/api/zones'), false, `une ${status} ne doit pas être mémorisée`);
  }

  // Une réponse valide, elle, est bien mémorisée : la stratégie reste utile.
  const fresh = { ok: true, status: 200, clone: () => ({ body: 'ok' }) };
  context.fetch = () => Promise.resolve(fresh);
  let responded;
  listeners.fetch({
    request: { method: 'GET', url: 'https://foretmap.test/api/zones' },
    respondWith: (promise) => {
      responded = promise;
    },
  });
  await responded;
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(store.has('/api/zones'), 'une réponse valide doit rester mise en cache');
});

test('renderServiceWorker refuse une configuration incomplète', () => {
  assert.throws(() => renderServiceWorker({ ...BASE_OPTIONS, product: '' }), /product/);
  assert.throws(() => renderServiceWorker({ ...BASE_OPTIONS, cacheName: '' }), /cacheName/);
  assert.throws(() => renderServiceWorker({ ...BASE_OPTIONS, precache: null }), /precache/);
  assert.throws(() => renderServiceWorker({ ...BASE_OPTIONS, htmlEntries: [] }), /htmlEntries/);
});

test('renderWebManifest produit les champs attendus pour chaque produit du registre', () => {
  for (const id of Object.keys(PRODUCTS)) {
    const product = PRODUCTS[id];
    const manifest = renderWebManifest(product);
    assert.strictEqual(manifest.name, product.pwa.name, id);
    assert.strictEqual(manifest.short_name, product.pwa.shortName, id);
    assert.strictEqual(manifest.description, product.pwa.description, id);
    assert.strictEqual(manifest.theme_color, product.pwa.themeColor, id);
    assert.strictEqual(manifest.background_color, product.pwa.backgroundColor, id);
    assert.strictEqual(manifest.start_url, product.pwa.startUrl, id);
    assert.strictEqual(manifest.lang, 'fr', id);
    assert.strictEqual(manifest.display, 'standalone', id);
    assert.strictEqual(manifest.scope, '/', id);
    assert.ok(Array.isArray(manifest.icons) && manifest.icons.length > 0, id);
    const prefix = iconUrlPrefix(product);
    for (const icon of manifest.icons) {
      assert.ok(icon.src.startsWith(prefix), `${id} : ${icon.src} doit commencer par ${prefix}`);
      assert.match(icon.sizes, /^\d+x\d+$/);
      assert.strictEqual(icon.type, 'image/png');
    }
  }
  assert.strictEqual(iconUrlPrefix(PRODUCTS.foret), '/');
  assert.strictEqual(iconUrlPrefix(PRODUCTS.gl), '/gl/');
  assert.strictEqual(iconUrlPrefix(PRODUCTS.plan), '/plan/');
});

test('renderWebManifest : icônes explicites et champs extra sans écrasement', () => {
  const icons = [
    { src: '/plan/pwa-icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
  ];
  const manifest = renderWebManifest(PRODUCTS.plan, {
    icons,
    extra: { name: 'NE DOIT PAS ÉCRASER', shortcuts: [{ name: 'Carte', url: '/?view=map' }] },
  });
  assert.deepStrictEqual(manifest.icons, icons);
  assert.strictEqual(manifest.name, 'Plan Lyautey');
  assert.deepStrictEqual(manifest.shortcuts, [{ name: 'Carte', url: '/?view=map' }]);
  assert.throws(() => renderWebManifest(null), /produit/);
  assert.throws(() => renderWebManifest({ id: 'x' }), /produit/);
});

test('listProductIcons ne garde que les icônes présentes sur disque', () => {
  const present = new Set(['gl/favicon-32.png', 'gl/apple-touch-icon.png']);
  const icons = listProductIcons(PRODUCTS.gl, { exists: (rel) => present.has(rel) });
  assert.deepStrictEqual(
    icons.map((icon) => icon.src),
    ['/gl/apple-touch-icon.png', '/gl/favicon-32.png'],
  );
  assert.deepStrictEqual(listProductIcons(PRODUCTS.foret, { exists: () => false }), []);
});

// ── Délai d'attente du réseau (network-first HTML et API) ──────────────────────────────
//
// Modèle `networkTimeoutSeconds` de Workbox : passé le délai, la copie en cache part si elle
// existe ; sinon on continue d'attendre le réseau. Audit du 25/09/2026, § 1.4.6 et § 2.4.

/** Minuteries pilotées à la main : `fire()` déclenche celles qui sont en attente. */
function fakeTimers() {
  const pending = new Map();
  let next = 1;
  return {
    setTimeout(fn, ms) {
      const id = next;
      next += 1;
      pending.set(id, { fn, ms });
      return id;
    },
    clearTimeout(id) {
      pending.delete(id);
    },
    delays: () => [...pending.values()].map((t) => t.ms),
    fire() {
      const due = [...pending.entries()];
      pending.clear();
      for (const [, t] of due) t.fn();
    },
  };
}

/** Réponse réseau différée : `resolve(response)` / `reject(err)` à la main. */
function deferredFetch(context) {
  const control = {};
  context.fetch = () =>
    new Promise((resolve, reject) => {
      control.resolve = resolve;
      control.reject = reject;
    });
  return control;
}

const flushMicrotasks = () => new Promise((resolve) => setImmediate(resolve));

function dispatchFetch(listeners, url) {
  let responded;
  const waited = [];
  listeners.fetch({
    request: { method: 'GET', url },
    respondWith: (promise) => {
      responded = promise;
    },
    waitUntil: (promise) => waited.push(promise),
  });
  return { responded, waited };
}

test('délai réseau : passé 4 s, la copie en cache est servie (API network-first)', async () => {
  const timers = fakeTimers();
  const { listeners, context } = loadServiceWorker(renderServiceWorker(BASE_OPTIONS), { timers });
  const cached = { ok: true, status: 200, body: 'zones en cache' };
  const store = cacheSandbox(context, [['/api/zones', cached]]);
  const network = deferredFetch(context);

  const { responded, waited } = dispatchFetch(listeners, 'https://foretmap.test/api/zones');
  assert.deepStrictEqual(timers.delays(), [DEFAULT_NETWORK_TIMEOUT_SECONDS * 1000]);
  timers.fire(); // le réseau ne répond pas
  assert.deepStrictEqual(await responded, cached);

  // La réponse réseau arrivée en retard rafraîchit quand même le cache (waitUntil).
  const fresh = { ok: true, status: 200, clone: () => ({ body: 'zones fraîches' }) };
  network.resolve(fresh);
  await Promise.all(waited);
  await flushMicrotasks();
  assert.deepStrictEqual(store.get('/api/zones'), { body: 'zones fraîches' });
});

test('délai réseau : sans copie en cache, on continue d’attendre le réseau', async () => {
  const timers = fakeTimers();
  const { listeners, context } = loadServiceWorker(renderServiceWorker(BASE_OPTIONS), { timers });
  cacheSandbox(context);
  const network = deferredFetch(context);

  const { responded } = dispatchFetch(listeners, 'https://foretmap.test/api/tasks');
  timers.fire();
  let settled = false;
  responded.then(() => {
    settled = true;
  });
  await flushMicrotasks();
  assert.strictEqual(settled, false, 'rien en cache : la réponse attend le réseau');

  const late = { ok: true, status: 200, clone: () => ({ body: 'tâches' }) };
  network.resolve(late);
  assert.strictEqual(await responded, late);
});

test('délai réseau : un réseau rapide répond, la minuterie est annulée', async () => {
  const timers = fakeTimers();
  const { listeners, context } = loadServiceWorker(renderServiceWorker(BASE_OPTIONS), { timers });
  cacheSandbox(context, [['/', { ok: true, body: 'page en cache' }]]);
  const fresh = { ok: true, status: 200, clone: () => ({ body: 'page' }) };
  context.fetch = () => Promise.resolve(fresh);

  const { responded } = dispatchFetch(listeners, 'https://foretmap.test/');
  assert.strictEqual(await responded, fresh);
  assert.deepStrictEqual(timers.delays(), [], 'minuterie annulée');
});

test('délai réseau : la page HTML en cache part au bout du délai ; sinon la page hors ligne', async () => {
  const timers = fakeTimers();
  const { listeners, context } = loadServiceWorker(renderServiceWorker(BASE_OPTIONS), { timers });
  const store = cacheSandbox(context, [
    ['/', { ok: true, body: 'coquille en cache' }],
    ['/offline.html', { body: 'offline' }],
  ]);
  deferredFetch(context);
  const first = dispatchFetch(listeners, 'https://foretmap.test/');
  timers.fire();
  assert.deepStrictEqual(await first.responded, { ok: true, body: 'coquille en cache' });

  // Réseau coupé net, rien en cache pour cette entrée : repli sur la page hors ligne.
  store.delete('/index.html');
  context.fetch = () => Promise.reject(new Error('hors ligne'));
  const second = dispatchFetch(listeners, 'https://foretmap.test/index.html');
  assert.deepStrictEqual(await second.responded, { body: 'offline' });
});

test('délai réseau : les scripts non hachés n’ont pas de délai (jamais de version obsolète)', async () => {
  const timers = fakeTimers();
  const { listeners, context } = loadServiceWorker(renderServiceWorker(BASE_OPTIONS), { timers });
  cacheSandbox(context, [['/legacy.js', { ok: true, body: 'vieux script' }]]);
  const network = deferredFetch(context);
  const { responded } = dispatchFetch(listeners, 'https://foretmap.test/legacy.js');
  assert.deepStrictEqual(timers.delays(), [], 'aucune minuterie pour un script');
  const fresh = { ok: true, status: 200, clone: () => ({}) };
  network.resolve(fresh);
  assert.strictEqual(await responded, fresh);
});

test('délai réseau : réglable, désactivable (0) et validé', () => {
  assert.match(
    renderServiceWorker({ ...BASE_OPTIONS, networkTimeoutSeconds: 2.5 }),
    /const NETWORK_TIMEOUT_MS = 2500;/,
  );
  const timers = fakeTimers();
  const { listeners, context } = loadServiceWorker(
    renderServiceWorker({ ...BASE_OPTIONS, networkTimeoutSeconds: 0 }),
    { timers },
  );
  cacheSandbox(context);
  deferredFetch(context);
  dispatchFetch(listeners, 'https://foretmap.test/api/zones');
  assert.deepStrictEqual(timers.delays(), []);
  for (const bad of [-1, Number.NaN, '4', Infinity]) {
    assert.throws(
      () => renderServiceWorker({ ...BASE_OPTIONS, networkTimeoutSeconds: bad }),
      /networkTimeoutSeconds/,
    );
  }
});

test('SW du mode dev (public/sw.js) : même délai réseau que le gabarit', async () => {
  const source = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '..', 'public', 'sw.js'),
    'utf8',
  );
  assert.match(source, /const NETWORK_TIMEOUT_MS = 4000;/);
  const timers = fakeTimers();
  const { listeners, context } = loadServiceWorker(source, { timers });
  cacheSandbox(context, [['/api/zones', { ok: true, body: 'zones en cache' }]]);
  deferredFetch(context);
  const { responded } = dispatchFetch(listeners, 'https://foretmap.test/api/zones');
  assert.deepStrictEqual(timers.delays(), [4000]);
  timers.fire();
  assert.deepStrictEqual(await responded, { ok: true, body: 'zones en cache' });
});
