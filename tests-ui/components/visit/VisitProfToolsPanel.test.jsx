import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Le panneau de sync fait ses propres appels API : stub ciblé, on vérifie juste les props passées.
vi.mock('../../../src/components/visit/VisitSyncPanel.jsx', () => ({
  VisitSyncPanel: ({ mapId, isTeacher }) => (
    <div data-testid="sync-panel" data-map-id={mapId} data-teacher={isTeacher ? '1' : '0'} />
  ),
}));

import { VisitProfToolsPanel } from '../../../src/components/visit/VisitProfToolsPanel.jsx';

function setup(overrides = {}) {
  const props = {
    isTeacher: true,
    loading: false,
    visitMapImageReady: true,
    mode: 'view',
    onSetMode: vi.fn(),
    drawPointsCount: 0,
    creating: false,
    onCreateZone: vi.fn(),
    onUndoDrawPoint: vi.fn(),
    onClearDrawPoints: vi.fn(),
    mapId: 'foret',
    onSynced: vi.fn(),
    onForceLogout: vi.fn(),
    onOpenMascotPackStudioTab: null,
    ...overrides,
  };
  const utils = render(<VisitProfToolsPanel {...props} />);
  return { props, ...utils };
}

describe('VisitProfToolsPanel', () => {
  test('bascule de mode : navigation/zone/repère → onSetMode avec le mode visé', () => {
    const { props } = setup();
    fireEvent.click(screen.getByRole('button', { name: '🖊️ Zone visite' }));
    expect(props.onSetMode).toHaveBeenCalledWith('draw-zone');
    fireEvent.click(screen.getByRole('button', { name: '📍 Repère visite' }));
    expect(props.onSetMode).toHaveBeenCalledWith('add-marker');
    fireEvent.click(screen.getByRole('button', { name: '🖐️ Navigation' }));
    expect(props.onSetMode).toHaveBeenCalledWith('view');
  });

  test('plan pas encore chargé : outils zone/repère désactivés + message d’attente', () => {
    const notReady = setup({ visitMapImageReady: false });
    expect(screen.getByText(/Chargement du plan/)).toBeTruthy();
    expect(screen.getByRole('button', { name: '🖊️ Zone visite' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: '📍 Repère visite' }).disabled).toBe(true);
    notReady.unmount();
    // Pendant le chargement initial, pas de message (le plan arrive).
    setup({ visitMapImageReady: false, loading: true });
    expect(screen.queryByText(/Chargement du plan/)).toBeNull();
  });

  test('tracé en cours : terminer (≥3 points), retirer un point, annuler', () => {
    const { props } = setup({ mode: 'draw-zone', drawPointsCount: 2 });
    const finish = screen.getByRole('button', { name: '✅ Terminer zone (2)' });
    expect(finish.disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '↩️ Retirer point' }));
    expect(props.onUndoDrawPoint).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: '✕ Annuler' }));
    expect(props.onClearDrawPoints).toHaveBeenCalledTimes(1);

    const ready = setup({ mode: 'draw-zone', drawPointsCount: 3 });
    fireEvent.click(screen.getByRole('button', { name: '✅ Terminer zone (3)' }));
    expect(ready.props.onCreateZone).toHaveBeenCalledTimes(1);
  });

  test('hors mode tracé : aucune action de tracé affichée', () => {
    setup({ mode: 'view', drawPointsCount: 3 });
    expect(screen.queryByRole('button', { name: /Terminer zone/ })).toBeNull();
    expect(screen.queryByRole('button', { name: '↩️ Retirer point' })).toBeNull();
  });

  test('panneau de sync câblé sur la carte courante ; studio mascotte seulement si callback fourni', () => {
    setup();
    const sync = screen.getByTestId('sync-panel');
    expect(sync.getAttribute('data-map-id')).toBe('foret');
    expect(sync.getAttribute('data-teacher')).toBe('1');
    expect(screen.queryByRole('button', { name: 'Ouvrir l’onglet Packs mascotte' })).toBeNull();

    const withStudio = setup({ onOpenMascotPackStudioTab: vi.fn() });
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir l’onglet Packs mascotte' }));
    expect(withStudio.props.onOpenMascotPackStudioTab).toHaveBeenCalledTimes(1);
  });
});
