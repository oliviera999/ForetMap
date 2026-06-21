const jwt = require('jsonwebtoken');

function parseBearerToken(req) {
  const auth = req?.headers?.authorization;
  return auth && auth.startsWith('Bearer ') ? auth.slice(7) : null;
}

function verifyJwtToken(token, jwtSecret) {
  return jwt.verify(token, jwtSecret);
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
 * Vérifie un JWT et contraint le produit (foret | gl).
 * @returns {{ claims: object }|{ error: string, status: number }}
 */
function verifyJwtForProduct(token, jwtSecret, expectedProduct) {
  try {
    const claims = verifyJwtToken(token, jwtSecret);
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
  } catch (_) {
    return { error: 'Token invalide ou expiré', status: 401 };
  }
}

module.exports = {
  parseBearerToken,
  verifyJwtToken,
  parseOptionalForetAuth,
  verifyJwtForProduct,
};
