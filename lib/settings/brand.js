'use strict';

/**
 * Réglages du domaine « marque » (`app_settings`).
 *
 * Marque affichée (nom du logiciel et de l'établissement) et thème de marque du produit.
 * Défauts posés par `lib/brand.js` ; surchargeables en base sans redéployer.
 *
 * Déclarations au format du noyau commun `lib/shared/settingsRegistryCore.js` (+ `scope` :
 * public / teacher / admin), agrégées par `lib/settings/domains.js` dans le registre unique
 * `SETTINGS_REGISTRY` de `lib/settings.js`. Recopiées telles quelles depuis ce registre
 * (piste B, étape B6) : mêmes clés, mêmes défauts, mêmes bornes.
 */

const { getBrand } = require('../brand');

/** Noms affichés par défaut (logiciel, établissement) — source unique `lib/brand.js`. */
const brand = getBrand();

const BRAND_SETTINGS = {
  /**
   * Marque affichée, exposée au front sous `publicSettings.content.brand.*`.
   *
   * Les composants partagés (carnet, « À propos »…) lisent ces deux clés au lieu d'écrire
   * « Lycée Lyautey » en dur. Défauts posés par `lib/brand.js` (variables d'environnement) ;
   * un administrateur peut ensuite les surcharger en base sans redéployer.
   *
   * `org_name` accepte la chaîne vide : une installation sans établissement rattaché retire
   * simplement la mention partout où elle apparaît.
   */
  'content.brand.app_name': {
    scope: 'public',
    type: 'string',
    maxLength: 80,
    default: brand.appName,
  },
  'content.brand.org_name': {
    scope: 'public',
    type: 'string',
    maxLength: 80,
    default: brand.orgName,
  },
  /**
   * Thème de marque du produit (lot 7 du plan de convergence) : huit couleurs, deux polices,
   * logo et favicon. Même forme que le thème G&L, dont le mécanisme est désormais partagé
   * (`src/shared/brand/brandThemeCore.js`) : les couleurs sont validées côté client, et les
   * URL de logo ou de favicon ne sont acceptées que sous `/uploads/` ou `/maps/` — un réglage
   * d'apparence ne doit pas devenir un moyen d'appeler un domaine tiers.
   */
  'ui.foret.brand': { scope: 'public', type: 'json', shape: 'object', default: {} },
};

module.exports = { BRAND_SETTINGS };
