'use strict';

require('./helpers/setup');

/**
 * Audit ForetMap du 19/11/2026, lot 1 — S6 et S7.
 *
 * S6 : le fallback SPA répondait `200 text/html` pour un fichier absent sous `/assets`,
 * `/uploads`, `/tutos`, `/fonts`, `/gl/intro`. Décision : 404 franc pour un chemin avec
 * extension sous ces préfixes ; les routes SPA sans extension gardent l'index.
 *
 * S7 : l'en-tête `X-Foretmap-Product` choisissait encore, en production, le HTML, le manifest,
 * `/sw.js` et le favicon. Il n'est plus lu qu'hors production (et dans le harnais e2e).
 */
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const express = require('express');
const request = require('supertest');

const {
  registerSpaFallbackRoutes,
  createSpaFallbackHandler,
  isMissingStaticFilePath,
} = require('../lib/spaFallback');
const { resolveProductFromRequest } = require('../lib/productResolver');
const { app } = require('../server');

function miniSpaApp() {
  const mini = express();
  registerSpaFallbackRoutes(
    mini,
    createSpaFallbackHandler({
      serveDist: false,
      distSpaIndex: '',
      distGlIndex: '',
      deployHelpPath: path.join(__dirname, '..', 'public', 'deploy-help.html'),
      resolveProductFromRequest,
      logger: { error: () => {} },
    }),
  );
  return mini;
}

/** Contenu comparable d'une réponse supertest (texte, binaire ou JSON). */
function payload(res) {
  if (typeof res.text === 'string') return res.text;
  if (Buffer.isBuffer(res.body)) return res.body.toString('base64');
  return JSON.stringify(res.body);
}

/** Exécute `fn` comme en production (hors harnais e2e), puis restaure l'environnement. */
async function asProduction(fn) {
  const saved = {
    NODE_ENV: process.env.NODE_ENV,
    E2E_DISABLE_RATE_LIMIT: process.env.E2E_DISABLE_RATE_LIMIT,
  };
  process.env.NODE_ENV = 'production';
  delete process.env.E2E_DISABLE_RATE_LIMIT;
  try {
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

test('S6 — fichier absent sous un préfixe statique : 404, pas l’index HTML', async () => {
  const mini = miniSpaApp();
  for (const p of [
    '/assets/index-disparu.js',
    '/assets/style-ancien.css',
    '/uploads/zones/photo-supprimee.jpg',
    '/tutos/fiche-absente.html',
    '/fonts/police-absente.woff2',
    '/gl/intro/assets/img/scene-absente.png',
  ]) {
    const res = await request(mini).get(p);
    assert.strictEqual(res.status, 404, `${p} → 404`);
    assert.doesNotMatch(
      String(res.headers['content-type'] || ''),
      /html/i,
      `${p} n’est pas du HTML`,
    );
    assert.strictEqual(res.headers['cache-control'], 'no-store');
  }
});

test('S6 — les routes SPA sans extension gardent l’index', async () => {
  const mini = miniSpaApp();
  for (const p of ['/', '/taches', '/gl/intro', '/assets', '/carte/foret', '/plan.v2']) {
    const res = await request(mini).get(p);
    assert.strictEqual(res.status, 200, `${p} → 200`);
    assert.match(String(res.headers['content-type'] || ''), /html/i);
  }
});

test('S6 — isMissingStaticFilePath', () => {
  assert.strictEqual(isMissingStaticFilePath('/assets/a.js'), true);
  assert.strictEqual(isMissingStaticFilePath('/uploads/a/b/c.webp'), true);
  assert.strictEqual(isMissingStaticFilePath('/assets/dossier'), false);
  assert.strictEqual(isMissingStaticFilePath('/assetsx/a.js'), false);
  assert.strictEqual(isMissingStaticFilePath('/zones/a.js'), false);
  assert.strictEqual(isMissingStaticFilePath('/uploads/dossier.v2/fichier'), false);
});

test('S6 — câblage server.js : chunk absent sous /assets → 404', async () => {
  const res = await request(app).get('/assets/chunk-disparu-apres-deploiement.js');
  assert.strictEqual(res.status, 404);
  assert.doesNotMatch(String(res.headers['content-type'] || ''), /html/i);
});

test('S7 — en production, X-Foretmap-Product est ignoré par le résolveur', async () => {
  const req = (override) => ({
    hostname: 'foretmap.olution.info',
    get: (name) => (String(name).toLowerCase() === 'x-foretmap-product' ? override : undefined),
  });
  assert.strictEqual(resolveProductFromRequest(req('gl')), 'gl', 'hors production : honoré');
  await asProduction(() => {
    assert.strictEqual(resolveProductFromRequest(req('gl')), 'foret');
    assert.strictEqual(resolveProductFromRequest(req('plan')), 'foret');
  });
});

test('S7 — en production, manifest, /sw.js, favicon et HTML ne suivent pas l’en-tête', async () => {
  for (const p of ['/manifest.json', '/sw.js', '/favicon.ico', '/', '/une-route-spa']) {
    await asProduction(async () => {
      const plain = await request(app).get(p);
      const forced = await request(app).get(p).set('X-Foretmap-Product', 'gl');
      assert.strictEqual(forced.status, plain.status, `${p} : même statut`);
      assert.strictEqual(
        forced.headers['content-type'],
        plain.headers['content-type'],
        `${p} : même type`,
      );
      assert.strictEqual(payload(forced), payload(plain), `${p} : même contenu`);
      assert.doesNotMatch(String(forced.headers.vary || ''), /x-foretmap-product/i);
    });
  }
});

test('S7 — hors production, la réponse dépendant de l’en-tête porte Vary', async () => {
  const res = await request(app).get('/manifest.json').set('X-Foretmap-Product', 'gl');
  assert.match(String(res.headers.vary || ''), /x-foretmap-product/i);
});
