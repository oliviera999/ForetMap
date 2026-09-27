'use strict';

/**
 * Modèle de lecture des fiches espèces — données des tables liées de la piste C (audit du
 * 25/09/2026, § 2.3 et § 3.5), appliquées à une ligne `plants` déjà enrichie
 * (`enrichPlantRow`).
 *
 * Temps 1 (« cesser de lire l'ancien ») : chaque champ historique exposé par le JSON est
 * désormais DÉRIVÉ de la nouvelle structure, avec repli sur l'ancienne colonne quand la
 * nouvelle structure est vide pour la fiche ou ne correspond plus au miroir (écriture par
 * une version antérieure du code, une migration de contenu ou un script). La forme du JSON
 * reste compatible avec le front existant ; les nouvelles structures s'y ajoutent.
 *
 * - photos (`plant_photos`, migration 302) : `photos` (liste), `photos_origin`
 *   (`table` | `colonnes`), et les 8 champs historiques (`photo`… `photo_credit`,
 *   `photo_licence`) recalculés.
 */

const { resolvePlantPhotos } = require('./plantPhotos');

/**
 * @param {object} plant ligne enrichie (copie modifiable)
 * @param {{ photos?: object[] }} related lignes liées de la fiche
 */
function applySpeciesRelations(plant, related) {
  const out = { ...plant };
  if (Object.prototype.hasOwnProperty.call(related, 'photos')) {
    const resolved = resolvePlantPhotos(plant, related.photos);
    Object.assign(out, resolved.columns);
    out.photos = resolved.photos;
    out.photos_origin = resolved.origin;
  }
  return out;
}

module.exports = { applySpeciesRelations };
