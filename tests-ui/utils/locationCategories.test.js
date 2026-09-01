import { describe, test, expect } from 'vitest';
import {
  collectMapCategoryOptions,
  isInfrastructureLocation,
  locationCategoriesSummary,
  locationCategoryIds,
  locationCategoryLabels,
  locationHasAnyCategory,
  primaryLocationCategory,
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
