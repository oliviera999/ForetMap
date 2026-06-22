import React from 'react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

vi.mock('../../../src/components/VisitMapMascotRenderer.jsx', () => ({
  default: ({ mascotState, mascotId }) => (
    <div data-testid="mascot-renderer" data-state={mascotState} data-mascot={mascotId} />
  ),
}));

import MascotPackRenderPreview from '../../../src/components/mascot/MascotPackRenderPreview.jsx';
import { VISIT_MASCOT_INTERACTION_EVENT } from '../../../src/utils/visitMascotInteractionEvents.js';

const VALID_PACK = {
  mascotPackVersion: 2,
  id: 'demo-pack',
  label: 'Pack démo',
  renderer: 'sprite_cut',
  framesBase: '/assets/mascots/demo/frames/',
  frameWidth: 32,
  frameHeight: 32,
  fallbackSilhouette: 'gnome',
  stateFrames: {
    idle: { files: ['idle-0.png'], fps: 4 },
    inspect: { files: ['inspect-0.png'], fps: 8 },
    celebrate: { files: ['cel-0.png'], fps: 6 },
  },
  interactionProfile: {
    markerInspectOpen: { mode: 'transient', state: 'inspect', durationMs: 1200 },
    markerMarkedSeenHappy: { mode: 'happy' },
    mascotDragVeryLarge: { mode: 'none' },
  },
};

describe('MascotPackRenderPreview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('affiche le titre et le renderer pour un pack valide', () => {
    render(<MascotPackRenderPreview pack={VALID_PACK} catalogId="demo-pack" label="Pack démo" />);
    expect(screen.getByRole('heading', { name: 'Rendu final' })).toBeTruthy();
    expect(screen.getByTestId('mascot-renderer')).toBeTruthy();
    expect(screen.getByText(/État affiché/i)).toBeTruthy();
  });

  test('message si pack invalide', () => {
    render(<MascotPackRenderPreview pack={{ foo: 1 }} catalogId="x" />);
    expect(screen.getByText(/Corrigez le pack/i)).toBeTruthy();
    expect(screen.queryByTestId('mascot-renderer')).toBeNull();
  });

  test('clic animation « inspect » met à jour l’état affiché', () => {
    render(
      <MascotPackRenderPreview pack={VALID_PACK} catalogId="demo-pack" focusSection="animations" />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Inspection \(inspect\)/i }));
    expect(screen.getByTestId('mascot-renderer').getAttribute('data-state')).toBe('inspect');
  });

  test('clic comportement rejoue l’état transitoire configuré', () => {
    render(
      <MascotPackRenderPreview pack={VALID_PACK} catalogId="demo-pack" focusSection="behaviors" />,
    );
    const chip = screen.getByRole('button', {
      name: /Ouverture d’un repère \(inspection\) — Inspection/i,
    });
    fireEvent.click(chip);
    expect(screen.getByTestId('mascot-renderer').getAttribute('data-state')).toBe('inspect');
  });

  test('expose playInteraction via ref impérative', () => {
    const ref = React.createRef();
    render(<MascotPackRenderPreview ref={ref} pack={VALID_PACK} catalogId="demo-pack" />);
    act(() => {
      ref.current?.playInteraction(VISIT_MASCOT_INTERACTION_EVENT.MARKER_MARKED_SEEN_HAPPY);
    });
    expect(screen.getByTestId('mascot-renderer').getAttribute('data-state')).toBe('happy');
  });
});
