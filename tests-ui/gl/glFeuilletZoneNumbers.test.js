import { describe, test, expect } from 'vitest';
import {
  buildFeuilletZoneNumberMap,
  sortFeuilletZonesForDisplay,
} from '../../src/gl/utils/glFeuilletZoneNumbers.js';

describe('glFeuilletZoneNumbers', () => {
  test('sortFeuilletZonesForDisplay trie par feuilletCode puis zoneId', () => {
    const sorted = sortFeuilletZonesForDisplay([
      { zoneId: 'zf-p1-03', feuilletCode: 'ep-I-03' },
      { zoneId: 'zf-p1-01', feuilletCode: 'ep-I-01' },
      { zoneId: 'zf-p1-02', feuilletCode: 'ep-I-02' },
    ]);
    expect(sorted.map((z) => z.zoneId)).toEqual(['zf-p1-01', 'zf-p1-02', 'zf-p1-03']);
  });

  test('buildFeuilletZoneNumberMap numérote à partir de 1 par défaut', () => {
    const zones = [{ zoneId: 'zf-p1-01' }, { zoneId: 'zf-p1-02' }];
    const map = buildFeuilletZoneNumberMap(zones, 1);
    expect(map.get('zf-p1-01')).toBe(1);
    expect(map.get('zf-p1-02')).toBe(2);
  });
});
