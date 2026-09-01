import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MapViewToolbar } from '../../src/components/map/MapViewToolbar.jsx';

const MAPS_2 = [
  { id: 'foret', label: 'Forêt' },
  { id: 'jardin', label: 'Jardin' },
];
const MAPS_5 = [
  { id: 'a', label: 'A' },
  { id: 'b', label: 'B' },
  { id: 'c', label: 'C' },
  { id: 'd', label: 'D' },
  { id: 'e', label: 'E' },
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
    onToggleInsertVertexMode: vi.fn(),
    onRemoveSelectedPoints: vi.fn(),
    onToggleMultiSelectMode: vi.fn(),
    onToggleSnap: vi.fn(),
    onSnapRadiusChange: vi.fn(),
    onSnapSensitivityChange: vi.fn(),
    onSnapSelectedPoints: vi.fn(),
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
    />,
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
    fireEvent.click(screen.getByRole('button', { name: '↩ Annuler' }));
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
    fireEvent.click(screen.getByRole('button', { name: '💾 Enregistrer' }));
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

  test('mode edit-points : compteurs de sommets et de sélection dans le badge', () => {
    renderToolbar({
      mode: 'edit-points',
      editZoneName: 'Mare',
      editPointsCount: 7,
      selectedPointsCount: 2,
    });
    expect(screen.getByText(/✏️ Mare · 7 pts \(2 sél\.\)/)).toBeTruthy();
  });

  test('mode edit-points : bascule « ＋ Sommet »', () => {
    const h = renderToolbar({ mode: 'edit-points' });
    const btn = screen.getByRole('button', { name: '＋ Sommet' });
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(btn);
    expect(h.onToggleInsertVertexMode).toHaveBeenCalled();

    renderToolbar({ mode: 'edit-points', insertVertexMode: true });
    expect(screen.getByRole('button', { name: '✕ Ajout' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
  });

  test('mode edit-points : suppression désactivée sans sélection supprimable', () => {
    const h = renderToolbar({ mode: 'edit-points' });
    expect(screen.getByRole('button', { name: '🗑️ Sommet' }).disabled).toBe(true);

    renderToolbar({ mode: 'edit-points', canRemoveSelection: true, selectedPointsCount: 3 });
    const btn = screen.getByRole('button', { name: '🗑️ 3 sommets' });
    expect(btn.disabled).toBe(false);
    fireEvent.click(btn);
    expect(h.onRemoveSelectedPoints).not.toHaveBeenCalled();
  });

  test('mode edit-points : bascule de sélection multiple', () => {
    const h = renderToolbar({ mode: 'edit-points' });
    fireEvent.click(screen.getByRole('button', { name: '⬜ Multi' }));
    expect(h.onToggleMultiSelectMode).toHaveBeenCalled();
    renderToolbar({ mode: 'edit-points', multiSelectMode: true });
    expect(screen.getByRole('button', { name: '☑️ Multi' })).toBeTruthy();
  });

  test('mode edit-points : états de l’aimant (éteint, analyse, indisponible, prêt)', () => {
    const h = renderToolbar({ mode: 'edit-points' });
    fireEvent.click(screen.getByRole('button', { name: '🧲 Aimant' }));
    expect(h.onToggleSnap).toHaveBeenCalled();
    expect(screen.queryByLabelText(/Rayon d’accroche/)).toBeNull();

    renderToolbar({ mode: 'edit-points', snapEnabled: true, snapStatus: 'loading' });
    expect(screen.getByRole('button', { name: '🧲 Analyse…' })).toBeTruthy();

    renderToolbar({ mode: 'edit-points', snapEnabled: true, snapStatus: 'unavailable' });
    expect(screen.getByRole('button', { name: '🧲 Indispo.' })).toBeTruthy();
  });

  test('mode edit-points : aimant prêt → curseur de sensibilité réglable', () => {
    const h = renderToolbar({
      mode: 'edit-points',
      snapEnabled: true,
      snapStatus: 'ready',
      snapSensitivity: 6,
    });
    const slider = screen.getByLabelText(/Sensibilité de l’aimant : niveau 6 sur 10/);
    expect(slider.getAttribute('min')).toBe('1');
    expect(slider.getAttribute('max')).toBe('10');
    fireEvent.change(slider, { target: { value: '9' } });
    expect(h.onSnapSensitivityChange).toHaveBeenCalledWith(9);
    expect(screen.getByText('6/10')).toBeTruthy();
  });

  test('mode edit-points : aimant prêt → curseur de rayon et collage de la sélection', () => {
    const h = renderToolbar({
      mode: 'edit-points',
      snapEnabled: true,
      snapStatus: 'ready',
      snapRadiusPx: 18,
    });
    const slider = screen.getByLabelText(/Rayon d’accroche de l’aimant : 18 pixels/);
    fireEvent.change(slider, { target: { value: '30' } });
    expect(h.onSnapRadiusChange).toHaveBeenCalledWith(30);
    fireEvent.click(screen.getByRole('button', { name: '🧲 Coller' }));
    expect(h.onSnapSelectedPoints).toHaveBeenCalled();
  });
});
