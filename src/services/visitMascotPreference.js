import { api } from './api';

/**
 * Préférence mascotte du compte connecté (`PUT /api/visit/mascot-preference`).
 *
 * Route **étroite** : elle n'écrit que `users.visit_mascot_catalog_id`, sans mot de passe
 * actuel — contrairement à l'édition complète du profil. C'est ce qui permet au sélecteur
 * de mascotte du plan d'enregistrer le choix dans le compte, donc de le rendre portable
 * d'un appareil à l'autre (et de ne pas le laisser sur une tablette partagée).
 *
 * @param {string} mascotId identifiant de mascotte ; vide efface la préférence.
 * @returns {Promise<string|null>} valeur retenue par le serveur (`null` si effacée).
 */
export async function saveVisitMascotPreference(mascotId) {
  const value = String(mascotId || '').trim();
  const res = await api('/api/visit/mascot-preference', 'PUT', {
    visit_mascot_catalog_id: value,
  });
  return res?.visit_mascot_catalog_id ?? null;
}
