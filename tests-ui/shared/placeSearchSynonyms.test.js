import { describe, test, expect } from 'vitest';

import {
  buildPlaceIndex,
  searchPlaces,
  normalizeSearchText,
} from '../../src/shared/search/placeSearch.js';
import {
  buildSynonymIndex,
  FR_PLACE_SYNONYM_GROUPS,
} from '../../src/shared/search/placeSearchSynonymsFr.js';

/**
 * Vocabulaire du visiteur (`docs/AUDIT_PLAN_NAVIGATION_UX_2026-09-16.md` N8) : en production,
 * « wc », « toilettes », « cantine » et « bibliothèque » ne renvoyaient rien alors que les
 * lieux existent — ils s'appellent « Sanitaires », « Cafétéria… » et « CDI ».
 */

const places = [
  { id: 'z1', name: 'Sanitaires' },
  { id: 'z2', name: 'Cafétéria et restauration scolaire' },
  { id: 'z3', name: "CDI — Centre de documentation et d'information" },
  { id: 'z4', name: 'Infirmerie' },
  { id: 'z5', name: 'Reprographie' },
  { id: 'z6', name: 'Bât.D — collège', description: "L'entrée du collège se fait ici" },
];
const index = buildPlaceIndex(places);
const names = (query) => searchPlaces(index, query).map((r) => r.place.name);

describe('recherche de lieux — vocabulaire courant', () => {
  test.each([
    ['wc', 'Sanitaires'],
    ['toilettes', 'Sanitaires'],
    ['cantine', 'Cafétéria et restauration scolaire'],
    ['self', 'Cafétéria et restauration scolaire'],
    ['bibliothèque', "CDI — Centre de documentation et d'information"],
    ['bibliotheque', "CDI — Centre de documentation et d'information"],
    ['photocopie', 'Reprographie'],
    ['soins', 'Infirmerie'],
  ])('« %s » trouve « %s »', (query, expected) => {
    expect(names(query)[0]).toBe(expected);
  });

  test('le mot littéral passe devant son synonyme', () => {
    const ranked = names('sanitaires');
    expect(ranked[0]).toBe('Sanitaires');
  });

  test('un mot sans synonyme connu se comporte comme avant', () => {
    expect(names('infirmerie')).toEqual(['Infirmerie']);
    expect(names('zzzz')).toEqual([]);
  });

  test('les synonymes peuvent être désactivés', () => {
    expect(searchPlaces(index, 'wc', { synonyms: null })).toEqual([]);
  });

  test('l’index de synonymes est symétrique et normalisé', () => {
    const map = buildSynonymIndex(FR_PLACE_SYNONYM_GROUPS, normalizeSearchText);
    expect(map.get('wc')).toContain('sanitaires');
    expect(map.get('sanitaires')).toContain('wc');
    // Aucun terme accentué ne doit subsister : le moteur compare du texte normalisé.
    for (const term of map.keys()) expect(term).toBe(normalizeSearchText(term));
  });
});
