import { enumOptions } from '../../shared/enums/enumCore.js';
import { TASK_STATUS_ENUM } from '../../shared/enums/taskEnums.js';

/**
 * Actions de changement de statut côté n3boss (partagé TasksView / TaskTileCard) : ordre
 * d'affichage propre, valeurs et libellés du référentiel partagé des ENUM.
 */
export const TEACHER_STATUS_ACTIONS = enumOptions(TASK_STATUS_ENUM, [
  'in_progress',
  'available',
  'done',
  'validated',
  'proposed',
  'on_hold',
]);

/** Options du filtre de statut (liste des tâches). */
export const TASK_STATUS_FILTER_OPTIONS = [
  { value: 'in_progress', label: 'En cours' },
  { value: 'available', label: 'À faire' },
  { value: 'done', label: 'Terminée (à valider)' },
  { value: 'overdue', label: 'En retard' },
  { value: 'validated', label: 'Validée' },
  { value: 'proposed', label: 'Proposée' },
  { value: 'on_hold', label: 'En attente' },
  { value: 'project_completed', label: 'Projet terminé (auto)' },
  { value: 'project_validated', label: 'Projet validé' },
];
