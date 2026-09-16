import { describe, test, expect, beforeEach, vi } from 'vitest';

/**
 * Profondeur d'historique des surcouches (`overlayHistory`).
 *
 * Le cas qui a mordu en production : toucher un résultat de recherche ferme la liste **et**
 * ouvre la fiche dans le même rendu React. Le `history.back()` immédiat du démontage partait
 * avant le `pushState` du montage ; la fermeture suivante reculait alors une entrée de trop et
 * le visiteur quittait le plan (`docs/AUDIT_PLAN_NAVIGATION_UX_2026-09-16.md` N16).
 */

/** Historique factice : compte les entrées posées et les reculs demandés. */
function installFakeHistory() {
  const state = { entries: 1, back: 0, listeners: [] };
  const history = {
    pushState: () => {
      state.entries += 1;
    },
    back: () => {
      state.back += 1;
      state.entries -= 1;
    },
    go: (delta) => {
      state.back += Math.abs(delta);
      state.entries += delta;
    },
  };
  globalThis.window = {
    history,
    location: { href: 'http://localhost/' },
    addEventListener: (type, fn) => {
      if (type === 'popstate') state.listeners.push(fn);
    },
    removeEventListener: () => {},
    setTimeout: (fn, ms) => setTimeout(fn, ms),
  };
  return state;
}

/** Laisse passer les microtâches (la synchronisation d'historique est différée). */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('overlayHistory — profondeur d’historique', () => {
  let mod;
  let fake;

  beforeEach(async () => {
    vi.resetModules();
    fake = installFakeHistory();
    mod = await import('../../src/shared/platform/overlayHistory.js');
  });

  test('une surcouche ouverte puis fermée rend exactement son entrée', async () => {
    const close = vi.fn();
    mod.pushOverlayClose(close);
    expect(fake.entries).toBe(2);
    mod.removeOverlayClose(close);
    await flush();
    expect(fake.back).toBe(1);
    expect(fake.entries).toBe(1);
  });

  test('une surcouche qui en remplace une autre dans le même rendu ne recule pas deux fois', async () => {
    const closeList = vi.fn();
    const closeSheet = vi.fn();
    mod.pushOverlayClose(closeList);
    // Même lot React : démontage de la liste, puis montage de la fiche.
    mod.removeOverlayClose(closeList);
    mod.pushOverlayClose(closeSheet);
    await flush();
    // Une seule surcouche ouverte : une seule entrée en trop, donc un seul recul.
    expect(fake.entries).toBe(2);
    mod.removeOverlayClose(closeSheet);
    await flush();
    // Retour au point de départ : le visiteur n'a jamais quitté la page.
    expect(fake.entries).toBe(1);
    expect(closeList).not.toHaveBeenCalled();
    expect(closeSheet).not.toHaveBeenCalled();
  });

  test('le retour navigateur ferme la surcouche du sommet sans reculer en plus', async () => {
    const close = vi.fn();
    mod.pushOverlayClose(close);
    fake.entries -= 1; // le navigateur a reculé de lui-même
    fake.listeners.forEach((fn) => fn());
    await flush();
    expect(close).toHaveBeenCalledTimes(1);
    expect(fake.back).toBe(0);
    expect(fake.entries).toBe(1);
  });

  test('deux surcouches empilées se dépilent une par une', async () => {
    const a = vi.fn();
    const b = vi.fn();
    mod.pushOverlayClose(a);
    mod.pushOverlayClose(b);
    expect(fake.entries).toBe(3);
    mod.removeOverlayClose(b);
    await flush();
    expect(fake.entries).toBe(2);
    mod.removeOverlayClose(a);
    await flush();
    expect(fake.entries).toBe(1);
  });

  test('abandonAllOverlays ne recule que des entrées réellement posées', async () => {
    const a = vi.fn();
    const b = vi.fn();
    mod.pushOverlayClose(a);
    mod.pushOverlayClose(b);
    mod.abandonAllOverlays();
    expect(fake.entries).toBe(1);
    expect(a).not.toHaveBeenCalled();
    expect(b).not.toHaveBeenCalled();
  });
});
