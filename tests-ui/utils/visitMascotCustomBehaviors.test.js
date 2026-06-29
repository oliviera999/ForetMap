import { describe, test, expect } from 'vitest';
import {
  getEntryCustomStates,
  getEntryCustomStateKeys,
  getEntryCustomTriggers,
  getPeriodicTriggers,
  getTapTriggers,
  periodicTriggersSignature,
} from '../../src/utils/visitMascotCustomBehaviors.js';

const entry = {
  id: 'srv-x',
  customStates: [{ key: 'yawn', label: 'Bâille' }],
  customTriggers: [
    { key: 'amb', label: 'A', type: 'periodic', state: 'yawn', durationMs: 1200, everyMs: 8000 },
    { key: 'tap', label: 'T', type: 'tap', state: 'dance', durationMs: 900 },
    { key: 'bad', label: 'B', type: 'periodic', state: 'idle', durationMs: 900, everyMs: 500 },
  ],
};

describe('extraction comportements personnalisés', () => {
  test('états personnalisés + clés', () => {
    expect(getEntryCustomStates(entry)).toHaveLength(1);
    expect(getEntryCustomStateKeys(entry)).toEqual(['yawn']);
    expect(getEntryCustomStateKeys(null)).toEqual([]);
  });

  test('lit aussi depuis spriteCut si absent au niveau entrée', () => {
    const e2 = { spriteCut: { customStates: [{ key: 'glow', label: 'G' }] } };
    expect(getEntryCustomStateKeys(e2)).toEqual(['glow']);
  });

  test('déclencheurs périodiques : everyMs < 1000 exclu', () => {
    const periodic = getPeriodicTriggers(entry);
    expect(periodic.map((t) => t.key)).toEqual(['amb']);
  });

  test('déclencheurs au tap', () => {
    expect(getTapTriggers(entry).map((t) => t.key)).toEqual(['tap']);
  });

  test('tous les déclencheurs bruts', () => {
    expect(getEntryCustomTriggers(entry)).toHaveLength(3);
    expect(getEntryCustomTriggers(null)).toEqual([]);
  });

  test('signature stable et sensible aux champs pertinents', () => {
    const a = periodicTriggersSignature(getPeriodicTriggers(entry));
    const b = periodicTriggersSignature(getPeriodicTriggers(entry));
    expect(a).toBe(b);
    const changed = periodicTriggersSignature([
      { key: 'amb', state: 'yawn', durationMs: 1200, everyMs: 9000 },
    ]);
    expect(changed).not.toBe(a);
  });
});
