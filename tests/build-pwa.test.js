'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { PRODUCTS } = require('../lib/products');
const {
  FORET_STATIC_ASSETS,
  collectEntryFiles,
  htmlEntriesForProduct,
  precacheHash,
  buildProductPwa,
  buildPwa,
} = require('../scripts/build-pwa');

/** Faux manifeste Rollup : trois entrées, un chunk partagé, un import dynamique à exclure. */
const FAKE_VITE_MANIFEST = Object.freeze({
  'index.vite.html': {
    file: 'assets/main-AAA.js',
    src: 'index.vite.html',
    isEntry: true,
    css: ['assets/main-AAA.css'],
    imports: ['_react-vendor-RRR.js', '_icons-III.js'],
    dynamicImports: ['src/components/Lazy.jsx'],
  },
  'gl.html': {
    file: 'assets/gl-GGG.js',
    src: 'gl.html',
    isEntry: true,
    css: ['assets/gl-GGG.css'],
    imports: ['_react-vendor-RRR.js'],
  },
  'plan.html': {
    file: 'assets/plan-PPP.js',
    src: 'plan.html',
    isEntry: true,
    css: ['assets/plan-PPP.css'],
    imports: ['_react-vendor-RRR.js'],
  },
  '_react-vendor-RRR.js': { file: 'assets/react-vendor-RRR.js', imports: ['_scheduler-SSS.js'] },
  '_scheduler-SSS.js': { file: 'assets/scheduler-SSS.js' },
  '_icons-III.js': { file: 'assets/icons-III.js', css: ['assets/icons-III.css'] },
  'src/components/Lazy.jsx': {
    file: 'assets/Lazy-LLL.js',
    isDynamicEntry: true,
    css: ['assets/Lazy-LLL.css'],
  },
});

function makeTempDirs() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'foretmap-build-pwa-'));
  const distDir = path.join(base, 'dist');
  const publicDir = path.join(base, 'public');
  fs.mkdirSync(path.join(distDir, '.vite'), { recursive: true });
  fs.mkdirSync(path.join(publicDir, 'gl'), { recursive: true });
  fs.mkdirSync(path.join(publicDir, 'plan'), { recursive: true });
  // Fichiers statiques « présents » : un sous-ensemble volontairement partiel.
  for (const rel of [
    'pwa-icon-192.png',
    'pwa-icon-512.png',
    'pwa-maskable-512.png',
    'icon.svg',
    'favicon.ico',
    'offline.html',
    'gl/favicon.svg',
    'gl/logo.png',
    'gl/favicon-32.png',
    'gl/apple-touch-icon.png',
    'plan/favicon.svg',
    'plan/pwa-icon-192.png',
    'plan/pwa-icon-512.png',
    'plan/pwa-maskable-512.png',
  ]) {
    fs.writeFileSync(path.join(publicDir, rel), 'x');
  }
  fs.writeFileSync(
    path.join(publicDir, 'manifest.json'),
    JSON.stringify({
      name: 'ANCIEN NOM',
      shortcuts: [{ name: 'Carte', url: '/?view=map' }],
      screenshots: [{ src: '/pwa-screenshot-wide.png', sizes: '1280x720', type: 'image/png' }],
      categories: ['education'],
    }),
  );
  return { base, distDir, publicDir };
}

test('FORET_STATIC_ASSETS reste aligné sur STATIC_ASSETS de public/sw.js', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'sw.js'), 'utf8');
  const start = source.indexOf('const STATIC_ASSETS = [');
  const block = source.slice(start, source.indexOf('];', start));
  const listed = [...block.matchAll(/'([^']+)'/g)].map((m) => m[1]);
  assert.deepStrictEqual([...FORET_STATIC_ASSETS], listed);
});

test('collectEntryFiles suit les imports statiques (récursifs) et ignore les chunks dynamiques', () => {
  const files = collectEntryFiles(FAKE_VITE_MANIFEST, 'index.vite.html');
  assert.deepStrictEqual(files, [
    '/assets/main-AAA.js',
    '/assets/main-AAA.css',
    '/assets/react-vendor-RRR.js',
    '/assets/scheduler-SSS.js',
    '/assets/icons-III.js',
    '/assets/icons-III.css',
  ]);
  assert.ok(!files.includes('/assets/Lazy-LLL.js'));
  assert.deepStrictEqual(collectEntryFiles(FAKE_VITE_MANIFEST, 'absent.html'), []);
  assert.deepStrictEqual(collectEntryFiles(null, 'gl.html'), []);
});

