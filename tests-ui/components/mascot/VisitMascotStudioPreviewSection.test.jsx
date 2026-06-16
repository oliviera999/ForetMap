import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Renderer mocké : on vérifie qu'il reçoit l'état et la mascotte courants,
// sans charger les chunks lazy de rendu (rive/sprite_cut/spritesheet).
vi.mock('../../../src/components/VisitMapMascotRenderer.jsx', () => ({
  default: ({ mascotState, mascotId }) => (
    <div data-testid="mascot-renderer" data-state={mascotState} data-mascot={mascotId} />
  ),
}));

import VisitMascotStudioPreviewSection from '../../../src/components/mascot/VisitMascotStudioPreviewSection.jsx';

function setup(extra = {}) {
  render(
    <VisitMascotStudioPreviewSection packs={[]} mapId="foret" onForceLogout={vi.fn()} {...extra} />,
  );
}

describe('VisitMascotStudioPreviewSection', () => {
  test('affiche l’identifiant de carte et le renderer de mascotte', () => {
    setup();
    expect(screen.getByText('foret')).toBeTruthy();
    expect(screen.getByTestId('mascot-renderer')).toBeTruthy();
  });

  test('le bouton Marche met l’état d’aperçu à « walking »', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Marche' }));
    expect(screen.getByTestId('mascot-renderer').getAttribute('data-state')).toBe('walking');
  });

  test('le bouton Idle remet l’état d’aperçu à « idle »', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Marche' }));
    fireEvent.click(screen.getByRole('button', { name: 'Idle' }));
    expect(screen.getByTestId('mascot-renderer').getAttribute('data-state')).toBe('idle');
  });

  test('le sélecteur de mascotte propose au moins une option du catalogue', () => {
    setup();
    const select = screen.getByRole('combobox');
    expect(select.querySelectorAll('option').length).toBeGreaterThan(0);
  });
});
