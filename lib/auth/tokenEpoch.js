'use strict';

/**
 * Époque de jeton (`users.token_epoch`) — révocation des sessions au changement de mot de passe.
 *
 * Le JWT ne porte aucun droit (ils sont relus en base à chaque requête), mais jusqu'ici rien
 * ne l'invalidait avant son expiration : un jeton volé restait valable après un reset du mot
 * de passe (audit `docs/AUDIT_COMPTES_2026-09.md`, S4). Chaque jeton embarque désormais le
 * claim `tokenEpoch` lu au moment de l'émission ; tout changement de mot de passe incrémente
 * `users.token_epoch`, et l'hydratation (ForetMap comme GL) rejette un jeton dont l'époque ne
 * correspond plus. L'hydratation touchant déjà la base, le contrôle ne coûte aucune requête
 * supplémentaire côté GL (jointure) et une lecture par clé primaire côté ForetMap.
 *
 * Les jetons émis avant cette évolution n'ont pas de claim : ils valent époque 0, ce qui
 * reste valide tant que le compte n'a pas changé de mot de passe depuis.
 */

const { queryOne, execute } = require('../../database');

/** Époque courante d'un compte `users` (0 si inconnu). */
async function getUserTokenEpoch(userId) {
  const id = String(userId || '').trim();
  if (!id) return 0;
  const row = await queryOne('SELECT token_epoch FROM users WHERE id = ? LIMIT 1', [id]);
  return Number(row?.token_epoch || 0);
}

/** Invalide toutes les sessions d'un compte (à appeler après chaque écriture de mot de passe). */
async function bumpUserTokenEpoch(userId) {
  const id = String(userId || '').trim();
  if (!id) return;
  await execute('UPDATE users SET token_epoch = token_epoch + 1, updated_at = NOW() WHERE id = ?', [
    id,
  ]);
}

/**
 * Vrai si le claim d'un jeton correspond à l'époque courante du compte.
 * @param {object} claims claims JWT vérifiés
 * @param {number|string|null} currentEpoch valeur de `users.token_epoch` (null = pas de compte)
 */
function tokenEpochMatches(claims, currentEpoch) {
  if (currentEpoch == null) return true;
  return Number(claims?.tokenEpoch || 0) === Number(currentEpoch || 0);
}

/**
 * Compte `users` porteur des secrets d'un acteur GL (joueur → compte lié ; staff →
 * enseignant ForetMap rattaché). `null` pour un invité ou un staff sans compte ForetMap.
 */
async function resolveUserIdForGlClaims(claims) {
  const userType = String(claims?.userType || '');
  const userId = String(claims?.userId || '').trim();
  if (!userId) return null;
  if (userType === 'gl_player') {
    const row = await queryOne(
      'SELECT linked_foretmap_user_id FROM gl_players WHERE id = ? LIMIT 1',
      [userId],
    );
    return row?.linked_foretmap_user_id ? String(row.linked_foretmap_user_id) : null;
  }
  if (userType === 'gl_admin') {
    const row = await queryOne('SELECT foretmap_user_id FROM gl_admins WHERE id = ? LIMIT 1', [
      userId,
    ]);
    return row?.foretmap_user_id ? String(row.foretmap_user_id) : null;
  }
  return null;
}

module.exports = {
  getUserTokenEpoch,
  bumpUserTokenEpoch,
  tokenEpochMatches,
  resolveUserIdForGlClaims,
};
