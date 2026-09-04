import {
  COMPACT_PANEL_QUERY,
  matchesCompactPanel,
  useCompactPanelState,
} from '../shared/hooks/useCompactPanelState.js';

/** En dessous de cette largeur, les filtres passent en feuille (bottom sheet). */
export const TASK_FILTERS_COMPACT_MQL = COMPACT_PANEL_QUERY;
const STORAGE_KEY = 'foretmap:tasks:filtersOpen';

/** Lecture synchrone de la media query (évite un flash de panneau ouvert au montage mobile). */
export function matchesTaskFiltersCompact() {
  return matchesCompactPanel(TASK_FILTERS_COMPACT_MQL);
}

/**
 * État du panneau de filtres de la vue Tâches — délègue au hook partagé
 * `useCompactPanelState` (kit d'interface, lot 3) :
 * - écran large : panneau inline, ouvert par défaut (comportement historique),
 *   repli mémorisé dans `localStorage` ;
 * - écran compact : feuille modale, toujours fermée à l'arrivée (l'ouverture est
 *   éphémère, jamais mémorisée) pour laisser les tâches visibles sans défiler.
 */
export function useTaskFiltersPanel() {
  return useCompactPanelState({ storageKey: STORAGE_KEY, wideDefaultOpen: true });
}
