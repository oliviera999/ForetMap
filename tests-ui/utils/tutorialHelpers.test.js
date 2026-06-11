import { describe, test, expect } from 'vitest';
import {
  tutorialZonePickLabel,
  sortTutorialsByOrder,
  moveIndex,
  LINKED_TASK_STATUS_LABELS,
  linkedTaskStatusLabel,
  initialTutorialForm,
} from '../../src/utils/tutorialHelpers.js';

// ── tutorialZonePickLabel ──────────────────────────────────────────────────────

describe('tutorialZonePickLabel', () => {
  test('retourne juste le nom si aucun être vivant', () => {
    const zone = { name: 'Clairière', living_beings_list: [], current_plant: null };
    expect(tutorialZonePickLabel(zone)).toBe('Clairière');
  });

  test('retourne nom — liste si des êtres vivants sont présents', () => {
    const zone = {
      name: 'Clairière',
      living_beings_list: [{ scientific_name: 'Quercus robur', type: 'plant' }],
      current_plant: null,
    };
    const result = tutorialZonePickLabel(zone);
    expect(result).toMatch(/^Clairière — /);
  });

  test('utilise living_beings en fallback si living_beings_list absent', () => {
    const zone = {
      name: 'Ruisseau',
      living_beings: [{ scientific_name: 'Alnus glutinosa', type: 'plant' }],
      current_plant: null,
    };
    const result = tutorialZonePickLabel(zone);
    expect(result).toMatch(/^Ruisseau/);
  });
});

// ── sortTutorialsByOrder ───────────────────────────────────────────────────────

describe('sortTutorialsByOrder', () => {
  test('trie par sort_order croissant', () => {
    const list = [
      { id: 'c', sort_order: 3, title: 'C' },
      { id: 'a', sort_order: 1, title: 'A' },
      { id: 'b', sort_order: 2, title: 'B' },
    ];
    const result = sortTutorialsByOrder(list);
    expect(result.map((t) => t.id)).toEqual(['a', 'b', 'c']);
  });

  test('tri alphabétique (fr) en cas de sort_order identique', () => {
    const list = [
      { id: '2', sort_order: 0, title: 'Zèbre' },
      { id: '1', sort_order: 0, title: 'Arbre' },
      { id: '3', sort_order: 0, title: 'Mousse' },
    ];
    const result = sortTutorialsByOrder(list);
    expect(result.map((t) => t.id)).toEqual(['1', '3', '2']);
  });

  test('traite sort_order absent comme 0', () => {
    const list = [
      { id: 'b', sort_order: 5, title: 'B' },
      { id: 'a', title: 'A' },
    ];
    const result = sortTutorialsByOrder(list);
    expect(result[0].id).toBe('a');
    expect(result[1].id).toBe('b');
  });

  test("ne modifie pas le tableau d'origine", () => {
    const list = [
      { id: 'b', sort_order: 2, title: 'B' },
      { id: 'a', sort_order: 1, title: 'A' },
    ];
    const original = [...list];
    sortTutorialsByOrder(list);
    expect(list).toEqual(original);
  });

  test('retourne tableau vide pour entrée vide', () => {
    expect(sortTutorialsByOrder([])).toEqual([]);
  });
});

// ── moveIndex ─────────────────────────────────────────────────────────────────

describe('moveIndex', () => {
  const arr = ['a', 'b', 'c', 'd'];

  test('déplace un élément vers le bas', () => {
    expect(moveIndex(arr, 0, 2)).toEqual(['b', 'c', 'a', 'd']);
  });

  test('déplace un élément vers le haut', () => {
    expect(moveIndex(arr, 3, 1)).toEqual(['a', 'd', 'b', 'c']);
  });

  test('from === to : retourne le même tableau (référence identique)', () => {
    expect(moveIndex(arr, 1, 1)).toBe(arr);
  });

  test('index négatif : retourne le tableau inchangé', () => {
    expect(moveIndex(arr, -1, 2)).toBe(arr);
    expect(moveIndex(arr, 0, -1)).toBe(arr);
  });

  test('index hors limites : retourne le tableau inchangé', () => {
    expect(moveIndex(arr, 0, 10)).toBe(arr);
    expect(moveIndex(arr, 10, 0)).toBe(arr);
  });

  test("ne modifie pas le tableau d'origine", () => {
    const copy = [...arr];
    moveIndex(arr, 0, 3);
    expect(arr).toEqual(copy);
  });
});

// ── linkedTaskStatusLabel ─────────────────────────────────────────────────────

describe('linkedTaskStatusLabel', () => {
  test.each(Object.entries(LINKED_TASK_STATUS_LABELS))(
    'retourne le libellé français pour le statut "%s"',
    (status, expected) => {
      expect(linkedTaskStatusLabel(status)).toBe(expected);
    }
  );

  test('est insensible à la casse', () => {
    expect(linkedTaskStatusLabel('DONE')).toBe('Terminée');
    expect(linkedTaskStatusLabel('In_Progress')).toBe('En cours');
  });

  test('retourne la valeur brute pour un statut inconnu', () => {
    expect(linkedTaskStatusLabel('unknown_status')).toBe('unknown_status');
  });

  test('retourne "—" pour valeur nulle ou vide', () => {
    expect(linkedTaskStatusLabel(null)).toBe('—');
    expect(linkedTaskStatusLabel('')).toBe('—');
    expect(linkedTaskStatusLabel(undefined)).toBe('—');
  });
});

// ── initialTutorialForm ───────────────────────────────────────────────────────

describe('initialTutorialForm', () => {
  test('retourne la structure complète avec les valeurs par défaut', () => {
    const form = initialTutorialForm();
    expect(form).toEqual({
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

  test('retourne un nouvel objet à chaque appel (pas de partage de référence)', () => {
    const a = initialTutorialForm();
    const b = initialTutorialForm();
    expect(a).not.toBe(b);
    a.zone_ids.push('x');
    expect(b.zone_ids).toEqual([]);
  });
});
