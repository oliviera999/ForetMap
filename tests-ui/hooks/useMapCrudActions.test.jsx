// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import useMapCrudActions from '../../src/hooks/useMapCrudActions.js';
import { api } from '../../src/services/api';

vi.mock('../../src/services/api', () => ({ api: vi.fn(() => Promise.resolve({ id: 99 })) }));

const TASK = { id: 5, zone_ids: [1], marker_ids: [10] };
const TUTORIAL = { id: 3, zone_ids: [1], marker_ids: [10] };

function setup(over = {}) {
  const onRefresh = vi.fn(() => Promise.resolve());
  const { result, rerender } = renderHook(() =>
    useMapCrudActions({
      activeMapId: 'map-1',
      tasks: [TASK],
      tutorials: [TUTORIAL],
      onRefresh,
      student: { id: 42, first_name: 'Ana', last_name: 'B' },
      canEnrollNewTasks: true,
      ...over,
    }),
  );
  return { result, rerender, onRefresh };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('useMapCrudActions', () => {
  it('saveMarker poste avec map_id par défaut (carte active) puis rafraîchit', async () => {
    const { result, onRefresh } = setup();
    await result.current.saveMarker({ label: 'Puits', x_pct: 1, y_pct: 2 });
    expect(api).toHaveBeenCalledWith('/api/map/markers', 'POST', {
      label: 'Puits',
      x_pct: 1,
      y_pct: 2,
      map_id: 'map-1',
    });
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('updateMarker met à jour sans écraser un map_id fourni', async () => {
    const { result } = setup();
    await result.current.updateMarker(10, { label: 'Mare', map_id: 'map-2' });
    expect(api).toHaveBeenCalledWith('/api/map/markers/10', 'PUT', {
      label: 'Mare',
      map_id: 'map-2',
    });
  });

  it('linkTaskToLocation ajoute le lieu du bon kind sans doublon', async () => {
    const { result } = setup();
    await result.current.linkTaskToLocation(5, 'zone', 2);
    expect(api).toHaveBeenCalledWith('/api/tasks/5', 'PUT', { zone_ids: [1, 2], marker_ids: [10] });
    await result.current.linkTaskToLocation(5, 'marker', 10);
    expect(api).toHaveBeenLastCalledWith('/api/tasks/5', 'PUT', {
      zone_ids: [1],
      marker_ids: [10],
    });
  });

  it('unlinkTaskFromLocation retire le lieu et rattache à la carte si plus aucun lieu', async () => {
    const { result } = setup();
    await result.current.unlinkTaskFromLocation(TASK, 'zone', 1);
    expect(api).toHaveBeenCalledWith('/api/tasks/5', 'PUT', { zone_ids: [], marker_ids: [10] });
    const orphan = { id: 6, zone_ids: [1], marker_ids: [] };
    await result.current.unlinkTaskFromLocation(orphan, 'zone', 1);
    expect(api).toHaveBeenLastCalledWith('/api/tasks/6', 'PUT', {
      zone_ids: [],
      marker_ids: [],
      map_id: 'map-1',
    });
  });

  it('linkTutorialToLocation / unlinkTutorialFromLocation gèrent zone et repère', async () => {
    const { result } = setup();
    await result.current.linkTutorialToLocation(3, 'marker', 11);
    // tutorialLocationIds normalise les ids existants en chaînes (comportement
    // de production) ; seul l'id ajouté garde son type d'origine.
    expect(api).toHaveBeenCalledWith('/api/tutorials/3', 'PUT', {
      zone_ids: ['1'],
      marker_ids: ['10', 11],
    });
    await result.current.unlinkTutorialFromLocation(TUTORIAL, 'marker', '10');
    expect(api).toHaveBeenLastCalledWith('/api/tutorials/3', 'PUT', {
      zone_ids: ['1'],
      marker_ids: [],
    });
  });

  it('linkTutorialToLocation ignore un tutoriel inconnu', async () => {
    const { result, onRefresh } = setup();
    await result.current.linkTutorialToLocation(999, 'zone', 1);
    expect(api).not.toHaveBeenCalled();
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('duplicateZone décale le contour, crée la copie et la retourne', async () => {
    const { result } = setup();
    const zone = {
      id: 1,
      name: 'Verger',
      points: JSON.stringify([
        { xp: 10, yp: 10 },
        { xp: 20, yp: 10 },
        { xp: 20, yp: 20 },
      ]),
      map_id: 'map-1',
    };
    const created = await result.current.duplicateZone(zone);
    expect(created).toEqual({ id: 99 });
    const [url, method, payload] = api.mock.calls[0];
    expect(url).toBe('/api/zones');
    expect(method).toBe('POST');
    expect(payload.name).toBe('Verger (copie)');
    expect(payload.points).not.toEqual(JSON.parse(zone.points));
  });

  it('duplicateZone rejette un contour invalide', async () => {
    const { result } = setup();
    await expect(result.current.duplicateZone({ id: 1, points: 'invalide' })).rejects.toThrow(
      'Contour invalide',
    );
    expect(api).not.toHaveBeenCalled();
  });

  it('duplicateMarker crée la copie décalée sans empiler « (copie) »', async () => {
    const { result } = setup();
    const created = await result.current.duplicateMarker({
      id: 10,
      x_pct: 99.5,
      y_pct: 50,
      label: 'Puits (copie)',
      emoji: '💧',
    });
    expect(created).toEqual({ id: 99 });
    const payload = api.mock.calls[0][2];
    expect(payload.label).toBe('Puits (copie)');
    expect(payload.x_pct).toBe(100);
    expect(payload.y_pct).toBe(51.5);
    expect(payload.map_id).toBe('map-1');
  });

  it('assignTasksToStudent inscrit chaque tâche et compte les échecs', async () => {
    api.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('Déjà inscrit'));
    const { result, onRefresh } = setup();
    const res = await result.current.assignTasksToStudent([5, 6, 5]);
    expect(res).toEqual({ assignedCount: 1, failedCount: 1, firstError: 'Déjà inscrit' });
    expect(api).toHaveBeenCalledWith('/api/tasks/5/assign', 'POST', {
      firstName: 'Ana',
      lastName: 'B',
      studentId: 42,
    });
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('assignTasksToStudent ne fait rien sans droit d’inscription', async () => {
    const { result, onRefresh } = setup({ canEnrollNewTasks: false });
    const res = await result.current.assignTasksToStudent([5]);
    expect(res).toEqual({ assignedCount: 0, failedCount: 0, firstError: null });
    expect(api).not.toHaveBeenCalled();
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('deleteZone / deleteMarker suppriment puis rafraîchissent', async () => {
    const { result, onRefresh } = setup();
    await result.current.deleteZone(1);
    expect(api).toHaveBeenCalledWith('/api/zones/1', 'DELETE');
    await result.current.deleteMarker(10);
    expect(api).toHaveBeenLastCalledWith('/api/map/markers/10', 'DELETE');
    expect(onRefresh).toHaveBeenCalledTimes(2);
  });
});
