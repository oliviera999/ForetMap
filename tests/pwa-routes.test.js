'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const request = require('supertest');

const { PRODUCTS, getProduct } = require('../lib/products');
const { resolveProductFromRequest } = require('../lib/productResolver');
const {
  registerPwaRoutes,
  resolvePwaFile,
  SW_CACHE_CONTROL,
  MANIFEST_CACHE_CONTROL,
  MANIFEST_CONTENT_TYPE,
} = require('../lib/pwaRoutes');

/** Dossiers temporaires : `dist/` avec fichiers générés, `public/` avec les fichiers manuels. */
function makeDirs({ withGenerated = true } = {}) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'foretmap-pwa-routes-'));
  const distDir = path.join(base, 'dist');
  const publicDir = path.join(base, 'public');
  fs.mkdirSync(distDir, { recursive: true });
  fs.mkdirSync(path.join(publicDir, 'plan'), { recursive: true });
  fs.mkdirSync(path.join(publicDir, 'gl'), { recursive: true });
  fs.writeFileSync(path.join(publicDir, 'sw.js'), '// SW public foret\n');
  fs.writeFileSync(path.join(publicDir, 'manifest.json'), '{"name":"manifest public foret"}\n');
  fs.writeFileSync(path.join(publicDir, 'plan', 'pwa-icon-192.png'), 'x');
  if (withGenerated) {
    for (const id of Object.keys(PRODUCTS)) {
      const product = PRODUCTS[id];
      fs.writeFileSync(path.join(distDir, product.swFile), `// SW généré ${id}\n`);
      fs.writeFileSync(
        path.join(distDir, product.manifestFile),
        `{"name":"manifest généré ${id}"}\n`,
      );
    }
    fs.writeFileSync(path.join(distDir, 'sw.js'), '// SW généré foret (copie)\n');
    fs.writeFileSync(
      path.join(distDir, 'manifest.json'),
      '{"name":"manifest généré foret (copie)"}\n',
    );
  }
  return { distDir, publicDir };
}

function makeApp({ serveDist, distDir, staticRoot, logger }) {
  const app = express();
  registerPwaRoutes(app, {
    staticRoot,
    distDir,
    serveDist,
    resolveProductFromRequest,
    getProduct,
    logger,
  });
  return app;
}

function assertSwHeaders(res) {
  assert.strictEqual(res.headers['cache-control'], SW_CACHE_CONTROL);
  assert.strictEqual(res.headers['service-worker-allowed'], '/');
  assert.strictEqual(res.headers.pragma, 'no-cache');
}

test('registerPwaRoutes valide ses paramètres', () => {
  assert.throws(() => registerPwaRoutes(null, {}), /app requis/);
  assert.throws(() => registerPwaRoutes(express(), {}), /resolveProductFromRequest/);
});

test('production : /sw.js et /manifest.json servent le fichier généré du produit résolu', async () => {
  const { distDir } = makeDirs();
  const app = makeApp({ serveDist: true, distDir, staticRoot: distDir });

  for (const [header, id] of [
    [undefined, 'foret'],
    ['gl', 'gl'],
    ['plan', 'plan'],
  ]) {
    let swReq = request(app).get('/sw.js');
    let manifestReq = request(app).get('/manifest.json');
    if (header) {
      swReq = swReq.set('X-Foretmap-Product', header);
      manifestReq = manifestReq.set('X-Foretmap-Product', header);
    }
    const sw = await swReq;
    assert.strictEqual(sw.status, 200, id);
    assert.strictEqual(sw.text, `// SW généré ${id}\n`, id);
    assert.match(String(sw.headers['content-type']), /javascript/, id);
    assertSwHeaders(sw);

    const manifest = await manifestReq;
    assert.strictEqual(manifest.status, 200, id);
    assert.strictEqual(manifest.text, `{"name":"manifest généré ${id}"}\n`, id);
    assert.ok(String(manifest.headers['content-type']).startsWith(MANIFEST_CONTENT_TYPE), id);
    assert.strictEqual(manifest.headers['cache-control'], MANIFEST_CACHE_CONTROL, id);
  }
});

test('production : le host gl.* résout le produit GL sans header', async () => {
  const { distDir } = makeDirs();
  const app = makeApp({ serveDist: true, distDir, staticRoot: distDir });
  const res = await request(app).get('/sw.js').set('Host', 'gl.olution.info');
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.text, '// SW généré gl\n');
  const plan = await request(app).get('/manifest.json').set('Host', 'www.planlyautey.olution.info');
  assert.strictEqual(plan.text, '{"name":"manifest généré plan"}\n');
});

