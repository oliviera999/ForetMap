import { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api';

/**
 * Catalogue biodiversité pour la visite, y compris **sans session**.
 *
 * Côté élève / prof, le catalogue est déjà chargé par `App.jsx` et distribué par le
 * contexte de données : il n'y a rien à faire. En **visite invitée**, il n'y a pas de
 * contexte de données du tout, alors que `GET /api/plants` est une route publique — le
 * visiteur pouvait donc lire les textes d'un lieu sans jamais voir ses espèces.
 *
 * Chargement **à la demande** (`ensurePlantCatalog`, appelée à l'ouverture d'un lieu qui
 * porte des espèces) plutôt qu'à l'affichage de la carte : une visite où personne n'ouvre
 * de fiche ne télécharge pas le catalogue. Mémoïsation au niveau du module, comme
 * `useGlossaryLinkIndex` : plusieurs appels n'entraînent qu'une requête, et l'échec est
 * silencieux (pas d'espèce affichée, jamais d'écran cassé).
 */

/** @type {Array<object>|null} */
let cachedPlants = null;
/** @type {Promise<Array<object>>|null} */
let pendingLoad = null;

function loadPublicPlantCatalog() {
  if (cachedPlants) return Promise.resolve(cachedPlants);
  if (!pendingLoad) {
    pendingLoad = api('/api/plants')
      .then((rows) => {
        cachedPlants = Array.isArray(rows) ? rows : [];
        return cachedPlants;
      })
      .catch(() => [])
      .finally(() => {
        pendingLoad = null;
      });
  }
  return pendingLoad;
}

/** Réinitialise le cache mémoire (tests, ou rechargement forcé du catalogue). */
export function resetVisitPlantCatalogCache() {
  cachedPlants = null;
  pendingLoad = null;
}

/**
 * @param {Array<object>} [contextPlants] catalogue déjà fourni par le contexte de données.
 * @returns {{ plants: Array<object>, ensurePlantCatalog: () => void }}
 */
export function useVisitPlantCatalog(contextPlants) {
  const hasContextCatalog = Array.isArray(contextPlants) && contextPlants.length > 0;
  const [fetchedPlants, setFetchedPlants] = useState(() => cachedPlants || []);
  const [wanted, setWanted] = useState(false);

  const ensurePlantCatalog = useCallback(() => {
    setWanted(true);
  }, []);

  useEffect(() => {
    if (!wanted || hasContextCatalog) return undefined;
    let cancelled = false;
    loadPublicPlantCatalog().then((rows) => {
      if (!cancelled) setFetchedPlants(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [wanted, hasContextCatalog]);

  return {
    plants: hasContextCatalog ? contextPlants : fetchedPlants,
    ensurePlantCatalog,
  };
}
