import { describe, test, expect } from 'vitest';
import {
  computeTaskVisualByLocation,
  computeTutorialCountByLocation,
} from '../../src/utils/mapLocationBadges.js';

describe('computeTaskVisualByLocation', () => {
  test('liste vide ou absente → maps vides', () => {
    const a = computeTaskVisualByLocation([]);
    expect(a.zoneTaskVisualById.size).toBe(0);
    expect(a.markerTaskVisualById.size).toBe(0);
    const b = computeTaskVisualByLocation(undefined);
    expect(b.zoneTaskVisualById.size).toBe(0);
    expect(b.markerTaskVisualById.size).toBe(0);
  });

  test('associe le statut visuel aux zones et repères de la tâche', () => {
    const tasks = [
      { id: 1, status: 'available', zone_ids: ['z1'], marker_ids: ['m1'] },
      { id: 2, status: 'in_progress', zone_ids: ['z2'] },
    ];
    const { zoneTaskVisualById, markerTaskVisualById } = computeTaskVisualByLocation(tasks);
    expect(zoneTaskVisualById.get('z1')).toBe('todo');
    expect(markerTaskVisualById.get('m1')).toBe('todo');
    expect(zoneTaskVisualById.get('z2')).toBe('progress');
  });

  test('ignore les tâches détachées de leur lieu (done/validated)', () => {
    const tasks = [
      { id: 1, status: 'done', zone_ids: ['z1'] },
      { id: 2, status: 'validated', marker_ids: ['m1'] },
    ];
    const { zoneTaskVisualById, markerTaskVisualById } = computeTaskVisualByLocation(tasks);
    expect(zoneTaskVisualById.size).toBe(0);
    expect(markerTaskVisualById.size).toBe(0);
  });

  test('fusionne les statuts d’un même lieu selon la priorité visuelle (todo > progress)', () => {
    const tasks = [
      { id: 1, status: 'in_progress', zone_ids: ['z1'] },
      { id: 2, status: 'available', zone_ids: ['z1'] },
    ];
    const { zoneTaskVisualById } = computeTaskVisualByLocation(tasks);
    // todo (3) prioritaire sur progress (2) : on met en avant la tâche la plus actionnable.
    expect(zoneTaskVisualById.get('z1')).toBe('todo');
  });

  test('prend en compte les champs legacy zone_id/marker_id', () => {
    const tasks = [{ id: 1, status: 'available', zone_id: 'zL', marker_id: 'mL' }];
    const { zoneTaskVisualById, markerTaskVisualById } = computeTaskVisualByLocation(tasks);
    expect(zoneTaskVisualById.get('zL')).toBe('todo');
    expect(markerTaskVisualById.get('mL')).toBe('todo');
  });
});

describe('computeTutorialCountByLocation', () => {
  const ZONES = [
    { id: 'z1', map_id: 'foret' },
    { id: 'z2', map_id: 'jardin' },
  ];
  const MARKERS = [
    { id: 'm1', map_id: 'foret' },
    { id: 'm2', map_id: 'jardin' },
  ];
  const base = { zones: ZONES, markers: MARKERS, activeMapId: 'foret' };

  test('compte les liens directs des tutoriels actifs sur la carte active', () => {
    const tutorials = [
      { id: 1, zone_ids: ['z1'], marker_ids: ['m1'] },
      { id: 2, zone_ids: ['z1'], marker_ids: [] },
      { id: 3, is_active: false, zone_ids: ['z1'], marker_ids: ['m1'] },
    ];
    const { zoneTutorialCountById, markerTutorialCountById } = computeTutorialCountByLocation({
      ...base, tutorials, tasks: [],
    });
    expect(zoneTutorialCountById.get('z1')).toBe(2);
    expect(markerTutorialCountById.get('m1')).toBe(1);
  });

  test('ignore les lieux hors carte active', () => {
    const tutorials = [{ id: 1, zone_ids: ['z2'], marker_ids: ['m2'] }];
    const { zoneTutorialCountById, markerTutorialCountById } = computeTutorialCountByLocation({
      ...base, tutorials, tasks: [],
    });
    expect(zoneTutorialCountById.size).toBe(0);
    expect(markerTutorialCountById.size).toBe(0);
  });

  test('ajoute les liens hérités des tâches sans recompter un lien direct', () => {
    const tutorials = [{ id: 7, zone_ids: ['z1'], marker_ids: [] }];
    const tasks = [
      // z1 est déjà un lien direct du tutoriel 7 → pas de double compte ;
      // m1 est hérité via la tâche → +1.
      { id: 1, status: 'todo', zone_ids: ['z1'], marker_ids: ['m1'], tutorial_ids: [7] },
    ];
    const { zoneTutorialCountById, markerTutorialCountById } = computeTutorialCountByLocation({
      ...base, tutorials, tasks,
    });
    expect(zoneTutorialCountById.get('z1')).toBe(1);
    expect(markerTutorialCountById.get('m1')).toBe(1);
  });

  test('dédoublonne la paire lieu/tutoriel sur plusieurs tâches', () => {
    const tutorials = [{ id: 7, zone_ids: [], marker_ids: [] }];
    const tasks = [
      { id: 1, status: 'todo', zone_ids: ['z1'], tutorial_ids: [7] },
      { id: 2, status: 'todo', zone_ids: ['z1'], tutorial_ids: [7] },
    ];
    const { zoneTutorialCountById } = computeTutorialCountByLocation({ ...base, tutorials, tasks });
    expect(zoneTutorialCountById.get('z1')).toBe(1);
  });

  test('ignore les tâches détachées et les tutoriels inactifs hérités', () => {
    const tutorials = [
      { id: 7, zone_ids: [], marker_ids: [] },
      { id: 8, is_active: false, zone_ids: [], marker_ids: [] },
    ];
    const tasks = [
      { id: 1, status: 'done', zone_ids: ['z1'], tutorial_ids: [7] },
      { id: 2, status: 'todo', zone_ids: ['z1'], tutorial_ids: [8] },
    ];
    const { zoneTutorialCountById } = computeTutorialCountByLocation({ ...base, tutorials, tasks });
    expect(zoneTutorialCountById.size).toBe(0);
  });

  test('utilise tutorials_linked quand présent sur la tâche', () => {
    const tasks = [
      { id: 1, status: 'todo', zone_ids: ['z1'], tutorials_linked: [{ id: 9, zone_ids: [], marker_ids: [] }] },
    ];
    const { zoneTutorialCountById } = computeTutorialCountByLocation({ ...base, tutorials: [], tasks });
    expect(zoneTutorialCountById.get('z1')).toBe(1);
  });
});
