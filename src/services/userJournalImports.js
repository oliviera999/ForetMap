import { api } from './api';

/**
 * Références déjà importées dans le carnet — chargées **une fois pour tout l'écran**.
 *
 * `GET /api/user-journal/me/imports/refs` renvoie la liste complète des imports du compte :
 * la même réponse pour tous les appelants. Or chaque `FmLearnAndImportSlot` la demandait à
 * son propre montage, et le catalogue de biodiversité en affiche un par vignette — 78 espèces
 * font 78 requêtes identiques à chaque ouverture, exactement le symptôme que la garde de
 * charge `tests-ui/components/PlantCatalogTiles.test.jsx` existe pour empêcher
 * (`docs/AUDIT_CHARGE_BIODIVERSITE_2026-09.md`, §1).
 *
 * Ce module ramène l'écran à une requête : les appels concurrents partagent la promesse en
 * vol, et le résultat est réutilisé pendant un court TTL. Tout import réussi invalide
 * l'entrée, pour qu'un second écran ne parte pas sur une liste périmée.
 */

/** Garde-fou : le carnet bouge à la main, une fraîcheur de quelques secondes suffit. */
const TTL_MS = 30000;

let inFlight = null;
let cachedRefs = null;
let cachedAt = 0;

/** Oublie la liste mémorisée (après un import, ou à la déconnexion). */
export function invalidateImportedRefs() {
  inFlight = null;
  cachedRefs = null;
  cachedAt = 0;
}

/**
 * Liste des références importées, mutualisée entre tous les appelants.
 * @returns {Promise<Array<{resourceType: string, resourceRef: string}>>} vide en cas d'échec.
 */
export function loadImportedRefs({ now = () => Date.now() } = {}) {
  if (cachedRefs && now() - cachedAt < TTL_MS) return Promise.resolve(cachedRefs);
  if (inFlight) return inFlight;
  inFlight = Promise.resolve()
    .then(() => api('/api/user-journal/me/imports/refs'))
    .then((res) => {
      const refs = Array.isArray(res?.refs) ? res.refs : [];
      cachedRefs = refs;
      cachedAt = now();
      return refs;
    })
    .catch(() => [])
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/** Vrai si `(resourceType, resourceRef)` figure déjà dans le carnet. */
export function refsContain(refs, resourceType, resourceRef) {
  const ref = String(resourceRef ?? '');
  if (!resourceType || ref === '') return false;
  return (Array.isArray(refs) ? refs : []).some(
    (r) => r?.resourceType === resourceType && String(r?.resourceRef) === ref,
  );
}
