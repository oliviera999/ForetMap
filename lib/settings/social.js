'use strict';

/**
 * Réglages du domaine « vie sociale » (`app_settings`).
 *
 * Vie sociale : réactions du forum et des commentaires contextuels.
 *
 * Déclarations au format du noyau commun `lib/shared/settingsRegistryCore.js` (+ `scope` :
 * public / teacher / admin), agrégées par `lib/settings/domains.js` dans le registre unique
 * `SETTINGS_REGISTRY` de `lib/settings.js`. Recopiées telles quelles depuis ce registre
 * (piste B, étape B6) : mêmes clés, mêmes défauts, mêmes bornes.
 */

const SOCIAL_SETTINGS = {
  'ui.reactions.allowed_emojis': {
    scope: 'public',
    type: 'string',
    maxLength: 160,
    default: '👍 ❤️ 😂 😮 😢 😡 🔥 👏',
  },
};

module.exports = { SOCIAL_SETTINGS };
