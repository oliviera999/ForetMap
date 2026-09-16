// @vitest-environment jsdom
import { afterEach, beforeEach, describe, test, expect, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';

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
      { xp: 10, yp: 40 },
    ]),
  },
  {
    id: 2,
    name: 'Mare',
    points: JSON.stringify([
      { xp: 60, yp: 60 },
      { xp: 90, yp: 60 },
      { xp: 90, yp: 90 },
      { xp: 60, yp: 90 },
    ]),
  },
];
const MARKERS = [
  { id: 11, label: 'Compost', x_pct: 50, y_pct: 50, emoji: '🌱' },
  { id: 12, label: 'Ruche', x_pct: 85, y_pct: 15, emoji: '🐝' },
];

describe('VisitMapStage', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

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

  test('progression : classes vu/non-vu sans pastille ; pas de halo en édition', () => {
    const seen = new Set(['zone:2']);
    const { container } = render(
      <VisitMapStage
        map={MAP}
        zones={ZONES}
        markers={MARKERS}
        seen={seen}
        selectedPlace={null}
        onSelectPlace={() => {}}
        editMode
      />,
    );
    expect(container.querySelector('.visit-zone-indicator')).toBeNull();
    expect(container.querySelector('.fm-pct-marker-indicator')).toBeNull();
    expect(container.querySelector('.fm-pct-zone.is-seen')).toBeTruthy();
    expect(container.querySelectorAll('.fm-pct-zone.is-unseen').length).toBeGreaterThan(0);
    expect(container.querySelector('.is-discover-halo')).toBeNull();
  });

  test('halo bref sur quelques non-vus à l’entrée (hors édition)', () => {
    const seen = new Set(['zone:2']);
    const { container } = render(
      <VisitMapStage
        map={MAP}
        zones={ZONES}
        markers={MARKERS}
        seen={seen}
        selectedPlace={null}
        onSelectPlace={() => {}}
        editMode={false}
      />,
    );
    expect(container.querySelector('.is-discover-halo')).toBeTruthy();
    expect(container.querySelector('.fm-pct-zone.is-seen.is-discover-halo')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(container.querySelector('.is-discover-halo')).toBeNull();
  });
});
