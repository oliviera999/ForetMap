'use strict';

/**
 * Réglages du domaine « biodiversité » (`app_settings`).
 *
 * Biodiversité : fiches espèces et niveau pédagogique par défaut.
 *
 * Déclarations au format du noyau commun `lib/shared/settingsRegistryCore.js` (+ `scope` :
 * public / teacher / admin), agrégées par `lib/settings/domains.js` dans le registre unique
 * `SETTINGS_REGISTRY` de `lib/settings.js`. Recopiées telles quelles depuis ce registre
 * (piste B, étape B6) : mêmes clés, mêmes défauts, mêmes bornes.
 */

const BIODIV_SETTINGS = {
  /**
   * Section « Détermination » des fiches espèces dépliée d'office.
   *
   * Par défaut repliée, comme les autres sections de la fiche. Un site qui travaille
   * beaucoup l'identification sur le terrain (ou dont le public lit mal un `<details>`)
   * peut la rendre permanente sans toucher au code. Le contenu, lui, ne s'affiche que
   * si le professeur a renseigné au moins un des trois champs.
   */
  'ui.biodiv.determination_always_open': { scope: 'public', type: 'boolean', default: false },
  'ui.biodiv.pedago_level_default': {
    scope: 'public',
    type: 'enum',
    values: ['college', 'lycee', 'universite'],
    default: 'college',
  },
  'ui.biodiv.pedago_pref_can_raise': { scope: 'public', type: 'boolean', default: false },
};

module.exports = { BIODIV_SETTINGS };
