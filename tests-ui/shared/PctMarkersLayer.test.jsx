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

describe('PctMarkersLayer — largeur du nom replié (audit UI/UX du 19/11/2026, U5)', () => {
  it('pose la largeur fournie par le moteur sur le repère (--fm-pct-marker-label-w)', () => {
    const labelWidthOf = vi.fn((marker, label) => (label === 'Mare' ? 150 : 0));
    render(
      <PctMarkersLayer markers={markers} onMarkerClick={vi.fn()} labelWidthOf={labelWidthOf} />,
    );
    const mare = screen.getByRole('button', { name: /Mare/ });
    const ruche = screen.getByRole('button', { name: /Ruche/ });
    expect(mare.style.getPropertyValue('--fm-pct-marker-label-w')).toBe('150px');
    // Largeur nulle : pas de variable, le plafond CSS par défaut s'applique.
    expect(ruche.style.getPropertyValue('--fm-pct-marker-label-w')).toBe('');
    expect(labelWidthOf).toHaveBeenCalledWith(markers[1], 'Mare');
  });

  it('sans fonction de largeur, rien n’est posé (comportement d’avant)', () => {
    render(<PctMarkersLayer markers={markers} onMarkerClick={vi.fn()} />);
    for (const btn of screen.getAllByRole('button')) {
      expect(btn.style.getPropertyValue('--fm-pct-marker-label-w')).toBe('');
    }
  });
});
