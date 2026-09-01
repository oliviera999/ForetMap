import { describe, test, expect } from 'vitest';

import {
  applyFindReplace,
  bulkPatchForItem,
  categoryOptionsForLocation,
  composeZoneName,
  countBulkTargets,
  locationLivingBeings,
  splitZoneName,
  zoneNameEmojiPatch,
  zoneParts,
} from '../../src/utils/adminLocationsGrid.js';

const CATALOG = [
  { id: 'c1', label: 'Verger', applies_to: 'both', map_id: null, is_active: true },
  { id: 'c2', label: 'Salles', applies_to: 'both', map_id: 'potager', is_active: true },
  { id: 'c3', label: 'Ruches', applies_to: 'marker', map_id: null, is_active: true },
  { id: 'c4', label: 'Ancienne', applies_to: 'both', map_id: null, is_active: false },
];

describe('splitZoneName / composeZoneName', () => {
  test('découpe le préfixe emoji et le nom, et les recompose', () => {
    expect(splitZoneName('🌳 Butte aux pommiers')).toEqual({
      emoji: '🌳',
      cleanName: 'Butte aux pommiers',
    });
    expect(composeZoneName('Butte aux pommiers', '🌳')).toBe('🌳 Butte aux pommiers');
  });

  test('nom sans emoji : préfixe vide, nom intact', () => {
    expect(splitZoneName('Carré des aromatiques')).toEqual({
      emoji: '',
      cleanName: 'Carré des aromatiques',
    });
  });

  test('nom vide refusé à la recomposition', () => {
    expect(composeZoneName('   ', '🌳')).toBeNull();
  });
});

describe('zoneParts / zoneNameEmojiPatch (colonne zones.emoji, audit C4)', () => {
  test('la colonne emoji prime sur le préfixe du nom', () => {
    expect(zoneParts({ emoji: '🌲', name: '🌳 Butte' })).toEqual({
      emoji: '🌲',
      cleanName: 'Butte',
    });
    expect(zoneParts({ emoji: '', name: '🌳 Butte' })).toEqual({ emoji: '🌳', cleanName: 'Butte' });
  });

  test('le patch envoie le nom préfixé ET la colonne emoji explicite', () => {
    expect(zoneNameEmojiPatch('Butte', '🌳')).toEqual({ name: '🌳 Butte', emoji: '🌳' });
    // Sans emoji : pas de préfixe ajouté, colonne effacée explicitement.
    expect(zoneNameEmojiPatch('Butte', '')).toEqual({ name: 'Butte', emoji: '' });
    expect(zoneNameEmojiPatch('   ', '🌳')).toBeNull();
  });
});

describe('categoryOptionsForLocation', () => {
  test('filtre par type, carte et activité', () => {
    const zoneForet = categoryOptionsForLocation('zone', 'foret', CATALOG).map((c) => c.id);
    expect(zoneForet).toEqual(['c1']);
    const zonePotager = categoryOptionsForLocation('zone', 'potager', CATALOG).map((c) => c.id);
    expect(zonePotager).toEqual(['c1', 'c2']);
    const markerForet = categoryOptionsForLocation('marker', 'foret', CATALOG).map((c) => c.id);
    expect(markerForet).toEqual(['c1', 'c3']);
  });
});

describe('applyFindReplace', () => {
  test('remplacement littéral de toutes les occurrences', () => {
    expect(applyFindReplace('Butte 1, butte 2, Butte 3', 'Butte', 'Colline')).toBe(
      'Colline 1, butte 2, Colline 3',
    );
  });
  test('caractères spéciaux regex traités comme littéraux', () => {
    expect(applyFindReplace('Zone (a) + (b)', '(a)', '[a]')).toBe('Zone [a] + (b)');
  });
});

describe('locationLivingBeings', () => {
  test('junction prioritaire, replis JSON puis colonne legacy', () => {
    expect(locationLivingBeings({ living_beings_list: ['Pommier', 'Sauge'] })).toEqual([
      'Pommier',
      'Sauge',
    ]);
    expect(locationLivingBeings({ current_plant: 'Tomate' })).toEqual(['Tomate']);
  });
});

