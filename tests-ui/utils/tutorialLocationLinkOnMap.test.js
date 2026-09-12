import { describe, test, expect } from 'vitest';
import { tutorialLocationIdsForLinkOnMap } from '../../src/utils/mapLocationContext.js';
import {
  tutorialLinkedToOtherMap,
  tutorialAssignOptionLabel,
  tutorialLinkedToSameMap,
} from '../../src/components/map/mapModalShared.jsx';

describe('tutorialLocationIdsForLinkOnMap', () => {
  const tu = {
    zone_ids: ['z-foret', 'z-n3'],
    marker_ids: ['m-foret'],
    zones_linked: [
      { id: 'z-foret', name: 'Foret', map_id: 'foret' },
      { id: 'z-n3', name: 'N3', map_id: 'n3' },
    ],
    markers_linked: [{ id: 'm-foret', label: 'Repère', map_id: 'foret' }],
  };

  test('lie une zone sur n3 : retire les lieux foret, conserve n3, ajoute la zone', () => {
    expect(tutorialLocationIdsForLinkOnMap(tu, 'zone', 'z-new', 'n3')).toEqual({
      zoneIds: ['z-n3', 'z-new'],
      markerIds: [],
    });
  });

  test('lie un repère sur foret : conserve les lieux foret', () => {
    expect(tutorialLocationIdsForLinkOnMap(tu, 'marker', 'm-new', 'foret')).toEqual({
      zoneIds: ['z-foret'],
      markerIds: ['m-foret', 'm-new'],
    });
  });
});

describe('tutorialAssignOptionLabel / other map', () => {
  test('détecte un tutoriel sur une autre carte et libelle l’option', () => {
    const tu = {
      title: 'Jardin N3',
      zones_linked: [{ id: 'z1', map_id: 'foret' }],
      markers_linked: [],
    };
    expect(tutorialLinkedToOtherMap(tu, 'n3')).toBe(true);
    expect(tutorialLinkedToSameMap(tu, 'n3')).toBe(false);
    expect(tutorialAssignOptionLabel(tu, 'n3')).toBe('Jardin N3 (autre carte — bascule ici)');
  });

  test('sans autre carte : titre seul', () => {
    const tu = { title: 'Compost', zones_linked: [], markers_linked: [] };
    expect(tutorialLinkedToOtherMap(tu, 'n3')).toBe(false);
    expect(tutorialAssignOptionLabel(tu, 'n3')).toBe('Compost');
  });
});
