import React from 'react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

import { MapTasksArea } from '../../../src/components/app/MapTasksArea.jsx';

const probes = vi.hoisted(() => ({ map: [], tasks: [] }));
vi.mock('../../../src/components/map-views', () => ({
  MapView: (props) => {
    probes.map.push(props);
    return <div data-testid="map-view" />;
  },
}));
vi.mock('../../../src/components/tasks-views', () => ({
  TasksView: (props) => {
    probes.tasks.push(props);
    return <div data-testid="tasks-view" />;
  },
}));

const baseProps = {
  isTeacher: false,
  student: { id: 'S1' },
  maps: [{ id: 'm1' }],
  onMapChange: vi.fn(),
  useSplitMapTasks: false,
  tab: 'map',
  tutorialsModuleEnabled: true,
  canAccessSoloMapTasks: true,
  canSelfAssignTasks: true,
  canViewOtherUsersIdentity: true,
  onZoneUpdate: vi.fn(),
  onRefresh: vi.fn(),
  onForceLogout: vi.fn(),
  onLocationTasksFocus: vi.fn(),
  onNavigateToTasksForLocation: vi.fn(),
  onTaskFormOverlayOpenChange: vi.fn(),
  mapLocationFocus: null,
  onMapLocationFocusChange: vi.fn(),
  onOpenPlantCatalogPreview: vi.fn(),
};

describe('MapTasksArea', () => {
  beforeEach(() => {
    probes.map.length = 0;
    probes.tasks.length = 0;
  });

  test('vue scindée : région carte + tâches, MapView embedded, pas de vue solo', () => {
    render(<MapTasksArea {...baseProps} useSplitMapTasks tab="maptasks" />);
    expect(
      screen.getByRole('region', { name: 'Vue carte, tâches et tutoriels' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('map-view')).toBeInTheDocument();
    expect(screen.getByTestId('tasks-view')).toBeInTheDocument();
    expect(probes.map[0].embedded).toBe(true);
    expect(probes.map[0].onNavigateToTasksForLocation).toBeUndefined();
  });

  test('vue scindée sans module tutoriels : aria-label court', () => {
    render(
      <MapTasksArea
        {...baseProps}
        useSplitMapTasks
        tab="maptasks"
        tutorialsModuleEnabled={false}
      />,
    );
    expect(screen.getByRole('region', { name: 'Vue carte et tâches' })).toBeInTheDocument();
  });

  test('asymétrie prof préservée : MapView du split sans canSelfAssignTasks, TasksView avec', () => {
    render(
      <MapTasksArea
        {...baseProps}
        isTeacher
        useSplitMapTasks
        tab="maptasks"
        splitMapCanSelfAssignTasks={undefined}
        canSelfAssignTasks
        hasPermission={() => true}
        hasPermissionInRole={() => true}
      />,
    );
    expect(probes.map[0].canSelfAssignTasks).toBeUndefined();
    expect(probes.tasks[0].canSelfAssignTasks).toBe(true);
    expect(probes.tasks[0].hasPermission).toEqual(expect.any(Function));
  });

  test('onglet carte seul : MapView non embedded avec navigation vers les tâches', () => {
    render(<MapTasksArea {...baseProps} tab="map" />);
    expect(screen.getByTestId('map-view')).toBeInTheDocument();
    expect(screen.queryByTestId('tasks-view')).toBeNull();
    expect(probes.map[0].embedded).toBeUndefined();
    expect(probes.map[0].onNavigateToTasksForLocation).toBe(baseProps.onNavigateToTasksForLocation);
  });

  test('onglet tâches seul : TasksView câblé avec les props élève', () => {
    render(<MapTasksArea {...baseProps} tab="tasks" canEnrollOnTasks={false} canSelfAssignTasks />);
    expect(screen.queryByTestId('map-view')).toBeNull();
    expect(probes.tasks[0]).toMatchObject({
      isTeacher: false,
      canEnrollOnTasks: false,
      canSelfAssignTasks: true,
      canViewOtherUsersIdentity: true,
    });
    expect(probes.tasks[0].hasPermission).toBeUndefined();
  });

  test('gating élève : canAccessSoloMapTasks=false bloque carte et tâches hors split', () => {
    const { rerender } = render(
      <MapTasksArea {...baseProps} tab="map" canAccessSoloMapTasks={false} />,
    );
    expect(screen.queryByTestId('map-view')).toBeNull();
    rerender(<MapTasksArea {...baseProps} tab="tasks" canAccessSoloMapTasks={false} />);
    expect(screen.queryByTestId('tasks-view')).toBeNull();
  });
});