describe('bulkPatchForItem', () => {
  const zone = {
    id: 'z1',
    map_id: 'foret',
    name: '🌳 Butte aux pommiers',
    description: 'Vieille butte',
    category_ids: ['c1'],
    living_beings_list: ['Pommier'],
  };
  const marker = {
    id: 'm1',
    map_id: 'foret',
    label: 'Ruches',
    emoji: '🐝',
    note: 'Trois ruches',
    category_ids: [],
    living_beings_list: [],
  };

  test('add_category : ajoute, ignore le doublon et la catégorie non applicable', () => {
    expect(
      bulkPatchForItem(
        'add_category',
        { categoryId: 'c3', catalog: CATALOG },
        { kind: 'marker', item: marker },
      ),
    ).toEqual({ patch: { category_ids: ['c3'] } });
    expect(
      bulkPatchForItem(
        'add_category',
        { categoryId: 'c1', catalog: CATALOG },
        { kind: 'zone', item: zone },
      ).skip,
    ).toBeTruthy();
    // c2 est propre à la carte « potager » : non posable sur une zone de « foret ».
    expect(
      bulkPatchForItem(
        'add_category',
        { categoryId: 'c2', catalog: CATALOG },
        { kind: 'zone', item: zone },
      ).skip,
    ).toBeTruthy();
  });

  test('remove_category : retire ou ignore', () => {
    expect(
      bulkPatchForItem('remove_category', { categoryId: 'c1' }, { kind: 'zone', item: zone }),
    ).toEqual({ patch: { category_ids: [] } });
    expect(
      bulkPatchForItem('remove_category', { categoryId: 'c1' }, { kind: 'marker', item: marker })
        .skip,
    ).toBeTruthy();
  });

  test('add_species / remove_species conservent la liste existante', () => {
    expect(
      bulkPatchForItem('add_species', { speciesName: 'Sauge' }, { kind: 'zone', item: zone }),
    ).toEqual({ patch: { living_beings: ['Pommier', 'Sauge'] } });
    expect(
      bulkPatchForItem('add_species', { speciesName: 'Pommier' }, { kind: 'zone', item: zone })
        .skip,
    ).toBeTruthy();
    expect(
      bulkPatchForItem('remove_species', { speciesName: 'Pommier' }, { kind: 'zone', item: zone }),
    ).toEqual({ patch: { living_beings: [] } });
  });

  test('set_map : déplace ou ignore si déjà en place', () => {
    expect(bulkPatchForItem('set_map', { mapId: 'potager' }, { kind: 'zone', item: zone })).toEqual(
      {
        patch: { map_id: 'potager' },
      },
    );
    expect(
      bulkPatchForItem('set_map', { mapId: 'foret' }, { kind: 'marker', item: marker }).skip,
    ).toBeTruthy();
  });

  test('set_emoji : champ emoji du repère, préfixe du nom de zone', () => {
    expect(
      bulkPatchForItem('set_emoji', { emoji: '🍎' }, { kind: 'marker', item: marker }),
    ).toEqual({ patch: { emoji: '🍎' } });
    expect(bulkPatchForItem('set_emoji', { emoji: '🍎' }, { kind: 'zone', item: zone })).toEqual({
      patch: { name: '🍎 Butte aux pommiers', emoji: '🍎' },
    });
    expect(
      bulkPatchForItem('set_emoji', { emoji: '🐝' }, { kind: 'marker', item: marker }).skip,
    ).toBeTruthy();
  });

  test('find_replace : nom (et description sur demande), sans occurrence → ignoré', () => {
    expect(
      bulkPatchForItem(
        'find_replace',
        { find: 'pommiers', replace: 'poiriers' },
        { kind: 'zone', item: zone },
      ),
    ).toEqual({ patch: { name: '🌳 Butte aux poiriers', emoji: '🌳' } });
    expect(
      bulkPatchForItem(
        'find_replace',
        { find: 'butte', replace: 'colline', includeText: true },
        { kind: 'zone', item: zone },
      ),
    ).toEqual({ patch: { description: 'Vieille colline' } });
    expect(
      bulkPatchForItem(
        'find_replace',
        { find: 'introuvable', replace: 'x' },
        { kind: 'marker', item: marker },
      ).skip,
    ).toBeTruthy();
  });

  test('find_replace : zone sans emoji ne se voit pas ajouter de préfixe', () => {
    const noEmoji = { ...zone, name: 'Carré des aromatiques' };
    expect(
      bulkPatchForItem(
        'find_replace',
        { find: 'aromatiques', replace: 'simples' },
        { kind: 'zone', item: noEmoji },
      ),
    ).toEqual({ patch: { name: 'Carré des simples', emoji: '' } });
  });

  test('find_replace : remplacement qui viderait le nom → ignoré', () => {
    expect(
      bulkPatchForItem(
        'find_replace',
        { find: 'Ruches', replace: '' },
        { kind: 'marker', item: marker },
      ).skip,
    ).toBeTruthy();
  });

  test('delete renvoie un marqueur de suppression', () => {
    expect(bulkPatchForItem('delete', {}, { kind: 'zone', item: zone })).toEqual({ del: true });
  });
});

describe('countBulkTargets', () => {
  test('compte les lieux réellement concernés', () => {
    const targets = [
      { kind: 'zone', item: { id: 'z1', map_id: 'foret', name: '🌳 A', category_ids: ['c1'] } },
      { kind: 'zone', item: { id: 'z2', map_id: 'foret', name: 'B', category_ids: [] } },
      { kind: 'marker', item: { id: 'm1', map_id: 'foret', label: 'C', category_ids: [] } },
    ];
    expect(countBulkTargets('add_category', { categoryId: 'c1', catalog: CATALOG }, targets)).toBe(
      2,
    );
  });
});
