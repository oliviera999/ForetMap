'use strict';

/**
 * Secrets d'entrée des plans (plan public, plan e-nov, plan des personnels) : **code d'accès**
 * ou **mot de passe**.
 *
 * Les deux reposent sur la même mécanique — un secret partagé, connu du serveur par sa seule
 * empreinte bcrypt, échangé contre un laissez-passer signé (`lib/accessGate.js`) — mais ne
 * jouent pas le même rôle :
 *
 *  - le **code d'accès** est un secret de *diffusion* : il se recopie d'une affiche, se porte
 *    dans un lien (`?code=`) et donc dans un QR code imprimé ;
 *  - le **mot de passe** est un secret de *personne* : il se tape (ou se retrouve dans le
 *    gestionnaire de mots de passe du navigateur), se saisit masqué, mêle lettres et chiffres,
 *    et **ne voyage jamais dans un lien** — un lien se photographie et se transmet, un mot de
 *    passe non.
 *
 * Chaque plan garde une empreinte **par nature de secret** : passer du code au mot de passe
 * ferme aussitôt la porte aux appareils entrés avec le code (le laissez-passer est dérivé de
 * l'empreinte en vigueur, `codePassValue`), et l'administrateur peut préparer le mot de passe
 * avant de basculer le mode — sans fenêtre où le plan resterait ouvert.
 */

/** Natures de secret ; `access_mode` d'un plan vaut l'une d'elles quand il est fermé. */
const ACCESS_SECRET_KINDS = Object.freeze(['code', 'password']);

/**
 * Longueur minimale d'un secret enregistré : 12 caractères. La seule défense contre le
 * tâtonnement est `authLimiter` (plafond par adresse IP) ; 12 caractères mettent le secret
 * hors de portée. Les secrets déjà enregistrés restent valides jusqu'à leur remplacement : la
 * règle s'applique à l'enregistrement, et un secret n'est connu que par son empreinte.
 */
const ACCESS_SECRET_MIN_LENGTH = 12;

/** Longueur maximale : bcrypt ne lit que 72 octets, et un secret se recopie. */
const ACCESS_SECRET_MAX_LENGTH = 64;

/** Empreintes bcrypt de chaque plan, par nature de secret (`lib/settings/plan.js`). */
const PLAN_ACCESS_SECRET_KEYS = Object.freeze({
  plan: Object.freeze({
    code: 'security.plan_access_code_hash',
    password: 'security.plan_access_password_hash',
  }),
  enov: Object.freeze({
    code: 'security.enov_plan_access_code_hash',
    password: 'security.enov_plan_access_password_hash',
  }),
  staff: Object.freeze({
    code: 'security.staff_plan_access_code_hash',
    password: 'security.staff_plan_access_password_hash',
  }),
});

/** Toutes les clés d'empreinte : jamais écrites telles quelles par `PUT /admin/:key`. */
const ACCESS_SECRET_HASH_KEYS = Object.freeze(
  Object.values(PLAN_ACCESS_SECRET_KEYS).flatMap((keys) => Object.values(keys)),
);

/** Au moins une lettre (toutes écritures) et un chiffre : la règle « alphanumérique ». */
const LETTER_RE = /\p{L}/u;
const DIGIT_RE = /\p{Nd}/u;

/** Formulations des réponses et des journaux, par nature de secret. */
const ACCESS_SECRET_WORDING = Object.freeze({
  code: Object.freeze({
    noun: 'Code d’accès',
    required: 'Code d’accès requis',
    missing: 'Code requis',
    invalid: 'Code incorrect',
  }),
  password: Object.freeze({
    noun: 'Mot de passe',
    required: 'Mot de passe requis',
    missing: 'Mot de passe requis',
    invalid: 'Mot de passe incorrect',
  }),
});

/**
 * Nature du secret exigé par un mode d'accès, ou `null` quand le mode n'en exige pas
 * (`public`, `disabled`, valeur inconnue).
 * @param {unknown} mode
 * @returns {'code'|'password'|null}
 */
function accessSecretKindForMode(mode) {
  return ACCESS_SECRET_KINDS.includes(mode) ? mode : null;
}

/** Clé d'empreinte d'un plan pour une nature de secret, ou `null`. */
function accessSecretHashKey(surfaceId, kind) {
  return PLAN_ACCESS_SECRET_KEYS[surfaceId]?.[kind] || null;
}

/** Formulations d'une nature de secret (repli : code). */
function accessSecretWording(kind) {
  return ACCESS_SECRET_WORDING[kind] || ACCESS_SECRET_WORDING.code;
}

/**
 * Règles d'un secret **à l'enregistrement**. Un secret vide est accepté (il efface).
 *
 *  - code : 12 à 64 caractères, quels qu'ils soient ;
 *  - mot de passe : 12 à 64 caractères, **au moins une lettre et un chiffre**. Casse
 *    respectée (`Enov2026Jury` ≠ `enov2026jury`) ; les autres caractères sont permis.
 *
 * @param {'code'|'password'} kind
 * @param {string} value secret déjà débarrassé de ses blancs de bord.
 * @returns {string|null} message d'erreur, ou `null` si le secret est acceptable.
 */
function validateAccessSecret(kind, value) {
  const secret = String(value ?? '');
  if (!secret) return null;
  const noun = kind === 'password' ? 'Mot de passe' : 'Code';
  if (secret.length > ACCESS_SECRET_MAX_LENGTH) {
    return `${noun} trop long (${ACCESS_SECRET_MAX_LENGTH} caractères maximum)`;
  }
  if (secret.length < ACCESS_SECRET_MIN_LENGTH) {
    return `${noun} trop court (${ACCESS_SECRET_MIN_LENGTH} caractères minimum)`;
  }
  if (kind === 'password' && !(LETTER_RE.test(secret) && DIGIT_RE.test(secret))) {
    return 'Le mot de passe doit mêler lettres et chiffres (au moins une lettre et un chiffre)';
  }
  return null;
}

module.exports = {
  ACCESS_SECRET_KINDS,
  ACCESS_SECRET_MIN_LENGTH,
  ACCESS_SECRET_MAX_LENGTH,
  PLAN_ACCESS_SECRET_KEYS,
  ACCESS_SECRET_HASH_KEYS,
  accessSecretKindForMode,
  accessSecretHashKey,
  accessSecretWording,
  validateAccessSecret,
};
