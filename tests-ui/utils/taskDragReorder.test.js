import { describe, test, expect } from 'vitest';
import { computeReorderedProjectTaskIds } from '../../src/utils/taskDragReorder.js';

const TASKS = [
  { id: 'a', project_id: 'p1' },
  { id: 'b', project_id: 'p1' },
  { id: 'c', project_id: 'p1' },
  { id: 'x', project_id: 'p2' },
  { id: 'z', project_id: '' },
];

describe('computeReorderedProjectTaskIds', () => {
  test('sans beforeTaskId : la tâche glissée arrive en fin de projet cible', () => {
    expect(computeReorderedProjectTaskIds(TASKS, 'x', 'p1')).toEqual(['a', 'b', 'c', 'x']);
  });

  test('avec beforeTaskId : insertion juste avant la tâche cible', () => {
    expect(computeReorderedProjectTaskIds(TASKS, 'x', 'p1', 'b')).toEqual(['a', 'x', 'b', 'c']);
  });

  test('réordonnancement au sein du même projet : la tâche est déplacée, pas dupliquée', () => {
    expect(computeReorderedProjectTaskIds(TASKS, 'c', 'p1', 'a')).toEqual(['c', 'a', 'b']);
  });

  test('beforeTaskId introuvable dans le projet → insertion en fin', () => {
    expect(computeReorderedProjectTaskIds(TASKS, 'z', 'p1', 'x')).toEqual(['a', 'b', 'c', 'z']);
  });

  test('ids numériques tolérés (normalisation en strings) et liste absente', () => {
    const tasks = [
      { id: 1, project_id: 9 },
      { id: 2, project_id: 9 },
    ];
    expect(computeReorderedProjectTaskIds(tasks, '2', '9', '1')).toEqual(['2', '1']);
    expect(computeReorderedProjectTaskIds(null, 't', 'p1')).toEqual(['t']);
  });
});
