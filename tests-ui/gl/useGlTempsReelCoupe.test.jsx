import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

/** Faux socket : `connected`, et de quoi émettre « connect » / « disconnect ». */
function fauxSocket(connected) {
  const ecouteurs = new Map();
  return {
    connected,
    on: (evt, fn) => ecouteurs.set(evt, [...(ecouteurs.get(evt) || []), fn]),
    off: (evt, fn) =>
      ecouteurs.set(
        evt,
        (ecouteurs.get(evt) || []).filter((f) => f !== fn),
      ),
    emettre(evt) {
      this.connected = evt === 'connect';
      for (const fn of ecouteurs.get(evt) || []) fn();
    },
    ecoutes: () => [...ecouteurs.values()].flat().length,
  };
}

const prise = { socket: null, release: vi.fn() };
vi.mock('../../src/gl/realtime/glSocketClient.js', () => ({
  acquireGlSocket: () => ({ socket: prise.socket, release: prise.release }),
}));

import {
  TEMPS_REEL_GRACE_MS,
  useGlTempsReelCoupe,
} from '../../src/gl/hooks/useGlTempsReelCoupe.js';

/**
 * Chantier « écrans de séance » — l'icône « Relire l'écran » de l'écran d'équipe ne se montre
 * que si le temps réel est coupé (ou l'état périmé). Ce hook dit quand il l'est.
 */
describe('useGlTempsReelCoupe', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    prise.release = vi.fn();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test('connecté : jamais coupé ; une coupure brève (moins que le délai de grâce) ne se voit pas', () => {
    prise.socket = fauxSocket(true);
    const onRetour = vi.fn();
    const { result } = renderHook(() => useGlTempsReelCoupe('tok', { onRetour }));
    expect(result.current).toBe(false);
    act(() => prise.socket.emettre('disconnect'));
    act(() => vi.advanceTimersByTime(TEMPS_REEL_GRACE_MS - 500));
    expect(result.current).toBe(false);
    act(() => prise.socket.emettre('connect'));
    act(() => vi.advanceTimersByTime(TEMPS_REEL_GRACE_MS));
    expect(result.current).toBe(false);
    // Rien n'a été manqué longtemps : l'écran ne se relit pas pour si peu.
    expect(onRetour).not.toHaveBeenCalled();
  });

  test('coupure qui dure : coupé ; au retour de la connexion, l’écran se relit une fois', () => {
    prise.socket = fauxSocket(true);
    const onRetour = vi.fn();
    const { result } = renderHook(() => useGlTempsReelCoupe('tok', { onRetour }));
    act(() => prise.socket.emettre('disconnect'));
    act(() => vi.advanceTimersByTime(TEMPS_REEL_GRACE_MS + 10));
    expect(result.current).toBe(true);
    expect(onRetour).not.toHaveBeenCalled();
    act(() => prise.socket.emettre('connect'));
    expect(result.current).toBe(false);
    expect(onRetour).toHaveBeenCalledTimes(1);
    // Une seconde coupure se signale de la même façon.
    act(() => prise.socket.emettre('disconnect'));
    act(() => vi.advanceTimersByTime(TEMPS_REEL_GRACE_MS + 10));
    expect(result.current).toBe(true);
  });

  test('socket qui ne se connecte pas à l’ouverture de l’écran : coupé après le délai de grâce', () => {
    prise.socket = fauxSocket(false);
    const { result } = renderHook(() => useGlTempsReelCoupe('tok'));
    expect(result.current).toBe(false);
    act(() => vi.advanceTimersByTime(TEMPS_REEL_GRACE_MS + 10));
    expect(result.current).toBe(true);
  });

  test('sans jeton ou sans socket : jamais coupé ; au démontage, le socket est rendu', () => {
    prise.socket = null;
    expect(renderHook(() => useGlTempsReelCoupe(null)).result.current).toBe(false);
    expect(renderHook(() => useGlTempsReelCoupe('tok')).result.current).toBe(false);

    prise.socket = fauxSocket(true);
    const { unmount } = renderHook(() => useGlTempsReelCoupe('tok'));
    expect(prise.socket.ecoutes()).toBe(2);
    unmount();
    expect(prise.socket.ecoutes()).toBe(0);
    expect(prise.release).toHaveBeenCalledTimes(1);
  });
});
