// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
  LAST_VIEWED_MAP_STORAGE_KEY,
  readLastViewedMapId,
  rememberLastViewedMapId,
} from '../../src/utils/lastViewedMap.js';

/**
 * Mémoire du dernier plan consulté (carte **et** Visite).
 *
 * Le point sensible est l'écriture : tant que la mémoire était posée par un effet sur
 * `activeMapId`, les plans choisis par la **résolution automatique** (carte par défaut
 * des réglages, repli sur le premier plan visible) y atterrissaient aussi. Un plan que
 * personne n'avait choisi se figeait alors sur l'appareil, et le réglage « plan ouvert
 * par défaut » ne s'appliquait plus jamais.
 */
describe('lastViewedMap', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('relit le plan mémorisé', () => {
    localStorage.setItem(LAST_VIEWED_MAP_STORAGE_KEY, 'n3');
    expect(readLastViewedMapId()).toBe('n3');
  });

  it('renvoie une chaîne vide quand l’appareil ne mémorise rien', () => {
    expect(readLastViewedMapId()).toBe('');
  });

  it('normalise les espaces autour du plan mémorisé', () => {
    localStorage.setItem(LAST_VIEWED_MAP_STORAGE_KEY, '  n3 ');
    expect(readLastViewedMapId()).toBe('n3');
  });

  it('mémorise un plan choisi', () => {
    expect(rememberLastViewedMapId('n3')).toBe(true);
    expect(localStorage.getItem(LAST_VIEWED_MAP_STORAGE_KEY)).toBe('n3');
    expect(readLastViewedMapId()).toBe('n3');
  });

  it('ignore une valeur vide plutôt que d’effacer la mémoire', () => {
    rememberLastViewedMapId('n3');
    expect(rememberLastViewedMapId('')).toBe(false);
    expect(rememberLastViewedMapId(null)).toBe(false);
    expect(rememberLastViewedMapId('   ')).toBe(false);
    expect(readLastViewedMapId()).toBe('n3');
  });

  it('survit à un stockage indisponible (navigation privée, stockage bloqué)', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('stockage bloqué');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('stockage bloqué');
    });
    expect(readLastViewedMapId()).toBe('');
    expect(rememberLastViewedMapId('n3')).toBe(false);
  });
});
