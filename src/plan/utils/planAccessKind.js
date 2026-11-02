/**
 * Nature du secret qui ferme un plan : **code d'accès** (`code`) ou **mot de passe**
 * (`password`), annoncée par le serveur dans ses refus (`access_kind`, `lib/accessSecret.js`).
 *
 * Module à part (et non dans `planApi.js`) : les écrans l'utilisent pour lire un refus, et les
 * tests qui simulent l'API ne doivent pas avoir à le recopier.
 */

/**
 * Nature du secret annoncée par un refus du serveur, `code` par défaut (serveur antérieur).
 * @param {object} [body] corps de la réponse 401.
 * @returns {'code'|'password'}
 */
export function accessKindFromBody(body) {
  return body?.access_kind === 'password' ? 'password' : 'code';
}

/**
 * Phrase d'explication de l'écran de saisie selon la nature du secret demandé
 * (`variant.accessIntro` / `variant.passwordIntro`, `planVariants.js`).
 * @param {object} variant
 * @param {'code'|'password'} [kind]
 * @returns {string}
 */
export function accessIntroFor(variant, kind = 'code') {
  if (kind === 'password' && variant?.passwordIntro) return variant.passwordIntro;
  return variant?.accessIntro || '';
}