test('htmlEntriesForProduct : ForetMap garde /index.html, les autres produits non', () => {
  assert.deepStrictEqual(htmlEntriesForProduct(PRODUCTS.foret), [
    '/',
    '/index.html',
    '/index.vite.html',
  ]);
  assert.deepStrictEqual(htmlEntriesForProduct(PRODUCTS.gl), ['/', '/gl.html']);
  assert.deepStrictEqual(htmlEntriesForProduct(PRODUCTS.plan), ['/', '/plan.html']);
});

test('precacheHash : stable, 8 hexadécimaux, sensible au contenu et au produit', () => {
  const a = precacheHash('foret', ['/a', '/b']);
  assert.match(a, /^[0-9a-f]{8}$/);
  assert.strictEqual(a, precacheHash('foret', ['/a', '/b']));
  assert.notStrictEqual(a, precacheHash('foret', ['/a', '/c']));
  assert.notStrictEqual(a, precacheHash('gl', ['/a', '/b']));
});

test('precacheHash : la politique d’API entre dans le nom du cache (S8)', () => {
  // Sans cela, retirer une route de l'allowlist ne changeait pas le nom du cache tant qu'aucun
  // bundle ne bougeait : la politique changeait, les réponses déjà mémorisées restaient sur
  // l'appareil. `activate` ne purge que les caches dont le nom diffère — une purge qui dépend
  // d'un changement sans rapport n'est pas une purge.
  const precache = ['/', '/assets/main.js'];
  const avec = precacheHash('plan', precache, {
    apiStaleWhileRevalidate: ['/api/plan/content'],
    apiNetworkFirst: [],
  });
  const sans = precacheHash('plan', precache, {
    apiStaleWhileRevalidate: [],
    apiNetworkFirst: [],
  });
  assert.match(avec, /^[0-9a-f]{8}$/);
  assert.notStrictEqual(avec, sans, 'changer l’allowlist doit changer le nom du cache');

  // La stratégie compte autant que la liste : déplacer une route de SWR vers network-first
  // change ce qui est servi hors ligne.
  const versNetworkFirst = precacheHash('plan', precache, {
    apiStaleWhileRevalidate: [],
    apiNetworkFirst: ['/api/plan/content'],
  });
  assert.notStrictEqual(avec, versNetworkFirst);
  assert.notStrictEqual(sans, versNetworkFirst);

  // Et le hash reste stable à politique égale (sinon chaque build purgerait tout le monde).
  assert.strictEqual(
    avec,
    precacheHash('plan', precache, {
      apiStaleWhileRevalidate: ['/api/plan/content'],
      apiNetworkFirst: [],
    }),
  );
});

test('buildProductPwa : seuls les bundles de la bonne entrée sont précachés', () => {
  const exists = () => true;
  const gl = buildProductPwa(PRODUCTS.gl, { viteManifest: FAKE_VITE_MANIFEST, exists });
  assert.ok(gl.precache.includes('/assets/gl-GGG.js'));
  assert.ok(gl.precache.includes('/assets/gl-GGG.css'));
  assert.ok(gl.precache.includes('/assets/react-vendor-RRR.js'));
  assert.ok(!gl.precache.includes('/assets/main-AAA.js'));
  assert.ok(!gl.precache.includes('/assets/plan-PPP.js'));
  assert.ok(!gl.precache.includes('/assets/icons-III.js'));
  assert.ok(gl.precache.includes('/gl.html') && gl.precache.includes('/gl/favicon.svg'));
  assert.ok(gl.precache.includes('/gl/logo.png') && gl.precache.includes('/offline.html'));
  assert.match(gl.cacheName, /^foretmap-gl-[0-9a-f]{8}$/);
  assert.ok(gl.serviceWorker.includes(gl.cacheName));

  const plan = buildProductPwa(PRODUCTS.plan, { viteManifest: FAKE_VITE_MANIFEST, exists });
  assert.ok(plan.precache.includes('/plan.html') && plan.precache.includes('/assets/plan-PPP.js'));
  assert.ok(plan.precache.includes('/plan/pwa-icon-192.png'));
  assert.ok(!plan.precache.includes('/assets/gl-GGG.js'));
  assert.notStrictEqual(plan.cacheName, gl.cacheName);

  const foret = buildProductPwa(PRODUCTS.foret, { viteManifest: FAKE_VITE_MANIFEST, exists });
  for (const url of FORET_STATIC_ASSETS) assert.ok(foret.precache.includes(url), url);
  assert.ok(foret.precache.includes('/assets/icons-III.css'));
  assert.ok(!foret.precache.includes('/assets/Lazy-LLL.js'));
  assert.ok(foret.serviceWorker.includes('"/api/visit/content"'));
  assert.ok(foret.serviceWorker.includes('"/api/zones"'));
});

