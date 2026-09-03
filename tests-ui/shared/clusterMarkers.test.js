import { describe, expect, test } from 'vitest';

import {
  CLUSTER_CELL_PX_DEFAULT,
  clusterCenterPct,
  clusterMarkers,
  clusterSeparatesOnZoom,
  clusterZoomTargetScale,
  markerPriority,
} from '../../src/shared/pct-map/clusterMarkers.js';

const VIEW = { contentWidthPx: 1000, contentHeightPx: 1000, scale: 1 };
const CATEGORIES = new Map([
  ['entrees', { id: 'entrees', sort_order: 10 }],
  ['sanitaires', { id: 'sanitaires', sort_order: 90 }],
]);

const near = (id, x, y, extra = {}) => ({ id, x_pct: x, y_pct: y, label: id, ...extra });

describe('markerPriority', () => {
  test('prend le meilleur rang des catégories du repère ; sans catégorie, le rang le plus bas', () => {
    expect(markerPriority({ category_ids: ['sanitaires', 'entrees'] }, CATEGORIES)).toBe(10);
    expect(markerPriority({ category_ids: ['sanitaires'] }, CATEGORIES)).toBe(90);
    expect(markerPriority({ category_ids: ['inconnue'] }, CATEGORIES)).toBe(Infinity);
    expect(markerPriority({}, CATEGORIES)).toBe(Infinity);
  });
});

describe('clusterMarkers', () => {
  test('repères éloignés → un groupe de taille 1 chacun', () => {
    const clusters = clusterMarkers([near('a', 5, 5), near('b', 80, 80)], VIEW);
    expect(clusters).toHaveLength(2);
    expect(clusters.every((c) => c.count === 1)).toBe(true);
    expect(clusters[0].lead.id).toBe('a');
  });

  test('repères dans la même cellule écran → un seul groupe, centre moyen et enveloppe', () => {
    // Cellule de 44 px sur 1000 px de contenu : 4,4 % de l'image.
    const clusters = clusterMarkers([near('a', 1, 1), near('b', 2, 2), near('c', 3, 1)], VIEW);
    expect(clusters).toHaveLength(1);
    const [cluster] = clusters;
    expect(cluster.count).toBe(3);
    expect(cluster.markers.map((m) => m.id).sort()).toEqual(['a', 'b', 'c']);
    expect(cluster.x_pct).toBeCloseTo(2, 5);
    expect(cluster.bounds).toEqual({ minXPct: 1, minYPct: 1, maxXPct: 3, maxYPct: 2 });
    expect(cluster.id).toContain('cluster:');
  });

  test('zoomer sépare les repères : plus de groupe à grande échelle', () => {
    const markers = [near('a', 1, 1), near('b', 3, 3)];
    expect(clusterMarkers(markers, VIEW)).toHaveLength(1);
    expect(clusterMarkers(markers, { ...VIEW, scale: 8 })).toHaveLength(2);
  });

  test('le représentant est le repère le plus prioritaire, pas un tirage', () => {
    const markers = [
      near('wc', 1, 1, { category_ids: ['sanitaires'] }),
      near('entree', 2, 1, { category_ids: ['entrees'] }),
    ];
    const [cluster] = clusterMarkers(markers, { ...VIEW, categoriesById: CATEGORIES });
    expect(cluster.lead.id).toBe('entree');
    // Ordre d'entrée inversé : même représentant (stabilité de rendu).
    const [again] = clusterMarkers([...markers].reverse(), {
      ...VIEW,
      categoriesById: CATEGORIES,
    });
    expect(again.lead.id).toBe('entree');
  });

  test('regroupement coupé, ou mesure absente → un groupe par repère', () => {
    const markers = [near('a', 1, 1), near('b', 2, 2)];
    expect(clusterMarkers(markers, { ...VIEW, enabled: false })).toHaveLength(2);
    expect(clusterMarkers(markers, { ...VIEW, contentWidthPx: 0 })).toHaveLength(2);
  });

  test('coordonnées illisibles ignorées, liste vide tolérée', () => {
    expect(clusterMarkers([{ id: 'x' }, near('a', 5, 5)], VIEW)).toHaveLength(1);
    expect(clusterMarkers(null, VIEW)).toEqual([]);
  });

  test('cellule par défaut ≈ une cible tactile', () => {
    expect(CLUSTER_CELL_PX_DEFAULT).toBe(44);
  });
});

describe('tap sur un groupe', () => {
  const spread = clusterMarkers([near('a', 1, 1), near('b', 3, 3)], VIEW)[0];
  const stacked = clusterMarkers([near('a', 5, 5), near('b', 5, 5)], VIEW)[0];

  test('clusterSeparatesOnZoom : vrai si les repères ne sont pas au même point', () => {
    expect(clusterSeparatesOnZoom(spread)).toBe(true);
    expect(clusterSeparatesOnZoom(stacked)).toBe(false);
    expect(clusterSeparatesOnZoom({ count: 1, bounds: {} })).toBe(false);
  });

  test('clusterZoomTargetScale : l’enveloppe occupe le cadre, bornée par maxScale', () => {
    const scale = clusterZoomTargetScale(spread, {
      stageWidthPx: 400,
      stageHeightPx: 800,
      contentWidthPx: 1000,
      contentHeightPx: 1000,
      maxScale: 8,
    });
    expect(scale).toBeGreaterThan(1);
    expect(scale).toBeLessThanOrEqual(8);
    expect(
      clusterZoomTargetScale(spread, {
        stageWidthPx: 400,
        stageHeightPx: 800,
        contentWidthPx: 1000,
        contentHeightPx: 1000,
        maxScale: 2,
      }),
    ).toBe(2);
    expect(clusterZoomTargetScale(null, {})).toBe(1);
  });

  test('clusterCenterPct : centre de l’enveloppe', () => {
    expect(clusterCenterPct(spread)).toEqual({ xp: 2, yp: 2 });
    expect(clusterCenterPct(null)).toEqual({ xp: 0, yp: 0 });
  });
});
