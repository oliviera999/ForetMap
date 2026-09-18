'use strict';

// Registre des produits (lot 1) : résolution par host, fallback SPA par entrée HTML, en-têtes
// `no-store`, favicon et garde d'entrée croisée — sans base de données.

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const request = require('supertest');

const products = require('../lib/products');
const { resolveProductFromRequest, normalizeProductOverride } = require('../lib/productResolver');
const { resolveSpaIndexPath } = require('../lib/spaFallback');
const { createDistStaticServeOptions } = require('../lib/staticCacheHeaders');

function fakeReq({ hostname = '', override = '' } = {}) {
  return {
    hostname,
    get: (key) => {
      const k = String(key).toLowerCase();
      if (k === 'host') return hostname;
      if (k === 'x-foretmap-product') return override;
      return '';
    },
  };
}

test('le registre déclare foret, gl, plan et staff avec leurs entrées HTML', () => {
  assert.deepStrictEqual(products.PRODUCT_IDS, ['foret', 'gl', 'plan', 'staff']);
  assert.strictEqual(products.getProduct('gl').htmlEntry, 'gl.html');
  assert.strictEqual(products.getProduct('plan').htmlEntry, 'plan.html');
  assert.strictEqual(products.getProduct('staff').htmlEntry, 'staff.html');
  assert.strictEqual(products.getProduct('inconnu').id, 'foret');
  assert.strictEqual(products.getProduct('plan').shareFaviconWith, undefined);
  assert.strictEqual(products.getProduct('plan').pwa.themeColor, '#183058');
  // Le plan des personnels réutilise le dossier d'icônes du plan public (même établissement,
  // aucun binaire dupliqué) mais garde sa propre teinte et son propre manifest.
  assert.strictEqual(products.getProduct('staff').assetsDir, 'plan');
  assert.notStrictEqual(
    products.getProduct('staff').pwa.themeColor,
    products.getProduct('plan').pwa.themeColor,
  );
  assert.strictEqual(products.getProduct('staff').manifestFile, 'manifest-staff.webmanifest');
  assert.deepStrictEqual(products.listHtmlEntryBasenames(), [
    'index.vite.html',
    'gl.html',
    'plan.html',
    'staff.html',
  ]);
});

test('résolution par host : proflyautey est distinct de planlyautey', () => {
  assert.strictEqual(products.resolveProductIdFromHost('proflyautey.olution.info'), 'staff');
  assert.strictEqual(products.resolveProductIdFromHost('planlyautey.olution.info'), 'plan');
  assert.strictEqual(
    resolveProductFromRequest(fakeReq({ hostname: 'www.proflyautey.olution.info:3000' })),
    'staff',
  );
  // Le code d'accès du plan des personnels est un secret court : il doit tomber sous le
  // limiteur strict au même titre qu'un mot de passe.
  assert.ok(products.listAuthRateLimitPaths().includes('/api/staff-plan/access'));
});

test('résolution par host : stafflyautey est un alias de proflyautey (même produit)', () => {
  assert.strictEqual(products.resolveProductIdFromHost('stafflyautey.olution.info'), 'staff');
  assert.strictEqual(
    resolveProductFromRequest(fakeReq({ hostname: 'www.stafflyautey.olution.info:3000' })),
    'staff',
  );
  // Les deux adresses mènent au même produit : mêmes entrée HTML, API, PWA et icônes.
  assert.deepStrictEqual(
    [...products.getProduct('staff').hostPrefixes],
    ['proflyautey.', 'stafflyautey.'],
  );
  // L'alias ne doit pas déborder sur le plan public ni sur ForetMap.
  assert.strictEqual(products.resolveProductIdFromHost('planlyautey.olution.info'), 'plan');
  assert.strictEqual(products.resolveProductIdFromHost('staff.olution.info'), 'foret');
});

test('résolution par host : préfixes du registre, www. retiré, défaut foret', () => {
  assert.strictEqual(products.resolveProductIdFromHost('planlyautey.olution.info'), 'plan');
  assert.strictEqual(products.resolveProductIdFromHost('gl.olution.info'), 'gl');
  assert.strictEqual(products.resolveProductIdFromHost('foretmap.olution.info'), 'foret');
  assert.strictEqual(
    resolveProductFromRequest(fakeReq({ hostname: 'www.planlyautey.olution.info:3000' })),
    'plan',
  );
  assert.strictEqual(resolveProductFromRequest(fakeReq({ hostname: 'localhost' })), 'foret');
});

