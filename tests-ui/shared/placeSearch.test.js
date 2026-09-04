import { describe, expect, test } from 'vitest';

import {
  buildPlaceIndex,
  normalizeSearchText,
  searchPlaces,
  tokenizeSearchQuery,
} from '../../src/shared/search/placeSearch.js';

const PLACES = [
  {
    id: 'cdi',
    name: 'CDI',
    search_aliases: ['bibliothèque', 'documentation'],
    visit_subtitle: 'Centre de documentation',
    categories: [{ label: 'Salles' }],
  },
  {
    id: 'gym',
    name: 'Gymnase Nord',
    search_aliases: [],
    visit_short_description: 'Salle de sport et vestiaires',
    categories: [{ label: 'Sport' }],
  },
  { id: 'lab', name: 'Laboratoire SVT', categories: [{ label: 'Salles' }] },
];

const index = buildPlaceIndex(PLACES);
const ids = (results) => results.map((r) => r.place.id);

describe('normalisation et découpage', () => {
  test('accents, casse, ponctuation et apostrophes', () => {
    expect(normalizeSearchText('Bibliothèque – l’Atelier !')).toBe('bibliotheque l atelier');
    expect(normalizeSearchText(null)).toBe('');
    expect(tokenizeSearchQuery('  salle   de sport ')).toEqual(['salle', 'de', 'sport']);
    expect(tokenizeSearchQuery('   ')).toEqual([]);
  });
});

describe('searchPlaces', () => {
  test('saisie vide → aucun résultat (le produit affiche alors sa liste)', () => {
    expect(searchPlaces(index, '')).toEqual([]);
    expect(searchPlaces(index, '   ')).toEqual([]);
  });

  test('trouve par nom, insensible aux accents et à la casse', () => {
    expect(ids(searchPlaces(index, 'cdi'))).toEqual(['cdi']);
    expect(ids(searchPlaces(index, 'GYMNASE'))).toEqual(['gym']);
  });

  test('trouve par alias : « bibliothèque » ramène le CDI', () => {
    expect(ids(searchPlaces(index, 'bibliotheque'))).toEqual(['cdi']);
  });

  test('trouve par accroche et par catégorie', () => {
    expect(ids(searchPlaces(index, 'vestiaires'))).toEqual(['gym']);
    expect(ids(searchPlaces(index, 'salles')).sort()).toEqual(['cdi', 'lab']);
  });

  test('tous les mots doivent correspondre', () => {
    expect(ids(searchPlaces(index, 'salle sport'))).toEqual(['gym']);
    expect(searchPlaces(index, 'cdi sport')).toEqual([]);
  });

  test('classement : le nom passe avant l’alias, qui passe avant le texte libre', () => {
    const mixed = buildPlaceIndex([
      { id: 'nom', name: 'Sport', categories: [] },
      { id: 'alias', name: 'Gymnase', search_aliases: ['sport'], categories: [] },
      { id: 'texte', name: 'Cour', visit_short_description: 'terrain de sport', categories: [] },
    ]);
    expect(ids(searchPlaces(mixed, 'sport'))).toEqual(['nom', 'alias', 'texte']);
  });

  test('limite le nombre de résultats', () => {
    expect(searchPlaces(index, 'salles', { limit: 1 })).toHaveLength(1);
  });

  test('alias en chaîne « a ; b » acceptés (forme stockée serveur)', () => {
    const stored = buildPlaceIndex([{ id: 'x', name: 'Loge', search_aliases: 'accueil ; entrée' }]);
    expect(ids(searchPlaces(stored, 'accueil'))).toEqual(['x']);
    expect(ids(searchPlaces(stored, 'entree'))).toEqual(['x']);
  });
});
