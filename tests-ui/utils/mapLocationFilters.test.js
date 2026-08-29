import { describe, test, expect } from 'vitest';
import {
  MAP_LOCATION_FILTER_DEFAULTS,
  applyMapLocationFilters,
  buildMarkerSearchBlob,
  buildZoneSearchBlob,
  collectMapSpeciesOptions,
  countActiveMapLocationFilters,
  isMapLocationFilterActive,
  mapSearchTokens,
  markerMatchesMapFilters,
  normalizeMapSearchText,
  zoneEffectiveStage,
  zoneMatchesMapFilters,
} from '../../src/utils/mapLocationFilters.js';

const ZONE_A = {
  id: 'z1',
  name: '🌿 Butte nord',
  description: 'Culture de tomates en permaculture',
  stage: 'growing',
  special: 0,
  species_ids: [10],
  species: [{ id: 10, name: 'Tomate' }],
  living_beings_list: ['Tomate cerise'],
  points: JSON.stringify([
    { xp: 10, yp: 10 },
    { xp: 20, yp: 10 },
    { xp: 15, yp: 20 },
  ]),
};

const ZONE_INFRA = {
  id: 'z2',
  name: 'Mare',
  description: 'Point d eau',
  stage: 'empty',
  special: 1,
  points: JSON.stringify([
    { xp: 30, yp: 30 },
    { xp: 40, yp: 30 },
    { xp: 35, yp: 40 },
  ]),
};

const MARKER_M = {
  id: 'm1',
  label: 'Olivier centenaire',
  emoji: '🌳',
  note: 'Arbre remarquable côté sud',
  species_ids: [20],
  species: [{ id: 20, name: 'Olivier' }],
  x_pct: 55,
  y_pct: 45,
};

const CTX = {
  zoneTaskVisualById: new Map([['z1', 'pending']]),
  markerTaskVisualById: new Map(),
  zoneTutorialCountById: new Map([['z2', 2]]),
  markerTutorialCountById: new Map([['m1', 1]]),
  emojiParsingList: ['🌿', '🌳'],
};

describe('normalizeMapSearchText', () => {
  test('minuscules et sans accents', () => {
    expect(normalizeMapSearchText('  Élève  ')).toBe('eleve');
  });
});

describe('mapSearchTokens', () => {
  test('AND sur plusieurs mots', () => {
    expect(mapSearchTokens('butte tomate')).toEqual(['butte', 'tomate']);
  });
});

describe('zoneMatchesMapFilters', () => {
  test('recherche texte dans description et espèce', () => {
    expect(zoneMatchesMapFilters(ZONE_A, { text: 'tomate' }, CTX)).toBe(true);
    expect(zoneMatchesMapFilters(ZONE_A, { text: 'tomate olivier' }, CTX)).toBe(false);
  });

  test('filtre état', () => {
    expect(zoneMatchesMapFilters(ZONE_A, { stages: ['growing'] }, CTX)).toBe(true);
    expect(zoneMatchesMapFilters(ZONE_A, { stages: ['empty'] }, CTX)).toBe(false);
  });

  test('infra specialOnly et stage special', () => {
    expect(zoneEffectiveStage(ZONE_INFRA)).toBe('special');
    expect(zoneMatchesMapFilters(ZONE_INFRA, { specialOnly: true }, CTX)).toBe(true);
    expect(zoneMatchesMapFilters(ZONE_A, { specialOnly: true }, CTX)).toBe(false);
    expect(zoneMatchesMapFilters(ZONE_INFRA, { stages: ['special'] }, CTX)).toBe(true);
  });

  test('filtre tâches et tutoriels', () => {
    expect(zoneMatchesMapFilters(ZONE_A, { hasTasks: 'yes' }, CTX)).toBe(true);
    expect(zoneMatchesMapFilters(ZONE_A, { hasTasks: 'no' }, CTX)).toBe(false);
    expect(zoneMatchesMapFilters(ZONE_INFRA, { hasTutorials: 'yes' }, CTX)).toBe(true);
  });

  test('filtre espèce', () => {
    expect(zoneMatchesMapFilters(ZONE_A, { speciesId: '10' }, CTX)).toBe(true);
    expect(zoneMatchesMapFilters(ZONE_A, { speciesId: '99' }, CTX)).toBe(false);
  });

  test('kinds markers exclut les zones', () => {
    expect(zoneMatchesMapFilters(ZONE_A, { kinds: 'markers' }, CTX)).toBe(false);
  });
});

describe('markerMatchesMapFilters', () => {
  test('recherche dans label et note', () => {
    expect(markerMatchesMapFilters(MARKER_M, { text: 'olivier' }, CTX)).toBe(true);
    expect(markerMatchesMapFilters(MARKER_M, { text: 'remarquable' }, CTX)).toBe(true);
  });

  test('kinds zones exclut les repères', () => {
    expect(markerMatchesMapFilters(MARKER_M, { kinds: 'zones' }, CTX)).toBe(false);
  });

  test('stages et specialOnly excluent les repères', () => {
    expect(markerMatchesMapFilters(MARKER_M, { stages: ['growing'] }, CTX)).toBe(false);
    expect(markerMatchesMapFilters(MARKER_M, { specialOnly: true }, CTX)).toBe(false);
  });

  test('tutoriels sur repère', () => {
    expect(markerMatchesMapFilters(MARKER_M, { hasTutorials: 'yes' }, CTX)).toBe(true);
  });
});

describe('applyMapLocationFilters', () => {
  test('sans filtre, tout correspond', () => {
    const r = applyMapLocationFilters({
      zones: [ZONE_A, ZONE_INFRA],
      markers: [MARKER_M],
      filters: MAP_LOCATION_FILTER_DEFAULTS,
      context: CTX,
    });
    expect(r.filterActive).toBe(false);
    expect(r.matchingZoneIds.size).toBe(2);
    expect(r.matchingMarkerIds.size).toBe(1);
    expect(r.resultItems).toHaveLength(3);
  });

  test('filtre actif atténue les non-correspondants via ids', () => {
    const r = applyMapLocationFilters({
      zones: [ZONE_A, ZONE_INFRA],
      markers: [MARKER_M],
      filters: { text: 'tomate' },
      context: CTX,
    });
    expect(r.filterActive).toBe(true);
    expect(r.matchingZoneIds).toEqual(new Set(['z1']));
    expect(r.matchingMarkerIds.size).toBe(0);
    expect(r.resultItems).toHaveLength(1);
  });
});

describe('collectMapSpeciesOptions', () => {
  test('agrège et trie les espèces', () => {
    const opts = collectMapSpeciesOptions([ZONE_A], [MARKER_M]);
    expect(opts.map((o) => o.label)).toEqual(['Olivier', 'Tomate']);
  });
});

describe('isMapLocationFilterActive / countActiveMapLocationFilters', () => {
  test('texte ou critère structuré', () => {
    expect(isMapLocationFilterActive({})).toBe(false);
    expect(isMapLocationFilterActive({ text: 'x' })).toBe(true);
    expect(countActiveMapLocationFilters({ kinds: 'zones' })).toBe(1);
    expect(countActiveMapLocationFilters({ text: 'x' })).toBe(0);
  });
});

describe('buildZoneSearchBlob / buildMarkerSearchBlob', () => {
  test('inclut noms et espèces normalisés', () => {
    expect(buildZoneSearchBlob(ZONE_A, CTX.emojiParsingList)).toContain('tomate');
    expect(buildMarkerSearchBlob(MARKER_M)).toContain('olivier');
  });
});
