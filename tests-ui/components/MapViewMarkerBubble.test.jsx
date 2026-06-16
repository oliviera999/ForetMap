import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { MapViewMarkerBubble } from '../../src/components/MapViewMarkerBubble.jsx';

function makeProps(overrides = {}) {
  return {
    marker: { x_pct: 25, y_pct: 75, emoji: '🌱', label: 'Chêne' },
    ariaLabel: 'Chêne',
    showLabels: true,
    isCoarsePointer: false,
    draggable: false,
    emojiFontSize: '16px',
    labelFontSize: '14px',
    labelMarginTop: 4,
    taskVisual: undefined,
    taskLabel: '',
    tutorialCount: 0,
    tutorialLabel: '',
    onOpen: vi.fn(),
    onPointerDown: undefined,
    ...overrides,
  };
}

describe('MapViewMarkerBubble', () => {
  test('rend le bouton positionné avec emoji et étiquette', () => {
    const { container } = render(<MapViewMarkerBubble {...makeProps()} />);
    const btn = container.querySelector('.map-bubble');
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveStyle({ left: '25%', top: '75%' });
    expect(btn).toHaveAttribute('aria-label', 'Chêne');
    expect(btn).toHaveAttribute('title', 'Chêne');
    expect(container.querySelector('.map-bubble-pin')).toHaveTextContent('🌱');
    expect(screen.getByText('Chêne')).toBeInTheDocument();
  });

  test('sans emoji → point par défaut, sans étiquette quand showLabels=false', () => {
    const { container } = render(
      <MapViewMarkerBubble
        {...makeProps({ marker: { x_pct: 0, y_pct: 0, emoji: '', label: 'X' }, showLabels: false })}
      />,
    );
    expect(container.querySelector('.map-marker-no-emoji')).toBeInTheDocument();
    expect(screen.queryByText('X')).toBeNull();
  });

  test('pastilles de tâche et de tutoriel selon les props', () => {
    const { container } = render(
      <MapViewMarkerBubble
        {...makeProps({
          taskVisual: 'done',
          taskLabel: 'Terminé',
          tutorialCount: 2,
          tutorialLabel: '2 tutoriels liés',
        })}
      />,
    );
    expect(container.querySelector('.map-task-status-dot--done')).toHaveAttribute(
      'aria-label',
      'Terminé',
    );
    expect(container.querySelector('.map-tutorial-marker-dot')).toHaveAttribute(
      'aria-label',
      '2 tutoriels liés',
    );
  });

  test('clic et touche Entrée déclenchent onOpen', () => {
    const onOpen = vi.fn();
    const { container } = render(<MapViewMarkerBubble {...makeProps({ onOpen })} />);
    const btn = container.querySelector('.map-bubble');
    fireEvent.click(btn);
    fireEvent.keyDown(btn, { key: 'Enter' });
    expect(onOpen).toHaveBeenCalledTimes(2);
  });

  test('draggable=true → curseur grab et onPointerDown branché', () => {
    const onPointerDown = vi.fn();
    const { container } = render(
      <MapViewMarkerBubble {...makeProps({ draggable: true, onPointerDown })} />,
    );
    const btn = container.querySelector('.map-bubble');
    expect(btn).toHaveStyle({ cursor: 'grab' });
    fireEvent.pointerDown(btn);
    expect(onPointerDown).toHaveBeenCalledTimes(1);
  });
});
