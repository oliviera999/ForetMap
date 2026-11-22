import { describe, it, expect } from 'vitest';
import {
  COLLEGE_FOCUS_DEPTHS,
  filterItemsForProfile,
  foodWebProfile,
  initialFocusDepth,
  itemsAroundSeeds,
  normalizeSeedIds,
  seedLinkStatus,
} from '../../../src/components/pedago/foodWebProfileModel.js';
import { FOCUS_DEPTHS } from '../../../src/components/pedago/foodWebGraphModel.js';

const row = (id, type, from, to, extra = {}) => ({
  id,
  interaction_type: type,
  from_id: from,
  from_name: `Espèce ${from}`,
  to_id: to,
  to_name: to == null ? null : `Espèce ${to}`,
  ...extra,
});

describe('foodWebProfile', () => {
  it('lycée / prof : réseau complet, profondeurs historiques', () => {
    const p = foodWebProfile({ fullByDefault: true });
    expect(p.collegeMode).toBe(false);
    expect(p).not.toHaveProperty('hideOffMap');
    expect(p.focusDepths).toBe(FOCUS_DEPTHS);
  });
  it('collège : profondeurs 1 et 2, hors carte jamais masqué', () => {
    const p = foodWebProfile({ fullByDefault: false, allowedTypes: ['a'] });
    expect(p.collegeMode).toBe(true);
    expect(p).not.toHaveProperty('hideOffMap');
    expect([...p.focusDepths]).toEqual([1, 2]);
    expect(p.allowedTypes).toEqual(['a']);
  });
});

describe('filterItemsForProfile', () => {
  const items = [
    row(1, 'predation', 1, 2),
    row(2, 'symbiose', 3, 4),
    row(3, 'herbivorie', 5, 6, { from_in_scope: 1, to_in_scope: 0 }),
    row(4, 'decomposition', 7, null, { from_in_scope: 1, to_in_scope: 1 }),
  ];
  it('sans profil : tout passe', () => {
    expect(filterItemsForProfile(items, {})).toHaveLength(4);
  });
  it('types hors palier retirés, liens hors carte gardés (décision 1 du 22/11/2026)', () => {
    const out = filterItemsForProfile(items, {
      allowedTypes: ['predation', 'herbivorie', 'decomposition'],
    });
    expect(out.map((r) => r.id)).toEqual([1, 3, 4]);
  });
  it('une ancienne option `hideOffMap` est sans effet', () => {
    expect(filterItemsForProfile(items, { hideOffMap: true }).map((r) => r.id)).toContain(3);
  });
});

describe('seedLinkStatus', () => {
  const raw = [row(1, 'predation', 1, 2), row(2, 'symbiose', 3, 4)];
  const shown = [raw[0]];
  it('visible, caché par le profil, absent', () => {
    expect(seedLinkStatus(raw, shown, 2)).toBe('visible');
    expect(seedLinkStatus(raw, shown, '3')).toBe('hidden');
    expect(seedLinkStatus(raw, shown, 99)).toBe('absent');
    expect(seedLinkStatus(raw, shown, null)).toBeNull();
  });
});

describe('profondeurs', () => {
  it('une espèce : 1 ; plusieurs : 0', () => {
    expect(initialFocusDepth(1)).toBe(1);
    expect(initialFocusDepth(3)).toBe(0);
  });
  it('normalizeSeedIds : entiers positifs, sans doublon', () => {
    expect(normalizeSeedIds([3, '3', 0, -1, 'x', 4])).toEqual([3, 4]);
    expect(normalizeSeedIds(new Set([5]))).toEqual([5]);
    expect(normalizeSeedIds('7')).toEqual([7]);
    expect(normalizeSeedIds(null)).toEqual([]);
  });
});

describe('itemsAroundSeeds', () => {
  // Chaîne 1 → 2 → 3 → 4, et 2 vers l'environnement ; 5 relié à l'environnement seulement.
  const items = [
    row(1, 'predation', 1, 2),
    row(2, 'predation', 2, 3),
    row(3, 'predation', 3, 4),
    row(4, 'decomposition', 2, null),
    row(5, 'decomposition', 5, null),
    row(6, 'competition', 1, 3),
  ];
  const ids = (list) => list.map((r) => r.id).sort((a, b) => a - b);
  it('profondeur 1 : voisins directs (et leurs liens mutuels)', () => {
    expect(ids(itemsAroundSeeds(items, [2], 1))).toEqual([1, 2, 4, 6]);
  });
  it('profondeur 2 : la chaîne, sans traverser l’environnement', () => {
    expect(ids(itemsAroundSeeds(items, [1], 2))).toEqual([1, 2, 3, 4, 6]);
    expect(itemsAroundSeeds(items, [1], 2).some((r) => r.id === 5)).toBe(false);
  });
  it('profondeur 0 : les espèces choisies et leurs liens mutuels', () => {
    expect(ids(itemsAroundSeeds(items, [1, 3], 0))).toEqual([6]);
    expect(itemsAroundSeeds(items, [4], 0)).toEqual([]);
  });
  it('sans graine : rien', () => {
    expect(itemsAroundSeeds(items, [], 1)).toEqual([]);
  });
});