test('production sans fichiers générés : repli sur staticRoot pour foret seulement, 404 sinon', async () => {
  const { distDir, publicDir } = makeDirs({ withGenerated: false });
  // Simule un dist/ servi qui contient encore les copies manuelles (public/ copié par Vite).
  fs.writeFileSync(path.join(distDir, 'sw.js'), '// SW manuel copié\n');
  fs.writeFileSync(path.join(distDir, 'manifest.json'), '{"name":"manifest manuel copié"}\n');
  const warnings = [];
  const app = makeApp({
    serveDist: true,
    distDir,
    staticRoot: distDir,
    logger: { warn: (...args) => warnings.push(args) },
  });

  const sw = await request(app).get('/sw.js');
  assert.strictEqual(sw.status, 200);
  assert.strictEqual(sw.text, '// SW manuel copié\n');
  const manifest = await request(app).get('/manifest.json');
  assert.strictEqual(manifest.text, '{"name":"manifest manuel copié"}\n');

  const swGl = await request(app).get('/sw.js').set('X-Foretmap-Product', 'gl');
  assert.strictEqual(swGl.status, 404);
  assertSwHeaders(swGl);
  const manifestPlan = await request(app).get('/manifest.json').set('X-Foretmap-Product', 'plan');
  assert.strictEqual(manifestPlan.status, 404);
  assert.strictEqual(warnings.length, 2);
  assert.strictEqual(warnings[0][0].product, 'gl');
  assert.strictEqual(warnings[1][0].product, 'plan');
  assert.ok(fs.existsSync(publicDir));
});

test('hors production : public/sw.js et public/manifest.json pour foret', async () => {
  const { distDir, publicDir } = makeDirs();
  const app = makeApp({ serveDist: false, distDir, staticRoot: publicDir });
  const sw = await request(app).get('/sw.js');
  assert.strictEqual(sw.status, 200);
  assert.strictEqual(sw.text, '// SW public foret\n');
  assertSwHeaders(sw);
  const manifest = await request(app).get('/manifest.json');
  assert.strictEqual(manifest.status, 200);
  assert.strictEqual(manifest.text, '{"name":"manifest public foret"}\n');
  assert.ok(String(manifest.headers['content-type']).startsWith(MANIFEST_CONTENT_TYPE));
});

test('hors production : 404 pour le SW GL, manifest plan généré à la volée', async () => {
  const { distDir, publicDir } = makeDirs();
  const app = makeApp({ serveDist: false, distDir, staticRoot: publicDir });

  const swGl = await request(app).get('/sw.js').set('X-Foretmap-Product', 'gl');
  assert.strictEqual(swGl.status, 404);
  assertSwHeaders(swGl);
  const swPlan = await request(app).get('/sw.js').set('Host', 'planlyautey.local:5173');
  assert.strictEqual(swPlan.status, 404);

  const manifestPlan = await request(app).get('/manifest.json').set('X-Foretmap-Product', 'plan');
  assert.strictEqual(manifestPlan.status, 200);
  assert.ok(String(manifestPlan.headers['content-type']).startsWith(MANIFEST_CONTENT_TYPE));
  assert.strictEqual(manifestPlan.headers['cache-control'], MANIFEST_CACHE_CONTROL);
  const body = JSON.parse(manifestPlan.text);
  assert.strictEqual(body.name, 'Plan Lyautey');
  assert.strictEqual(body.short_name, 'Plan');
  assert.strictEqual(body.lang, 'fr');
  assert.deepStrictEqual(
    body.icons.map((icon) => icon.src),
    ['/plan/pwa-icon-192.png'],
  );

  const manifestGl = await request(app).get('/manifest.json').set('X-Foretmap-Product', 'gl');
  assert.strictEqual(manifestGl.status, 200);
  assert.strictEqual(JSON.parse(manifestGl.text).name, 'Gnomes & Licornes');
  assert.deepStrictEqual(JSON.parse(manifestGl.text).icons, []);
});

test('resolvePwaFile : matrice de décision', () => {
  const { distDir, publicDir } = makeDirs();
  const common = {
    distDir,
    staticRoot: publicDir,
    distFileName: 'sw-gl.js',
    staticFileName: 'sw.js',
  };
  assert.deepStrictEqual(resolvePwaFile({ ...common, product: PRODUCTS.gl, serveDist: true }), {
    kind: 'file',
    path: path.join(distDir, 'sw-gl.js'),
  });
  assert.deepStrictEqual(resolvePwaFile({ ...common, product: PRODUCTS.gl, serveDist: false }), {
    kind: 'generate',
  });
  assert.deepStrictEqual(
    resolvePwaFile({
      ...common,
      product: PRODUCTS.foret,
      serveDist: false,
      distFileName: 'sw-foret.js',
    }),
    { kind: 'file', path: path.join(publicDir, 'sw.js') },
  );
  assert.deepStrictEqual(
    resolvePwaFile({
      ...common,
      product: PRODUCTS.foret,
      serveDist: true,
      distFileName: 'absent.js',
      staticFileName: 'absent.js',
    }),
    { kind: 'none' },
  );
});
