// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { render } from '@testing-library/react';
import React from 'react';
import useZoneDrawing from '../../src/hooks/useZoneDrawing.js';
import { DrawingLayer } from '../../src/components/map/DrawingLayer.jsx';

const P = (xp, yp) => ({ xp, yp });

function setup() {
  const setMode = vi.fn();
  const setPendingZone = vi.fn();
  const hook = renderHook(() => useZoneDrawing({ setMode, setPendingZone }));
  return { setMode, setPendingZone, ...hook };
}

describe('useZoneDrawing', () => {
  it('ajoute des points et annule le dernier (undoPoint)', () => {
    const { result } = setup();
    act(() => result.current.addDrawPoint(P(1, 1)));
    act(() => result.current.addDrawPoint(P(2, 2)));
    expect(result.current.drawPoints).toEqual([P(1, 1), P(2, 2)]);
    act(() => result.current.undoPoint());
    expect(result.current.drawPoints).toEqual([P(1, 1)]);
  });

  it('finishZone ne fait rien sous 3 points', () => {
    const { result, setMode, setPendingZone } = setup();
    act(() => result.current.addDrawPoint(P(1, 1)));
    act(() => result.current.addDrawPoint(P(2, 2)));
    act(() => result.current.finishZone());
    expect(setPendingZone).not.toHaveBeenCalled();
    expect(setMode).not.toHaveBeenCalled();
    expect(result.current.drawPoints).toHaveLength(2);
  });

  it('finishZone à ≥ 3 points : ouvre la modale, vide le tracé, repasse en vue', () => {
    const { result, setMode, setPendingZone } = setup();
    const pts = [P(1, 1), P(2, 2), P(3, 3)];
    pts.forEach((p) => act(() => result.current.addDrawPoint(p)));
    act(() => result.current.finishZone());
    expect(setPendingZone).toHaveBeenCalledWith(pts);
    expect(setMode).toHaveBeenCalledWith('view');
    expect(result.current.drawPoints).toEqual([]);
  });

  it('cancelDraw vide le tracé et repasse en vue', () => {
    const { result, setMode } = setup();
    act(() => result.current.addDrawPoint(P(1, 1)));
    act(() => result.current.cancelDraw());
    expect(result.current.drawPoints).toEqual([]);
    expect(setMode).toHaveBeenCalledWith('view');
  });
});

describe('DrawingLayer', () => {
  const layer = (drawPoints) =>
    render(
      <svg>
        <g>
          <DrawingLayer drawPoints={drawPoints} iw={200} ih={100} inv={1} />
        </g>
      </svg>,
    );

  it('ne rend rien sans point', () => {
    const { container } = layer([]);
    expect(container.querySelector('polyline')).toBeNull();
    expect(container.querySelector('circle')).toBeNull();
  });

  it('rend un sommet (croix + disques) sans polyligne pour un point unique', () => {
    const { container } = layer([P(50, 50)]);
    expect(container.querySelector('polyline')).toBeNull();
    expect(container.querySelectorAll('circle')).toHaveLength(2);
    expect(container.querySelectorAll('line')).toHaveLength(2);
  });

  it('rend la polyligne pointillée dès 2 points, en coordonnées monde', () => {
    const { container } = layer([P(0, 0), P(50, 100)]);
    const polyline = container.querySelector('polyline');
    expect(polyline).toHaveAttribute('points', '0,0 100,100');
    expect(polyline).toHaveAttribute('stroke', '#52b788');
  });
});
