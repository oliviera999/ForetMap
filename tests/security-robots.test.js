'use strict';

/**
 * Référencement par produit — filet du lot J de `docs/AUDIT_SECURITE_2026-09-22.md`
 * (constat **S9**).
 *
 * Ce qui est vérifié, et pourquoi :
 * - les surfaces gardées (`plan`, `staff`) interdisent tout parcours **et** portent
 *   `X-Robots-Tag: noindex` sur leurs réponses — les deux, parce qu'un `robots.txt` interdit
 *   le parcours mais ne retire pas de l'index une adresse reçue par ailleurs ;
 * - l'en-tête couvre aussi les réponses d'**API** et pas seulement le HTML : c'est souvent une
 *   réponse JSON qu'un agrégateur archive ;
 * - la surface publique n'est pas dé-référencée au passage — ForêtMap doit rester trouvable,
 *   sans quoi le correctif serait une régression produit.
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { app } = require('../server');
const { PRODUCT_IDS, getProduct } = require('../lib/products');

/** Requête sur un produit donné (l'en-tête tient lieu de host hors production). */
function onProduct(req, productId) {
  return req.set('X-Foretmap-Product', productId);
}

test('robots.txt : les surfaces gardées interdisent tout parcours', async () => {
  for (const productId of ['plan', 'staff']) {
    const res = await onProduct(request(app).get('/robots.txt'), productId).expect(200);
    assert.match(res.headers['content-type'] || '', /text\/plain/);
    assert.match(res.text, /^User-agent: \*$/m, `${productId} : directive d’agent attendue`);
    assert.match(res.text, /^Disallow: \/$/m, `${productId} : le parcours doit être interdit`);
  }
});

test('robots.txt : la surface publique reste référençable, API et médias exclus', async () => {
  const res = await onProduct(request(app).get('/robots.txt'), 'foret').expect(200);
  assert.doesNotMatch(res.text, /^Disallow: \/$/m, 'ForêtMap doit rester trouvable');
  assert.match(res.text, /^Disallow: \/api\/$/m);
  assert.match(res.text, /^Disallow: \/uploads\/$/m);
});

test('X-Robots-Tag : posé sur les surfaces gardées, absent ailleurs', async () => {
  for (const productId of PRODUCT_IDS) {
    const indexable = getProduct(productId).indexable !== false;
    const res = await onProduct(request(app).get('/robots.txt'), productId).expect(200);
    const header = String(res.headers['x-robots-tag'] || '');
    if (indexable) {
      assert.equal(header, '', `${productId} est référençable : aucun en-tête attendu`);
    } else {
      assert.match(header, /noindex/, `${productId} doit porter noindex`);
      assert.match(header, /nofollow/, `${productId} doit porter nofollow`);
    }
  }
});

test('X-Robots-Tag : l’en-tête couvre aussi les réponses d’API', async () => {
  // Une réponse JSON s'archive comme une page. L'en-tête est posé avant tout ce qui répond,
  // il doit donc valoir pour l'API comme pour le HTML — y compris sur un refus.
  const refus = await onProduct(request(app).get('/api/plan/content'), 'plan');
  assert.match(String(refus.headers['x-robots-tag'] || ''), /noindex/);

  const publique = await onProduct(request(app).get('/api/version'), 'foret');
  assert.equal(String(publique.headers['x-robots-tag'] || ''), '');
});