test('surcharge X-Foretmap-Product : tout produit du registre, rien d’autre', () => {
  assert.strictEqual(normalizeProductOverride('PLAN'), 'plan');
  assert.strictEqual(normalizeProductOverride('gl'), 'gl');
  assert.strictEqual(normalizeProductOverride('autre'), null);
  assert.strictEqual(
    resolveProductFromRequest(fakeReq({ hostname: 'gl.olution.info', override: 'plan' })),
    'plan',
  );
});

test('chemins d’authentification : tous produits, sans doublon, plan sans auth', () => {
  const paths = products.listAuthRateLimitPaths();
  assert.ok(paths.includes('/api/auth/login'));
  assert.ok(paths.includes('/api/gl/auth/login'));
  assert.strictEqual(new Set(paths).size, paths.length);
  assert.deepStrictEqual([...products.getProduct('plan').authRateLimitPaths], []);
});

test('fallback SPA en production : entrée du produit si présente, sinon index ForetMap', () => {
  const distDir = fs.mkdtempSync(path.join(os.tmpdir(), 'foretmap-dist-'));
  const distSpaIndex = path.join(distDir, 'index.vite.html');
  const distGlIndex = path.join(distDir, 'gl.html');
  const distPlanIndex = path.join(distDir, 'plan.html');
  fs.writeFileSync(distSpaIndex, '<!doctype html>foret');
  fs.writeFileSync(distGlIndex, '<!doctype html>gl');
  const options = {
    serveDist: true,
    distSpaIndex,
    distIndexByProduct: { gl: distGlIndex, plan: distPlanIndex },
    deployHelpPath: '/inexistant/deploy-help.html',
    resolveProductFromRequest,
  };
  try {
    assert.strictEqual(
      resolveSpaIndexPath(fakeReq({ hostname: 'gl.olution.info' }), options),
      distGlIndex,
    );
    // plan.html absent du build : repli silencieux sur ForetMap (comme gl.html avant).
    assert.strictEqual(
      resolveSpaIndexPath(fakeReq({ hostname: 'planlyautey.olution.info' }), options),
      distSpaIndex,
    );
    fs.writeFileSync(distPlanIndex, '<!doctype html>plan');
    assert.strictEqual(
      resolveSpaIndexPath(fakeReq({ hostname: 'planlyautey.olution.info' }), options),
      distPlanIndex,
    );
    // Compatibilité : l'ancienne option `distGlIndex` reste comprise.
    assert.strictEqual(
      resolveSpaIndexPath(fakeReq({ hostname: 'gl.olution.info' }), {
        ...options,
        distIndexByProduct: undefined,
        distGlIndex,
      }),
      distGlIndex,
    );
    assert.strictEqual(
      resolveSpaIndexPath(fakeReq({ hostname: 'gl.olution.info' }), {
        ...options,
        serveDist: false,
      }),
      '/inexistant/deploy-help.html',
    );
  } finally {
    fs.rmSync(distDir, { recursive: true, force: true });
  }
});

test('en-têtes statiques : chaque entrée HTML du registre est servie en no-store', () => {
  const distDir = path.join(os.tmpdir(), 'foretmap-dist-headers');
  const options = createDistStaticServeOptions(distDir);
  for (const entry of ['index.vite.html', 'gl.html', 'plan.html']) {
    const headers = {};
    options.setHeaders({ setHeader: (k, v) => (headers[k] = v) }, path.join(distDir, entry));
    assert.match(String(headers['Cache-Control']), /no-store/, entry);
  }
  const headers = {};
  options.setHeaders(
    { setHeader: (k, v) => (headers[k] = v) },
    path.join(distDir, 'assets', 'main-abc123.js'),
  );
  assert.match(String(headers['Cache-Control']), /immutable/);
});

test('serveur : garde d’entrée croisée et favicon par produit', async () => {
  const { app } = require('../server');
  // /gl.html demandé sur le host plan → redirigé vers la racine.
  const crossed = await request(app).get('/gl.html').set('X-Foretmap-Product', 'plan');
  assert.strictEqual(crossed.status, 302);
  assert.strictEqual(crossed.headers.location, '/');
  const crossedForet = await request(app).get('/plan.html').set('X-Foretmap-Product', 'foret');
  assert.strictEqual(crossedForet.status, 302);
  // Sur son propre host, l'entrée n'est pas redirigée (elle est servie ou 404 selon le build).
  const own = await request(app).get('/gl.html').set('X-Foretmap-Product', 'gl');
  assert.notStrictEqual(own.status, 302);
  // Favicon : le produit plan a sa propre icône (charte Lyautey) sous public/plan/.
  const favicon = await request(app).get('/favicon.ico').set('X-Foretmap-Product', 'plan');
  assert.ok([200, 204].includes(favicon.status));
  if (favicon.status === 200) {
    assert.match(String(favicon.headers['content-type'] || ''), /image/i);
  }
});
