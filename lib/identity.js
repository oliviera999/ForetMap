const { queryOne } = require('../database');
const { normalizeOptionalString } = require('./shared/httpHelpers');

function normalizeEmail(value) {
  const email = normalizeOptionalString(value);
  return email ? email.toLowerCase() : null;
}

/**
 * Acteur réel d'une requête pour les journaux : pendant une prise de contrôle
 * (« voir comme »), c'est l'administrateur qui agit, pas le compte contrôlé — sinon toute
 * action faite « en tant que » était journalisée au nom de la victime (CDG-08).
 * @returns {{ actorUserType: string|null, actorUserId: string|null, onBehalfOf: object|null }}
 */
function resolveActorFromReq(req) {
  const auth = req?.auth;
  if (!auth?.userId || !auth?.userType) {
    return { actorUserType: null, actorUserId: null, onBehalfOf: null };
  }
  if (auth.impersonating && auth.impersonatedBy?.userId) {
    return {
      actorUserType: auth.impersonatedBy.userType || null,
      actorUserId: String(auth.impersonatedBy.userId),
      onBehalfOf: { userType: auth.userType, userId: String(auth.userId) },
    };
  }
  return { actorUserType: auth.userType, actorUserId: String(auth.userId), onBehalfOf: null };
}

/**
 * Résout un compte `users` pour la connexion identifiant + mot de passe : pseudo, e-mail, ou
 * pseudo de jeu Gnomes & Licornes (une seule identité, quel que soit le produit). Plus aucun
 * alias d'administrateur codé en dur (CDG-01, CDG-13).
 */
async function resolveLoginAccountByIdentifier(identifier) {
  const normalized = normalizeOptionalString(identifier);
  if (!normalized) return null;

  const account = await queryOne(
    `SELECT * FROM users
      WHERE LOWER(pseudo) = LOWER(?) OR LOWER(email) = LOWER(?)
      ORDER BY (LOWER(email) = LOWER(?)) DESC, created_at ASC
      LIMIT 1`,
    [normalized, normalized, normalized],
  );
  if (account) return account;

  return queryOne(
    `SELECT u.* FROM gl_players p
      INNER JOIN users u ON u.id = p.linked_foretmap_user_id
      WHERE LOWER(p.pseudo) = LOWER(?)
      LIMIT 1`,
    [normalized],
  );
}

module.exports = {
  resolveActorFromReq,
  resolveLoginAccountByIdentifier,
  normalizeEmail,
};
