import { describe, it, expect } from 'vitest';
import {
  NO_RELATION_TEXT,
  addToSelection,
  defaultSelectionDepth,
  filterSelectionCandidates,
  hasMutualLinks,
  pickEntryMap,
  readStoredSelection,
  removeFromSelection,
  selectionCandidates,
  selectionDepthChoices,
  selectionStorageKey,
  toggleInSelection,
  writeStoredSelection,
} from '../../../src/components/pedago/foodWebSelectionModel.js';

/** Chantier collège du 22/11/2026, lot 2 : sélection de plusieurs espèces (logique pure). */

const row = (id, type, from, fromName, to, toName, extra = {}) => ({
  id,
  interaction_type: type,
  from_id: from,
  from_name: fromName,
  to_id: to,
  to_name: toName,
  from_in_scope: 1,
  to_in_scope: 1,
  ...extra,
});

const ITEMS = [
  row(1, 'herbivorie', 2, 'Tilapia', 1, 'Élodée'),
  row(2, 'pollinisation', 3, 'Abeille', 4, 'Courgette', { from_in_scope: 0 }),
  row(3, 'predation', 5, 'Héron', 2, 'Tilapia'),
];

describe('opérations de sélection', () => {
  it('ajouter, retirer, basculer — ordre conservé, sans doublon', () => {
    let s = addToSelection([], 2);
    s = addToSelection(s, '4');
    s = addToSelection(s, 2);
    expect(s).toEqual([2, 4]);
    expect(toggleInSelection(s, 7)).toEqual([2, 4, 7]);
    expect(toggleInSelection(s, 2)).toEqual([4]);
    expect(removeFromSelection(s, 4)).toEqual([2]);
    expect(addToSelection(s, 'x')).toEqual([2, 4]);
  });
});

describe('profondeur par défaut', () => {
  it('1 pour une espèce ; plusieurs : 0 si liens mutuels, sinon 1', () => {
    expect(defaultSelectionDepth(ITEMS, [2])).toBe(1);
    expect(hasMutualLinks(ITEMS, [2, 5])).toBe(true);
    expect(defaultSelectionDepth(ITEMS, [2, 5])).toBe(0);
    expect(defaultSelectionDepth(ITEMS, [1, 4])).toBe(1);
  });
  it('« seulement les liens entre mes espèces » dès deux espèces', () => {
    expect(selectionDepthChoices(1)).toEqual([1, 2]);
    expect(selectionDepthChoices(3)).toEqual([0, 1, 2]);
  });
});

describe('candidats', () => {
  const plants = [
    { id: 2, name: 'Tilapia' },
    { id: 9, name: 'Ver sans lien' },
  ];
  it('phares en tête ; hors carte marqué ; espèce sans lien seulement par la recherche', () => {
    const list = selectionCandidates(ITEMS, { featuredIds: [4], plants });
    expect(list[0]).toMatchObject({ id: 4, featured: true });
    expect(list.find((c) => c.id === 3).outOfScope).toBe(true);
    expect(list.find((c) => c.id === 2).links).toBe(2);
    const noSearch = filterSelectionCandidates(list, '');
    expect([...noSearch.featured, ...noSearch.others].some((c) => c.id === 9)).toBe(false);
    const found = filterSelectionCandidates(list, 'VER SANS');
    expect(found.others.map((c) => c.id)).toEqual([9]);
    expect(found.others[0].links).toBe(0);
    expect(NO_RELATION_TEXT).toBe('aucune relation enregistrée');
  });
  it('recherche sans accents', () => {
    const list = selectionCandidates(ITEMS, {});
    expect(filterSelectionCandidates(list, 'elodee').others.map((c) => c.id)).toEqual([1]);
  });
  it('liste bornée sans recherche', () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      row(i + 10, 'predation', i + 100, `E${i}`, 1, 'Élodée'),
    );
    const out = filterSelectionCandidates(selectionCandidates(many), '', { max: 5 });
    expect(out.others).toHaveLength(5);
  });
});

describe('mémoire de session par carte', () => {
  it('lit et écrit sans jamais lever', () => {
    const store = new Map();
    const storage = {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, v),
      removeItem: (k) => store.delete(k),
    };
    writeStoredSelection(storage, 'n3', [3, 1]);
    expect(store.get(selectionStorageKey('n3'))).toBe('[3,1]');
    expect(readStoredSelection(storage, 'n3')).toEqual([3, 1]);
    writeStoredSelection(storage, 'n3', []);
    expect(readStoredSelection(storage, 'n3')).toEqual([]);
    const broken = {
      getItem: () => {
        throw new Error('bloqué');
      },
      setItem: () => {
        throw new Error('plein');
      },
    };
    expect(readStoredSelection(broken, 'n3')).toEqual([]);
    expect(() => writeStoredSelection(broken, 'n3', [1])).not.toThrow();
    expect(selectionStorageKey('')).toBe('foretmap.foodweb.selection.all');
  });
});

describe('carte d’ouverture depuis une fiche', () => {
  it('carte active si l’espèce y vit, sinon la première de ses cartes, sinon toutes', () => {
    expect(pickEntryMap({ speciesMapIds: ['n3', 'foret'], activeMapId: 'foret' })).toBe('foret');
    expect(pickEntryMap({ speciesMapIds: ['n3', 'dayat'], activeMapId: 'foret' })).toBe('n3');
    expect(pickEntryMap({ speciesMapIds: [], activeMapId: 'foret' })).toBe('');
    expect(
      pickEntryMap({
        speciesMapIds: ['cachee', 'dayat'],
        activeMapId: 'foret',
        availableMapIds: ['foret', 'dayat'],
      }),
    ).toBe('dayat');
  });
});
