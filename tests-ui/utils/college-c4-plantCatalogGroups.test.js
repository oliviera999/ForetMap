import { describe, test, expect } from 'vitest';
import {
  CATALOG_PRESENCE_RANK,
  TO_SEARCH_HINT,
  catalogPresenceRank,
  groupCatalogByUsage,
  isToSearchPresence,
} from '../../src/utils/plantCatalogHelpers.js';
import {
  CATALOG_OTHER_GROUP_ID,
  catalogHasUsageGroups,
  plantMatchesStructuredFilters,
  plantTaxonomyValue,
  plantTextMatchesQuery,
  usageGroupFilterOptions,
} from '../../src/utils/plantFilters.js';
import { PRESENCE_VALIDATION_STATUS_ENUM } from '../../src/shared/enums/biodivEnums.js';

/** Catalogue groupé du collège (chantier collège, flux C4) : helpers purs. */

const G_OIS = { id: 'oiseaux', label: 'Oiseaux' };
const G_INS = { id: 'insectes', label: 'Insectes' };

const plants = [
  { id: 1, name: 'Mésange', usage_group: G_OIS },
  { id: 2, name: 'Coccinelle', usage_group: G_INS },
  { id: 3, name: 'Bergeronnette', usage_group: G_OIS },
  { id: 4, name: 'Plancton', usage_group: null },
  { id: 5, name: 'Héron', usage_group: G_OIS },
];

describe('rang de présence', () => {
  test('phare < présent (confirmé, attendu, lieu) < à chercher < absent', () => {
    expect(catalogPresenceRank({ is_featured: true, validation_status: 'attendu' })).toBe(
      CATALOG_PRESENCE_RANK.FEATURED,
    );
    expect(catalogPresenceRank({ validation_status: 'confirme_site' })).toBe(
      CATALOG_PRESENCE_RANK.PRESENT,
    );
    expect(catalogPresenceRank({ validation_status: 'attendu' })).toBe(
      CATALOG_PRESENCE_RANK.PRESENT,
    );
    expect(catalogPresenceRank({ sources: ['zone'], validation_status: null })).toBe(
      CATALOG_PRESENCE_RANK.PRESENT,
    );
    expect(catalogPresenceRank({ validation_status: 'documentaire' })).toBe(
      CATALOG_PRESENCE_RANK.TO_SEARCH,
    );
    expect(catalogPresenceRank({ validation_status: 'a_confirmer' })).toBe(
      CATALOG_PRESENCE_RANK.TO_SEARCH,
    );
    expect(catalogPresenceRank(null)).toBe(CATALOG_PRESENCE_RANK.ELSEWHERE);
  });

  test('featured_first masquée : une phare garde son rang de présence', () => {
    expect(
      catalogPresenceRank(
        { is_featured: true, validation_status: 'documentaire' },
        { featuredFirst: false },
      ),
    ).toBe(CATALOG_PRESENCE_RANK.TO_SEARCH);
  });

  test('« à chercher » = les deux derniers statuts du référentiel', () => {
    const [confirme, attendu, aConfirmer, documentaire] = PRESENCE_VALIDATION_STATUS_ENUM.values;
    expect(isToSearchPresence({ validation_status: aConfirmer })).toBe(true);
    expect(isToSearchPresence({ validation_status: documentaire })).toBe(true);
    expect(isToSearchPresence({ validation_status: confirme })).toBe(false);
    expect(isToSearchPresence({ validation_status: attendu })).toBe(false);
    expect(TO_SEARCH_HINT).toBe('à chercher');
  });
});

describe('groupCatalogByUsage', () => {
  test('sections triées par libellé, « Autres » en dernier, effectifs', () => {
    const groups = groupCatalogByUsage(plants, null);
    expect(groups.map((g) => [g.id, g.count])).toEqual([
      ['insectes', 1],
      ['oiseaux', 3],
      [CATALOG_OTHER_GROUP_ID, 1],
    ]);
    expect(groups[2].label).toBe('Autres êtres vivants');
  });

  test('dans une section : rang puis ordre reçu (tri de l’élève conservé)', () => {
    const presence = new Map([
      [1, { plant_id: 1, validation_status: 'documentaire' }],
      [3, { plant_id: 3, validation_status: 'confirme_site' }],
      [5, { plant_id: 5, validation_status: 'attendu', is_featured: true }],
    ]);
    const oiseaux = groupCatalogByUsage(plants, presence).find((g) => g.id === 'oiseaux');
    expect(oiseaux.plants.map((x) => x.plant.name)).toEqual(['Héron', 'Bergeronnette', 'Mésange']);
    expect(oiseaux.plants.map((x) => x.toSearch)).toEqual([false, false, true]);
  });

  test('liste vide ou absente', () => {
    expect(groupCatalogByUsage([], null)).toEqual([]);
    expect(groupCatalogByUsage(null, null)).toEqual([]);
  });
});

describe('filtre « Groupe »', () => {
  test('options : groupes présents par libellé, « Autres » en dernier', () => {
    expect(usageGroupFilterOptions(plants)).toEqual([
      { id: 'insectes', label: 'Insectes', count: 1 },
      { id: 'oiseaux', label: 'Oiseaux', count: 3 },
      { id: CATALOG_OTHER_GROUP_ID, label: 'Autres êtres vivants', count: 1 },
    ]);
  });

  test('plantMatchesStructuredFilters filtre par groupe d’usage', () => {
    expect(plantMatchesStructuredFilters(plants[0], { usageGroup: 'oiseaux' })).toBe(true);
    expect(plantMatchesStructuredFilters(plants[1], { usageGroup: 'oiseaux' })).toBe(false);
    expect(plantMatchesStructuredFilters(plants[3], { usageGroup: CATALOG_OTHER_GROUP_ID })).toBe(
      true,
    );
    expect(plantMatchesStructuredFilters(plants[0], { usageGroup: '' })).toBe(true);
  });

  test('catalogHasUsageGroups : repli quand aucune fiche n’a de groupe', () => {
    expect(catalogHasUsageGroups(plants)).toBe(true);
    expect(catalogHasUsageGroups([{ id: 1, usage_group: null }])).toBe(false);
    expect(catalogHasUsageGroups(null)).toBe(false);
  });

  test('la recherche trouve le libellé du groupe et l’étiquette simple', () => {
    expect(plantTextMatchesQuery(plants[0], 'oiseaux')).toBe(true);
    expect(
      plantTextMatchesQuery({ name: 'Ficus', usage_label: 'arbre fruitier' }, 'fruitier'),
    ).toBe(true);
  });
});

describe('refacto : plus de repli group_*', () => {
  test('plantTaxonomyValue ne lit plus les colonnes supprimées en migration 129', () => {
    expect(plantTaxonomyValue({ group_1: 'Végétal' }, 'kingdom')).toBe('');
    expect(plantTaxonomyValue({ taxon_kingdom: 'Végétal' }, 'kingdom')).toBe('Végétal');
  });
});
