import { describe, test, expect } from 'vitest';
import { tutorialLinkedToSameMap } from '../../src/components/map/mapModalShared.jsx';
import { tutorialLocationIds } from '../../src/utils/mapLocationContext.js';

describe('liaison tutoriel multi-cartes', () => {
  test('tutorialLinkedToSameMap : faux si lieux sur plusieurs cartes', () => {
    const tu = {
      zones_linked: [
        { id: 'z1', map_id: 'foret' },
        { id: 'z2', map_id: 'n3' },
      ],
      markers_linked: [],
    };
    expect(tutorialLinkedToSameMap(tu, 'foret')).toBe(false);
    expect(tutorialLinkedToSameMap(tu, 'n3')).toBe(false);
  });

  test('ajouter un lieu conserve les ids existants (liaison additive)', () => {
    const tu = {
      zone_ids: ['z-foret'],
      marker_ids: ['m-foret'],
    };
    const { zoneIds, markerIds } = tutorialLocationIds(tu);
    const nextZones = [...new Set([...zoneIds, 'z-n3'])];
    expect(nextZones).toEqual(['z-foret', 'z-n3']);
    expect(markerIds).toEqual(['m-foret']);
  });
});
