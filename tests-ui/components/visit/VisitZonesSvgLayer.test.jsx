import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { VisitZonesSvgLayer } from '../../../src/components/visit/VisitZonesSvgLayer.jsx';

const TYPOGRAPHY = {
  emojiU: 4,
  labelU: 3,
  gapU: 4,
  strokeU: 0.1,
  labelFontPx: 14,
  emojiFontPx: 20,
  minSideFactor: 0,
  labelMaxTextLengthU: 40,
  inv: 1,
};

function makeZone(overrides = {}) {
  return {
    id: 7,
    name: 'Verger',
    emoji: '',
    // `points` est stocké en JSON (cf. parsePctPolygonPoints).
    points: JSON.stringify([
      { xp: 10, yp: 10 },
      { xp: 60, yp: 10 },
      { xp: 60, yp: 60 },
      { xp: 10, yp: 60 },
    ]),
    ...overrides,
  };
}

function setup(overrides = {}) {
  const props = {
    zones: [makeZone()],
    seen: new Set(),
    markerEmojis: ['📍'],
    typography: TYPOGRAPHY,
    fitWidth: 400,
    fitHeight: 300,
    mode: 'view',
    drawPoints: [],
    onZoneClick: vi.fn(),
    ...overrides,
  };
  const utils = render(<VisitZonesSvgLayer {...props} />);
  return { ...utils, props };
}

describe('VisitZonesSvgLayer — accessibilité clavier des zones', () => {
  test('chaque zone est un bouton nommé, atteignable au clavier', () => {
    setup();
    const zone = screen.getByRole('button', { name: 'Verger' });
    expect(zone).toHaveClass('visit-zone-hit');
    expect(zone).toHaveAttribute('tabindex', '0');
  });

  test('zone sans nom exploitable → nom accessible de repli', () => {
    setup({ zones: [makeZone({ name: '   ' })] });
    expect(screen.getByRole('button', { name: 'Zone de visite' })).toBeInTheDocument();
  });

  test('Entrée et Espace ouvrent la zone comme un clic', () => {
    const { props } = setup();
    const zone = screen.getByRole('button', { name: 'Verger' });

    fireEvent.keyDown(zone, { key: 'Enter' });
    fireEvent.keyDown(zone, { key: ' ' });

    expect(props.onZoneClick).toHaveBeenCalledTimes(2);
    expect(props.onZoneClick.mock.calls[0][0]).toMatchObject({ id: 7 });
  });

  test('une autre touche ne déclenche pas l’ouverture', () => {
    const { props } = setup();
    fireEvent.keyDown(screen.getByRole('button', { name: 'Verger' }), { key: 'a' });
    expect(props.onZoneClick).not.toHaveBeenCalled();
  });

  test('le clic reste opérant (non-régression)', () => {
    const { props } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Verger' }));
    expect(props.onZoneClick).toHaveBeenCalledTimes(1);
  });

  test('l’emoji du nom est retiré du libellé accessible', () => {
    setup({ zones: [makeZone({ name: '📍 Verger' })] });
    expect(screen.getByRole('button', { name: 'Verger' })).toBeInTheDocument();
  });
});
