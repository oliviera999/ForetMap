import { describe, it, expect } from 'vitest';
import {
  COLLEGE_FOCUS_DEPTHS,
  filterItemsForProfile,
  filterStartSpecies,
  focusDepthChoices,
  foodWebProfile,
  initialFocusDepth,
  normalizeSeedIds,
  seedLinkStatus,
  startSpeciesCandidates,
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
    const p = foodWebProfile({ fullByDefault: true, offMapSpecies: true });
    expect(p.collegeMode).toBe(false);
    expect(p.hideOffMap).toBe(false);
    expect(p.focusDepths).toBe(FOCUS_DEPTHS);
  });
  it('collège : espèce de départ, profondeurs 1 et 2, hors carte masqué', () => {
    const p = foodWebProfile({ fullByDefault: false, offMapSpecies: false, allowedTypes: ['a'] });
    expect(p.collegeMode).toBe(true);
    expect(p.hideOffMap).toBe(true);
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
  it('types hors palier et espèces hors carte retirés', () => {
    const out = filterItemsForProfile(items, {
      allowedTypes: ['predation', 'herbivorie', 'decomposition'],
      hideOffMap: true,
    });
    expect(out.map((r) => r.id)).toEqual([1, 4]);
  });
  it('hors carte gardé quand le profil le montre', () => {
    expect(filterItemsForProfile(items, { hideOffMap: false }).map((r) => r.id)).toContain(3);
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

describe('espèces de départ', () => {
  const shown = [
    row(1, 'predation', 10, 20),
    row(2, 'herbivorie', 20, 30),
    row(3, 'herbivorie', 40, 30),
    row(4, 'decomposition', 50, null),
  ];
  shown[0].from_name = 'Écureuil';
  it('espèces phares en tête, puis par nombre de liens', () => {
    const list = startSpeciesCandidates(shown, { featuredIds: [50] });
    expect(list[0]).toMatchObject({ id: 50, featured: true });
    expect(
      list
        .slice(1, 3)
        .map((c) => c.id)
        .sort(),
    ).toEqual([20, 30]);
    expect(list.find((c) => c.id === 50).links).toBe(1);
    expect(list.some((c) => c.id == null)).toBe(false);
  });
  it('recherche sans accents ; sans recherche, liste bornée', () => {
    const list = startSpeciesCandidates(shown, { featuredIds: [50] });
    const found = filterStartSpecies(list, 'ecur');
    expect(found.others.map((c) => c.id)).toEqual([10]);
    const capped = filterStartSpecies(list, '', { max: 2 });
    expect(capped.featured.map((c) => c.id)).toEqual([50]);
    expect(capped.others).toHaveLength(2);
    expect(capped.total).toBe(list.length);
  });
});

describe('profondeurs', () => {
  it('une espèce : 1 ; plusieurs : 0', () => {
    expect(initialFocusDepth(1)).toBe(1);
    expect(initialFocusDepth(3)).toBe(0);
  });
  it('la profondeur 0 seulement à partir de deux espèces', () => {
    expect(focusDepthChoices(COLLEGE_FOCUS_DEPTHS, 1)).toEqual([1, 2]);
    expect(focusDepthChoices(COLLEGE_FOCUS_DEPTHS, 2)).toEqual([0, 1, 2]);
    expect(focusDepthChoices(FOCUS_DEPTHS, 1)).toEqual([1, 2]);
  });
  it('normalizeSeedIds : entiers positifs, sans doublon', () => {
    expect(normalizeSeedIds([3, '3', 0, -1, 'x', 4])).toEqual([3, 4]);
    expect(normalizeSeedIds(new Set([5]))).toEqual([5]);
    expect(normalizeSeedIds('7')).toEqual([7]);
    expect(normalizeSeedIds(null)).toEqual([]);
  });
});
