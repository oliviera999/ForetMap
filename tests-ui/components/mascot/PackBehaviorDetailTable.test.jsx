import React from 'react';
import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import PackBehaviorDetailTable from '../../../src/components/mascot/PackBehaviorDetailTable.jsx';

const VALID_PACK = {
  mascotPackVersion: 1,
  id: 'demo',
  label: 'Demo',
  renderer: 'sprite_cut',
  framesBase: '/assets/mascots/demo/frames/',
  frameWidth: 32,
  frameHeight: 32,
  fallbackSilhouette: 'gnome',
  stateFrames: {
    idle: { files: ['a.png', 'b.png'], fps: 4 },
    walking: { files: ['c.png'], fps: 8 },
  },
};

describe('PackBehaviorDetailTable', () => {
  test('rend la fiche métadonnées et une ligne par état', () => {
    render(<PackBehaviorDetailTable pack={VALID_PACK} />);
    // En-tête métadonnées : framesBase + dimensions + silhouette
    expect(screen.getByText('framesBase')).toBeTruthy();
    expect(screen.getByText(/\/assets\/mascots\/demo\/frames/)).toBeTruthy();
    // Une ligne <code> par état, triées alphabétiquement.
    expect(screen.getByText('idle')).toBeTruthy();
    expect(screen.getByText('walking')).toBeTruthy();
    // En-têtes du tableau présents.
    expect(screen.getByText('Durée estimée')).toBeTruthy();
    expect(screen.getByText('frameDwellMs')).toBeTruthy();
  });

  test('affiche le message d’erreur pour un pack invalide', () => {
    render(<PackBehaviorDetailTable pack={{ foo: 'bar' }} />);
    expect(screen.getByText(/Pack invalide pour la fiche/)).toBeTruthy();
    expect(screen.queryByText('idle')).toBeNull();
  });

  test('le nombre d’images reflète les frames de l’état', () => {
    render(<PackBehaviorDetailTable pack={VALID_PACK} />);
    const idleRow = screen.getByText('idle').closest('tr');
    expect(idleRow.textContent).toContain('2');
  });
});
