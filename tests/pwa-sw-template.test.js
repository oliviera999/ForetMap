'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const vm = require('node:vm');

const { PRODUCTS } = require('../lib/products');
const {
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
function loadServiceWorker(source) {
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
  assert.match(source, /function networkFirst\(request, fallback\)/);
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
