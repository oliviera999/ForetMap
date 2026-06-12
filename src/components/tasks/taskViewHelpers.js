/** Actions de changement de statut côté n3boss (partagé TasksView / TaskTileCard). */
export const TEACHER_STATUS_ACTIONS = [
  { value: 'in_progress', label: 'En cours', icon: '⚙️' },
  { value: 'available', label: 'À faire', icon: '🔥' },
  { value: 'done', label: 'Terminée', icon: '✅' },
  { value: 'validated', label: 'Validée', icon: '✔️' },
  { value: 'proposed', label: 'Proposée', icon: '💡' },
  { value: 'on_hold', label: 'En attente', icon: '⏸️' },
];

/** Options du filtre de statut (liste des tâches). */
export const TASK_STATUS_FILTER_OPTIONS = [
  { value: 'in_progress', label: 'En cours' },
  { value: 'available', label: 'À faire' },
  { value: 'done', label: 'Terminée' },
  { value: 'validated', label: 'Validée' },
  { value: 'proposed', label: 'Proposée' },
  { value: 'on_hold', label: 'En attente' },
  { value: 'project_completed', label: 'Projet terminé (auto)' },
  { value: 'project_validated', label: 'Projet validé' },
];
