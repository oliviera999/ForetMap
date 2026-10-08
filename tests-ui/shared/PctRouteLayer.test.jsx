import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { PctRouteBadges, PctRouteLines } from '../../src/shared/pct-map/PctRouteLayer.jsx';

/** Habillage d'un parcours sur la carte : tracé fléché, ligne de guidage, étapes numérotées. */

const points = [
  { xp: 10, yp: 10, index: 0, number: 1 },
  { xp: 50, yp: 10, index: 1, number: 2 },
  { xp: 50, yp: 60, index: 2, number: 3 },
];

describe('PctRouteLines', () => {
  test('vue d’ensemble : tous les tronçons, avec des chevrons de sens', () => {
    const { container } = render(
      <PctRouteLines points={points} phase="overview" widthPx={1000} heightPx={1000} />,
    );
    const svg = screen.getByTestId('map-route-lines');
    expect(svg.getAttribute('class')).toContain('is-phase-overview');
    expect(container.querySelectorAll('.fm-pct-route__stroke')).toHaveLength(2);
    expect(container.querySelectorAll('.fm-pct-route__chevron').length).toBeGreaterThan(2);
    expect(screen.queryByTestId('map-route-guide')).toBe(null);
  });

  test('en étape : tronçons passés grisés, ligne de guidage vers l’étape courante', () => {
    const { container } = render(
      <PctRouteLines
        points={points}
        phase="steps"
        currentIndex={2}
        guideFrom={{ xp: 40, yp: 40 }}
        guideTo={{ xp: 50, yp: 60 }}
        widthPx={1000}
        heightPx={1000}
      />,
    );
    const strokes = [...container.querySelectorAll('.fm-pct-route__stroke')];
    expect(strokes.map((el) => el.getAttribute('class'))).toEqual([
      'fm-pct-route__stroke is-done',
      'fm-pct-route__stroke is-current',
    ]);
    expect(screen.getByTestId('map-route-guide')).toBeTruthy();
  });

  test('tracé complet masqué : seule la ligne de guidage reste (cas « Y aller »)', () => {
    const { container } = render(
      <PctRouteLines
        showFullPath={false}
        guideFrom={{ xp: 0, yp: 0 }}
        guideTo={{ xp: 50, yp: 50 }}
        widthPx={400}
        heightPx={300}
        className="fm-pct-direct-line"
      />,
    );
    expect(container.querySelector('.fm-pct-direct-line')).toBeTruthy();
    expect(container.querySelectorAll('.fm-pct-route__stroke')).toHaveLength(0);
  });

  test('rien à dessiner : aucun SVG', () => {
    render(<PctRouteLines points={[]} widthPx={100} heightPx={100} />);
    expect(screen.queryByTestId('map-route-lines')).toBe(null);
  });
});

describe('PctRouteBadges', () => {
  test('vue d’ensemble : numéros, départ et arrivée', () => {
    render(<PctRouteBadges points={points} phase="overview" total={3} />);
    const badges = screen.getByTestId('map-route-badges').querySelectorAll('[data-step-number]');
    expect([...badges].map((b) => b.getAttribute('data-step-number'))).toEqual(['1', '2', '3']);
    expect(screen.getByText('Départ')).toBeTruthy();
    expect(screen.getByText('Arrivée 🏁')).toBeTruthy();
  });

  test('en étape : étapes passées cochées, étape courante marquée', () => {
    render(<PctRouteBadges points={points} phase="steps" currentIndex={1} total={3} />);
    const badges = [
      ...screen.getByTestId('map-route-badges').querySelectorAll('[data-step-number]'),
    ];
    expect(badges[0].textContent).toBe('✓');
    expect(badges[1].className).toContain('is-current');
    expect(badges[2].className).toContain('is-upcoming');
    expect(screen.queryByText('Départ')).toBe(null);
  });
});
