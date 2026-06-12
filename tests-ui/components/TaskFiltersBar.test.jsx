import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TaskFiltersBar } from '../../src/components/tasks/TaskFiltersBar.jsx';

const MAPS = [{ id: 'foret', label: 'Forêt' }, { id: 'jardin', label: 'Jardin' }];
const ZONES = [{ id: 'z1', name: 'Mare', map_id: 'foret' }];
const MARKERS = [{ id: 'm1', label: 'Ruche', emoji: '🐝', map_id: 'foret' }];
const PROJECTS = [
  { id: 'p1', title: 'Verger', map_id: 'foret', status: 'on_hold' },
  { id: 'p2', title: 'Abris', map_id: 'jardin', status: 'active' },
];

function renderBar(overrides = {}) {
  const handlers = {
    setViewMode: vi.fn(),
    setFilterMap: vi.fn(),
    setFilterText: vi.fn(),
    setFilterZone: vi.fn(),
    onMapLocationFocusChange: vi.fn(),
    setFilterProject: vi.fn(),
    setFilterGroupId: vi.fn(),
    setFilterUrgentCategory: vi.fn(),
    setFilterStatus: vi.fn(),
    setHasTouchedStatusFilter: vi.fn(),
  };
  render(
    <TaskFiltersBar
      viewMode="tiles"
      filterMap="active"
      maps={MAPS}
      activeMapId="foret"
      filterText=""
      filterZone=""
      usedZones={['z1']}
      usedMarkers={['m1']}
      zones={ZONES}
      markers={MARKERS}
      filterProject=""
      taskProjects={PROJECTS}
      filterGroupId=""
      groupOptions={[{ id: 'g1', name: 'Groupe A' }]}
      filterUrgentCategory=""
      filterStatus=""
      {...handlers}
      {...overrides}
    />,
  );
  return handlers;
}

describe('TaskFiltersBar', () => {
  test('mode d’affichage : le bouton Liste appelle setViewMode', () => {
    const { setViewMode } = renderBar();
    fireEvent.click(screen.getByRole('button', { name: '📄 Liste' }));
    expect(setViewMode).toHaveBeenCalledWith('list');
  });

  test('filtre carte : option carte active avec libellé résolu + cartes listées', () => {
    renderBar();
    expect(screen.getByRole('option', { name: 'Carte active (Forêt)' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Jardin' })).toBeTruthy();
  });

  test('filtre lieu : zones et repères utilisés (emoji du repère), choix zone → focus carte', () => {
    const { setFilterZone, onMapLocationFocusChange } = renderBar();
    const zoneOption = screen.getByRole('option', { name: 'Mare' });
    expect(zoneOption.value).toBe('zone:z1');
    expect(screen.getByRole('option', { name: '🐝 Ruche' })).toBeTruthy();
    fireEvent.change(zoneOption.closest('select'), { target: { value: 'zone:z1' } });
    expect(setFilterZone).toHaveBeenCalledWith('zone:z1');
    expect(onMapLocationFocusChange).toHaveBeenCalledWith({ kind: 'zone', id: 'z1' });
  });

  test('filtre lieu : retour à « Toutes les zones » efface le focus carte', () => {
    const { onMapLocationFocusChange } = renderBar({ filterZone: 'zone:z1' });
    fireEvent.change(screen.getByRole('option', { name: 'Toutes les zones' }).closest('select'), {
      target: { value: '' },
    });
    expect(onMapLocationFocusChange).toHaveBeenCalledWith(null);
  });

  test('filtre projet : seuls les projets de la carte active, suffixe de statut inclus', () => {
    renderBar();
    expect(screen.getByRole('option', { name: 'Verger (en attente)' })).toBeTruthy();
    expect(screen.queryByRole('option', { name: /Abris/ })).toBeNull();
  });

  test('filtre groupe : visible seulement côté n3boss', () => {
    renderBar();
    expect(screen.queryByLabelText('Filtrer les tâches par groupe')).toBeNull();
  });

  test('n3boss : choix d’un groupe appelle setFilterGroupId', () => {
    const { setFilterGroupId } = renderBar({ isTeacher: true });
    fireEvent.change(screen.getByLabelText('Filtrer les tâches par groupe'), {
      target: { value: 'g1' },
    });
    expect(setFilterGroupId).toHaveBeenCalledWith('g1');
  });

  test('filtre statut : la sélection marque aussi le filtre comme touché', () => {
    const { setFilterStatus, setHasTouchedStatusFilter } = renderBar();
    fireEvent.change(screen.getByRole('option', { name: 'Tous les statuts' }).closest('select'), {
      target: { value: 'done' },
    });
    expect(setFilterStatus).toHaveBeenCalledWith('done');
    expect(setHasTouchedStatusFilter).toHaveBeenCalledWith(true);
  });

  test('catégorie urgent : la sélection appelle setFilterUrgentCategory', () => {
    const { setFilterUrgentCategory } = renderBar();
    fireEvent.change(screen.getByLabelText('Filtrer par catégorie urgent'), {
      target: { value: 'urgent' },
    });
    expect(setFilterUrgentCategory).toHaveBeenCalledWith('urgent');
  });
});
