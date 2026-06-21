import { describe, test, expect } from 'vitest';
import { computeGlDicePopoverPosition } from '../../src/gl/utils/glDicePopoverPosition.js';

const anchor = { left: 20, top: 500, right: 64, bottom: 544, width: 44, height: 44 };
const board = { left: 0, top: 80, right: 800, bottom: 560, width: 800, height: 480 };
const viewport = { width: 900, height: 900 };

describe('computeGlDicePopoverPosition', () => {
  test('place le popover sous le plateau quand la place le permet', () => {
    const pos = computeGlDicePopoverPosition({
      anchorRect: anchor,
      panelWidth: 300,
      panelHeight: 280,
      avoidRect: board,
      viewportWidth: viewport.width,
      viewportHeight: viewport.height,
    });
    expect(pos.top).toBeGreaterThanOrEqual(board.bottom + 8);
    expect(pos.left).toBeGreaterThanOrEqual(8);
  });

  test('évite le recouvrement du plateau si possible', () => {
    const pos = computeGlDicePopoverPosition({
      anchorRect: anchor,
      panelWidth: 300,
      panelHeight: 280,
      avoidRect: board,
      viewportWidth: viewport.width,
      viewportHeight: viewport.height,
    });
    const panel = {
      left: pos.left,
      top: pos.top,
      right: pos.left + 300,
      bottom: pos.top + 280,
    };
    const overlaps =
      panel.left < board.right &&
      panel.right > board.left &&
      panel.top < board.bottom &&
      panel.bottom > board.top;
    expect(overlaps).toBe(false);
  });

  test('retourne une position dans le viewport', () => {
    const pos = computeGlDicePopoverPosition({
      anchorRect: anchor,
      panelWidth: 300,
      panelHeight: 280,
      avoidRect: board,
      viewportWidth: 360,
      viewportHeight: 400,
    });
    expect(pos.left).toBeGreaterThanOrEqual(8);
    expect(pos.top).toBeGreaterThanOrEqual(8);
    expect(pos.left + 300).toBeLessThanOrEqual(360 - 8);
    expect(pos.top + 280).toBeLessThanOrEqual(400 - 8);
  });
});
