'use strict';

/**
 * Politique de création de comptes — lot I de `docs/AUDIT_SECURITE_2026-09-22.md`
 * (constat **S11**).
 *
 * Le constat : deux réglages indépendants gardaient deux chemins de création de compte.
 * `ui.auth.allow_register` fermait le formulaire d'inscription (`POST /api/auth/register`) ;
 * `ui.auth.allow_google_auto_register` fermait la création à la première connexion Google.
 * Les deux gardes étaient réelles et leurs défauts sûrs — mais **décocher « autoriser
 * l'inscription » ne fermait pas l'auto-inscription Google**. Un administrateur qui ferme les
 * inscriptions avant les vacances croit raisonnablement avoir fermé la création de comptes ;
 * il lui en restait un chemin ouvert, sans rien pour le lui dire.
 *
 * Le correctif ne supprime pas le second réglage — il reste utile pour n'autoriser la connexion
 * Google qu'aux comptes déjà existants, inscriptions ouvertes par ailleurs. Il le rend
 * **subordonné** : `allow_register` devient l'interrupteur général, et le réglage Google ne
 * peut qu'affiner à l'intérieur. Une garde qu'on croit avoir posée doit tenir.
 *
 * La règle vit ici, et non dans `routes/auth.js`, pour que les deux chemins lisent la **même**
 * fonction : c'est la seule façon qu'un troisième chemin d'inscription (LTI, ENT…) ajouté
 * demain ne reparte pas d'une lecture de réglage à lui.
 */

const { getSettingValue } = require('./settings');

/**
 * Création de compte autorisée, tous chemins confondus (interrupteur général).
 * @returns {Promise<boolean>}
 */
async function isRegistrationAllowed() {
  return (await getSettingValue('ui.auth.allow_register', true)) !== false;
}

/**
 * Création d'un compte élève à la **première connexion Google**.
 *
 * Subordonnée à l'interrupteur général : inscriptions fermées ⇒ pas d'auto-inscription, quel
 * que soit `ui.auth.allow_google_auto_register`. Une connexion Google sur un compte **déjà
 * existant** n'est pas concernée — ce n'est pas une création.
 *
 * @returns {Promise<boolean>}
 */
async function isGoogleAutoRegistrationAllowed() {
  if (!(await isRegistrationAllowed())) return false;
  return (await getSettingValue('ui.auth.allow_google_auto_register', false)) !== false;
}

module.exports = {
  isRegistrationAllowed,
  isGoogleAutoRegistrationAllowed,
};
