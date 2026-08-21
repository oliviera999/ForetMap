import { useCallback } from 'react';

import { useGuidedTour } from '../shared/hooks/useGuidedTour.js';
import { getDiscoverySteps } from '../constants/discoveryTour.js';

/**
 * Visite guidée **ForetMap** : le moteur est partagé (`useGuidedTour`), ce module ne
 * fournit que le registre du produit et sa clé de mémoire.
 *
 * La version (`_v1`) du suffixe de clé permet de relancer l'onboarding pour tous
 * après une refonte majeure des parcours.
 */
const SEEN_STORAGE_KEY = 'foretmap_discovery_seen_v1';

export function useDiscoveryTour({ isTeacher = false, tourOverrides = null } = {}) {
  const getSteps = useCallback(
    (tabKey) => getDiscoverySteps(tabKey, isTeacher, tourOverrides),
    [isTeacher, tourOverrides],
  );
  return useGuidedTour({ getSteps, storageKey: SEEN_STORAGE_KEY });
}
