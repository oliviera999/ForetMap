/**
 * Garde-fou : une tâche « Urgent ! » liée à un projet doit rester dans le regroupement
 * du bloc projets. L'encart Urgent retire ces tâches des sections de statut, pas de la
 * case projet (`tasks-views.jsx` passe `allFiltered` à `groupProjectTasksById`).
 */
import { describe, test, expect } from 'vitest';
import {
  groupProjectTasksById,
  computeStepInfoByTaskId,
} from '../../src/utils/taskProjectSteps.js';
import { isTaskUrgentPending, applyTaskFilters } from '../../src/utils/taskSectioning.js';

describe('tâches Urgent ! dans le bloc projet', () => {
  const projectId = 'proj-1';
  const normal = {
    id: 't-normal',
    title: 'Semer',
    project_id: projectId,
    map_id_resolved: 'foret',
    status: 'available',
    importance_level: 'high',
  };
  const urgent = {
    id: 't-urgent',
    title: 'Arroser tout de suite',
    project_id: projectId,
    map_id_resolved: 'foret',
    status: 'available',
    importance_level: 'absolute',
  };

  test('isTaskUrgentPending reconnaît l’importance absolute', () => {
    expect(isTaskUrgentPending(urgent)).toBe(true);
    expect(isTaskUrgentPending(normal)).toBe(false);
  });

  test('le regroupement projet conserve les tâches urgentes filtrées', () => {
    const filtered = applyTaskFilters([normal, urgent], {
      filterMap: 'active',
      activeMapId: 'foret',
    });
    const withoutUrgent = filtered.filter((t) => !isTaskUrgentPending(t));
    const stepInfo = computeStepInfoByTaskId(filtered);

    // Ancien comportement bugué : source = withoutUrgent → case projet vide si seule urgente.
    expect(
      groupProjectTasksById(withoutUrgent, stepInfo)
        .get(projectId)
        ?.map((t) => t.id),
    ).toEqual(['t-normal']);

    // Comportement attendu : source = filtered (avec urgentes).
    expect(
      groupProjectTasksById(filtered, stepInfo)
        .get(projectId)
        ?.map((t) => t.id),
    ).toEqual(['t-normal', 't-urgent']);
  });

  test('une seule tâche urgente du projet reste visible dans la case', () => {
    const filtered = applyTaskFilters([urgent], {
      filterMap: 'active',
      activeMapId: 'foret',
    });
    const byId = groupProjectTasksById(filtered, computeStepInfoByTaskId(filtered));
    expect(byId.get(projectId)?.map((t) => t.id)).toEqual(['t-urgent']);
  });
});
