import { TASK_STATUS_FILTER_OPTIONS } from '../components/tasks/taskViewHelpers.js';

/**
 * Résumé des filtres actifs de la vue Tâches (barre compacte mobile) : liste de
 * « chips » supprimables décrivant chaque filtre posé. La recherche texte n'y
 * figure pas — son champ reste visible en permanence dans la barre.
 * Fonctions pures : testables sans rendu React.
 */

/** Libellés du filtre « catégorie urgent » (identiques aux options du select). */
export const TASK_URGENT_CATEGORY_LABELS = {
  urgent: 'Urgent ! uniquement',
  non_urgent: 'Hors urgent',
};

/** Libellé lisible d'un statut, y compris la vue « Archivés » réservée au n3boss. */
export function taskStatusFilterLabel(value) {
  if (!value) return '';
  if (value === 'archived') return '📦 Archivés';
  const opt = TASK_STATUS_FILTER_OPTIONS.find((o) => o.value === value);
  return opt ? opt.label : String(value);
}

/** Libellé lisible du filtre lieu (`zone:<id>` ou `marker:<id>`). */
export function taskLocationFilterLabel(filterZone, zones = [], markers = []) {
  const raw = String(filterZone || '');
  if (!raw) return '';
  const colon = raw.indexOf(':');
  if (colon <= 0) return raw;
  const kind = raw.slice(0, colon);
  const id = raw.slice(colon + 1);
  if (kind === 'zone') {
    const zone = zones.find((z) => String(z.id) === id);
    return zone ? zone.name : id;
  }
  if (kind === 'marker') {
    const marker = markers.find((m) => String(m.id) === id);
    if (!marker) return `📍 ${id}`;
    return `${marker.emoji ? `${marker.emoji} ` : '📍 '}${marker.label}`;
  }
  return raw;
}

/** Libellé du filtre carte (`'active'` = valeur par défaut, jamais affichée en chip). */
function mapFilterLabel(filterMap, maps = []) {
  if (filterMap === 'all') return 'Toutes cartes';
  const map = maps.find((m) => String(m.id) === String(filterMap));
  return map ? map.label : String(filterMap);
}

/**
 * Liste des filtres actifs sous forme de chips.
 * @returns {Array<{key:string,label:string,removeLabel:string}>}
 */
export function activeTaskFilterChips({
  filterMap = 'active',
  maps = [],
  filterZone = '',
  zones = [],
  markers = [],
  filterProject = '',
  taskProjects = [],
  isTeacher = false,
  filterGroupId = '',
  groupOptions = [],
  filterUrgentCategory = '',
  filterStatus = '',
} = {}) {
  const chips = [];
  if (filterMap && filterMap !== 'active') {
    chips.push({
      key: 'map',
      label: `Carte : ${mapFilterLabel(filterMap, maps)}`,
      removeLabel: 'Retirer le filtre carte',
    });
  }
  if (filterZone) {
    chips.push({
      key: 'zone',
      label: `Lieu : ${taskLocationFilterLabel(filterZone, zones, markers)}`,
      removeLabel: 'Retirer le filtre lieu',
    });
  }
  if (filterProject) {
    const project = taskProjects.find((p) => String(p.id) === String(filterProject));
    chips.push({
      key: 'project',
      label: `Projet : ${project ? project.title : filterProject}`,
      removeLabel: 'Retirer le filtre projet',
    });
  }
  if (isTeacher && filterGroupId) {
    const group = groupOptions.find((g) => String(g.id) === String(filterGroupId));
    chips.push({
      key: 'group',
      label: `Groupe : ${group ? group.name : filterGroupId}`,
      removeLabel: 'Retirer le filtre groupe',
    });
  }
  if (filterUrgentCategory) {
    chips.push({
      key: 'urgent',
      label: TASK_URGENT_CATEGORY_LABELS[filterUrgentCategory] || filterUrgentCategory,
      removeLabel: 'Retirer le filtre urgence',
    });
  }
  if (filterStatus) {
    chips.push({
      key: 'status',
      label: `Statut : ${taskStatusFilterLabel(filterStatus)}`,
      removeLabel: 'Retirer le filtre statut',
    });
  }
  return chips;
}

/** Nombre de filtres actifs (badge du bouton « Filtres »). */
export function countActiveTaskFilters(params) {
  return activeTaskFilterChips(params).length;
}