test('buildPwa écrit les SW et manifests de tous les produits + copies sw.js/manifest.json', () => {
  const { distDir, publicDir } = makeTempDirs();
  fs.writeFileSync(
    path.join(distDir, '.vite', 'manifest.json'),
    JSON.stringify(FAKE_VITE_MANIFEST),
  );
  const logs = [];
  const { written, builds } = buildPwa({ distDir, publicDir, log: (m) => logs.push(m) });
  const names = written.map((file) => path.basename(file)).sort();
  assert.deepStrictEqual(names, [
    'manifest-foret.webmanifest',
    'manifest-gl.webmanifest',
    'manifest-plan.webmanifest',
    'manifest-staff.webmanifest',
    'manifest.json',
    'sw-foret.js',
    'sw-gl.js',
    'sw-plan.js',
    'sw-staff.js',
    'sw.js',
  ]);
  for (const name of names) assert.ok(fs.existsSync(path.join(distDir, name)), name);

  // Le plan des personnels précache sa coquille mais **aucune** API : sa charge contient des
  // lieux internes et des consignes filtrées par rôle, qu'un service worker garderait sur
  // l'appareil après un changement de rôle ou un prêt de téléphone.
  const staffSw = fs.readFileSync(path.join(distDir, 'sw-staff.js'), 'utf8');
  assert.ok(!staffSw.includes('/api/staff-plan/content'));
  assert.ok(!staffSw.includes('/api/plan/content'));
  assert.ok(builds.staff.precache.includes('/staff.html'));

  // Copies ForetMap identiques aux fichiers nommés.
  assert.strictEqual(
    fs.readFileSync(path.join(distDir, 'sw.js'), 'utf8'),
    fs.readFileSync(path.join(distDir, 'sw-foret.js'), 'utf8'),
  );
  assert.strictEqual(
    fs.readFileSync(path.join(distDir, 'manifest.json'), 'utf8'),
    fs.readFileSync(path.join(distDir, 'manifest-foret.webmanifest'), 'utf8'),
  );

  // Manifest ForetMap : nom du registre, extras (raccourcis/captures) de public/manifest.json.
  const foretManifest = JSON.parse(fs.readFileSync(path.join(distDir, 'manifest.json'), 'utf8'));
  assert.strictEqual(foretManifest.name, PRODUCTS.foret.pwa.name);
  assert.deepStrictEqual(foretManifest.shortcuts, [{ name: 'Carte', url: '/?view=map' }]);
  assert.ok(Array.isArray(foretManifest.screenshots));
  assert.deepStrictEqual(foretManifest.categories, ['education']);
  assert.deepStrictEqual(
    foretManifest.icons.map((icon) => icon.src),
    ['/pwa-icon-192.png', '/pwa-icon-512.png', '/pwa-maskable-512.png'],
  );

  // Manifest GL : icônes limitées aux fichiers présents, pas d'extras ForetMap.
  const glManifest = JSON.parse(
    fs.readFileSync(path.join(distDir, 'manifest-gl.webmanifest'), 'utf8'),
  );
  assert.strictEqual(glManifest.name, 'Gnomes & Licornes');
  assert.deepStrictEqual(
    glManifest.icons.map((icon) => icon.src),
    ['/gl/apple-touch-icon.png', '/gl/favicon-32.png'],
  );
  assert.strictEqual(glManifest.shortcuts, undefined);

  // SW GL : bundles GL seulement ; SW plan : bundles plan seulement ; icônes plan absentes filtrées.
  const swGl = fs.readFileSync(path.join(distDir, 'sw-gl.js'), 'utf8');
  assert.ok(swGl.includes('"/assets/gl-GGG.js"') && !swGl.includes('"/assets/main-AAA.js"'));
  const swPlan = fs.readFileSync(path.join(distDir, 'sw-plan.js'), 'utf8');
  assert.ok(swPlan.includes('"/assets/plan-PPP.js"') && !swPlan.includes('"/assets/gl-GGG.js"'));
  assert.ok(swPlan.includes('"/plan/favicon.svg"'));
  assert.ok(!swPlan.includes('"/plan/favicon-16.png"'), 'icône absente du disque : non précachée');
  assert.ok(builds.plan.precache.includes('/plan/pwa-icon-512.png'));
  assert.ok(logs.some((m) => m.includes('[build-pwa] plan')));
});

test('buildPwa échoue proprement sans manifeste Vite', () => {
  const { distDir, publicDir } = makeTempDirs();
  assert.throws(() => buildPwa({ distDir, publicDir }), /manifeste Vite introuvable/);
});
