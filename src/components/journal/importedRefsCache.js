import { api } from '../../services/api';

/**
 * Liste des refs déjà importées dans le carnet — **une seule requête pour toute la page**.
 *
 * `/api/user-journal/me/imports/refs` renvoie la liste complète des imports de l'utilisateur.
 * Chaque `FmLearnAndImportSlot` la demandait pour son propre compte, afin d'y chercher une
 * seule entrée : autant de requêtes identiques que de vignettes affichées. Sur le catalogue
 * de biodiversité, 78 espèces = 78 appels au même endpoint, à chaque ouverture — exactement
 * la classe de défaut que décrit `docs/AUDIT_CHARGE_BIODIVERSITE_2026-09.md`, et que la garde
 * `tests-ui/components/PlantCatalogTiles.test.jsx` est censée retenir.
 *
 * Ici, les montants simultanés partagent **la même promesse**. Le résultat est mémorisé
 * jusqu'à ce qu'un import le périme : la liste ne change que de notre fait.
 */
let pending = null;
let cached = null;

/**
 * Refs importées, éventuellement servies depuis le cache de page.
 * @returns {Promise<Array<{ resourceType: string, resourceRef: string }>>}
 */
export function getImportedRefs() {
  if (cached) return Promise.resolve(cached);
  if (!pending) {
    pending = Promise.resolve()
      .then(() => api('/api/user-journal/me/imports/refs'))
      .then((res) => {
        cached = Array.isArray(res?.refs) ? res.refs : [];
        return cached;
      })
      .catch((err) => {
        // Un échec ne doit pas se figer en cache : la prochaine vignette réessaiera.
        throw err;
      })
      .finally(() => {
        pending = null;
      });
  }
  return pending;
}

/** À appeler après un import : la liste mémorisée n'est plus à jour. */
export function invalidateImportedRefs() {
  cached = null;
  pending = null;
}

/** Remise à zéro complète — réservée aux tests. */
export function resetImportedRefsCache() {
  invalidateImportedRefs();
}
