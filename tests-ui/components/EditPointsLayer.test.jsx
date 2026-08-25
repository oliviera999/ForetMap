import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EditPointsLayer } from '../../src/components/map/EditPointsLayer.jsx';

const POINTS = [
  { xp: 0, yp: 0 },
  { xp: 100, yp: 0 },
  { xp: 100, yp: 100 },
  { xp: 0, yp: 100 },
];

function renderLayer(overrides = {}) {
  const handlers = {
    onTranslatePointerDown: vi.fn(),
    onTranslatePointerMove: vi.fn(),
    endEditZoneTranslate: vi.fn(),
    onTranslateLostPointerCapture: vi.fn(),
    onEditPointPointerDown: vi.fn(),
    onEditPointPointerMove: vi.fn(),
    onEditPointPointerUp: vi.fn(),
    onInsertPointFromPct: vi.fn(() => 1),
    onInsertPointAtMidpoint: vi.fn(() => 1),
    onLassoPointerDown: vi.fn(),
    onLassoPointerMove: vi.fn(),
    onLassoPointerUp: vi.fn(),
    onLassoLostPointerCapture: vi.fn(),
  };
  const utils = render(
    <svg>
      <EditPointsLayer
        mode="edit-points"
        editPoints={POINTS}
        draggingPtIdx={-1}
        selectedPtIdxs={new Set()}
        iw={1000}
        ih={1000}
        inv={1}
        toImagePct={(x, y) => ({ xp: x / 10, yp: y / 10 })}
        {...handlers}
        {...overrides}
      />
    </svg>,
  );
  return { ...utils, handlers };
}

describe('EditPointsLayer', () => {
  test('ne rend rien hors du mode edit-points', () => {
    const { container } = renderLayer({ mode: 'view' });
    expect(container.querySelectorAll('.edit-pt')).toHaveLength(0);
  });

  test('une poignée par sommet et une poignée fantôme par arête', () => {
    const { container } = renderLayer();
    expect(container.querySelectorAll('.edit-pt')).toHaveLength(4);
    expect(container.querySelectorAll('.edit-mid')).toHaveLength(4);
    expect(screen.getByTestId('edit-mid-1')).toBeTruthy();
    expect(screen.getByTestId('edit-mid-4')).toBeTruthy();
  });

  test('au-delà de 60 sommets, les poignées fantômes disparaissent (lisibilité)', () => {
    const many = Array.from({ length: 61 }, (_v, i) => ({ xp: i, yp: i }));
    const { container } = renderLayer({ editPoints: many });
    expect(container.querySelectorAll('.edit-mid')).toHaveLength(0);
    expect(container.querySelectorAll('.edit-pt')).toHaveLength(61);
  });

  test('les sommets sélectionnés portent une classe dédiée', () => {
    const { container } = renderLayer({ selectedPtIdxs: new Set([1, 3]) });
    expect(container.querySelectorAll('.edit-pt--selected')).toHaveLength(2);
    expect(screen.getByTestId('edit-pt-1').getAttribute('class')).toContain('edit-pt--selected');
  });

  test('appuyer sur une poignée fantôme crée le sommet puis enchaîne sur son glissement', () => {
    const { handlers } = renderLayer();
    fireEvent.pointerDown(screen.getByTestId('edit-mid-2'));
    expect(handlers.onInsertPointAtMidpoint).toHaveBeenCalledWith(2, { xp: 100, yp: 50 });
    expect(handlers.onEditPointPointerDown).toHaveBeenCalledWith(1, expect.anything());

    fireEvent.pointerMove(screen.getByTestId('edit-mid-2'));
    expect(handlers.onEditPointPointerMove).toHaveBeenCalledWith(1, expect.anything());

    fireEvent.pointerUp(screen.getByTestId('edit-mid-2'));
    expect(handlers.onEditPointPointerUp).toHaveBeenCalled();
  });

  test('une insertion refusée n’enchaîne pas sur un glissement', () => {
    const { handlers } = renderLayer({ onInsertPointAtMidpoint: vi.fn(() => -1) });
    fireEvent.pointerDown(screen.getByTestId('edit-mid-1'));
    expect(handlers.onEditPointPointerDown).not.toHaveBeenCalled();
  });

  test('la bande d’arête n’apparaît qu’en mode « ＋ Sommet » et insère au clic', () => {
    const { queryByTestId } = renderLayer();
    expect(queryByTestId('edit-edge-band')).toBeNull();

    const { handlers } = renderLayer({ insertVertexMode: true });
    fireEvent.click(screen.getByTestId('edit-edge-band'), { clientX: 300, clientY: 0 });
    expect(handlers.onInsertPointFromPct).toHaveBeenCalledWith({ xp: 30, yp: 0 });
  });

  test('le fond capteur relaie les gestes de lasso', () => {
    const { container, handlers } = renderLayer();
    const capture = container.querySelector('.edit-lasso-capture');
    fireEvent.pointerDown(capture);
    fireEvent.pointerMove(capture);
    fireEvent.pointerUp(capture);
    expect(handlers.onLassoPointerDown).toHaveBeenCalled();
    expect(handlers.onLassoPointerMove).toHaveBeenCalled();
    expect(handlers.onLassoPointerUp).toHaveBeenCalled();
  });

  test('le rectangle de lasso est dessiné aux bonnes coordonnées monde', () => {
    renderLayer({ lassoRect: { x1: 10, y1: 20, x2: 40, y2: 60 } });
    const rect = screen.getByTestId('edit-lasso');
    expect(rect.getAttribute('x')).toBe('100');
    expect(rect.getAttribute('y')).toBe('200');
    expect(rect.getAttribute('width')).toBe('300');
    expect(rect.getAttribute('height')).toBe('400');
  });

  test('sans callback d’insertion, aucune poignée fantôme (calque en lecture)', () => {
    const { container } = renderLayer({ onInsertPointAtMidpoint: undefined });
    expect(container.querySelectorAll('.edit-mid')).toHaveLength(0);
    expect(container.querySelectorAll('.edit-pt')).toHaveLength(4);
  });
});
