'use strict';

/**
 * Rattachement d'un lancement LTI à un compte `users` déjà connu (I-L2, I-L9, L6, L20).
 * Aucun INSERT dans `users`. Une ligne `external_identities` `provider = 'lti'` est posée
 * (ou rafraîchie) une fois le compte trouvé.
 */

const { queryOne, queryAll, execute } = require('../../database');
const { normalizeEmail } = require('../moodle/matching');
const { PROVIDER } = require('./config');

function httpError(status, message, extra = {}) {
  const err = new Error(message);
  err.status = status;
  Object.assign(err, extra);
  return err;
}

async function findUserByEmail(email) {
  if (!email) return null;
  const rows = await queryAll(
    'SELECT * FROM users WHERE LOWER(email) = LOWER(?) AND is_active = 1 LIMIT 3',
    [email],
  );
  if (!rows.length) return null;
  if (rows.length > 1) {
    throw httpError(
      409,
      'Plusieurs comptes portent cette adresse e-mail : l’entrée depuis le cours est refusée',
      {
        code: 'LTI_EMAIL_AMBIGUOUS',
      },
    );
  }
  return rows[0];
}

/**
 * @param {{ sub: string, email?: string|null, issuer: string }} identity
 * @returns {Promise<{ user: object, linked: boolean, via: 'lti'|'email'|'moodle_id' }>}
 */
async function resolveLtiUser({ sub, email, issuer }) {
  const externalId = String(sub || '').trim();
  if (!externalId) throw httpError(400, 'Identifiant LTI manquant');

  const known = await queryOne(
    `SELECT u.* FROM external_identities ei
       INNER JOIN users u ON u.id = ei.user_id
      WHERE ei.provider = ? AND ei.issuer = ? AND ei.external_id = ?
      LIMIT 1`,
    [PROVIDER, issuer, externalId],
  );
  if (known) {
    if (!Number(known.is_active)) throw httpError(403, 'Compte désactivé');
    await execute(
      'UPDATE external_identities SET last_seen_at = NOW() WHERE provider = ? AND issuer = ? AND external_id = ?',
      [PROVIDER, issuer, externalId],
    );
    return { user: known, linked: false, via: 'lti' };
  }

  const normalized = normalizeEmail(email);
  let user = await findUserByEmail(normalized);
  let via = 'email';

  if (!user && /^\d+$/.test(externalId)) {
    const moodle = await queryOne(
      `SELECT u.* FROM external_identities ei
         INNER JOIN users u ON u.id = ei.user_id
        WHERE ei.provider = 'moodle' AND ei.external_id = ? AND u.is_active = 1
        LIMIT 1`,
      [externalId],
    );
    if (moodle) {
      user = moodle;
      via = 'moodle_id';
    }
  }

  if (!user) {
    throw httpError(
      403,
      'Aucun compte ForetMap ne correspond : l’entrée depuis le cours est refusée',
      {
        code: 'LTI_UNKNOWN_USER',
      },
    );
  }

  await execute(
    `INSERT INTO external_identities
       (user_id, provider, issuer, external_id, external_username, origin, linked_at, last_seen_at)
     VALUES (?, ?, ?, ?, NULL, 'linked', NOW(), NOW())
     ON DUPLICATE KEY UPDATE last_seen_at = NOW(), user_id = VALUES(user_id)`,
    [user.id, PROVIDER, issuer, externalId],
  );
  return { user, linked: true, via };
}

async function isN3beurUser(userId) {
  const row = await queryOne(
    `SELECT 1 AS x FROM group_members gm
       INNER JOIN \`groups\` g ON g.id = gm.group_id
      WHERE gm.user_id = ? AND g.grants_n3beur_access = 1 AND g.is_active = 1
      LIMIT 1`,
    [userId],
  );
  return Boolean(row);
}

module.exports = { resolveLtiUser, isN3beurUser };
