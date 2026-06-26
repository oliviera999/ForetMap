import React from 'react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

vi.mock('../../src/services/api', () => ({ api: vi.fn(() => Promise.resolve({})) }));

import { MapGeorefPanel } from '../../src/components/settings/MapGeorefPanel.jsx';

const MAP = { id: 'foret', label: 'Forêt', georef: null, gps_enabled: false };

beforeEach(() => {
  // Position/dimension déterministes pour la conversion clic → %.
  Object.defineProperty(HTMLImageElement.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100 }),
  });
});

describe('MapGeorefPanel', () => {
  test('un clic sur le plan place le premier point sans armement préalable', () => {
    render(<MapGeorefPanel map={MAP} imageUrl="/maps/map-foret.svg" />);
    // Au départ, le point 1 est ciblé automatiquement (bannière visible).
    expect(screen.getByText(/placer le point 1/i)).toBeTruthy();

    const img = screen.getByAltText('Plan Forêt');
    // L'image doit être exclue de la lightbox globale, sinon le clic ouvre l'aperçu plein écran.
    expect(img.hasAttribute('data-no-lightbox')).toBe(true);
    fireEvent.click(img, { clientX: 100, clientY: 50 });

    // 50 % / 50 % attendus, et le ciblage avance vers le point 2.
    expect(screen.getByText(/placer le point 2/i)).toBeTruthy();
    // La ligne du point 1 affiche désormais sa position (x50 y50).
    expect(screen.getByText('x50 y50')).toBeTruthy();
  });

  test('place les 3 points puis ne cible plus rien', () => {
    render(<MapGeorefPanel map={MAP} imageUrl="/maps/map-foret.svg" />);
    const img = screen.getByAltText('Plan Forêt');
    fireEvent.click(img, { clientX: 20, clientY: 10 });
    fireEvent.click(img, { clientX: 180, clientY: 10 });
    fireEvent.click(img, { clientX: 20, clientY: 90 });
    // Les 3 points placés → plus de bannière de ciblage.
    expect(screen.queryByText(/placer le point/i)).toBeNull();
    expect(screen.getByText('x10 y10')).toBeTruthy();
    expect(screen.getByText('x90 y10')).toBeTruthy();
    expect(screen.getByText('x10 y90')).toBeTruthy();
  });
});
