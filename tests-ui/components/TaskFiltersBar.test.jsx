import React from 'react';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { TaskFiltersBar } from '../../src/components/tasks/TaskFiltersBar.jsx';

const MAPS = [
  { id: 'foret', label: 'Forêt' },
  { id: 'jardin', label: 'Jardin' },
];
const ZONES = [{ id: 'z1', name: 'Mare', map_id: 'foret' }];
const MARKERS = [{ id: 'm1', label: 'Ruche', emoji: '🐝', map_id: 'foret' }];
const PROJECTS = [
  { id: 'p1', title: 'Verger', map_id: 'foret', status: 'on_hold' },
  { id: 'p2', title: 'Abris', map_id: 'jardin', status: 'active' },
];

/**
 * Simule la largeur d'écran : `compact` bascule la barre en feuille de filtres
 * (mobile), sinon panneau inline ouvert par défaut (écran large).
 */
function mockMatchMedia(compact) {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: compact,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
    onchange: null,
  }));
}

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
  beforeEach(() => {
    mockMatchMedia(false);
    window.localStorage?.clear?.();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('mode d’affichage : le bouton Liste appelle setViewMode', () => {
    const { setViewMode } = renderBar();
    fireEvent.click(screen.getByRole('button', { name: 'Affichage en liste' }));
    expect(setViewMode).toHaveBeenCalledWith('list');
  });

  test('mode d’affichage : le mode courant est signalé (aria-pressed)', () => {
    renderBar({ viewMode: 'condensed' });
    expect(screen.getByRole('button', { name: 'Affichage condensé' }).ariaPressed).toBe('true');
    expect(screen.getByRole('button', { name: 'Affichage en tuiles' }).ariaPressed).toBe('false');
  });

  test('la recherche reste visible en permanence dans la barre', () => {
    const { setFilterText } = renderBar();
    fireEvent.change(screen.getByLabelText('Rechercher une tâche'), {
      target: { value: 'paillage' },
    });
    expect(setFilterText).toHaveBeenCalledWith('paillage');
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

  describe('barre compacte', () => {
    test('écran large : les champs sont dépliés d’emblée, le bouton Filtres est ouvert', () => {
      renderBar();
      expect(screen.getByLabelText('Filtrer les tâches par carte')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Filtres' }).getAttribute('aria-expanded')).toBe(
        'true',
      );
    });

    test('écran large : replier masque les champs, la recherche et l’affichage restent', () => {
      renderBar();
      fireEvent.click(screen.getByRole('button', { name: 'Filtres' }));
      expect(screen.queryByLabelText('Filtrer les tâches par carte')).toBeNull();
      expect(screen.getByLabelText('Rechercher une tâche')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Affichage en tuiles' })).toBeTruthy();
    });

    test('écran compact : les champs sont repliés à l’arrivée (tâches visibles sans défiler)', () => {
      mockMatchMedia(true);
      renderBar();
      expect(screen.queryByLabelText('Filtrer les tâches par carte')).toBeNull();
      expect(screen.getByLabelText('Rechercher une tâche')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Filtres' }).getAttribute('aria-expanded')).toBe(
        'false',
      );
    });

    test('écran compact : le bouton Filtres ouvre la feuille avec tous les champs', () => {
      mockMatchMedia(true);
      renderBar({ isTeacher: true, resultCount: 4 });
      fireEvent.click(screen.getByRole('button', { name: 'Filtres' }));
      const sheet = screen.getByRole('dialog', { name: 'Filtres des tâches' });
      expect(within(sheet).getByLabelText('Filtrer les tâches par carte')).toBeTruthy();
      expect(within(sheet).getByLabelText('Filtrer les tâches par lieu')).toBeTruthy();
      expect(within(sheet).getByLabelText('Filtrer les tâches par projet')).toBeTruthy();
      expect(within(sheet).getByLabelText('Filtrer les tâches par groupe')).toBeTruthy();
      expect(within(sheet).getByLabelText('Filtrer par catégorie urgent')).toBeTruthy();
      expect(within(sheet).getByLabelText('Filtrer les tâches par statut')).toBeTruthy();
      expect(within(sheet).getByRole('button', { name: 'Voir 4 tâches' })).toBeTruthy();
    });

    test('écran compact : « Voir N tâches » referme la feuille', () => {
      mockMatchMedia(true);
      renderBar({ resultCount: 1 });
      fireEvent.click(screen.getByRole('button', { name: 'Filtres' }));
      fireEvent.click(screen.getByRole('button', { name: 'Voir 1 tâche' }));
      expect(screen.queryByRole('dialog', { name: 'Filtres des tâches' })).toBeNull();
    });
  });

  describe('chips de filtres actifs', () => {
    test('aucun chip quand aucun filtre n’est posé', () => {
      renderBar();
      expect(screen.queryByRole('group', { name: 'Filtres actifs' })).toBeNull();
      expect(screen.getByRole('button', { name: 'Filtres' })).toBeTruthy();
    });

    test('un chip par filtre posé, avec le compteur sur le bouton Filtres', () => {
      renderBar({ filterZone: 'marker:m1', filterStatus: 'done' });
      const chips = screen.getByRole('group', { name: 'Filtres actifs' });
      expect(within(chips).getByText('Lieu : 🐝 Ruche')).toBeTruthy();
      expect(within(chips).getByText('Statut : Terminée')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Filtres (2 actifs)' })).toBeTruthy();
    });

    test('un chip retire son filtre (et le focus carte pour le lieu)', () => {
      const { setFilterZone, onMapLocationFocusChange } = renderBar({ filterZone: 'zone:z1' });
      fireEvent.click(screen.getByRole('button', { name: 'Retirer le filtre lieu' }));
      expect(setFilterZone).toHaveBeenCalledWith('');
      expect(onMapLocationFocusChange).toHaveBeenCalledWith(null);
    });

    test('« Tout effacer » remet chaque filtre à sa valeur par défaut', () => {
      const handlers = renderBar({
        filterMap: 'jardin',
        filterZone: 'zone:z1',
        filterProject: 'p1',
        filterUrgentCategory: 'urgent',
        filterStatus: 'done',
        isTeacher: true,
        filterGroupId: 'g1',
      });
      fireEvent.click(screen.getByRole('button', { name: 'Tout effacer' }));
      expect(handlers.setFilterMap).toHaveBeenCalledWith('active');
      expect(handlers.setFilterZone).toHaveBeenCalledWith('');
      expect(handlers.setFilterProject).toHaveBeenCalledWith('');
      expect(handlers.setFilterGroupId).toHaveBeenCalledWith('');
      expect(handlers.setFilterUrgentCategory).toHaveBeenCalledWith('');
      expect(handlers.setFilterStatus).toHaveBeenCalledWith('');
    });
  });
});
