'use strict';

/**
 * Politique de double authentification : qui est soumis, et que faire à la connexion comme à
 * chaque requête. Source unique partagée par la connexion par mot de passe, Google, Moodle/LTI
 * et l'hydratation de session (`middleware/requireTeacher.js`).
 *
 * **Comptes soumis** : profil effectif `admin` ou `prof` (n3boss), et tout profil de rang
 * ≥ 400 (paliers n3boss dupliqués). La règle porte sur le **profil effectif**, jamais sur
 * `users.user_type` : un compte de type élève promu n3boss est soumis ; un élève (rang ≤ 300),
 * un « personnel » (320), un « prof de classe » (350) et les profils G&L ne le sont jamais.
 *
 * Réglage `security.totp.enforcement` (`off` / `enroll` / `required`, défaut `enroll`) :
 *
 * | compte soumis | `off`   | `enroll`                      | `required`               |
 * | ------------- | ------- | ----------------------------- | ------------------------ |
 * | enrôlé        | session | étape TOTP                    | étape TOTP               |
 * | non enrôlé    | session | session + invitation          | enrôlement imposé        |
 */

const { getSettingValue } = require('../settings');
const { N3BOSS_ROLE_RANK } = require('../rbac');
const { isTotpKeyConfigured } = require('./totpCrypto');

const MFA_ENFORCEMENT_KEY = 'security.totp.enforcement';
const MFA_ENFORCEMENT_VALUES = Object.freeze(['off', 'enroll', 'required']);
const DEFAULT_MFA_ENFORCEMENT = 'enroll';
const MFA_SUBJECT_ROLE_SLUGS = Object.freeze(['admin', 'prof']);

function normalizeEnforcement(value) {
  const v = String(value ?? '')
    .trim()
    .toLowerCase();
  return MFA_ENFORCEMENT_VALUES.includes(v) ? v : DEFAULT_MFA_ENFORCEMENT;
}

/** Valeur courante du réglage (cache des réglages : pas de requête à chaque appel). */
async function getMfaEnforcement() {
  return normalizeEnforcement(await getSettingValue(MFA_ENFORCEMENT_KEY, DEFAULT_MFA_ENFORCEMENT));
}

/**
 * Le profil est-il soumis à la double authentification ?
 * @param {{ roleSlug?: string, roleRank?: number|string }} role
 */
function isMfaSubjectRole(role) {
  const slug = String(role?.roleSlug ?? '')
    .trim()
    .toLowerCase();
  if (MFA_SUBJECT_ROLE_SLUGS.includes(slug)) return true;
  const rank = Number(role?.roleRank);
  return Number.isFinite(rank) && rank >= N3BOSS_ROLE_RANK;
}

/**
 * Décision à la connexion (premier facteur validé).
 * @param {{ authz: { roleSlug?: string, roleRank?: number }, enrolled: boolean, enforcement: string }} params
 * @returns {{ action: 'session'|'verify'|'enroll', subject: boolean, suggestSetup: boolean }}
 */
function decideLoginMfa({ authz, enrolled, enforcement }) {
  const subject = isMfaSubjectRole(authz);
  const mode = normalizeEnforcement(enforcement);
  if (mode === 'off' || !subject) return { action: 'session', subject, suggestSetup: false };
  if (enrolled) return { action: 'verify', subject, suggestSetup: false };
  if (mode === 'required') return { action: 'enroll', subject, suggestSetup: false };
  return { action: 'session', subject, suggestSetup: isTotpKeyConfigured() };
}

/**
 * À chaque requête : une session sans second facteur validé doit-elle être refusée ?
 * Oui pour un compte soumis quand le réglage l'exige, ou quand le compte est enrôlé (une
 * session ouverte avant l'activation, ou pendant une période `off`, ne survit pas).
 * @param {{ authz: object, totpEnabled: boolean, enforcement: string, mfa: boolean }} params
 */
function sessionLacksRequiredMfa({ authz, totpEnabled, enforcement, mfa }) {
  if (mfa) return false;
  const mode = normalizeEnforcement(enforcement);
  if (mode === 'off') return false;
  if (!isMfaSubjectRole(authz)) return false;
  return mode === 'required' || !!totpEnabled;
}

module.exports = {
  MFA_ENFORCEMENT_KEY,
  MFA_ENFORCEMENT_VALUES,
  DEFAULT_MFA_ENFORCEMENT,
  MFA_SUBJECT_ROLE_SLUGS,
  normalizeEnforcement,
  getMfaEnforcement,
  isMfaSubjectRole,
  decideLoginMfa,
  sessionLacksRequiredMfa,
};
