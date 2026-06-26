import React from 'react';
import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { MascotGpsStatusBanner } from '../../src/components/MascotGpsStatusBanner.jsx';

describe('MascotGpsStatusBanner', () => {
  test('rien si le suivi est inactif ou absent', () => {
    const { container, rerender } = render(<MascotGpsStatusBanner gps={null} />);
    expect(container.firstChild).toBeNull();
    rerender(<MascotGpsStatusBanner gps={{ active: false, status: 'idle', feedback: null }} />);
    expect(container.firstChild).toBeNull();
  });

  test('suivi OK affiche la précision', () => {
    render(
      <MascotGpsStatusBanner
        gps={{ active: true, status: 'granted', feedback: 'ok', accuracy: 12 }}
      />,
    );
    expect(screen.getByText(/Suivi GPS actif/i)).toBeTruthy();
    expect(screen.getByText(/±12 m/)).toBeTruthy();
  });

  test('localisation refusée', () => {
    render(
      <MascotGpsStatusBanner
        gps={{ active: true, status: 'denied', feedback: null, accuracy: null }}
      />,
    );
    expect(screen.getByText(/refusée/i)).toBeTruthy();
  });

  test('hors zone du plan', () => {
    render(
      <MascotGpsStatusBanner
        gps={{ active: true, status: 'granted', feedback: 'out_of_bounds', accuracy: 8 }}
      />,
    );
    expect(screen.getByText(/hors de la zone/i)).toBeTruthy();
  });

  test('signal faible avec précision', () => {
    render(
      <MascotGpsStatusBanner
        gps={{ active: true, status: 'granted', feedback: 'low_accuracy', accuracy: 220 }}
      />,
    );
    expect(screen.getByText(/Signal GPS faible/i)).toBeTruthy();
    expect(screen.getByText(/±220 m/)).toBeTruthy();
  });
});
