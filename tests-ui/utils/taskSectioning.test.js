import { describe, test, expect } from 'vitest';
import {
  isTaskUrgentCategory,
  taskMatchesFilters,
  applyTaskFilters,
  projectMatchesMapChoice,
  filterProjectsByMapChoice,
  sortedVisibleProjects,
  partitionTasksByEffectiveStatus,
  studentUrgentDueTasks,
} from '../../src/utils/taskSectioning.js';

const BASE_FILTERS = { filterMap: 'all', activeMapId: 'foret' };

describe('isTaskUrgentCategory', () => {
  test('vrai uniquement pour importance_level=absolute (insensible casse/espaces)', () => {
    expect(isTaskUrgentCategory({ importance_level: 'absolute' })).toBe(true);
    expect(isTaskUrgentCategory({ importance_level: ' Absolute ' })).toBe(true);
    expect(isTaskUrgentCategory({ importance_level: 'high' })).toBe(false);
    expect(isTaskUrgentCategory({})).toBe(false);
    expect(isTaskUrgentCategory(null)).toBe(false);
  });
});

describe('taskMatchesFilters', () => {
  test('filtre carte : active garde la carte active et les tâches globales', () => {
    const filters = { filterMap: 'active', activeMapId: 'foret' };
    expect(taskMatchesFilters({ title: 'a', map_id: 'foret' }, filters)).toBe(true);
    expect(taskMatchesFilters({ title: 'a', map_id: null }, filters)).toBe(true);
    expect(taskMatchesFilters({ title: 'a', map_id: 'jardin' }, filters)).toBe(false);
  });

  test('filtre texte : titre ou description, insensible à la casse', () => {
    const t = { title: 'Planter un chêne', description: 'Près de la mare' };
    expect(taskMatchesFilters(t, { ...BASE_FILTERS, filterText: 'CHÊNE' })).toBe(true);
    expect(taskMatchesFilters(t, { ...BASE_FILTERS, filterText: 'mare' })).toBe(true);
    expect(taskMatchesFilters(t, { ...BASE_FILTERS, filterText: 'ruche' })).toBe(false);
  });

  test('filtre lieu : zone:id et marker:id', () => {
    const t = { title: 'a', zone_ids: ['z1'], marker_ids: ['m1'] };
    expect(taskMatchesFilters(t, { ...BASE_FILTERS, filterZone: 'zone:z1' })).toBe(true);
    expect(taskMatchesFilters(t, { ...BASE_FILTERS, filterZone: 'marker:m1' })).toBe(true);
    expect(taskMatchesFilters(t, { ...BASE_FILTERS, filterZone: 'zone:z9' })).toBe(false);
  });

  test('filtre statut : validated englobe project_validated, on_hold reste strict', () => {
    const validated = { title: 'a', status: 'available', project_status: 'validated' };
    expect(taskMatchesFilters(validated, { ...BASE_FILTERS, filterStatus: 'validated' })).toBe(
      true,
    );
    expect(
      taskMatchesFilters(
        { title: 'a', status: 'validated' },
        { ...BASE_FILTERS, filterStatus: 'validated' },
      ),
    ).toBe(true);
    expect(
      taskMatchesFilters(validated, { ...BASE_FILTERS, filterStatus: 'project_validated' }),
    ).toBe(true);
    const onHold = { title: 'a', status: 'on_hold' };
    expect(taskMatchesFilters(onHold, { ...BASE_FILTERS, filterStatus: 'on_hold' })).toBe(true);
    expect(taskMatchesFilters(onHold, { ...BASE_FILTERS, filterStatus: 'available' })).toBe(false);
    const projectCompleted = { title: 'a', status: 'available', project_status: 'completed' };
    expect(
      taskMatchesFilters(projectCompleted, { ...BASE_FILTERS, filterStatus: 'project_completed' }),
    ).toBe(true);
  });

  test('filtres projet et groupe', () => {
    const t = { title: 'a', project_id: 'p1', group_id: 7 };
    expect(taskMatchesFilters(t, { ...BASE_FILTERS, filterProject: 'p1' })).toBe(true);
    expect(taskMatchesFilters(t, { ...BASE_FILTERS, filterProject: 'p2' })).toBe(false);
    expect(taskMatchesFilters(t, { ...BASE_FILTERS, filterGroupId: '7' })).toBe(true);
    expect(taskMatchesFilters(t, { ...BASE_FILTERS, filterGroupId: '8' })).toBe(false);
  });

  test('catégorie urgent : urgent ne garde que absolute, non_urgent l’exclut', () => {
    const urgent = { title: 'a', importance_level: 'absolute' };
    const normal = { title: 'b', importance_level: 'high' };
    expect(taskMatchesFilters(urgent, { ...BASE_FILTERS, filterUrgentCategory: 'urgent' })).toBe(
      true,
    );
    expect(taskMatchesFilters(normal, { ...BASE_FILTERS, filterUrgentCategory: 'urgent' })).toBe(
      false,
    );
    expect(
      taskMatchesFilters(urgent, { ...BASE_FILTERS, filterUrgentCategory: 'non_urgent' }),
    ).toBe(false);
    expect(
      taskMatchesFilters(normal, { ...BASE_FILTERS, filterUrgentCategory: 'non_urgent' }),
    ).toBe(true);
  });

  test('applyTaskFilters conserve l’ordre d’origine', () => {
    const list = [
      { id: 1, title: 'mare nettoyage' },
      { id: 2, title: 'ruche' },
      { id: 3, title: 'mare comptage' },
    ];
    const out = applyTaskFilters(list, { ...BASE_FILTERS, filterText: 'mare' });
    expect(out.map((t) => t.id)).toEqual([1, 3]);
  });
});

