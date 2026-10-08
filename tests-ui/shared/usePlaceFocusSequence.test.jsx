import { describe, test, expect, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { usePlaceFocusSequence } from '../../src/shared/pct-map/usePlaceFocusSequence.js';
import { useGLBoardFocus, useGLBoardFocusRestore } from '../../src/gl/hooks/useGLBoardFocus.js';

/**
 * Séquence « zoom sur le lieu, puis fiche, puis retour à la vue d'avant » (carte de travail,
 * Visite, Plan, plateaux GL).
 */

const zone = {
  kind: 'zone',
  points: [
    { xp: 10, yp: 10 },
    { xp: 30, yp: 10 },
    { xp: 30, yp: 40 },
  ],
};
const marker = { kind: 'marker', x_pct: 50, y_pct: 50 };

function deferred() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function fakeViewport() {
  const flights = [];
  let snap = 0;
  return {
    flights,
    flyToPctBounds: vi.fn(() => {
      const d = deferred();
      flights.push(d);
      return d.promise;
    }),
    restoreViewAnimated: vi.fn(() => Promise.resolve(true)),
    getViewSnapshot: vi.fn(() => ({ xp: 50, yp: 50, zoom: 1, n: ++snap })),
  };
}

function setup(vp, props = {}) {
  return renderHook((p) => usePlaceFocusSequence({ getViewport: () => vp, ...p }), {
    initialProps: props,
  });
}

describe('usePlaceFocusSequence', () => {
  test('la fiche ne s’ouvre qu’après le zoom', async () => {
    const vp = fakeViewport();
    const { result } = setup(vp, { maxZoom: 3, durationMs: 200 });
    const open = vi.fn();
    act(() => result.current.focusThenOpen(zone, open, { insets: { bottom: 100 } }));
    expect(open).not.toHaveBeenCalled();
    expect(vp.flyToPctBounds).toHaveBeenCalledWith(
      zone.points,
      expect.objectContaining({
        insets: { bottom: 100 },
        maxZoom: 3,
        duration: 200,
      }),
    );
    await act(async () => vp.flights[0].resolve(true));
    expect(open).toHaveBeenCalledTimes(1);
  });

  test('un zoom interrompu par un geste ouvre quand même la fiche', async () => {
    const vp = fakeViewport();
    const { result } = setup(vp);
    const open = vi.fn();
    act(() => result.current.focusThenOpen(marker, open));
    await act(async () => vp.flights[0].resolve(false));
    expect(open).toHaveBeenCalledTimes(1);
  });

  test('un second clic rend caduque la première ouverture', async () => {
    const vp = fakeViewport();
    const { result } = setup(vp);
    const first = vi.fn();
    const second = vi.fn();
    act(() => result.current.focusThenOpen(zone, first));
    act(() => result.current.focusThenOpen(marker, second));
    await act(async () => {
      vp.flights[0].resolve(true);
      vp.flights[1].resolve(true);
    });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  test('enchaîner les lieux garde la vue d’origine, restaurée à la fermeture', async () => {
    const vp = fakeViewport();
    const { result } = setup(vp, { durationMs: 300 });
    act(() => result.current.focusThenOpen(zone, () => {}));
    await act(async () => vp.flights[0].resolve(true));
    act(() => result.current.focusThenOpen(marker, () => {}));
    await act(async () => vp.flights[1].resolve(true));
    expect(vp.getViewSnapshot).toHaveBeenCalledTimes(1);
    expect(result.current.hasSnapshot()).toBe(true);
    act(() => result.current.restore());
    expect(vp.restoreViewAnimated).toHaveBeenCalledWith(
      expect.objectContaining({ n: 1 }),
      expect.objectContaining({ duration: 300 }),
    );
    expect(result.current.hasSnapshot()).toBe(false);
  });

  test('fermer pendant le zoom annule l’ouverture', async () => {
    const vp = fakeViewport();
    const { result } = setup(vp);
    const open = vi.fn();
    act(() => result.current.focusThenOpen(zone, open));
    act(() => result.current.restore());
    await act(async () => vp.flights[0].resolve(true));
    expect(open).not.toHaveBeenCalled();
  });

  test('désactivée : ouverture immédiate, carte intouchée', () => {
    const vp = fakeViewport();
    const { result } = setup(vp, { enabled: false });
    const open = vi.fn();
    act(() => result.current.focusThenOpen(zone, open));
    expect(open).toHaveBeenCalledTimes(1);
    expect(vp.flyToPctBounds).not.toHaveBeenCalled();
    act(() => result.current.restore());
    expect(vp.restoreViewAnimated).not.toHaveBeenCalled();
  });

  test('retour désactivé : la carte reste sur le lieu à la fermeture', async () => {
    const vp = fakeViewport();
    const { result } = setup(vp, { restoreOnClose: false });
    act(() => result.current.focusThenOpen(zone, () => {}));
    await act(async () => vp.flights[0].resolve(true));
    act(() => result.current.restore());
    expect(vp.restoreViewAnimated).not.toHaveBeenCalled();
  });

  test('« Y aller » (forget) : pas de retour à la vue d’avant', async () => {
    const vp = fakeViewport();
    const { result } = setup(vp);
    act(() => result.current.focusThenOpen(zone, () => {}));
    await act(async () => vp.flights[0].resolve(true));
    act(() => result.current.forget());
    act(() => result.current.restore());
    expect(vp.restoreViewAnimated).not.toHaveBeenCalled();
  });

  test('changement de carte : la vue mémorisée est oubliée', async () => {
    const vp = fakeViewport();
    const { result, rerender } = setup(vp, { resetKey: 'a' });
    act(() => result.current.focusThenOpen(zone, () => {}));
    await act(async () => vp.flights[0].resolve(true));
    rerender({ resetKey: 'b' });
    expect(result.current.hasSnapshot()).toBe(false);
  });

  test('rien à animer (cadre non mesuré, mouvement réduit) : ouverture dans le même tour', () => {
    const vp = { ...fakeViewport(), flyToPctBounds: vi.fn(() => false) };
    const { result } = setup(vp);
    const open = vi.fn();
    act(() => result.current.focusThenOpen(zone, open));
    expect(open).toHaveBeenCalledTimes(1);
  });

  test('lieu sans géométrie ou moteur absent : ouverture immédiate', () => {
    const open = vi.fn();
    const { result } = renderHook(() => usePlaceFocusSequence({ getViewport: () => null }));
    act(() => result.current.focusThenOpen(zone, open));
    const vp = fakeViewport();
    const second = setup(vp);
    act(() => second.result.current.focusThenOpen({ kind: 'zone', points: '[]' }, open));
    expect(open).toHaveBeenCalledTimes(2);
    expect(vp.flyToPctBounds).not.toHaveBeenCalled();
  });

  test('effets : vol aller puis retour annoncés avec le lieu et les échelles', async () => {
    const vp = fakeViewport();
    vp.flyToPctBounds.mockImplementation((_pts, opts) => {
      opts.onPlan?.({ fromScale: 1, toScale: 3, durationMs: 300 });
      const d = deferred();
      vp.flights.push(d);
      return d.promise;
    });
    vp.restoreViewAnimated.mockImplementation((_snap, opts) => {
      opts.onPlan?.({ fromScale: 3, toScale: 1, durationMs: 300 });
      return Promise.resolve(true);
    });
    const onFx = vi.fn();
    const { result } = setup(vp, { onFx });
    act(() => result.current.focusThenOpen(zone, () => {}));
    expect(onFx).toHaveBeenLastCalledWith({
      type: 'in',
      place: zone,
      fromScale: 1,
      toScale: 3,
      durationMs: 300,
    });
    await act(async () => vp.flights[0].resolve(true));
    act(() => result.current.restore());
    expect(onFx).toHaveBeenLastCalledWith({
      type: 'out',
      place: zone,
      fromScale: 3,
      toScale: 1,
      durationMs: 300,
    });
  });

  test('effets : retour sans animation ou « Y aller » éteignent les effets', async () => {
    const vp = fakeViewport();
    const onFx = vi.fn();
    const { result } = setup(vp, { onFx });
    act(() => result.current.focusThenOpen(zone, () => {}));
    await act(async () => vp.flights[0].resolve(true));
    act(() => result.current.restore());
    expect(onFx).toHaveBeenLastCalledWith({ type: 'cancel' });
    onFx.mockClear();
    act(() => result.current.forget());
    expect(onFx).toHaveBeenCalledWith({ type: 'cancel' });
  });
});

describe('plateau GL : useGLBoardFocus', () => {
  test('beforePresent attend le zoom ; la fermeture du popover restaure la vue', async () => {
    const vp = fakeViewport();
    const { result, rerender } = renderHook(
      ({ open }) => {
        const focus = useGLBoardFocus({ mapGestures: vp, settings: { durationMs: 200 } });
        useGLBoardFocusRestore(open, focus.restore);
        return focus;
      },
      { initialProps: { open: false } },
    );
    let presented = false;
    act(() => {
      result.current.beforePresent(marker).then(() => {
        presented = true;
      });
    });
    await act(async () => {});
    expect(presented).toBe(false);
    await act(async () => vp.flights[0].resolve(true));
    expect(presented).toBe(true);
    rerender({ open: true });
    expect(vp.restoreViewAnimated).not.toHaveBeenCalled();
    rerender({ open: false });
    expect(vp.restoreViewAnimated).toHaveBeenCalledTimes(1);
  });

  test('désactivé par le MJ : présentation immédiate', async () => {
    const vp = fakeViewport();
    const { result } = renderHook(() =>
      useGLBoardFocus({ mapGestures: vp, settings: { enabled: false } }),
    );
    await act(async () => {
      await result.current.beforePresent(zone);
    });
    expect(vp.flyToPctBounds).not.toHaveBeenCalled();
  });
});
