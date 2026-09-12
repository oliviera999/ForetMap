import { describe, test, expect } from 'vitest';
import {
  buildCategoryReorderByMove,
  buildCategoryReorderPatches,
  collectMapCategoryOptions,
  isInfrastructureLocation,
  locationCategoriesSummary,
  locationCategoryIds,
  locationCategoryLabels,
  locationHasAnyCategory,
  primaryLocationCategory,
  sortLocationCategories,
} from '../../src/utils/locationCategories.js';

const VERGER = { id: 'c1', label: 'Verger', emoji: '🍎', color: '#fca5a590', sort_order: 20 };
const INFRA = {
  id: 'c2',
  label: 'Infrastructure',
  emoji: '🏗️',
  color: '#dbeafe90',
  is_infrastructure: true,
  sort_order: 10,
};

describe('locationCategoryIds', () => {
  test('privilégie category_ids et retombe sur categories', () => {
    expect(locationCategoryIds({ category_ids: ['a', 'b'] })).toEqual(['a', 'b']);
    expect(locationCategoryIds({ categories: [VERGER, INFRA] })).toEqual(['c1', 'c2']);
    expect(locationCategoryIds(null)).toEqual([]);
    expect(locationCategoryIds({})).toEqual([]);
  });

  test('normalise les identifiants numériques en chaînes', () => {
    expect(locationCategoryIds({ category_ids: [7] })).toEqual(['7']);
  });
});

describe('isInfrastructureLocation', () => {
  test('lit le drapeau calculé par le serveur en priorité', () => {
    expect(isInfrastructureLocation({ is_infrastructure: true })).toBe(true);
    expect(isInfrastructureLocation({ is_infrastructure: false, special: 1 })).toBe(false);
  });

  test('déduit des catégories quand le drapeau est absent', () => {
    expect(isInfrastructureLocation({ categories: [INFRA] })).toBe(true);
    expect(isInfrastructureLocation({ categories: [VERGER] })).toBe(false);
  });

  test('accepte le drapeau special déprécié en dernier repli', () => {
    expect(isInfrastructureLocation({ special: 1 })).toBe(true);
    expect(isInfrastructureLocation({})).toBe(false);
    expect(isInfrastructureLocation(null)).toBe(false);
  });
});

describe('locationHasAnyCategory', () => {
  test('OU logique, et filtre vide qui laisse tout passer', () => {
    const zone = { category_ids: ['c1'] };
    expect(locationHasAnyCategory(zone, [])).toBe(true);
    expect(locationHasAnyCategory(zone, ['c1'])).toBe(true);
    expect(locationHasAnyCategory(zone, ['c2'])).toBe(false);
    expect(locationHasAnyCategory(zone, ['c2', 'c1'])).toBe(true);
  });
});

describe('collectMapCategoryOptions', () => {
  test('fusionne catalogue et catégories portées, sans doublon, triées', () => {
    const options = collectMapCategoryOptions(
      [{ categories: [VERGER] }],
      [{ categories: [INFRA, VERGER] }],
      [VERGER],
    );
    expect(options.map((o) => o.id)).toEqual(['c2', 'c1']);
    expect(options[0].label).toBe('Infrastructure');
  });

  test('sans donnée : liste vide', () => {
    expect(collectMapCategoryOptions()).toEqual([]);
  });
});

describe('libellés et résumé', () => {
  test('locationCategoryLabels alimente la recherche libre', () => {
    expect(locationCategoryLabels({ categories: [VERGER] })).toEqual(['Verger', '🍎']);
  });

  test('locationCategoriesSummary joint les libellés', () => {
    expect(locationCategoriesSummary({ categories: [INFRA, VERGER] })).toBe(
      'Infrastructure · Verger',
    );
    expect(locationCategoriesSummary({})).toBe('');
  });

  test('primaryLocationCategory retourne la première (couleur / légende)', () => {
    expect(primaryLocationCategory({ categories: [INFRA, VERGER] })).toBe(INFRA);
    expect(primaryLocationCategory({})).toBe(null);
  });
});

describe('sortLocationCategories', () => {
  test('trie par sort_order puis libellé, sans muter', () => {
    const input = [VERGER, INFRA, { id: 'c3', label: 'Alpha', sort_order: 10 }];
    const sorted = sortLocationCategories(input);
    expect(sorted.map((c) => c.id)).toEqual(['c3', 'c2', 'c1']);
    expect(input[0]).toBe(VERGER);
  });
});

describe('buildCategoryReorderPatches', () => {
  const cats = [
    { id: 'a', sort_order: 0, label: 'A' },
    { id: 'b', sort_order: 1, label: 'B' },
    { id: 'c', sort_order: 2, label: 'C' },
  ];

  test('descendre le premier échange les deux premiers', () => {
    expect(buildCategoryReorderPatches(cats, 'a', 1)).toEqual({
      category_ids: ['b', 'a', 'c'],
      patches: [
        { id: 'b', sort_order: 0 },
        { id: 'a', sort_order: 1 },
      ],
    });
  });

  test('monter le dernier échange les deux derniers', () => {
    expect(buildCategoryReorderPatches(cats, 'c', -1)).toEqual({
      category_ids: ['a', 'c', 'b'],
      patches: [
        { id: 'c', sort_order: 1 },
        { id: 'b', sort_order: 2 },
      ],
    });
  });

  test('renvoie null hors bornes ou id inconnu', () => {
    expect(buildCategoryReorderPatches(cats, 'a', -1)).toBeNull();
    expect(buildCategoryReorderPatches(cats, 'c', 1)).toBeNull();
    expect(buildCategoryReorderPatches(cats, 'z', 1)).toBeNull();
  });

  test('corrige aussi les sort_order désynchronisés', () => {
    const desync = [
      { id: 'a', sort_order: 50 },
      { id: 'b', sort_order: 10 },
      { id: 'c', sort_order: 20 },
    ];
    expect(buildCategoryReorderPatches(desync, 'b', 1)).toEqual({
      category_ids: ['a', 'c', 'b'],
      patches: [
        { id: 'a', sort_order: 0 },
        { id: 'c', sort_order: 1 },
        { id: 'b', sort_order: 2 },
      ],
    });
  });
});

describe('buildCategoryReorderByMove', () => {
  const cats = [
    { id: 'a', sort_order: 0, label: 'A' },
    { id: 'b', sort_order: 1, label: 'B' },
    { id: 'c', sort_order: 2, label: 'C' },
  ];

  test('déplace le premier vers la fin', () => {
    expect(buildCategoryReorderByMove(cats, 0, 2)).toEqual({
      category_ids: ['b', 'c', 'a'],
      patches: [
        { id: 'b', sort_order: 0 },
        { id: 'c', sort_order: 1 },
        { id: 'a', sort_order: 2 },
      ],
    });
  });

  test('renvoie null si indices invalides ou identiques', () => {
    expect(buildCategoryReorderByMove(cats, 1, 1)).toBeNull();
    expect(buildCategoryReorderByMove(cats, -1, 0)).toBeNull();
    expect(buildCategoryReorderByMove(cats, 0, 9)).toBeNull();
  });
});
