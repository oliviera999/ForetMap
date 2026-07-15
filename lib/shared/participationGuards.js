'use strict';

/**
 * Noyau commun forum / commentaires contextuels (audit : helpers dupliqués à
 * l'identique dans routes/forum.js et routes/context-comments.js) : acteur,
 * modération, rôle visiteur, cooldown anti-spam et participation n3beur.
 *
 * Les éléments propres à chaque module (messages 403, codes, colonnes de rôle)
 * restent paramétrés côté routes.
 */

const { queryOne } = require('../../database');

/** Acteur canonique (type + id) d'une session authentifiée, ou null. */
function getActor(auth) {
  const userType = String(auth?.userType || '')
    .trim()
    .toLowerCase();
  const userId = String(auth?.canonicalUserId || auth?.userId || '').trim();
  if (!userType || !userId) return null;
  return { userType, userId };
}

/** Modérateur : slug admin/prof, ou permission teacher.access. */
function canModerateWithTeacherAccess(auth) {
  const roleSlug = String(auth?.roleSlug || '')
    .trim()
    .toLowerCase();
  if (roleSlug === 'admin' || roleSlug === 'prof') return true;
  const perms = Array.isArray(auth?.permissions) ? auth.permissions : [];
  return perms.includes('teacher.access');
}

function isVisitorRole(auth) {
  return (
    String(auth?.roleSlug || '')
      .trim()
      .toLowerCase() === 'visiteur'
  );
}

/**
 * Fabrique un vérificateur de cooldown avec son état privé (une Map par module,
 * comme les deux Maps d'origine). Purge périodique des entrées expirées.
 */
function createCooldownChecker() {
  const cooldownState = new Map();
  return function checkCooldown(actor, action, cooldownMs) {
    if (process.env.NODE_ENV === 'test') return true;
    const key = `${action}:${actor.userType}:${actor.userId}`;
    const now = Date.now();
    const last = cooldownState.get(key) || 0;
    if (now - last < cooldownMs) return false;
    // Purge des entrées expirées quand la Map grossit — sinon croissance sans borne
    // (une entrée par acteur, jamais supprimée) sur un process longue durée.
    if (cooldownState.size > 1000) {
      for (const [k, ts] of cooldownState) {
        if (now - ts >= cooldownMs) cooldownState.delete(k);
      }
    }
    cooldownState.set(key, now);
    return true;
  };
}

/** Colonnes de participation autorisées (jamais d'interpolation SQL hors liste blanche). */
const PARTICIPATION_COLUMNS = new Set(['forum_participate', 'context_comment_participate']);

/**
 * n3boss / comptes non élèves : toujours participatif ; n3beur : selon le
 * profil principal (`roles.<column>`, défaut 1).
 */
async function studentParticipationAllowed(auth, column) {
  if (!PARTICIPATION_COLUMNS.has(column)) {
    throw new Error(`Colonne de participation inconnue: ${column}`);
  }
  if (!auth) return false;
  if (String(auth.userType || '').toLowerCase() !== 'student') return true;
  const row = await queryOne(
    `SELECT COALESCE(r.${column}, 1) AS participate
       FROM users u
  LEFT JOIN user_roles ur ON ur.user_id = u.id AND ur.user_type = 'student' AND ur.is_primary = 1
  LEFT JOIN roles r ON r.id = ur.role_id
      WHERE u.id = ? AND u.user_type = 'student' LIMIT 1`,
    [auth.userId],
  );
  if (!row) return true;
  return Number(row.participate) !== 0;
}

module.exports = {
  getActor,
  canModerateWithTeacherAccess,
  isVisitorRole,
  createCooldownChecker,
  studentParticipationAllowed,
};
