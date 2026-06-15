import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VisitMapMarkerButton } from '../../src/components/VisitMapMarkerButton.jsx';

function makeMarker(overrides = {}) {
  return {
    id: 12,
    label: 'Vieux chêne',
    emoji: '🌳',
    x_pct: 40,
    y_pct: 60,
    ...overrides,
  };
}

describe('VisitMapMarkerButton', () => {
  test('affiche emoji, libellé accessible et position en %', () => {
    const { container } = render(
      <VisitMapMarkerButton marker={makeMarker()} isSeen={false} onClick={vi.fn()} />,
    );
    const btn = container.querySelector('.visit-marker-btn');
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveAttribute('aria-label', 'Vieux chêne');
    expect(btn.style.left).toBe('40%');
    expect(btn.style.top).toBe('60%');
    expect(container.querySelector('.visit-marker-emoji')).toHaveTextContent('🌳');
    expect(container.querySelector('.visit-marker-indicator')).toHaveClass('is-unseen');
  });

  test('repère vu → indicateur is-seen', () => {
    const { container } = render(
      <VisitMapMarkerButton marker={makeMarker()} isSeen onClick={vi.fn()} />,
    );
    expect(container.querySelector('.visit-marker-indicator')).toHaveClass('is-seen');
  });

  test('sans emoji → pastille de repli et libellé par défaut', () => {
    const { container } = render(
      <VisitMapMarkerButton
        marker={makeMarker({ emoji: '', label: '   ' })}
        isSeen={false}
        onClick={vi.fn()}
      />,
    );
    expect(container.querySelector('.visit-marker-emoji--empty')).toBeInTheDocument();
    expect(container.querySelector('.visit-marker-btn')).toHaveAttribute(
      'aria-label',
      'Repère visite',
    );
  });

  test('clic transmet l’évènement au parent', () => {
    const onClick = vi.fn();
    render(<VisitMapMarkerButton marker={makeMarker()} isSeen={false} onClick={onClick} />);
    fireEvent.click(screen.getByRole('button', { name: 'Vieux chêne' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
