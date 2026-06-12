import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MapViewToolbar } from '../../src/components/map/MapViewToolbar.jsx';

const MAPS_2 = [{ id: 'foret', label: 'Forêt' }, { id: 'jardin', label: 'Jardin' }];
const MAPS_5 = [
  { id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' },
  { id: 'd', label: 'D' }, { id: 'e', label: 'E' },
];

function renderToolbar(overrides = {}) {
  const handlers = {
    onMapChange: vi.fn(),
    onModeButtonClick: vi.fn(),
    onFinishZone: vi.fn(),
    onUndoPoint: vi.fn(),
    onCancelDraw: vi.fn(),
    onUndoEditPoints: vi.fn(),
    onSaveEditPoints: vi.fn(),
    onExitEditPoints: vi.fn(),
    onToggleMarkerPositionLock: vi.fn(),
    onToggleMapInteraction: vi.fn(),
    onToggleLabels: vi.fn(),
    fitMap: vi.fn(),
    animateZoomTowardScale: vi.fn(),
  };
  render(
    <MapViewToolbar
      maps={MAPS_2}
      activeMapId="foret"
      mode="view"
      isTeacher={false}
      drawPointsCount={0}
      editCanUndo={false}
      canManageMarkerPositions={false}
      markerPositionUnlocked={false}
      isCoarsePointer={false}
      mobileInteractionsActive={false}
      showLabels
      containerRef={{ current: null }}
      txRef={{ current: { s: 1 } }}
      {...handlers}
      {...overrides}
    />
  );
  return handlers;
}

describe('MapViewToolbar', () => {
  test('sélecteur de carte : boutons inline (≤4 cartes) qui appellent onMapChange', () => {
    const h = renderToolbar();
    fireEvent.click(screen.getByRole('button', { name: 'Jardin' }));
    expect(h.onMapChange).toHaveBeenCalledWith('jardin');
  });

  test('sélecteur de carte : un <select> au-delà de 4 cartes', () => {
    const h = renderToolbar({ maps: MAPS_5, activeMapId: 'a' });
    const select = screen.getByLabelText('Sélection de carte active');
    fireEvent.change(select, { target: { value: 'c' } });
    expect(h.onMapChange).toHaveBeenCalledWith('c');
  });

  test('élève : seul le mode Nav est proposé ; prof : Zone et Repère apparaissent', () => {
    renderToolbar();
    expect(screen.getByRole('button', { name: '🖐️ Nav' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Zone/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Repère/ })).toBeNull();
  });

  test('prof en mode draw-zone : compteur de points et contrôles Terminer/Undo/✕', () => {
    const h = renderToolbar({ isTeacher: true, mode: 'draw-zone', drawPointsCount: 3 });
    expect(screen.getByRole('button', { name: '🖊️ Zone (3)' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '✅ Terminer' }));
    expect(h.onFinishZone).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '↩ Undo' }));
    expect(h.onUndoPoint).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '✕' }));
    expect(h.onCancelDraw).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '📍 Repère' }));
    expect(h.onModeButtonClick).toHaveBeenCalledWith('add-marker');
  });

  test('mode edit-points : nom de zone, Annuler désactivé sans historique, Sauver et sortie', () => {
    const h = renderToolbar({ mode: 'edit-points', editZoneName: 'Mare', editCanUndo: false });
    expect(screen.getByText('✏️ Mare')).toBeTruthy();
    const undoBtn = screen.getByRole('button', { name: '↩ Annuler' });
    expect(undoBtn.disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '💾 Sauver' }));
    expect(h.onSaveEditPoints).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '✕' }));
    expect(h.onExitEditPoints).toHaveBeenCalled();
  });

  test('verrou repères affiché seulement si canManageMarkerPositions', () => {
    const h = renderToolbar({ canManageMarkerPositions: true });
    fireEvent.click(screen.getByRole('button', { name: 'Déverrouiller la position des repères' }));
    expect(h.onToggleMarkerPositionLock).toHaveBeenCalled();
  });

  test('bascule des étiquettes et des gestes tactiles', () => {
    const h = renderToolbar({ isCoarsePointer: true, mobileInteractionsActive: true });
    fireEvent.click(screen.getByRole('button', { name: 'Masquer les noms' }));
    expect(h.onToggleLabels).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Désactiver les gestes carte' }));
    expect(h.onToggleMapInteraction).toHaveBeenCalled();
  });

  test('zoom : ＋/－ animent vers la nouvelle échelle centrée, ⊡ recentre via fitMap', () => {
    const container = { clientWidth: 800, clientHeight: 600 };
    const h = renderToolbar({
      containerRef: { current: container },
      txRef: { current: { s: 2 } },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Zoomer la carte' }));
    expect(h.animateZoomTowardScale).toHaveBeenCalledWith(2 * 1.28, 400, 300);
    fireEvent.click(screen.getByRole('button', { name: 'Dézoomer la carte' }));
    expect(h.animateZoomTowardScale).toHaveBeenCalledWith(2 * 0.78, 400, 300);
    fireEvent.click(screen.getByRole('button', { name: 'Recentrer la carte' }));
    expect(h.fitMap).toHaveBeenCalled();
  });

  test('astuce contextuelle affichée par défaut (aide active sans réglages)', () => {
    renderToolbar();
    expect(screen.getByText(/Astuce :/)).toBeTruthy();
    expect(screen.getByText(/actions guidées/)).toBeTruthy();
  });
});
