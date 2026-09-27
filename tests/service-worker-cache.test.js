'use strict';

// Service worker : `public/sw.js` reste la source de développement ForetMap (écrite à la main) ;
// `dist/sw.js` est GÉNÉRÉ au build par `scripts/build-pwa.js` depuis le gabarit commun
// `src/shared/pwa/swTemplate.js` (lot 1). Les deux doivent garder la même politique de cache
// sur la lecture « visite » : `/api/maps` et `/api/visit/content` en stale-while-revalidate,
// jamais la progression liée au compte.

require('./helpers/setup');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildProductPwa } = require('../scripts/build-pwa');
const { PRODUCTS } = require('../lib/products');

function readServiceWorker(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

/**
 * `dist/sw.js` tel que `scripts/build-pwa.js` l'écrit, généré en mémoire : `dist/` n'est plus
 * versionné (build livré par la CI, docs/DEPLOY_DIST_ARTIFACT.md), le test ne peut donc plus
 * le lire sur le disque. Même fonction, même gabarit ; seul le manifeste Vite est factice.
 */
function generatedForetServiceWorker() {
  const viteManifest = {
    'index.vite.html': { file: 'assets/main-AbCd1234.js', isEntry: true, css: [] },
  };
  return buildProductPwa(PRODUCTS.foret, { viteManifest, exists: () => true }).serviceWorker;
}

/** Matcher historique de `public/sw.js` (fonction écrite à la main). */
function extractVisitReadMatcher(source) {
  const match = /function isVisitReadApiPath\(pathname\) \{[\s\S]*?\n\}/.exec(source);
  assert.ok(match, 'matcher isVisitReadApiPath introuvable');
  return match[0];
}

/** Liste `API_STALE_WHILE_REVALIDATE` du service worker généré par le gabarit. */
function extractStaleWhileRevalidateList(source) {
  const match = /const API_STALE_WHILE_REVALIDATE = (\[[\s\S]*?\]);/.exec(source);
  assert.ok(match, 'liste API_STALE_WHILE_REVALIDATE introuvable');
  return match[1];
}

describe('Service Worker cache visite', () => {
  it('public/sw.js ne met pas en cache la progression liée au compte', () => {
    const matcher = extractVisitReadMatcher(readServiceWorker('public/sw.js'));
    assert.ok(matcher.includes('/api/maps'));
    assert.ok(matcher.includes('/api/visit/content'));
    assert.ok(!matcher.includes('/api/visit/progress'));
  });

  it('le service worker généré ne met pas en cache la progression liée au compte', () => {
    const source = generatedForetServiceWorker();
    assert.match(source, /GÉNÉRÉ par scripts\/build-pwa\.js/, 'le SW doit venir du gabarit');
    const list = extractStaleWhileRevalidateList(source);
    assert.ok(list.includes('/api/maps'));
    assert.ok(list.includes('/api/visit/content'));
    assert.ok(!list.includes('/api/visit/progress'));
  });

  it('le service worker généré est celui du produit ForetMap, au nom de cache versionné', () => {
    const distSw = generatedForetServiceWorker();
    assert.match(distSw, /Service worker « foret »/);
    const distVersion = /const CACHE_NAME = "([^"]+)"/.exec(distSw)?.[1];
    assert.ok(distVersion, 'CACHE_NAME absent du service worker généré');
    // Préfixe produit + empreinte du build : un nouveau build purge l'ancien cache.
    assert.match(distVersion, /^foretmap-foret-[0-9a-f]{8}$/);
    const publicVersion = /const CACHE_NAME = '([^']+)'/.exec(
      readServiceWorker('public/sw.js'),
    )?.[1];
    assert.ok(publicVersion, 'CACHE_NAME absent de public/sw.js');
  });
});
