import { describe, test, expect } from 'vitest';
import {
  CANONICAL_STATE_KEYS,
  extractCustomStates,
  getCustomStateKeys,
  getAllStateKeys,
  getStateLabel,
  buildStateOptions,
  INTERACTION_EVENT_OPTIONS,
} from '../../src/utils/visitMascotBehaviorRegistry.js';

const pack = {
  customStates: [
    { key: 'cast', label: 'Incantation' },
    { key: 'idle', label: 'Collision ignorée' }, // collision canonique → ignorée
    { key: '', label: 'Vide ignorée' },
    { key: 'cast', label: 'Doublon ignoré' }, // doublon → ignoré
  ],
};

describe('visitMascotBehaviorRegistry', () => {
  test('palette canonique inclut la palette élargie', () => {
    expect(CANONICAL_STATE_KEYS).toContain('idle');
    expect(CANONICAL_STATE_KEYS).toContain('wave');
    expect(CANONICAL_STATE_KEYS).toContain('dance');
  });

  test('extractCustomStates lit pack ou entrée (spriteCut)', () => {
    expect(extractCustomStates(pack)).toHaveLength(4);
    expect(extractCustomStates({ spriteCut: { customStates: [{ key: 'x' }] } })).toHaveLength(1);
    expect(extractCustomStates(null)).toEqual([]);
  });

  test('getCustomStateKeys filtre collisions/doublons/vides', () => {
    expect(getCustomStateKeys(pack)).toEqual(['cast']);
  });

  test('getAllStateKeys = canoniques + personnalisés', () => {
    const all = getAllStateKeys(pack);
    expect(all).toContain('idle');
    expect(all).toContain('cast');
    expect(all.length).toBe(CANONICAL_STATE_KEYS.length + 1);
  });

  test('getStateLabel : perso > canonique > clé', () => {
    expect(getStateLabel('cast', pack)).toBe('Incantation');
    expect(getStateLabel('idle', pack)).toBe('Repos');
    expect(getStateLabel('inconnu', pack)).toBe('inconnu');
  });

  test('buildStateOptions : canoniques (custom:false) puis perso (custom:true)', () => {
    const opts = buildStateOptions(pack);
    const cast = opts.find((o) => o.key === 'cast');
    expect(cast).toEqual({ key: 'cast', label: 'Incantation', custom: true });
    expect(opts.filter((o) => o.custom)).toHaveLength(1);
    // l'état canonique reste non-custom
    expect(opts.find((o) => o.key === 'idle').custom).toBe(false);
  });

  test('INTERACTION_EVENT_OPTIONS inclut mascotTap et porte des libellés', () => {
    const keys = INTERACTION_EVENT_OPTIONS.map((o) => o.key);
    expect(keys).toContain('mascotTap');
    expect(keys).toContain('markerMarkedSeen');
    expect(INTERACTION_EVENT_OPTIONS.every((o) => o.label && o.label.length > 0)).toBe(true);
  });
});
