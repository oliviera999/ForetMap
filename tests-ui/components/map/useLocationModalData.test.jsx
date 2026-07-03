import { describe, test, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useLocationModalData } from '../../../src/components/map/useLocationModalData.js';

const ZONE = { id: 'z1', map_id: 'map1', living_beings_list: ['Pommier'] };
const MARKER = { id: 'm1', map_id: 'map1', living_beings_list: ['Menthe'] };

const TASKS = [
  { id: 1, title: 'Tâche zone', zone_ids: ['z1'], status: 'open' },
  { id: 2, title: 'Tâche repère', marker_ids: ['m1'], status: 'open' },
  { id: 3, title: 'Tâche validée', zone_ids: ['z1'], status: 'validated' },
  { id: 4, title: 'Tâche autre carte', map_id_resolved: 'map2', status: 'open' },
  { id: 5, title: 'Tâche liable', map_id_resolved: 'map1', status: 'open' },
];

const TUTORIALS = [
  { id: 10, title: 'Tuto direct zone', zone_ids: ['z1'], is_active: true },
  { id: 11, title: 'Tuto archivé zone', zone_ids: ['z1'], is_active: false },
  { id: 12, title: 'Tuto liable', zone_ids: [], marker_ids: [], is_active: true },
];

function renderData(kind, entity, ctx = {}) {
  return renderHook(({ kind: k, entity: e, ctx: c }) => useLocationModalData(k, e, c), {
    initialProps: { kind, entity, ctx: { tasks: TASKS, tutorials: TUTORIALS, ...ctx } },
  });
}

describe('useLocationModalData', () => {
  test('zone : tâches liées par zone_ids, tâches détachées (validées) exclues', () => {
    const { result } = renderData('zone', ZONE, { isTeacher: true });
    expect(result.current.linkedTasks.map((t) => t.id)).toEqual([1]);
  });

  test('marker : tâches liées par marker_ids', () => {
    const { result } = renderData('marker', MARKER, { isTeacher: true });
    expect(result.current.linkedTasks.map((t) => t.id)).toEqual([2]);
  });

  test('assignableTasks : exclut liées, détachées et autres cartes ; garde même carte / sans carte', () => {
    const { result } = renderData('zone', ZONE, { isTeacher: true });
    expect(result.current.assignableTasks.map((t) => t.id)).toEqual([2, 5]);
  });

  test('tutoriels : prof voit tout, élève ne voit pas les archivés', () => {
    const teacher = renderData('zone', ZONE, { isTeacher: true });
    expect(teacher.result.current.linkedTutorialsVisible.map((t) => t.id)).toEqual([10, 11]);
    const student = renderData('zone', ZONE, { isTeacher: false, student: { id: 9 } });
    expect(student.result.current.linkedTutorialsVisible.map((t) => t.id)).toEqual([10]);
  });

  test('assignableTutorials : exclut archivés et déjà liés au lieu', () => {
    const { result } = renderData('zone', ZONE, { isTeacher: true });
    expect(result.current.assignableTutorials.map((t) => t.id)).toEqual([12]);
  });

  test('livingNames : repli sur le champ plante legacy du type de lieu (current_plant vs plant_name)', () => {
    const zone = renderData(
      'zone',
      { id: 'z1', map_id: 'map1', current_plant: 'Sauge' },
      { isTeacher: true },
    );
    expect(zone.result.current.livingNames).toEqual(['Sauge']);
    const marker = renderData(
      'marker',
      { id: 'm1', map_id: 'map1', plant_name: 'Thym' },
      { isTeacher: true },
    );
    expect(marker.result.current.livingNames).toEqual(['Thym']);
  });

  test('zone spéciale : pas de section Biodiversité (visitAsideSpecies false)', () => {
    const { result } = renderData('zone', { ...ZONE, special: 1 }, { isTeacher: true });
    expect(result.current.visitAsideSpecies).toBe(false);
    expect(result.current.showVisitAsideBlock).toBe(true); // tutoriels liés restent affichés
  });

  test('repère en création (isNew) : onglets et bloc visite masqués', () => {
    const { result } = renderData('marker', MARKER, { isTeacher: true, isNew: true });
    expect(result.current.showTasksTab).toBe(false);
    expect(result.current.showTutorialsTab).toBe(false);
    expect(result.current.showVisitAsideBlock).toBe(false);
    expect(result.current.visitAsideSpecies).toBe(false);
  });

  test('onglet Tâches : élève seulement si tâches liées, jamais pour visiteur sans compte', () => {
    const student = renderData('zone', ZONE, { isTeacher: false, student: { id: 9 } });
    expect(student.result.current.showTasksTab).toBe(true);
    const anon = renderData('zone', ZONE, { isTeacher: false, student: null });
    expect(anon.result.current.showTasksTab).toBe(false);
  });

  test('références stables entre rendus (anti-boucle P0) : linkedTasks et studentAssignableTasks', () => {
    const student = { id: 9 };
    const { result, rerender } = renderHook((props) => useLocationModalData('zone', ZONE, props), {
      initialProps: { tasks: TASKS, tutorials: TUTORIALS, student, isTeacher: false },
    });
    const firstLinked = result.current.linkedTasks;
    const firstAssignable = result.current.studentAssignableTasks;
    rerender({ tasks: TASKS, tutorials: TUTORIALS, student, isTeacher: false });
    expect(result.current.linkedTasks).toBe(firstLinked);
    expect(result.current.studentAssignableTasks).toBe(firstAssignable);
  });
});
