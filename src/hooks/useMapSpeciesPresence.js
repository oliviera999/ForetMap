import { useEffect, useMemo, useState } from 'react';
import { fetchMapSpeciesPresence } from '../services/biodivApi';
import { indexSpeciesPresence } from '../utils/speciesPresence';
import { keepPrevIfEqual } from '../utils/stableCollection';

/**
 * Identité stable d'un objet (tableau de données du `DataContext`) : la même référence
 * donne le même numéro. `useAppDataSync` conserve la référence tant que le contenu ne
 * change pas (`keepPrevIfEqual`) : un nouveau numéro signale donc un vrai rechargement.
 *
 * Un tableau **vide** a toujours le même jeton : `const { zones = [] } = useData()` hors
 * `DataProvider` fabrique un tableau neuf à chaque rendu, qui ne doit pas relancer la requête.
 */
const objectIds = new WeakMap();
let nextObjectId = 1;
function identityOf(value) {
  if (!value || typeof value !== 'object') return String(value ?? '');
  if (Array.isArray(value) && value.length === 0) return 'vide';
  if (!objectIds.has(value)) {
    objectIds.set(value, nextObjectId);
    nextObjectId += 1;
  }
  return String(objectIds.get(value));
}

const EMPTY_STATE = Object.freeze({ mapId: '', status: 'idle', species: null, summary: null });

/**
 * Espèces présentes sur une carte selon le serveur (définition commune, décision Q10).
 *
 * @param {string|null|undefined} mapId carte active
 * @param {object} [opts]
 * @param {Array<unknown>} [opts.watch] données dont un rechargement doit rafraîchir la
 *   présence (zones, repères, fiches du `DataContext`) — comparées par référence
 * @param {boolean} [opts.enabled] `false` : aucune requête
 * @param {Array<object>|null} [opts.species] présence déjà fournie par l'écran (contenu de
 *   visite) : utilisée telle quelle, sans requête
 * @returns {{ status: 'idle'|'loading'|'ready'|'error', species: Array<object>|null,
 *   summary: object|null, byPlantId: Map<number, object>|null }}
 *   `byPlantId === null` tant que la présence de **cette** carte est inconnue
 */
export function useMapSpeciesPresence(mapId, { watch = [], enabled = true, species = null } = {}) {
  const provided = Array.isArray(species);
  const id = String(mapId || '').trim();
  const revision = (Array.isArray(watch) ? watch : []).map(identityOf).join('.');
  const [state, setState] = useState(EMPTY_STATE);

  useEffect(() => {
    if (provided || !enabled || !id) return undefined;
    let cancelled = false;
    // Même carte : on garde la liste précédente le temps du rechargement (pas de clignotement
    // du filtre), sans nouveau rendu. Autre carte : la liste précédente ne vaut rien ici.
    setState((prev) => {
      if (prev.mapId !== id) return { mapId: id, status: 'loading', species: null, summary: null };
      if (prev.status === 'ready' || prev.status === 'loading') return prev;
      return { ...prev, status: 'loading' };
    });
    fetchMapSpeciesPresence(id, { revision }).then(
      (data) => {
        if (cancelled) return;
        const nextSpecies = Array.isArray(data?.species) ? data.species : [];
        // Réponse identique à la précédente : même état, aucun rendu (le catalogue ne se
        // recalcule pas pour rien à chaque rechargement des données).
        setState((prev) => {
          const kept = prev.mapId === id ? keepPrevIfEqual(prev.species, nextSpecies) : nextSpecies;
          if (prev.mapId === id && prev.status === 'ready' && kept === prev.species) return prev;
          return { mapId: id, status: 'ready', species: kept, summary: data?.summary || null };
        });
      },
      () => {
        if (cancelled) return;
        setState((prev) => (prev.mapId === id ? { ...prev, status: 'error' } : prev));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [provided, enabled, id, revision]);

  const effectiveSpecies = provided ? species : state.mapId === id ? state.species : null;
  const byPlantId = useMemo(() => indexSpeciesPresence(effectiveSpecies), [effectiveSpecies]);

  if (provided) return { status: 'ready', species, summary: null, byPlantId };
  if (!enabled || !id) return { status: 'idle', species: null, summary: null, byPlantId: null };
  return {
    status: state.mapId === id ? state.status : 'loading',
    species: effectiveSpecies,
    summary: state.mapId === id ? state.summary : null,
    byPlantId,
  };
}
