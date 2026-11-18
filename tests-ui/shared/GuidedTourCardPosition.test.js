import { describe, expect, test } from 'vitest';

import { computeCardPosition } from '../../src/shared/components/GuidedTourOverlay.jsx';

/**
 * Placement de la carte de visite guidée (bulle d'Olu) : elle doit toujours tenir
 * entière dans l'écran, sinon ses boutons Passer / Suivant deviennent inaccessibles.
 */
const VIEWPORT = { width: 390, height: 700 };
const GUTTER = 12;

function rectAt(top, height = 40, left = 100, width = 120) {
  return { top, left, width, height, bottom: top + height, right: left + width };
}

function assertInside(card, cardHeight, viewport = VIEWPORT) {
  const h = Math.min(cardHeight, viewport.height - GUTTER * 2);
  expect(card.top).toBeGreaterThanOrEqual(GUTTER);
  expect(card.top + h).toBeLessThanOrEqual(viewport.height - GUTTER);
  expect(card.left).toBeGreaterThanOrEqual(GUTTER);
  expect(card.left + card.width).toBeLessThanOrEqual(viewport.width - GUTTER);
}

describe('computeCardPosition — la carte reste dans l’écran', () => {
  test('cible basse + carte haute : la carte passe au-dessus au lieu de déborder', () => {
    const rect = rectAt(450);
    const card = computeCardPosition(rect, 'auto', 320, 360, VIEWPORT);
    assertInside(card, 360);
    expect(card.top + 360).toBeLessThanOrEqual(rect.top);
  });

  test('placement « bottom » imposé mais sans place : retourné au-dessus', () => {
    const rect = rectAt(500);
    const card = computeCardPosition(rect, 'bottom', 320, 300, VIEWPORT);
    assertInside(card, 300);
  });

  test('cible au milieu, ni dessus ni dessous ne suffit : recalée dans l’écran', () => {
    const rect = rectAt(300, 100);
    const card = computeCardPosition(rect, 'auto', 320, 400, VIEWPORT);
    assertInside(card, 400);
  });

  test('carte plus haute que l’écran : bornée à la fenêtre', () => {
    const card = computeCardPosition(rectAt(200), 'auto', 320, 2000, VIEWPORT);
    expect(card.maxHeight).toBe(VIEWPORT.height - GUTTER * 2);
    assertInside(card, 2000);
  });

  test('sans cible : centrée et entière', () => {
    const card = computeCardPosition(null, undefined, 320, 500, VIEWPORT);
    expect(card.centered).toBe(true);
    assertInside(card, 500);
  });

  test('place suffisante dessous : comportement inchangé (sous la cible)', () => {
    const rect = rectAt(80);
    const card = computeCardPosition(rect, 'auto', 320, 200, VIEWPORT);
    expect(card.top).toBe(rect.bottom + 14);
  });
});
