export const DESKTOP_SPLIT_MIN_WIDTH = 1024;
export const DESKTOP_SPLIT_MIN_MAP_PX = 620;
export const DESKTOP_SPLIT_MIN_TASKS_PX = 420;
export const TAB_STORAGE_KEY = 'foretmap_active_tab';
/** Regroupe les rafraîchissements auto quand plusieurs états changent à la suite (réglages, carte, session). */
export const FETCH_ALL_AUTO_DEBOUNCE_MS = 250;
/** Durée max d’une passe fetchAll avant déblocage UI (loader + bannière serverDown). */
export const FETCH_ALL_MAX_WALL_MS = 90_000;
/** Plafond d’itérations de la boucle while (rafraîchissements concurrents). */
export const FETCH_ALL_MAX_LOOP_ITERATIONS = 8;

/**
 * @param {{ loopIterations: number, jobStartedAt: number, now?: number }} params
 * @returns {'iterations'|'wall'|null}
 */
export function getFetchAllLoopAbortReason({ loopIterations, jobStartedAt, now = Date.now() }) {
  if (loopIterations > FETCH_ALL_MAX_LOOP_ITERATIONS) return 'iterations';
  if (now - jobStartedAt > FETCH_ALL_MAX_WALL_MS) return 'wall';
  return null;
}
/** Intervalle de polling par défaut (rafraîchissement complet) — compromis charge serveur / fraîcheur des données. */
export const DATA_REFRESH_INTERVAL_MS = 60000;
/** Onglets où les tâches / carte changent rarement : on double l’intervalle quand le temps réel Socket.IO est inactif. */
export const POLLING_COARSE_TABS = new Set([
  'about',
  'settings',
  'audit',
  'profiles',
  'tuto',
  'stats',
  'forum',
  'notebook',
  'mascot_packs',
]);
export const IOS_INSTALL_HINT_DISMISSED_KEY = 'foretmap_ios_install_hint_dismissed';
export const GUEST_VISIT_MASCOT_CONFIRMED_KEY = 'foretmap_visit_guest_mascot_confirmed_v1';
export const DEFAULT_VISIT_MASCOT_ALLOWED_IDS = [
  'sprout-rive',
  'scrap-rive',
  'gnome-foret-rive',
  'gnome-ambre-rive',
  'gnome-punk-rive',
  'spore-rive',
  'vine-rive',
  'moss-rive',
  'seed-rive',
  'swarm-rive',
  'sprite-template',
  'olu-spritesheet',
  'tan-bird-spritesheet',
  'fox-backpack-spritesheet',
  'renard2-cut-spritesheet',
];
export const KNOWN_TAB_VALUES = new Set([
  'map',
  'maptasks',
  'tasks',
  'plants',
  'tuto',
  'stats',
  'visit',
  'mascot_packs',
  'notebook',
  'profiles',
  'settings',
  'forum',
  'audit',
  'about',
  'glossary',
  'quiz',
  'foodweb',
]);
