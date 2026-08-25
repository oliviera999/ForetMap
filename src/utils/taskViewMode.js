/**
 * Mode d'affichage de la liste des tâches (`tiles` / `list` / `condensed`).
 * Le mode retenu est mémorisé par l'utilisateur ; en l'absence de préférence,
 * les écrans compacts démarrent en « condensé » (≈ 48 px par tâche au lieu de
 * ~180 px) pour que des tâches restent visibles sans défiler.
 */

export const TASK_VIEW_MODES = ['tiles', 'list', 'condensed'];

/** Largeur en dessous de laquelle le mode condensé est proposé par défaut. */
export const TASK_VIEW_COMPACT_MQL = '(max-width: 640px)';

/** Normalise une valeur stockée ; `null` si elle n'est pas exploitable. */
export function normalizeTaskViewMode(value) {
  const raw = String(value || '').trim();
  return TASK_VIEW_MODES.includes(raw) ? raw : null;
}

/** Mode par défaut selon la taille d'écran (sans préférence utilisateur). */
export function defaultTaskViewMode(matchMediaFn = null) {
  const matcher =
    matchMediaFn ||
    (typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? (q) => window.matchMedia(q)
      : null);
  if (!matcher) return 'tiles';
  try {
    return matcher(TASK_VIEW_COMPACT_MQL)?.matches ? 'condensed' : 'tiles';
  } catch {
    return 'tiles';
  }
}

/** Mode initial : préférence mémorisée si valide, sinon défaut lié à l'écran. */
export function resolveInitialTaskViewMode(storedValue, matchMediaFn = null) {
  return normalizeTaskViewMode(storedValue) || defaultTaskViewMode(matchMediaFn);
}
