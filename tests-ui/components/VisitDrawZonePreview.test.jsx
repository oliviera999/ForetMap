import React from 'react';
import { describe, test, expect } from 'vitest';
import { render } from '@testing-library/react';
import { VisitDrawZonePreview } from '../../src/components/VisitDrawZonePreview.jsx';

function renderInSvg(points) {
  return render(
    <svg viewBox="0 0 100 100">
      <VisitDrawZonePreview points={points} />
    </svg>,
  );
}

describe('VisitDrawZonePreview', () => {
  test('trace la polyligne des points posés', () => {
    const { container } = renderInSvg([
      { xp: 10, yp: 20 },
      { xp: 30, yp: 40 },
      { xp: 50, yp: 15 },
    ]);
    const polyline = container.querySelector('polyline');
    expect(polyline).toBeInTheDocument();
    expect(polyline).toHaveAttribute('points', '10,20 30,40 50,15');
    expect(polyline).toHaveAttribute('stroke', '#166534');
    expect(polyline).toHaveAttribute('stroke-dasharray', '0.8 0.4');
  });

  test('un cercle par point posé', () => {
    const { container } = renderInSvg([
      { xp: 10, yp: 20 },
      { xp: 30, yp: 40 },
    ]);
    const circles = container.querySelectorAll('circle');
    expect(circles).toHaveLength(2);
    expect(circles[0]).toHaveAttribute('cx', '10');
    expect(circles[0]).toHaveAttribute('cy', '20');
    expect(circles[0]).toHaveAttribute('r', '0.7');
    expect(circles[0]).toHaveAttribute('fill', '#166534');
  });

  test('avec un seul point : polyligne sans segment et un seul cercle', () => {
    const { container } = renderInSvg([{ xp: 42, yp: 7 }]);
    expect(container.querySelector('polyline')).toHaveAttribute('points', '42,7');
    expect(container.querySelectorAll('circle')).toHaveLength(1);
  });
});
