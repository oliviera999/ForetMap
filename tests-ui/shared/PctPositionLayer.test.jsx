import { describe, expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';

import { PctDirectLine, PctPositionLayer } from '../../src/shared/pct-map/PctPositionLayer.jsx';

/**
 * Le calque de position n'était couvert par aucun test : c'est ce qui a laissé passer un halo
 * de précision dimensionné en pourcentage d'un parent sans dimension, donc rendu à 0 × 0 et
 * jamais visible depuis le lot 6 (`docs/AUDIT_PLAN_AFFICHAGE_2026-09.md` C8).
 */
describe('PctPositionLayer', () => {
  const position = { xp: 40, yp: 60 };

  test('le halo porte un diamètre en pixels, pas un pourcentage', () => {
    const { container } = render(<PctPositionLayer position={position} haloPx={33.2} />);
    const halo = container.querySelector('.fm-pct-position__halo');
    expect(halo.style.width).toBe('33.2px');
    expect(halo.style.height).toBe('33.2px');
    // Largeur et hauteur identiques : un disque, pas une ellipse.
    expect(halo.style.width).toBe(halo.style.height);
  });

  test('sans précision exploitable, pas de halo du tout', () => {
    const { container } = render(<PctPositionLayer position={position} haloPx={0} />);
    expect(container.querySelector('.fm-pct-position__halo')).toBe(null);
  });

  test('hors du plan : flèche de direction, ni halo (il ne voudrait rien dire) ni cap', () => {
    const { container } = render(
      <PctPositionLayer
        position={{ ...position, offMap: true, bearingDeg: 45 }}
        haloPx={33.2}
        headingDeg={10}
      />,
    );
    expect(container.querySelector('.fm-pct-position__halo')).toBe(null);
    expect(container.querySelector('.fm-pct-position__heading')).toBe(null);
    expect(container.querySelector('.fm-pct-position__arrow')).toBeTruthy();
    expect(container.querySelector('.fm-pct-position').classList.contains('is-off-map')).toBe(true);
  });

  test('le point est posé en % et annoncé avec sa précision', () => {
    const { container } = render(
      <PctPositionLayer position={position} haloPx={20} accuracyM={12.4} />,
    );
    const root = container.querySelector('.fm-pct-position');
    expect(root.style.left).toBe('40%');
    expect(root.style.top).toBe('60%');
    expect(screen.getByRole('img', { name: 'Votre position à 12 mètres près' })).toBeTruthy();
    expect(container.querySelector('.fm-pct-position__dot')).toBeTruthy();
  });

  test('sans position : rien du tout', () => {
    const { container } = render(<PctPositionLayer position={null} haloPx={20} />);
    expect(container.querySelector('.fm-pct-position')).toBe(null);
  });
});

describe('PctDirectLine', () => {
  test('trace le segment entre les deux points, en unités de pourcentage', () => {
    const { container } = render(
      <PctDirectLine from={{ xp: 10, yp: 20 }} to={{ xp: 70, yp: 80 }} />,
    );
    const line = container.querySelector('line');
    expect([
      line.getAttribute('x1'),
      line.getAttribute('y1'),
      line.getAttribute('x2'),
      line.getAttribute('y2'),
    ]).toEqual(['10', '20', '70', '80']);
  });

  test('une extrémité manquante : pas de trait inventé', () => {
    const { container } = render(<PctDirectLine from={{ xp: 10, yp: 20 }} to={null} />);
    expect(container.querySelector('svg')).toBe(null);
  });
});
