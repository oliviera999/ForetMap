'use strict';

/**
 * Réglages déclarés par domaine (piste B, étape B6 ; ligne 13 du § 3.3 de
 * `docs/AUDIT_ETAT_DES_LIEUX_2026-09-25.md`).
 *
 * Chaque domaine déclare ses clés dans son fichier (`lib/settings/<domaine>.js` ; Moodle et LTI
 * dans leur dossier) ; `lib/settings.js` n'en garde que l'agrégat, `SETTINGS_REGISTRY`, et les
 * fonctions de lecture et d'écriture — son API ne change pas.
 *
 * **L'ordre de la liste compte** : il fixe l'ordre des clés dans les réponses
 * (`GET /api/settings/public`). Il reproduit celui du registre d'avant la répartition — en
 * particulier les sous-sections de `content` (marque, connexion, application, visite,
 * « À propos », aide). Un domaine nouveau s'ajoute en fin de liste.
 *
 * Une clé déclarée par deux domaines fait échouer le chargement : un réglage n'a qu'un
 * propriétaire.
 */

const { MOODLE_SETTINGS_REGISTRY } = require('../moodle/settingsRegistry');
const { LTI_SETTINGS_REGISTRY } = require('../lti/settingsRegistry');
const { BRAND_SETTINGS } = require('./brand');
const { IDENTITY_SETTINGS } = require('./identity');
const { APP_SETTINGS } = require('./app');
const { TERRAIN_SETTINGS } = require('./terrain');
const { HELP_SETTINGS } = require('./help');
const { MODULES_SETTINGS } = require('./modules');
const { BIODIV_SETTINGS } = require('./biodiv');
const { TASKS_SETTINGS } = require('./tasks');
const { SOCIAL_SETTINGS } = require('./social');
const { PEDAGO_SETTINGS } = require('./pedago');
const { PLAN_SETTINGS } = require('./plan');
const { PRIVACY_SETTINGS } = require('./privacy');
const { ROUTES_SETTINGS } = require('./routes');
const { PLACE_FOCUS_SETTINGS } = require('./placeFocus');

/** Domaines, dans l'ordre d'agrégation. */
const SETTINGS_DOMAINS = Object.freeze([
  { domain: 'marque', settings: BRAND_SETTINGS },
  { domain: 'identité', settings: IDENTITY_SETTINGS },
  { domain: 'application', settings: APP_SETTINGS },
  { domain: 'terrain', settings: TERRAIN_SETTINGS },
  { domain: 'aide', settings: HELP_SETTINGS },
  { domain: 'modules', settings: MODULES_SETTINGS },
  { domain: 'biodiversité', settings: BIODIV_SETTINGS },
  { domain: 'tâches', settings: TASKS_SETTINGS },
  { domain: 'vie sociale', settings: SOCIAL_SETTINGS },
  { domain: 'pédagogie', settings: PEDAGO_SETTINGS },
  { domain: 'plan', settings: PLAN_SETTINGS },
  // Lien Moodle (`integration.moodle.*`) et entrée LTI (`integration.lti.*`).
  { domain: 'moodle', settings: MOODLE_SETTINGS_REGISTRY },
  { domain: 'lti', settings: LTI_SETTINGS_REGISTRY },
  { domain: 'confidentialité', settings: PRIVACY_SETTINGS },
  { domain: 'parcours', settings: ROUTES_SETTINGS },
  { domain: 'zoom sur le lieu', settings: PLACE_FOCUS_SETTINGS },
]);

/**
 * Registre unique : les déclarations de chaque domaine, dans l'ordre de `domains`.
 * @param {ReadonlyArray<{ domain: string, settings: Record<string, object> }>} domains
 * @returns {Record<string, object>}
 */
function assembleSettingsRegistry(domains = SETTINGS_DOMAINS) {
  const registry = {};
  const owner = new Map();
  for (const { domain, settings } of domains) {
    for (const [key, meta] of Object.entries(settings)) {
      if (owner.has(key)) {
        throw new Error(`Réglage « ${key} » déclaré deux fois (${owner.get(key)}, ${domain})`);
      }
      owner.set(key, domain);
      registry[key] = meta;
    }
  }
  return registry;
}

/** Domaine propriétaire d'une clé (`null` si inconnue). */
function settingsDomainOf(key, domains = SETTINGS_DOMAINS) {
  const found = domains.find(({ settings }) => Object.hasOwn(settings, key));
  return found ? found.domain : null;
}

module.exports = { SETTINGS_DOMAINS, assembleSettingsRegistry, settingsDomainOf };
