/**
 * Fiche espèce complète (`GET /api/plants/:id`) — complète la liste allégée du catalogue.
 *
 * @param {(path: string, method?: string) => Promise<object>} apiFn client HTTP (ex. `api`)
 * @param {number|string} id identifiant de fiche
 * @returns {Promise<object>}
 */
export async function fetchPlantDetail(apiFn, id) {
  const plantId = Number(id);
  if (!Number.isInteger(plantId) || plantId <= 0) {
    throw new Error('Identifiant de fiche invalide');
  }
  return apiFn(`/api/plants/${plantId}`);
}
