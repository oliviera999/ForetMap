import { api } from '../../services/api';

/**
 * Téléversement d'une photo de fiche espèce (`POST /api/plants/:id/photo-upload`).
 *
 * Le serveur incrémente la révision d'édition de la fiche à chaque envoi (audit du
 * 19/11/2026, C7) : le parent qui tient la session d'édition fournit `onUploadPhoto` pour
 * passer l'envoi dans sa file d'enregistrement et adopter la révision renvoyée — sinon le
 * prochain enregistrement du formulaire serait pris pour un conflit. Sans parent (création
 * de fiche), l'envoi part directement.
 *
 * @param {string|number} plantId
 * @param {{ field: string, imageData: string, position?: string }} body
 * @param {((plantId: string|number, body: object) => Promise<object>)|null} [onUploadPhoto]
 * @returns {Promise<object>} réponse du serveur (`url`, `edit_revision`, `photos`…)
 */
export function uploadPlantPhotoRequest(plantId, body, onUploadPhoto = null) {
  if (typeof onUploadPhoto === 'function') return onUploadPhoto(plantId, body);
  return api(`/api/plants/${plantId}/photo-upload`, 'POST', body);
}
