import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MapScaleCompassOverlay } from '../../src/shared/pct-map/MapScaleCompassOverlay.jsx';

const VALID_ANCHORS = [
  { xp: 10, yp: 10, lat: 48.85, lng: 2.3 },
  { xp: 90, yp: 10, lat: 48.85, lng: 2.31 },
  { xp: 10, yp: 90, lat: 48.84, lng: 2.3 },
];

describe('MapScaleCompassOverlay', () => {
  test('ne rend rien si invisible ou calage absent', () => {
    const { container: a } = render(
      <MapScaleCompassOverlay
        visible={false}
        georef={VALID_ANCHORS}
        contentWidthPx={800}
        scale={1}
      />,
    );
    expect(a.querySelector('[data-testid="map-scale-compass"]')).toBeNull();

    const { container: b } = render(
      <MapScaleCompassOverlay visible georef={null} contentWidthPx={800} scale={1} />,
    );
    expect(b.querySelector('[data-testid="map-scale-compass"]')).toBeNull();
  });

  test('affiche la barre d’échelle et la rose des vents pour un calage valide', () => {
    render(
      <MapScaleCompassOverlay
        visible
        georef={VALID_ANCHORS}
        contentWidthPx={800}
        scale={1}
        orientationDeg={0}
      />,
    );
    const root = screen.getByTestId('map-scale-compass');
    expect(root).toBeTruthy();
    expect(root.querySelector('.map-scale-compass__bar')).toBeTruthy();
    expect(root.querySelector('.map-scale-compass__label')?.textContent).toMatch(/\d/);
    expect(root.querySelector('.map-scale-compass__n')?.textContent).toBe('N');
  });

  test('oriente l’aiguille selon orientationDeg', () => {
    const { container } = render(
      <MapScaleCompassOverlay
        visible
        georef={VALID_ANCHORS}
        contentWidthPx={800}
        scale={1}
        orientationDeg={90}
      />,
    );
    const needle = container.querySelector('.map-scale-compass__needle');
    expect(needle?.getAttribute('style') || '').toMatch(/rotate\(/);
  });
});