describe('projets visibles selon le filtre carte', () => {
  const projects = [
    { id: 'p1', title: 'Verger', map_id: 'foret' },
    { id: 'p2', title: 'Abris', map_id: 'jardin' },
    { id: 'p3', title: 'Compost', map_id: 'foret' },
  ];

  test('projectMatchesMapChoice : all / active / id de carte', () => {
    expect(projectMatchesMapChoice(projects[1], 'all', 'foret')).toBe(true);
    expect(projectMatchesMapChoice(projects[1], 'active', 'foret')).toBe(false);
    expect(projectMatchesMapChoice(projects[1], 'jardin', 'foret')).toBe(true);
  });

  test('filterProjectsByMapChoice conserve l’ordre d’origine', () => {
    expect(filterProjectsByMapChoice(projects, 'active', 'foret').map((p) => p.id)).toEqual([
      'p1',
      'p3',
    ]);
    expect(filterProjectsByMapChoice(projects, 'all', 'foret')).toHaveLength(3);
  });

  test('sortedVisibleProjects trie par titre (fr) sans muter la source', () => {
    const out = sortedVisibleProjects(projects, 'active', 'foret');
    expect(out.map((p) => p.title)).toEqual(['Compost', 'Verger']);
    expect(projects.map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);
  });
});

describe('partitionTasksByEffectiveStatus', () => {
  test('répartit chaque tâche dans le seau de son statut effectif', () => {
    const list = [
      { id: 'a', status: 'available' },
      { id: 'b', status: 'in_progress' },
      { id: 'c', status: 'done' },
      { id: 'd', status: 'validated' },
      { id: 'e', status: 'proposed' },
      { id: 'f', status: 'on_hold' },
      { id: 'g', status: 'available', project_status: 'completed' },
      { id: 'h', status: 'available', project_status: 'validated' },
    ];
    const out = partitionTasksByEffectiveStatus(list);
    expect(out.available.map((t) => t.id)).toEqual(['a']);
    expect(out.inProgress.map((t) => t.id)).toEqual(['b']);
    expect(out.done.map((t) => t.id)).toEqual(['c']);
    expect(out.validated.map((t) => t.id)).toEqual(['d']);
    expect(out.proposed.map((t) => t.id)).toEqual(['e']);
    expect(out.onHold.map((t) => t.id)).toEqual(['f']);
    expect(out.projectCompletedTasks.map((t) => t.id)).toEqual(['g']);
    expect(out.projectValidatedTasks.map((t) => t.id)).toEqual(['h']);
  });
});

describe('studentUrgentDueTasks', () => {
  const inDays = (n) => new Date(Date.now() + n * 86400000).toISOString();

  test('garde les tâches actives dues entre J-2 et J+3, exclut le reste', () => {
    const keepSoon = { id: 'soon', status: 'available', due_date: inDays(2) };
    const keepLate = { id: 'late', status: 'in_progress', due_date: inDays(-1.5) };
    const tooFar = { id: 'far', status: 'available', due_date: inDays(6) };
    const tooOld = { id: 'old', status: 'available', due_date: inDays(-4) };
    const noDate = { id: 'nodate', status: 'available' };
    const doneTask = { id: 'done', status: 'done', due_date: inDays(1) };
    const onHold = { id: 'hold', status: 'on_hold', due_date: inDays(1) };
    const projectValidated = {
      id: 'pv',
      status: 'available',
      project_status: 'validated',
      due_date: inDays(1),
    };
    const out = studentUrgentDueTasks([
      keepSoon,
      keepLate,
      tooFar,
      tooOld,
      noDate,
      doneTask,
      onHold,
      projectValidated,
    ]);
    expect(out.map((t) => t.id).sort()).toEqual(['late', 'soon']);
  });

  test('trie par importance explicite puis date limite', () => {
    const absoluteLater = {
      id: 'abs',
      status: 'available',
      importance_level: 'absolute',
      due_date: inDays(3),
    };
    const plainSooner = { id: 'plain', status: 'available', due_date: inDays(1) };
    const out = studentUrgentDueTasks([plainSooner, absoluteLater]);
    expect(out.map((t) => t.id)).toEqual(['abs', 'plain']);
  });
});
