'use strict';

/**
 * Référencement par produit — lot J de `docs/AUDIT_SECURITE_2026-09-22.md` (constat **S9**).
 *
 * Le constat : le dépôt ne servait **aucun** `robots.txt`, et aucune réponse ne portait
 * `X-Robots-Tag` (à l'exception de `/api/staff-plan/content`). Rien n'empêchait donc un
 * moteur d'indexer `planlyautey.*` — dont l'écran d'accueil, le manifest PWA et les libellés
 * décrivent le plan d'un établissement scolaire — ni d'en publier l'adresse. Le code d'accès
 * du plan protège les **données** ; il ne protège pas l'existence de la surface, et une
 * adresse indexée est une adresse qu'on n'a plus besoin de deviner.
 *
 * Deux garde-fous, parce qu'ils n'échouent pas ensemble :
 *   - `GET /robots.txt`, servi **selon le host** comme le reste du registre produit : c'est ce
 *     qu'un robot lit avant de parcourir ;
 *   - `X-Robots-Tag: noindex, nofollow, noarchive` sur **toute** réponse d'un produit non
 *     référençable : c'est ce qui vaut pour une page déjà connue d'un moteur, qu'un
 *     `robots.txt` (lequel interdit le *parcours*, pas l'*indexation* d'une adresse reçue
 *     par ailleurs) ne retirerait jamais de l'index.
 *
 * Le drapeau vit dans le registre (`lib/products.js`, champ `indexable`) et non ici : ajouter
 * un produit, c'est ajouter une entrée là-bas, pas un `if` ici.
 *
 * Branchement dans `server.js` avec les **autres en-têtes de sécurité**, tôt dans la chaîne :
 * plus bas, la garde de disponibilité `/api` (503 pendant un redémarrage), les limiteurs et
 * `express.static` répondraient sans que l'en-tête soit posé. C'est aussi, au passage, avant
 * `express.static` : un `public/robots.txt` déposé un jour ne prendrait pas le pas sur la
 * version par produit.
 *   registerRobotsRoutes(app, { resolveProductFromRequest, getProduct });
 */

const { getProduct: getProductFromRegistry } = require('./products');

/** En-tête posé sur les réponses d'un produit non référençable. */
const NOINDEX_HEADER = 'noindex, nofollow, noarchive';

/**
 * `robots.txt` d'un produit référençable. Les deux interdictions ne sont pas des gardes —
 * l'autorisation, elle, est portée par les routes — mais évitent qu'un robot consomme le
 * quota d'API et indexe des médias sortis de leur page.
 */
const INDEXABLE_ROBOTS = ['User-agent: *', 'Disallow: /api/', 'Disallow: /uploads/', ''].join('\n');

/** `robots.txt` d'un produit non référençable : rien, nulle part. */
const NON_INDEXABLE_ROBOTS = ['User-agent: *', 'Disallow: /', ''].join('\n');

/** @param {{ indexable?: boolean }} product */
function robotsBodyFor(product) {
  return product?.indexable === false ? NON_INDEXABLE_ROBOTS : INDEXABLE_ROBOTS;
}

/**
 * Branche `GET /robots.txt` et l'en-tête `X-Robots-Tag` par produit.
 *
 * @param {import('express').Application} app
 * @param {object} deps
 * @param {(req: import('express').Request) => string} deps.resolveProductFromRequest
 * @param {(id: string) => object} [deps.getProduct] injectable pour les tests.
 */
function registerRobotsRoutes(app, { resolveProductFromRequest, getProduct } = {}) {
  const resolveProduct = getProduct || getProductFromRegistry;

  // L'en-tête d'abord : il doit couvrir le HTML, les assets ET les réponses d'API du produit,
  // donc être posé avant tout ce qui répond.
  app.use((req, res, next) => {
    const product = resolveProduct(resolveProductFromRequest(req));
    if (product?.indexable === false) res.setHeader('X-Robots-Tag', NOINDEX_HEADER);
    return next();
  });

  app.get('/robots.txt', (req, res) => {
    const product = resolveProduct(resolveProductFromRequest(req));
    res.type('text/plain; charset=utf-8');
    // Court, mais pas `no-store` : un robot qui relit toutes les 15 min n'apprend rien de plus,
    // et un changement de politique doit tout de même se propager dans la journée.
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.send(robotsBodyFor(product));
  });
}

module.exports = {
  NOINDEX_HEADER,
  INDEXABLE_ROBOTS,
  NON_INDEXABLE_ROBOTS,
  robotsBodyFor,
  registerRobotsRoutes,
};
