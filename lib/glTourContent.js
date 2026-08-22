'use strict';

const { queryOne, execute } = require('../database');
const { normalizeTourRegistry, resolveStoredTourRegistry } = require('./shared/tourOverridesCore');

/**
 * Surcharges éditoriales des visites guidées **Gnomes & Licornes**.
 *
 * Pendant GL de `lib/tourContent.js` : mêmes règles (noyau partagé
 * `lib/shared/tourOverridesCore.js`), table et clé propres au produit. Un MJ qui
 * réécrit une bulle du royaume ne touche pas aux parcours du verger.
 *
 * Comme côté ForetMap, **le corpus par défaut n'est pas dupliqué en base** : il vit dans
 * `src/gl/constants/glDiscoveryTour.js` et le client applique la surcharge par-dessus.
 * Améliorer un texte versionné reste donc visible partout où personne ne l'a réécrit —
 * la propriété que le registre d'aide GL n'a obtenue qu'au prix d'un dégel (§11.2).
 */
const GL_TOUR_REGISTRY_KEY = 'content.tour';

/** Registre stocké, ou `{}` si aucune ligne n'existe ou si la valeur est illisible. */
async function getGlTourRegistryFromDb() {
  const row = await queryOne('SELECT value_json FROM gl_settings WHERE `key` = ? LIMIT 1', [
    GL_TOUR_REGISTRY_KEY,
  ]);
  return resolveStoredTourRegistry(row?.value_json);
}

/** Écrit le registre normalisé. Un registre vide efface toute personnalisation. */
async function saveGlTourRegistryToDb(registry, updatedBy = null) {
  const normalized = normalizeTourRegistry(registry);
  await execute(
    `INSERT INTO gl_settings (\`key\`, value_json, updated_by, updated_at)
     VALUES (?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE
       value_json = VALUES(value_json),
       updated_by = VALUES(updated_by),
       updated_at = NOW()`,
    [GL_TOUR_REGISTRY_KEY, JSON.stringify(normalized), updatedBy],
  );
  return normalized;
}

module.exports = {
  GL_TOUR_REGISTRY_KEY,
  getGlTourRegistryFromDb,
  saveGlTourRegistryToDb,
};
