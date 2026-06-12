import { describe, test, expect } from 'vitest';
import {
  taskEffectiveMapId,
  taskMapIdMatchesFilter,
  collectUsedLocationIds,
  focusMapIdForLocationFilter,
  tutorialLocationIdsAfterLink,
  tutorialLocationIdsAfterUnlink,
} from '../../src/utils/taskLocationPicker.js';

describe('taskEffectiveMapId', () => {
  test('priorité : map_id_resolved > map_id > zone_map_id > marker_map_id > null', () => {
    expect(taskEffectiveMapId({ map_id_resolved: 'a', map_id: 'b' })).toBe('a');
    expect(taskEffectiveMapId({ map_id: 'b', zone_map_id: 'c' })).toBe('b');
    expect(taskEffectiveMapId({ zone_map_id: 'c', marker_map_id: 'd' })).toBe('c');
    expect(taskEffectiveMapId({ marker_map_id: 'd' })).toBe('d');
    expect(taskEffectiveMapId({})).toBe(null);
  });
});

describe('taskMapIdMatchesFilter', () => {
  test('filtre « active » : carte active ou globale (null) uniquement', () => {
    expect(taskMapIdMatchesFilter('foret', 'active', 'foret')).toBe(true);
    expect(taskMapIdMatchesFilter(null, 'active', 'foret')).toBe(true);
    expect(taskMapIdMatchesFilter('mare', 'active', 'foret')).toBe(false);
  });
  test('filtre « all » : tout passe', () => {
    expect(taskMapIdMatchesFilter('mare', 'all', 'foret')).toBe(true);
  });
  test('filtre par id de carte : id exact ou globale (null)', () => {
    expect(taskMapIdMatchesFilter('mare', 'mare', 'foret')).toBe(true);
    expect(taskMapIdMatchesFilter(null, 'mare', 'foret')).toBe(true);
    expect(taskMapIdMatchesFilter('foret', 'mare', 'foret')).toBe(false);
  });
});

describe('collectUsedLocationIds', () => {
  const zones = [{ id: 'z1', map_id: 'foret' }, { id: 'z2', map_id: 'mare' }];
  const markers = [{ id: 'm1', map_id: 'foret' }, { id: 'm2', map_id: 'mare' }];

  test('collecte zones/repères des tâches (listes + champs legacy)', () => {
    const { usedZones, usedMarkers } = collectUsedLocationIds({
      tasksForLocationPicker: [
        { zone_ids: ['z1'], marker_ids: ['m1'] },
        { zone_id: 'z2', marker_id: 'm2' },
      ],
      tutorials: [],
      zones,
      markers,
      filterMap: 'all',
      activeMapId: 'foret',
    });
    expect(usedZones).toEqual(['z1', 'z2']);
    expect(usedMarkers).toEqual(['m1', 'm2']);
  });

  test('ajoute les lieux des tutoriels en respectant le filtre carte « active »', () => {
    const { usedZones, usedMarkers } = collectUsedLocationIds({
      tasksForLocationPicker: [],
      tutorials: [{ zone_ids: ['z1', 'z2'], marker_ids: ['m2'] }],
      zones,
      markers,
      filterMap: 'active',
      activeMapId: 'foret',
    });
    expect(usedZones).toEqual(['z1']);
    expect(usedMarkers).toEqual([]);
  });

  test('élève : ignore les tutoriels archivés ; n3boss : les garde', () => {
    const base = {
      tasksForLocationPicker: [],
      tutorials: [{ is_active: false, zone_ids: ['z1'], marker_ids: [] }],
      zones,
      markers,
      filterMap: 'all',
      activeMapId: 'foret',
    };
    expect(collectUsedLocationIds({ ...base, isTeacher: false }).usedZones).toEqual([]);
    expect(collectUsedLocationIds({ ...base, isTeacher: true }).usedZones).toEqual(['z1']);
  });

  test('module tutoriels désactivé : seuls les lieux des tâches restent', () => {
    const { usedZones } = collectUsedLocationIds({
      tasksForLocationPicker: [{ zone_ids: ['z2'] }],
      tutorials: [{ zone_ids: ['z1'], marker_ids: [] }],
      zones,
      markers,
      filterMap: 'all',
      activeMapId: 'foret',
      tutorialsModuleEnabled: false,
    });
    expect(usedZones).toEqual(['z2']);
  });
});

describe('focusMapIdForLocationFilter', () => {
  const zones = [{ id: 'z1', map_id: 'mare' }];
  const markers = [{ id: 'm1', map_id: 'verger' }];
  test('zone:id et marker:id → carte du lieu, repli carte active si introuvable', () => {
    expect(focusMapIdForLocationFilter('zone:z1', zones, markers, 'foret')).toBe('mare');
    expect(focusMapIdForLocationFilter('marker:m1', zones, markers, 'foret')).toBe('verger');
    expect(focusMapIdForLocationFilter('zone:inconnu', zones, markers, 'foret')).toBe('foret');
  });
  test('valeur héritée sans préfixe : cherchée comme id de zone', () => {
    expect(focusMapIdForLocationFilter('z1', zones, markers, 'foret')).toBe('mare');
    expect(focusMapIdForLocationFilter('xx', zones, markers, 'foret')).toBe('foret');
  });
});

describe('tutorialLocationIdsAfterLink / tutorialLocationIdsAfterUnlink', () => {
  const tu = { zone_ids: ['z1'], marker_ids: ['m1'] };

  test('lie une zone (dédupliqué) sans toucher aux repères', () => {
    expect(tutorialLocationIdsAfterLink(tu, 'zone:z2'))
      .toEqual({ zoneIds: ['z1', 'z2'], markerIds: ['m1'] });
    expect(tutorialLocationIdsAfterLink(tu, 'zone:z1'))
      .toEqual({ zoneIds: ['z1'], markerIds: ['m1'] });
  });

  test('lie un repère sans toucher aux zones', () => {
    expect(tutorialLocationIdsAfterLink(tu, 'marker:m2'))
      .toEqual({ zoneIds: ['z1'], markerIds: ['m1', 'm2'] });
  });

  test('délie zone ou repère du filtre courant', () => {
    expect(tutorialLocationIdsAfterUnlink(tu, 'zone:z1'))
      .toEqual({ zoneIds: [], markerIds: ['m1'] });
    expect(tutorialLocationIdsAfterUnlink(tu, 'marker:m1'))
      .toEqual({ zoneIds: ['z1'], markerIds: [] });
  });

  test('valeur sans préfixe valide : ids inchangés', () => {
    expect(tutorialLocationIdsAfterLink(tu, 'z9')).toEqual({ zoneIds: ['z1'], markerIds: ['m1'] });
    expect(tutorialLocationIdsAfterUnlink(tu, 'z1')).toEqual({ zoneIds: ['z1'], markerIds: ['m1'] });
  });
});
