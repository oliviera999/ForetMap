/**
 * Filtres métier / format de la vue Tâches et raccourci « ⚡ J'ai 15 minutes » (migration 329).
 *
 * État `{ categories: string[], formats: string[], quick: boolean }`, mémorisé pour la session
 * d'onglet (`sessionStorage`, toujours en try/catch : navigation privée, stockage bloqué).
 * Le raccourci retient les tâches Flash **disponibles pour l'élève** : à faire, places libres.
 */
import {
  QUICK_TASK_FORMAT,
  TASK_CATEGORY_KEYS,
  TASK_FORMAT_KEYS,
  categoryInfo,
  formatInfo,
} from '../shared/taskTaxonomyCore.js';

export const TASK_TAXONOMY_FILTERS_STORAGE_KEY = 'foretmap:tasks:taxonomyFilters';

export const EMPTY_TASK_TAXONOMY_FILTERS = Object.freeze({
  categories: Object.freeze([]),
  formats: Object.freeze([]),
  quick: false,
});

function sanitize(raw) {
  const categories = Array.isArray(raw?.categories)
    ? raw.categories.filter((k) => TASK_CATEGORY_KEYS.includes(k))
    : [];
  const formats = Array.isArray(raw?.formats)
    ? raw.formats.filter((k) => TASK_FORMAT_KEYS.includes(k))
    : [];
  return { categories, formats, quick: raw?.quick === true };
}

export function readTaskTaxonomyFilters() {
  try {
    const raw = globalThis.sessionStorage?.getItem(TASK_TAXONOMY_FILTERS_STORAGE_KEY);
    return raw ? sanitize(JSON.parse(raw)) : { ...EMPTY_TASK_TAXONOMY_FILTERS };
  } catch {
    return { ...EMPTY_TASK_TAXONOMY_FILTERS };
  }
}

export function writeTaskTaxonomyFilters(filters) {
  try {
    globalThis.sessionStorage?.setItem(
      TASK_TAXONOMY_FILTERS_STORAGE_KEY,
      JSON.stringify(sanitize(filters)),
    );
  } catch {
    /* stockage indisponible : filtre non mémorisé, sans conséquence */
  }
}

/** Ajoute ou retire une valeur d'une liste de filtre. */
export function toggleTaxonomyValue(list, value) {
  const current = Array.isArray(list) ? list : [];
  return current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
}

/** Tâche disponible pour un élève : statut « à faire » et places encore libres. */
export function isTaskOpenForStudent(task) {
  if (String(task?.status || '') !== 'available') return false;
  const required = Number(task?.required_students) || 1;
  const assigned = Number(task?.assigned_count ?? task?.assignees_total_count ?? 0) || 0;
  return assigned < required;
}

/** Une tâche passe-t-elle les filtres métier / format / raccourci ? */
export function taskMatchesTaxonomyFilters(task, filters) {
  const f = filters || EMPTY_TASK_TAXONOMY_FILTERS;
  if (f.categories?.length && !f.categories.includes(task?.category)) return false;
  if (f.formats?.length && !f.formats.includes(task?.format)) return false;
  if (f.quick && !(task?.format === QUICK_TASK_FORMAT && isTaskOpenForStudent(task))) {
    return false;
  }
  return true;
}

/** Chips des filtres actifs (barre de filtres). */
export function taxonomyFilterChips(filters) {
  const f = filters || EMPTY_TASK_TAXONOMY_FILTERS;
  const chips = [];
  if (f.quick) {
    chips.push({
      key: 'quick',
      label: '⚡ J’ai 15 minutes',
      removeLabel: 'Retirer le raccourci « J’ai 15 minutes »',
    });
  }
  if (f.categories?.length) {
    chips.push({
      key: 'category',
      label: `Métier : ${f.categories.map((k) => categoryInfo(k)?.label || k).join(', ')}`,
      removeLabel: 'Retirer le filtre métier',
    });
  }
  if (f.formats?.length) {
    chips.push({
      key: 'format',
      label: `Format : ${f.formats.map((k) => formatInfo(k)?.label || k).join(', ')}`,
      removeLabel: 'Retirer le filtre format',
    });
  }
  return chips;
}

/** Filtres après retrait d'une chip. */
export function clearTaxonomyFilter(filters, key) {
  const f = sanitize(filters);
  if (key === 'quick') return { ...f, quick: false };
  if (key === 'category') return { ...f, categories: [] };
  if (key === 'format') return { ...f, formats: [] };
  return f;
}
