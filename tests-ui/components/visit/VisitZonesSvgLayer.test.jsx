// @vitest-environment jsdom
import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { VisitZonesSvgLayer } from '../../../src/components/visit/VisitZonesSvgLayer.jsx';
import { parseVisitZonePoints } from '../../../src/utils/visitMapGeometry.js';

vi.mock('../../../src/utils/visitMapGeometry.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, parseVisitZonePoints: vi.fn(actual.parseVisitZonePoints) };
});

const TYPO = { emojiU: 4, labelU: 2, gapU: 3, strokeU: 0.5 };

const zone = (
  id,
  name,
  pts = [
    { xp: 10, yp: 10 },
    { xp: 30, yp: 10 },
    { xp: 20, yp: 30 },
  ],
) => ({
  id,
  name,
  points: JSON.stringify(pts),
});

function renderLayer(overrides = {}) {
  const props = {
    zones: [zone(1, '🌳 Verger')],
    seen: new Set(),
    markerEmojis: ['🌳', '💧'],
    typography: TYPO,
    fitWidth: 400,
    fitHeight: 300,
    mode: 'view',
    drawPoints: [],
    onZoneClick: vi.fn(),
    ...overrides,
  };
  const view = render(
    <svg>
      <VisitZonesSvgLayer {...props} />
    </svg>,
  );
  const rerenderWith = (next = {}) =>
    view.rerender(
      <svg>
        <VisitZonesSvgLayer {...props} {...next} />
      </svg>,
    );
  return { props, rerenderWith, ...view };
}

describe('VisitZonesSvgLayer', () => {
  test('rend un polygone par zone valide avec emoji et libellé séparés', () => {
    const { container } = renderLayer();
    const poly = container.querySelector('.visit-zone-poly');
    expect(poly).toBeTruthy();
    expect(poly.getAttribute('points')).toBe('10,10 30,10 20,30');
    expect(poly.classList.contains('is-unseen')).toBe(true);
    expect(container.querySelector('.visit-zone-label--emoji').textContent).toBe('🌳');
    expect(container.querySelector('.visit-zone-label--title').textContent).toBe('Verger');
  });

  test('ignore les zones au polygone invalide (< 3 points)', () => {
    const { container } = renderLayer({
      zones: [
        zone(1, 'Valide'),
        zone(2, 'Invalide', [
          { xp: 1, yp: 1 },
          { xp: 2, yp: 2 },
        ]),
      ],
    });
    expect(container.querySelectorAll('.visit-zone-poly')).toHaveLength(1);
  });

  test('applique is-seen selon la clé zone:id', () => {
    const { container } = renderLayer({ seen: new Set(['zone:1']) });
    expect(container.querySelector('.visit-zone-poly').classList.contains('is-seen')).toBe(true);
  });

  test('clic sur une zone : onZoneClick(zone, event)', () => {
    const { container, props } = renderLayer();
    fireEvent.click(container.querySelector('.visit-zone-hit'));
    expect(props.onZoneClick).toHaveBeenCalledTimes(1);
    expect(props.onZoneClick.mock.calls[0][0]).toMatchObject({ id: 1, name: '🌳 Verger' });
  });

  test('les points ne sont re-parsés que si `zones` change (pré-parse mémoïsé)', () => {
    const { rerenderWith } = renderLayer();
    const callsAfterMount = parseVisitZonePoints.mock.calls.length;
    expect(callsAfterMount).toBeGreaterThan(0);

    // Changement d'une prop non géométrique : pas de nouveau parse.
    rerenderWith({ seen: new Set(['zone:1']) });
    expect(parseVisitZonePoints.mock.calls.length).toBe(callsAfterMount);

    // Changement de `zones` : re-parse.
    rerenderWith({ seen: new Set(['zone:1']), zones: [zone(9, 'Mare')] });
    expect(parseVisitZonePoints.mock.calls.length).toBeGreaterThan(callsAfterMount);
  });

  test('mode draw-zone : aperçu du tracé rendu à partir d’un point', () => {
    const { container } = renderLayer({
      mode: 'draw-zone',
      drawPoints: [
        { xp: 5, yp: 5 },
        { xp: 15, yp: 5 },
      ],
    });
    // L'aperçu VisitDrawZonePreview rend la polyligne + un cercle par point posé.
    expect(container.querySelector('polyline')).toBeTruthy();
    expect(container.querySelectorAll('circle')).toHaveLength(2);
  });
});
