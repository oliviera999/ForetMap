import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { PctMarkersLayer } from '../../src/shared/pct-map/PctMarkersLayer.jsx';

const markers = [
  { id: 1, x_pct: 10, y_pct: 20, label: 'Ruche' },
  { id: 2, x_pct: 60, y_pct: 40, label: 'Mare' },
];

describe('PctMarkersLayer — repère ouvert', () => {
  it('annonce le repère ouvert (aria-current) et lui seul', () => {
    render(<PctMarkersLayer markers={markers} onMarkerClick={vi.fn()} activeMarkerId={2} />);
    const active = screen.getByRole('button', { name: /Mare/ });
    const other = screen.getByRole('button', { name: /Ruche/ });
    expect(active).toHaveAttribute('aria-current', 'true');
    expect(active).toHaveClass('is-active');
    expect(other).not.toHaveAttribute('aria-current');
  });

  it('sans lieu ouvert, aucun repère n’est marqué courant', () => {
    render(<PctMarkersLayer markers={markers} onMarkerClick={vi.fn()} />);
    for (const btn of screen.getAllByRole('button')) {
      expect(btn).not.toHaveAttribute('aria-current');
    }
  });
});
