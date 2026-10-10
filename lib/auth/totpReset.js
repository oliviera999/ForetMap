'use strict';

/**
 * Réinitialisation du second facteur d'un compte (téléphone perdu, enrôlement douteux),
 * partagée par la route d'administration (`POST /api/auth/totp/users/:userId/reset`) et le
 * script serveur du dernier administrateur (`scripts/totp-admin.js reset`).
 *
 * Effets, toujours les mêmes : secret, enrôlement en attente et codes de secours supprimés ;
 * `token_epoch` incrémenté (**toutes** les sessions du compte tombent, y compris une session
 * G&L liée) ; journal d'audit **et** de sécurité `auth.totp.reset` ; e-mail au titulaire.
 * Au prochain login, le compte refait l'enrôlement (imposé quand le réglage est `required`).
 */

const { queryOne } = require('../../database');
const { logAudit } = require('../auditLog');
const { bumpUserTokenEpoch } = require('./tokenEpoch');
const { resetTotp } = require('./totpStore');
const { notifyTotpChange } = require('./mfaLogin');

/**
 * @param {object} params
 * @param {string} params.userId compte visé
 * @param {{ userType: string, userId: string|null }} params.actor auteur (administrateur, ou `cli`)
 * @param {'admin'|'cli'} params.via
 * @param {object} [params.req] requête HTTP (adresse, agent) quand il y en a une
 * @param {object} [params.payload] contexte journalisé en plus (hôte, utilisateur système…)
 * @returns {Promise<{ hadTotp: boolean, wasEnabled: boolean, notice: Promise<unknown> }>}
 */
async function resetUserSecondFactor({ userId, actor, via, req = null, payload = {} }) {
  const target = await queryOne('SELECT id, user_type FROM users WHERE id = ? LIMIT 1', [
    String(userId),
  ]);
  if (!target) {
    const err = new Error('Utilisateur introuvable');
    err.code = 'USER_NOT_FOUND';
    throw err;
  }
  const result = await resetTotp(target.id);
  await bumpUserTokenEpoch(target.id);
  await logAudit(
    'auth.totp.reset',
    target.user_type,
    target.id,
    'Double authentification réinitialisée',
    {
      req,
      actorUserType: actor?.userType || null,
      actorUserId: actor?.userId || null,
      payload: { via, had_totp: result.wasEnabled, ...payload },
    },
  );
  const notice = notifyTotpChange(target.id, 'reset');
  return { ...result, notice };
}

module.exports = { resetUserSecondFactor };
