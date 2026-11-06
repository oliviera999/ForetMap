'use strict';

/**
 * « Tenir à deux » § 8.6 — projection en lecture seule d'une partie (vidéoprojecteur).
 *
 * Le MJ émet un jeton `product:'gl'`, `userType:'gl_guest'`, claim `projection: { gameId, jti }`,
 * valable 12 h. Le hachage SHA-256 du `jti` est stocké dans `gl_games.projection_token_hash` :
 * un nouveau jeton révoque le précédent, et la clôture de la partie efface le hachage. Une
 * projection lit (état, tour, chasse, voile, journal, salon temps réel) et n'écrit jamais ;
 * elle ne reçoit aucune bourse, aucun polygone, aucun motif.
 */

const crypto = require('node:crypto');
const { signJwtToken } = require('./auth/jwtPipeline');
const { JWT_SECRET } = require('../middleware/requireTeacher');
const { hashProjectionToken } = require('./glTenir');

const PROJECTION_TTL = '12h';

async function issueProjectionToken(db, { gameId, issuedBy }) {
  const jti = crypto.randomUUID();
  const hash = hashProjectionToken(jti);
  await db.execute(
    'UPDATE gl_games SET projection_token_hash = ?, updated_at = NOW() WHERE id = ?',
    [hash, gameId],
  );
  const token = signJwtToken(
    {
      product: 'gl',
      userType: 'gl_guest',
      userId: `projection-${gameId}-${jti.slice(0, 8)}`,
      roleSlug: 'gl_observateur',
      displayName: 'Projection',
      projection: { gameId: Number(gameId), jti },
      issuedBy: issuedBy != null ? String(issuedBy) : null,
    },
    JWT_SECRET,
    { expiresIn: PROJECTION_TTL },
  );
  return { token, expiresIn: PROJECTION_TTL };
}

async function revokeProjectionToken(db, gameId) {
  await db.execute(
    'UPDATE gl_games SET projection_token_hash = NULL, updated_at = NOW() WHERE id = ?',
    [gameId],
  );
}

/** Le claim de projection d'un jeton correspond-il encore à la partie (non révoqué) ? */
async function isProjectionValid(db, projection, gameId) {
  if (!projection || Number(projection.gameId) !== Number(gameId) || !projection.jti) return false;
  const row = await db.queryOne('SELECT projection_token_hash FROM gl_games WHERE id = ? LIMIT 1', [
    gameId,
  ]);
  if (!row?.projection_token_hash) return false;
  const expected = hashProjectionToken(projection.jti);
  return crypto.timingSafeEqual(
    Buffer.from(expected),
    Buffer.from(String(row.projection_token_hash)),
  );
}

function isProjectionAuth(auth) {
  return (
    !!auth &&
    auth.userType === 'gl_guest' &&
    !!auth.projection &&
    Number(auth.projection.gameId) > 0
  );
}

module.exports = {
  PROJECTION_TTL,
  issueProjectionToken,
  revokeProjectionToken,
  isProjectionValid,
  isProjectionAuth,
};
