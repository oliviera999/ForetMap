import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VisitMapZoomControls } from '../../../src/components/visit/VisitMapZoomControls.jsx';

function setup() {
  const props = {
    onZoomIn: vi.fn(),
    onZoomOut: vi.fn(),
    onReset: vi.fn(),
  };
  const onStageClick = vi.fn();
  render(
    <div onClick={onStageClick}>
      <VisitMapZoomControls {...props} />
    </div>
  );
  return { props, onStageClick };
}

describe('VisitMapZoomControls', () => {
  test('trois contrôles accessibles, chacun relié à son action', () => {
    const { props } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Zoomer la carte de visite' }));
    expect(props.onZoomIn).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Dézoomer la carte de visite' }));
    expect(props.onZoomOut).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Recentrer la carte de visite' }));
    expect(props.onReset).toHaveBeenCalledTimes(1);
  });

  test('les clics ne se propagent pas au plan (pas de déplacement mascotte)', () => {
    const { onStageClick } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Zoomer la carte de visite' }));
    fireEvent.click(screen.getByRole('button', { name: 'Recentrer la carte de visite' }));
    expect(onStageClick).not.toHaveBeenCalled();
  });

  test('conteneur .visit-map-controls conservé (exclusion du pan au pointerdown)', () => {
    setup();
    const zoomIn = screen.getByRole('button', { name: 'Zoomer la carte de visite' });
    expect(zoomIn.closest('.visit-map-controls')).toBeTruthy();
  });
});
