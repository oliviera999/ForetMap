import { describe, test, expect } from 'vitest';
import {
  sortTutorialsByOrder,
  moveIndex,
  linkedTaskStatusLabel,
} from '../../src/utils/tutorialListHelpers.js';

describe('sortTutorialsByOrder', () => {
  test('trie par sort_order puis titre (fr), sans muter', () => {
    const list = [
      { sort_order: 2, title: 'B' },
      { sort_order: 1, title: 'Z' },
      { sort_order: 1, title: 'A' },
    ];
    expect(sortTutorialsByOrder(list).map((t) => t.title)).toEqual(['A', 'Z', 'B']);
    expect(list.map((t) => t.title)).toEqual(['B', 'Z', 'A']); // entrée inchangée
  });
  test('sort_order manquant → 0', () => {
    const list = [{ title: 'X' }, { sort_order: -1, title: 'Y' }];
    expect(sortTutorialsByOrder(list).map((t) => t.title)).toEqual(['Y', 'X']);
  });
});

describe('moveIndex', () => {
  const arr = ['a', 'b', 'c', 'd'];
  test('déplace from→to', () => {
    expect(moveIndex(arr, 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(moveIndex(arr, 3, 1)).toEqual(['a', 'd', 'b', 'c']);
  });
  test('no-op (même réf) si indices invalides ou égaux', () => {
    expect(moveIndex(arr, 1, 1)).toBe(arr);
    expect(moveIndex(arr, -1, 2)).toBe(arr);
    expect(moveIndex(arr, 0, 9)).toBe(arr);
  });
  test('ne mute pas la source', () => {
    const copy = [...arr];
    moveIndex(copy, 0, 3);
    expect(copy).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('linkedTaskStatusLabel', () => {
  test('libellés connus', () => {
    expect(linkedTaskStatusLabel('available')).toBe('À faire');
    expect(linkedTaskStatusLabel('IN_PROGRESS')).toBe('En cours');
    expect(linkedTaskStatusLabel('validated')).toBe('Validée');
  });
  test('repli : valeur brute puis « — »', () => {
    expect(linkedTaskStatusLabel('weird')).toBe('weird');
    expect(linkedTaskStatusLabel('')).toBe('—');
    expect(linkedTaskStatusLabel(null)).toBe('—');
  });
});

import {
  tutorialZonePickLabel,
  createInitialTutorialForm,
  filterAndSortTutorials,
} from '../../src/utils/tutorialListHelpers.js';

describe('filterAndSortTutorials', () => {
  const tutorials = [
    { title: 'Greffe', summary: 'Arbres fruitiers', type: 'html', is_active: true, sort_order: 2 },
    { title: 'Compost', summary: '', type: 'link', is_active: true, sort_order: 1 },
    {
      title: 'Ancienne fiche',
      summary: 'greffe historique',
      type: 'html',
      is_active: false,
      sort_order: 0,
    },
  ];
  test('sans filtre : tout, trié par sort_order', () => {
    expect(filterAndSortTutorials(tutorials).map((t) => t.title)).toEqual([
      'Ancienne fiche',
      'Compost',
      'Greffe',
    ]);
  });
  test('filtre par type et par statut', () => {
    expect(filterAndSortTutorials(tutorials, { typeFilter: 'link' }).map((t) => t.title)).toEqual([
      'Compost',
    ]);
    expect(
      filterAndSortTutorials(tutorials, { statusFilter: 'active' }).map((t) => t.title),
    ).toEqual(['Compost', 'Greffe']);
    expect(
      filterAndSortTutorials(tutorials, { statusFilter: 'archived' }).map((t) => t.title),
    ).toEqual(['Ancienne fiche']);
  });
  test('recherche insensible à la casse sur titre + résumé', () => {
    expect(filterAndSortTutorials(tutorials, { search: '  GREFFE ' }).map((t) => t.title)).toEqual([
      'Ancienne fiche',
      'Greffe',
    ]);
  });
  test('liste absente → tableau vide', () => {
    expect(filterAndSortTutorials(undefined)).toEqual([]);
  });
});

describe('tutorialZonePickLabel', () => {
  test('zone sans êtres vivants → juste le nom', () => {
    expect(tutorialZonePickLabel({ name: 'Verger' })).toBe('Verger');
    expect(tutorialZonePickLabel({ name: 'Mare', living_beings_list: [] })).toBe('Mare');
  });
  test('zone avec êtres vivants → « Nom — … » (préfixe nom + séparateur)', () => {
    const label = tutorialZonePickLabel({
      name: 'Verger',
      living_beings_list: [{ name: 'Pommier' }],
    });
    expect(label.startsWith('Verger — ')).toBe(true);
    expect(label.length).toBeGreaterThan('Verger — '.length);
  });
});

describe('createInitialTutorialForm', () => {
  test('forme attendue, type html, actif par défaut', () => {
    expect(createInitialTutorialForm()).toEqual({
      id: null,
      title: '',
      summary: '',
      type: 'html',
      html_content: '',
      source_url: '',
      source_file_path: '',
      sort_order: 0,
      is_active: true,
      map_id: '',
      zone_ids: [],
      marker_ids: [],
    });
  });
  test('objet et tableaux neufs à chaque appel (pas de partage de référence)', () => {
    const a = createInitialTutorialForm();
    const b = createInitialTutorialForm();
    expect(a).not.toBe(b);
    expect(a.zone_ids).not.toBe(b.zone_ids);
    a.zone_ids.push(1);
    expect(b.zone_ids).toEqual([]);
  });
});
