import { useCompactPanelState } from '../shared/hooks/useCompactPanelState.js';

const STORAGE_KEY = 'foretmap:map:locationFiltersOpen';

/**
 * Panneau filtres carte : inline (large, fermé par défaut) ou feuille (compact), comme les
 * tâches — délègue au hook partagé `useCompactPanelState` (kit d'interface, lot 3).
 */
export function useMapLocationFiltersPanel() {
  return useCompactPanelState({ storageKey: STORAGE_KEY, wideDefaultOpen: false });
}
