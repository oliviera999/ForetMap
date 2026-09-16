import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PctZonesLayer } from '../../../src/shared/pct-map/PctZonesLayer.jsx';

function makeZone(overrides = {}) {
  return {
    id: 7,
    name: 'Verger',
    emoji: '',
    color: '#fde04790',
    points: JSON.stringify([
      { xp: 10, yp: 10 },
      { xp: 60, yp: 10 },
      { xp: 60, yp: 60 },
      { xp: 10, yp: 60 },
    ]),
    ...overrides,
  };
}

describe('PctZonesLayer — statut vu', () => {
  test('getIsSeen false → classe is-unseen et aria À découvrir', () => {
    const { container } = render(
      <PctZonesLayer
        zones={[makeZone()]}
        onZoneClick={vi.fn()}
        showLabels={false}
        getIsSeen={() => false}
      />,
    );
    expect(container.querySelector('.fm-pct-zone')).toHaveClass('is-unseen');
    expect(screen.getByRole('button', { name: /À découvrir/ })).toBeInTheDocument();
  });

  test('getIsSeen true → classe is-seen', () => {
    const { container } = render(
      <PctZonesLayer
        zones={[makeZone()]}
        onZoneClick={vi.fn()}
        showLabels={false}
        getIsSeen={() => true}
      />,
    );
    expect(container.querySelector('.fm-pct-zone')).toHaveClass('is-seen');
    expect(screen.getByRole('button', { name: /Vu$/ })).toBeInTheDocument();
  });

  test('sans getIsSeen → pas de classe seen', () => {
    const { container } = render(
      <PctZonesLayer zones={[makeZone()]} onZoneClick={vi.fn()} showLabels={false} />,
    );
    const zone = container.querySelector('.fm-pct-zone');
    expect(zone).not.toHaveClass('is-seen');
    expect(zone).not.toHaveClass('is-unseen');
  });

  test('clic déclenche onZoneClick', () => {
    const onZoneClick = vi.fn();
    render(<PctZonesLayer zones={[makeZone()]} onZoneClick={onZoneClick} showLabels={false} />);
    fireEvent.click(screen.getByRole('button', { name: /Verger/ }));
    expect(onZoneClick).toHaveBeenCalledTimes(1);
  });

  test('getDiscoverHalo true → classe is-discover-halo', () => {
    const { container } = render(
      <PctZonesLayer
        zones={[makeZone()]}
        onZoneClick={vi.fn()}
        showLabels={false}
        getIsSeen={() => false}
        getDiscoverHalo={() => true}
      />,
    );
    expect(container.querySelector('.fm-pct-zone')).toHaveClass('is-discover-halo');
  });
});
