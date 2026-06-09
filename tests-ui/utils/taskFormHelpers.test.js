import { describe, test, expect } from 'vitest';
import {
  zonePickDisplayName,
  initialLocationIds,
  initialLinkedObjectIds,
  normalizeTutorialIds,
} from '../../src/utils/taskFormHelpers.js';

describe('zonePickDisplayName', () => {
  test('nom seul si aucun être vivant', () => {
    expect(zonePickDisplayName({ name: 'Zone A' })).toBe('Zone A');
  });
  test('nom + liste si êtres vivants', () => {
    const label = zonePickDisplayName({ name: 'Zone A', living_beings_list: ['Pommier'] });
    expect(label.startsWith('Zone A — ')).toBe(true);
  });
});

describe('initialLocationIds', () => {
  test('clé multi prioritaire, dédupliquée/nettoyée', () => {
    expect(initialLocationIds({ zone_ids: [' 1 ', '1', '', '2'] }, 'zone_ids', 'zone_id')).toEqual(['1', '2']);
  });
  test('repli sur la clé simple', () => {
    expect(initialLocationIds({ zone_id: '7' }, 'zone_ids', 'zone_id')).toEqual(['7']);
  });
  test('vide si rien / editTask absent', () => {
    expect(initialLocationIds(null, 'zone_ids', 'zone_id')).toEqual([]);
    expect(initialLocationIds({}, 'zone_ids', 'zone_id')).toEqual([]);
  });
});

describe('initialLinkedObjectIds', () => {
  test('extrait les id d’objets liés, dédupliqués', () => {
    expect(initialLinkedObjectIds({ zones_linked: [{ id: '1' }, { id: '1' }, { id: '2' }] }, 'zones_linked'))
      .toEqual(['1', '2']);
  });
  test('vide si absent / non tableau', () => {
    expect(initialLinkedObjectIds({}, 'zones_linked')).toEqual([]);
    expect(initialLinkedObjectIds(null, 'zones_linked')).toEqual([]);
  });
});

describe('normalizeTutorialIds', () => {
  test('entiers positifs uniques, ignore invalides', () => {
    expect(normalizeTutorialIds(['1', 2, 2, '0', -3, 'x', 4])).toEqual([1, 2, 4]);
  });
  test('non-tableau → []', () => {
    expect(normalizeTutorialIds(null)).toEqual([]);
    expect(normalizeTutorialIds(undefined)).toEqual([]);
  });
});
