import { describe, expect, test, vi } from 'vitest';
import { createApiRetryGate, MAX_GATE_WAIT_MS } from '../../src/shared/apiRetryGate.js';

/**
 * Fenêtre de réessai partagée : ce qui est vérifié ici, c'est qu'une requête qui constate
 * une indisponibilité en informe les autres — sans quoi les ~9 requêtes d'un cycle de
 * rafraîchissement redécouvrent chacune que le serveur est absent, et les réessais d'une
 * salle entière derrière la même IP publique atteignent le plafond de 1200 req/min.
 */

/** Horloge et sommeil contrôlés : le temps n'avance que quand on attend. */
function fakeClock() {
  let current = 1000;
  const waits = [];
  return {
    waits,
    now: () => current,
    sleep: async (ms) => {
      waits.push(ms);
      current += ms;
    },
    advance: (ms) => {
      current += ms;
    },
  };
}

describe('apiRetryGate', () => {
  test('sans pause ouverte, wait() rend la main immédiatement', async () => {
    const clock = fakeClock();
    const gate = createApiRetryGate({ now: clock.now, sleep: clock.sleep });
    expect(await gate.wait()).toBe(0);
    expect(clock.waits).toEqual([]);
  });

  test('une requête qui ouvre la pause fait patienter les suivantes', async () => {
    const clock = fakeClock();
    const gate = createApiRetryGate({ now: clock.now, sleep: clock.sleep });

    gate.pauseFor(800);
    expect(gate.remainingMs()).toBe(800);
    // Requête sœur : elle attend la fenêtre au lieu d'émettre sa propre tentative.
    expect(await gate.wait()).toBe(800);
    expect(gate.remainingMs()).toBe(0);
  });

  test('la pause se prolonge mais ne se raccourcit jamais', async () => {
    const clock = fakeClock();
    const gate = createApiRetryGate({ now: clock.now, sleep: clock.sleep });

    gate.pauseFor(2000);
    gate.pauseFor(500); // backoff plus court d'une autre requête : ignoré
    expect(gate.remainingMs()).toBe(2000);
    gate.pauseFor(4000);
    expect(gate.remainingMs()).toBe(4000);
  });

  test('la première réponse du serveur libère toutes les requêtes en attente', async () => {
    const clock = fakeClock();
    const gate = createApiRetryGate({ now: clock.now, sleep: clock.sleep });

    gate.pauseFor(8000);
    gate.clear();
    expect(gate.remainingMs()).toBe(0);
    expect(await gate.wait()).toBe(0);
  });

  test('l’attente est plafonnée : une action utilisateur n’est jamais bloquée longtemps', async () => {
    const clock = fakeClock();
    const gate = createApiRetryGate({ now: clock.now, sleep: clock.sleep });

    gate.pauseFor(60000);
    expect(await gate.wait()).toBe(MAX_GATE_WAIT_MS);
  });

  test('la pause s’épuise avec le temps sans qu’on l’attende', async () => {
    const clock = fakeClock();
    const gate = createApiRetryGate({ now: clock.now, sleep: clock.sleep });

    gate.pauseFor(1000);
    clock.advance(1500);
    expect(gate.remainingMs()).toBe(0);
    expect(await gate.wait()).toBe(0);
  });

  test('un délai invalide n’ouvre pas de pause', () => {
    const clock = fakeClock();
    const gate = createApiRetryGate({ now: clock.now, sleep: clock.sleep });
    gate.pauseFor(Number.NaN);
    gate.pauseFor(-500);
    expect(gate.remainingMs()).toBe(0);
  });

  test('l’instance par défaut dort réellement (pas d’attente active)', async () => {
    const gate = createApiRetryGate();
    const sleepSpy = vi.spyOn(globalThis, 'setTimeout');
    gate.pauseFor(20);
    await gate.wait();
    expect(sleepSpy).toHaveBeenCalled();
    sleepSpy.mockRestore();
  });
});
