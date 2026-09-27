'use strict';

/**
 * Réglages du domaine « pédagogie » (`app_settings`).
 *
 * Pédagogie : conditionnement « marquer comme lu/appris » par réussite au quiz.
 *
 * Déclarations au format du noyau commun `lib/shared/settingsRegistryCore.js` (+ `scope` :
 * public / teacher / admin), agrégées par `lib/settings/domains.js` dans le registre unique
 * `SETTINGS_REGISTRY` de `lib/settings.js`. Recopiées telles quelles depuis ce registre
 * (piste B, étape B6) : mêmes clés, mêmes défauts, mêmes bornes.
 */

const { gatingRegistryEntries } = require('../shared/settingsRegistryCore');

const PEDAGO_SETTINGS = {
  // Conditionnement « marquer comme lu/appris » par réussite au quiz.
  //
  // Le catalogue fait autorité dans `lib/shared/gatingSettingsCore.js` — un seul
  // descripteur par réglage, partagé avec Gnomes & Licornes. Les entrées ci-dessous
  // en sont DÉRIVÉES : ajouter un réglage là-bas l'ajoute ici et côté GL, avec les
  // mêmes bornes. Seul le stockage reste propre à chaque produit (`app_settings`
  // ici, `gl_settings` là-bas).
  // Portée `teacher` pour toutes : réglages pédagogiques, pas système.
  ...gatingRegistryEntries('fm', { scope: 'teacher' }),
};

module.exports = { PEDAGO_SETTINGS };
