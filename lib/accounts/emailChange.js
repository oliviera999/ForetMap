'use strict';

/**
 * Changement d'adresse e-mail d'un compte `users` — règles communes (audit sécurité
 * 2026-09-30, AC2 et AC3).
 *
 * L'e-mail est la clé du « mot de passe oublié » : qui le remplace par le sien prend le compte
 * de façon **durable**, même après la révocation des sessions. Toute voie qui le modifie
 * (« Mon profil » élève ou enseignant, fiche compte de l'administration) passe donc par ici :
 *
 *  - libre-service : mot de passe actuel exigé, refus en prise de contrôle, refus pour un
 *    compte sans mot de passe (Google seul) — `checkSelfEmailChangeAllowed` ;
 *  - après écriture : sessions révoquées (`token_epoch`) et jetons de réinitialisation ouverts
 *    consommés (`bumpUserTokenEpoch` fait les deux), puis courriel d'avertissement à
 *    l'**ancienne** adresse, sans jamais attendre ni bloquer — `applyEmailChangeEffects`.
 */

const bcrypt = require('bcryptjs');
const logger = require('../logger');
const { bumpUserTokenEpoch } = require('../auth/tokenEpoch');

function normalizeForCompare(email) {
  return String(email ?? '')
    .trim()
    .toLowerCase();
}

/** Vrai si l'adresse change réellement (la casse et les espaces ne comptent pas). */
function emailWillChange(previousEmail, nextEmail) {
  return normalizeForCompare(previousEmail) !== normalizeForCompare(nextEmail);
}

/** `jean.dupont@exemple.fr` → `j***@e***.fr` (courriel d'avertissement, journaux). */
function maskEmail(email) {
  const value = normalizeForCompare(email);
  const at = value.indexOf('@');
  if (at <= 0) return '';
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  const dot = domain.lastIndexOf('.');
  const domainHead = dot > 0 ? domain.slice(0, dot) : domain;
  const tld = dot > 0 ? domain.slice(dot) : '';
  return `${local[0]}***@${domainHead[0] || ''}***${tld}`;
}

const SELF_EMAIL_NO_PASSWORD_ERROR =
  'Ce compte n’a pas encore de mot de passe (connexion Google) : définissez-en un dans « Mon ' +
  'profil » avant de changer d’adresse e-mail, ou demandez ce changement à un administrateur.';

/**
 * Contrôles d'un changement d'e-mail **par le titulaire du compte** (AC3).
 *
 * @param {{ password_hash?: string|null }} account ligne `users` (avec `password_hash`)
 * @param {object} body corps de requête (`currentPassword`)
 * @param {object} auth `req.auth`
 * @returns {Promise<{ ok: true } | { ok: false, status: number, error: string, code?: string }>}
 */
async function checkSelfEmailChangeAllowed(account, body, auth) {
  if (auth?.impersonating) {
    return {
      ok: false,
      status: 403,
      error: 'Pas de changement d’adresse e-mail en prise de contrôle',
    };
  }
  if (!account?.password_hash) {
    return {
      ok: false,
      status: 403,
      error: SELF_EMAIL_NO_PASSWORD_ERROR,
      code: 'EMAIL_CHANGE_NEEDS_PASSWORD',
    };
  }
  const current = typeof body?.currentPassword === 'string' ? body.currentPassword : '';
  if (!current) {
    return {
      ok: false,
      status: 400,
      error: 'Mot de passe actuel requis pour changer d’adresse e-mail',
      code: 'CURRENT_PASSWORD_REQUIRED',
    };
  }
  const ok = await bcrypt.compare(current, account.password_hash);
  if (!ok) return { ok: false, status: 401, error: 'Mot de passe actuel incorrect' };
  return { ok: true };
}

/**
 * Effets d'un changement d'e-mail **déjà écrit** en base.
 *
 * @param {object} args
 * @param {string} args.userId compte modifié
 * @param {string|null} args.previousEmail adresse avant changement
 * @param {string|null} args.nextEmail adresse après changement
 * @param {string} [args.displayName] nom affiché dans le courriel
 * @param {'self'|'admin'} [args.changedBy]
 * @param {object} [args.deps] injection (tests) : `{ sendEmailChangedNotice }`
 * @returns {Promise<boolean>} `true` si l'adresse a réellement changé
 */
async function applyEmailChangeEffects({
  userId,
  previousEmail,
  nextEmail,
  displayName = '',
  changedBy = 'self',
  deps = {},
}) {
  if (!emailWillChange(previousEmail, nextEmail)) return false;
  // Révoque les sessions ouvertes et consomme les jetons « mot de passe oublié » encore
  // valables : un lien parti vers l'ancienne adresse ne doit plus servir.
  await bumpUserTokenEpoch(userId);
  const previous = normalizeForCompare(previousEmail);
  if (previous) {
    const send = deps.sendEmailChangedNotice || require('../mailer').sendEmailChangedNotice;
    // Fire-and-forget : un SMTP lent ou en panne ne retarde ni ne fait échouer la requête.
    Promise.resolve()
      .then(() =>
        send({
          to: previous,
          displayName,
          newEmailMasked: nextEmail ? maskEmail(nextEmail) : '',
          changedBy,
        }),
      )
      .catch((err) => {
        logger.warn({ err, userId: String(userId) }, 'Courriel « e-mail modifié » non envoyé');
      });
  }
  return true;
}

module.exports = {
  emailWillChange,
  maskEmail,
  checkSelfEmailChangeAllowed,
  applyEmailChangeEffects,
  SELF_EMAIL_NO_PASSWORD_ERROR,
};
