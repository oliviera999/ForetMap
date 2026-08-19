const jwt = require('jsonwebtoken');

/**
 * Seul algorithme accepté, à la signature comme à la vérification.
 *
 * Tous les jetons de l'application (session ForetMap, session GL, présentation de QCM)
 * sont signés avec le secret partagé `JWT_SECRET`, donc en HMAC. L'épingler explicitement
 * ferme la classe d'attaques par confusion d'algorithme : un jeton présenté en `none` ou
 * en RS256 — dont la « clé publique » serait notre secret — est rejeté avant toute
 * lecture des claims, sans dépendre du défaut de la bibliothèque.
 *
 * Corollaire : passer un jour à une paire de clés asymétriques se fait ici, et nulle part
 * ailleurs — c'est le seul endroit du code où jsonwebtoken est appelé.
 */
const JWT_ALGORITHM = 'HS256';
const JWT_ALGORITHMS = Object.freeze([JWT_ALGORITHM]);

function parseBearerToken(req) {
  const auth = req?.headers?.authorization;
  return auth && auth.startsWith('Bearer ') ? auth.slice(7) : null;
}

/** Signe un jeton avec l'algorithme de l'application. `options` complète (expiresIn…). */
function signJwtToken(payload, jwtSecret, options = {}) {
  return jwt.sign(payload, jwtSecret, { ...options, algorithm: JWT_ALGORITHM });
}

/** Vérifie signature et expiration. Lève si le jeton est invalide, expiré ou mal signé. */
function verifyJwtToken(token, jwtSecret) {
  return jwt.verify(token, jwtSecret, { algorithms: JWT_ALGORITHMS });
}

/**
 * Auth ForetMap optionnelle (routes publiques avec enrichissement si JWT valide).
 * @param {import('express').Request} req
 * @param {{ jwtSecret: string|null, hydrateAuthFromTokenClaims: (claims: object) => Promise<object|null> }} deps
 */
async function parseOptionalForetAuth(req, { jwtSecret, hydrateAuthFromTokenClaims }) {
  try {
    if (!jwtSecret) return null;
    const token = parseBearerToken(req);
    if (!token) return null;
    const claims = verifyJwtToken(token, jwtSecret);
    return await hydrateAuthFromTokenClaims(claims);
  } catch (_) {
    return null;
  }
}

/**
 * Contrainte de produit sur des claims **déjà vérifiés** (fonction pure).
 * @returns {{ claims: object }|{ error: string, status: number }}
 */
function checkClaimsProduct(claims, expectedProduct) {
  const product = String(claims.product || 'foret').toLowerCase();
  const expected = String(expectedProduct || 'foret').toLowerCase();
  if (product !== expected) {
    return {
      error:
        expected === 'gl'
          ? 'Session non autorisée pour Gnomes & Licornes'
          : 'Session non autorisée pour ce produit',
      status: 403,
    };
  }
  return { claims };
}

/**
 * Vérifie un JWT et contraint le produit (foret | gl).
 * @returns {{ claims: object }|{ error: string, status: number }}
 */
function verifyJwtForProduct(token, jwtSecret, expectedProduct) {
  try {
    const claims = verifyJwtToken(token, jwtSecret);
    return checkClaimsProduct(claims, expectedProduct);
  } catch (_) {
    return { error: 'Token invalide ou expiré', status: 401 };
  }
}

module.exports = {
  JWT_ALGORITHM,
  JWT_ALGORITHMS,
  parseBearerToken,
  signJwtToken,
  verifyJwtToken,
  parseOptionalForetAuth,
  verifyJwtForProduct,
  checkClaimsProduct,
};
