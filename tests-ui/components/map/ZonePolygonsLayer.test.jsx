// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import React from 'react';
import {
  ZonePolygonsLayer,
  parseZonesForLayer,
} from '../../../src/components/map/ZonePolygonsLayer.jsx';

const EMOJIS = ['🌳', '🌱'];

const zoneFixture = (over = {}) => ({
  id: 1,
  name: '🌳 Verger',
  color: '#86efac80',
  special: 0,
  points: JSON.stringify([
    { xp: 0, yp: 0 },
    { xp: 50, yp: 0 },
    { xp: 50, yp: 50 },
  ]),
  ...over,
});

function renderLayer(props = {}) {
  const defaults = {
    parsedZones: parseZonesForLayer([zoneFixture()], EMOJIS),
    iw: 200,
    ih: 100,
    inv: 1,
    mode: 'view',
    showLabels: true,
    editZoneId: null,
    zoneTaskVisualById: new Map(),
    zoneTutorialCountById: new Map(),
    emojiFontPx: 16,
    labelFontPx: 12,
    emojiLabelCenterGap: 14,
    onZoneOpen: vi.fn(),
  };
  const merged = { ...defaults, ...props };
  const view = render(
    <svg>
      <g>
        <ZonePolygonsLayer {...merged} />
      </g>
    </svg>,
  );
  return { ...view, props: merged };
}

describe('parseZonesForLayer', () => {
  it('pré-parse points/emoji/nom et écarte les contours invalides', () => {
    const zones = [
      zoneFixture(),
      zoneFixture({ id: 2, points: 'pas-du-json' }),
      zoneFixture({ id: 3, points: JSON.stringify([{ xp: 1, yp: 1 }]) }),
      zoneFixture({ id: 4, points: null }),
    ];
    const parsed = parseZonesForLayer(zones, EMOJIS);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].zone.id).toBe(1);
    expect(parsed[0].pts).toHaveLength(3);
    expect(parsed[0].zoneEmoji).toBe('🌳');
    expect(parsed[0].zoneName).toBe('Verger');
  });
});

describe('ZonePolygonsLayer', () => {
  it('rend le polygone, l’emoji et le nom de zone (mode view)', () => {
    const { container, getByText } = renderLayer();
    const poly = container.querySelector('polygon');
    // 3 points en % convertis dans le monde image 200×100.
    expect(poly).toHaveAttribute('points', '0,0 100,0 100,50');
    expect(getByText('🌳')).toBeInTheDocument();
    expect(getByText('Verger')).toBeInTheDocument();
    expect(container.querySelector('g.map-zone-hit')).toBeTruthy();
  });

  it('transmet la zone au clic via onZoneOpen (handler stable côté parent)', () => {
    const onZoneOpen = vi.fn();
    const { container } = renderLayer({ onZoneOpen });
    fireEvent.click(container.querySelector('g.map-zone-hit'));
    expect(onZoneOpen).toHaveBeenCalledTimes(1);
    expect(onZoneOpen.mock.calls[0][0].id).toBe(1);
  });

  it('affiche les pastilles tâche et tutoriel comme avant', () => {
    const { container, getByText } = renderLayer({
      zoneTaskVisualById: new Map([[1, 'todo']]),
      zoneTutorialCountById: new Map([[1, 2]]),
    });
    expect(container.querySelector('.map-task-status--todo')).toBeTruthy();
    expect(container.querySelector('.map-tutorial-zone-dot')).toBeTruthy();
    expect(getByText('2 tutoriels liés')).toBeInTheDocument();
  });

  it('met en surbrillance la zone en édition de contour', () => {
    const { container } = renderLayer({ mode: 'edit-points', editZoneId: 1 });
    const poly = container.querySelector('polygon');
    expect(poly).toHaveAttribute('fill', 'rgba(82,183,136,0.35)');
    expect(poly).toHaveAttribute('stroke', '#52b788');
    // Pas de curseur pointeur ni de hit-class hors mode view.
    expect(container.querySelector('g.map-zone-hit')).toBeNull();
  });
});
