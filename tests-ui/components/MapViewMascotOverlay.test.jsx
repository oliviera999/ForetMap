import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../../src/components/VisitMapMascotRenderer.jsx', () => ({
  default: ({ mascotId, mascotState }) => (
    <div data-testid="mascot-renderer" data-mascot-id={mascotId} data-state={mascotState} />
  ),
}));

import { MapViewMascotOverlay } from '../../src/components/MapViewMascotOverlay.jsx';

function makeProps(overrides = {}) {
  return {
    show: true,
    mascotClassName: 'map-view-forest-mascot',
    embedded: false,
    renderPct: { xp: 40, yp: 60 },
    fitScale: 1,
    faceRight: true,
    animationState: 'idle',
    mascotId: 'fox',
    dialogVisible: false,
    dialog: null,
    ...overrides,
  };
}

describe('MapViewMascotOverlay', () => {
  test('show=false → rien n’est rendu', () => {
    const { container } = render(<MapViewMascotOverlay {...makeProps({ show: false })} />);
    expect(container).toBeEmptyDOMElement();
  });

  test('show=true → rend la mascotte positionnée', () => {
    const { container } = render(<MapViewMascotOverlay {...makeProps()} />);
    const root = container.querySelector('.map-view-forest-mascot');
    expect(root).toBeInTheDocument();
    expect(root).toHaveStyle({ left: '40%', top: '60%' });
    expect(screen.getByTestId('mascot-renderer')).toHaveAttribute('data-mascot-id', 'fox');
  });

  test('dialogVisible + dialog → affiche la bulle de dialogue', () => {
    const { container } = render(
      <MapViewMascotOverlay {...makeProps({ dialogVisible: true, dialog: 'Coucou !' })} />,
    );
    const bubble = container.querySelector('.visit-map-mascot-dialog');
    expect(bubble).toBeInTheDocument();
    expect(bubble).toHaveTextContent('Coucou !');
    expect(bubble).toHaveAttribute('role', 'status');
  });

  test('dialogVisible mais dialog vide → pas de bulle', () => {
    const { container } = render(
      <MapViewMascotOverlay {...makeProps({ dialogVisible: true, dialog: null })} />,
    );
    expect(container.querySelector('.visit-map-mascot-dialog')).toBeNull();
  });
});
