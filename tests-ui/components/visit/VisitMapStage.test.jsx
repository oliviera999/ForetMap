// @vitest-environment jsdom
import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { VisitMapStage } from '../../../src/components/visit/VisitMapStage.jsx';

vi.mock('../../../src/shared/pct-map/usePctMapViewport.js', () => {
  const noop = () => {};
  return {
    usePctMapViewport: () => ({
      containerRef: { current: null },
      worldRef: { current: null },
      imgRef: { current: null },
      committed: { x: 0, y: 0, s: 1 },
      fitRect: { offsetX: 0, offsetY: 0, width: 100, height: 80 },
      fitScale: 1,
      stageSize: { w: 100, h: 80 },
      imgSize: { w: 100, h: 80 },
      fitMap: noop,
      fitMapAnimated: noop,
      zoomBy: noop,
      focusOnPct: noop,
      consumeSkipClick: () => false,
      toImagePct: () => null,
      touchAction: 'none',
      setMapOrientation: noop,
      orientStyle: {},
    }),
  };
});

const MAP = { id: 'foret', map_image_url: '/maps/map-foret.svg', label: 'Forêt' };
const ZONES = [
  {
    id: 1,
    name: 'Verger',
    points: JSON.stringify([
      { xp: 10, yp: 10 },
      { xp: 40, yp: 10 },
      { xp: 40, yp: 40 },
    ]),
  },
];
const MARKERS = [{ id: 11, label: 'Compost', x_pct: 20, y_pct: 30, emoji: '🌱' }];

describe('VisitMapStage', () => {
  test('conserve le modificateur plein écran passé par la vue', () => {
    const { container } = render(
      <VisitMapStage
        map={MAP}
        zones={ZONES}
        markers={MARKERS}
        selectedPlace={null}
        onSelectPlace={() => {}}
        className="visit-map-stage visit-map-stage--fullscreen"
      />,
    );
    const stage = container.querySelector('.visit-map-stage');
    expect(stage).not.toBeNull();
    expect(stage).toHaveClass('visit-map-stage--fullscreen');
    expect(screen.getByTestId('visit-zoom-in')).toBeTruthy();
  });
});
