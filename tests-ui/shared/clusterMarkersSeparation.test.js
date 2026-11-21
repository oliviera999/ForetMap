import { describe, expect, test } from 'vitest';

import {
  CLUSTER_MARKER_RADIUS_PX_DEFAULT,
  CLUSTER_PILL_HALF_HEIGHT_PX,
  clusterMarkers,
  clusterPillRadiusPx,
  clusterSeparationPx,
} from '../../src/shared/pct-map/clusterMarkers.js';

/**
 * Seconde passe du regroupement (audit UI/UX du 19/11/2026, lot I) : plus aucun repère laissé
 * seul sous la pastille d'un groupe voisin. Les positions ci-dessous sont celles des repères
 * de la carte « forêt » (arrondies), là où le défaut a été relevé.
 */
const FOREST_PCT = [
  [50.72, 6.04],
  [23.19, 11.36],
  [46.76, 12.29],
  [52.96, 14.21],
  [26.44, 19.59],
  [36.08, 19.66],
  [59.74, 26.31],
  [47.2, 31.12],
  [24.86, 31.2],
  [56.74, 31.43],
  [41.46, 33.14],
  [28.57, 39.56],
  [35.35, 42.96],
  [30.25, 48.3],
  [84.55, 54.43],
  [42.78, 57.19],
  [37.93, 64.24],
  [69.48, 71.44],
  [51.86, 75.98],
  [61.19, 86.19],
  [53.58, 92.33],
];
const FOREST = FOREST_PCT.map(([x, y], index) => ({
  id: `f${index}`,
  x_pct: x,
  y_pct: y,
  label: `Lieu ${index}`,
}));

/** Rectangle image mesuré : Visite sur téléphone de 390 px, puis ordinateur de 1 440 px. */
const PHONE = { contentWidthPx: 302, contentHeightPx: 200.86, scale: 1 };
const DESKTOP = { contentWidthPx: 992.3, contentHeightPx: 660, scale: 1 };

/** Cibles agrandies (réglage d'un produit pour pointeur grossier) : 56 px, pilules plus larges. */
const COARSE = {
  markerRadiusPx: 28,
  pillRadiusPx: (count) => 36 + 5 * String(count).length,
};

function toScreen(cluster, view) {
  return {
    x: (cluster.x_pct / 100) * view.contentWidthPx * view.scale,
    y: (cluster.y_pct / 100) * view.contentHeightPx * view.scale,
  };
}

/** Paires d'éléments rendus plus proches que l'écart requis (liste vide = rien ne se gêne). */
function tooClose(clusters, view, sizes) {
  const out = [];
  for (let a = 0; a < clusters.length; a += 1) {
    for (let b = a + 1; b < clusters.length; b += 1) {
      const pa = toScreen(clusters[a], view);
      const pb = toScreen(clusters[b], view);
      const distance = Math.hypot(pa.x - pb.x, pa.y - pb.y);
      const need = clusterSeparationPx(clusters[a].count, clusters[b].count, sizes);
      if (distance < need - 1e-6) {
        out.push({ a: clusters[a].id, b: clusters[b].id, distance, need });
      }
    }
  }
  return out;
}

/** Générateur déterministe (LCG) : mêmes nuages de repères à chaque exécution. */
function seededMarkers(seed, count) {
  let state = seed;
  const next = () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
  return Array.from({ length: count }, (_, index) => ({
    id: `m${seed}-${index}`,
    x_pct: 5 + next() * 90,
    y_pct: 5 + next() * 90,
    label: `Repère ${index}`,
  }));
}

describe('clusterSeparationPx', () => {
  test('repère seul contre pastille : rayon de la pastille + rayon du repère', () => {
    expect(clusterSeparationPx(1, 3)).toBe(
      clusterPillRadiusPx(3) + CLUSTER_MARKER_RADIUS_PX_DEFAULT,
    );
    expect(clusterSeparationPx(12, 1)).toBe(
      clusterPillRadiusPx(12) + CLUSTER_MARKER_RADIUS_PX_DEFAULT,
    );
    expect(clusterSeparationPx(1, 3, COARSE)).toBe(41 + 28);
  });

  test('deux repères seuls : le centre de l’un hors du carré de touche de l’autre', () => {
    expect(clusterSeparationPx(1, 1)).toBeCloseTo(CLUSTER_MARKER_RADIUS_PX_DEFAULT * Math.SQRT2);
  });

  test('deux pastilles : jamais le centre de l’une sous l’autre', () => {
    const need = clusterSeparationPx(4, 25);
    expect(need).toBeGreaterThanOrEqual(
      Math.hypot(clusterPillRadiusPx(25), CLUSTER_PILL_HALF_HEIGHT_PX),
    );
  });

  test('la pilule s’élargit avec le nombre de chiffres, jamais sous une cible tactile', () => {
    expect(clusterPillRadiusPx(2)).toBeGreaterThanOrEqual(22);
    expect(clusterPillRadiusPx(10)).toBeGreaterThan(clusterPillRadiusPx(9));
  });
});

describe('clusterMarkers — séparation des repères et des pastilles', () => {
  test('cas relevé : un repère à 25 px d’un groupe voisin, dans une autre cellule', () => {
    // Cellules de 44 px sur 1000 px : « a » et « b » partagent une cellule (groupe centré
    // en x = 41 px), « seul » tombe dans la suivante, à 25 px du centre du groupe.
    const markers = [
      { id: 'a', x_pct: 3.9, y_pct: 2 },
      { id: 'b', x_pct: 4.3, y_pct: 2 },
      { id: 'seul', x_pct: 6.6, y_pct: 2 },
    ];
    const clusters = clusterMarkers(markers, {
      contentWidthPx: 1000,
      contentHeightPx: 1000,
      scale: 1,
    });
    expect(clusters).toHaveLength(1);
    expect(clusters[0].count).toBe(3);
    expect(clusters[0].markers.map((m) => m.id)).toEqual(['a', 'b', 'seul']);
    expect(clusters[0].bounds).toEqual({ minXPct: 3.9, minYPct: 2, maxXPct: 6.6, maxYPct: 2 });
  });

  test('deux repères à cheval sur deux cellules, plus proches qu’une demi-cible : un groupe', () => {
    // 43 px et 46 px : deux cellules, 3 px d'écart — l'un prenait tout le toucher de l'autre.
    const clusters = clusterMarkers(
      [
        { id: 'a', x_pct: 4.3, y_pct: 2 },
        { id: 'b', x_pct: 4.6, y_pct: 2 },
      ],
      { contentWidthPx: 1000, contentHeightPx: 1000, scale: 1 },
    );
    expect(clusters).toHaveLength(1);
    expect(clusters[0].count).toBe(2);
  });

  test.each([
    ['téléphone', PHONE],
    ['ordinateur', DESKTOP],
  ])('forêt, %s : aucun repère seul sous une pastille, rien ne se gêne', (_name, view) => {
    const clusters = clusterMarkers(FOREST, view);
    expect(tooClose(clusters, view)).toEqual([]);
    // Aucun repère perdu ni dupliqué.
    const ids = clusters.flatMap((c) => c.markers.map((m) => m.id)).sort();
    expect(ids).toEqual(FOREST.map((m) => m.id).sort());
    expect(clusters.reduce((sum, c) => sum + c.count, 0)).toBe(FOREST.length);
  });

  test('forêt sur ordinateur : les repères restent tous distincts (rien à regrouper)', () => {
    expect(clusterMarkers(FOREST, DESKTOP).every((c) => c.count === 1)).toBe(true);
  });

  test('forêt sur téléphone : il reste des repères seuls et des groupes', () => {
    const clusters = clusterMarkers(FOREST, PHONE);
    expect(clusters.some((c) => c.count === 1)).toBe(true);
    expect(clusters.filter((c) => c.count > 1).length).toBeGreaterThan(1);
  });

  test.each([
    ['cibles par défaut (44 px, pointeur fin ou grossier)', undefined],
    ['cibles agrandies (56 px)', COARSE],
  ])('nuages denses, %s : l’écart requis tient à toute échelle', (_name, sizes) => {
    for (const seed of [1, 7, 42, 2026]) {
      for (const count of [12, 45, 120]) {
        const markers = seededMarkers(seed, count);
        for (const scale of [1, 1.6, 3]) {
          const view = { contentWidthPx: 320, contentHeightPx: 240, scale };
          const clusters = clusterMarkers(markers, { ...view, ...sizes });
          expect(tooClose(clusters, view, sizes)).toEqual([]);
          expect(clusters.reduce((sum, c) => sum + c.count, 0)).toBe(count);
        }
      }
    }
  });

  test('résultat stable : même découpage quel que soit l’ordre d’entrée', () => {
    const shape = (clusters) =>
      clusters.map((c) =>
        c.markers
          .map((m) => m.id)
          .sort()
          .join('+'),
      );
    const direct = clusterMarkers(FOREST, PHONE);
    expect(shape(clusterMarkers([...FOREST].reverse(), PHONE))).toEqual(shape(direct));
    // Les membres d'un groupe gardent l'ordre de la liste d'entrée.
    for (const cluster of direct) {
      const order = cluster.markers.map((m) => FOREST.indexOf(m));
      expect(order).toEqual([...order].sort((a, b) => a - b));
    }
  });

  test('le repère mis à part (fiche ouverte) ne se fond toujours dans aucun groupe', () => {
    const clusters = clusterMarkers(FOREST, { ...PHONE, keepApartId: 'f3' });
    const apart = clusters.find((c) => c.id === 'f3');
    expect(apart?.count).toBe(1);
    expect(clusters.reduce((sum, c) => sum + c.count, 0)).toBe(FOREST.length);
    // Rendu en dernier : peint au-dessus d'une pastille voisine, il garde le toucher.
    expect(clusters[clusters.length - 1].id).toBe('f3');
  });

  test('les lieux mis en avant sont rendus après toutes les pastilles', () => {
    const markers = FOREST.map((m, index) => (index % 5 === 0 ? { ...m, map_highlight: true } : m));
    const clusters = clusterMarkers(markers, PHONE);
    const lastPill = clusters.map((c) => c.count > 1).lastIndexOf(true);
    const firstApart = clusters.findIndex((c) => c.lead.map_highlight === true);
    expect(lastPill).toBeGreaterThanOrEqual(0);
    expect(firstApart).toBeGreaterThan(lastPill);
    expect(clusters.filter((c) => c.lead.map_highlight === true)).toHaveLength(5);
  });

  test('regroupement coupé : aucune fusion, même pour des repères superposés', () => {
    const clusters = clusterMarkers(FOREST, { ...PHONE, enabled: false });
    expect(clusters).toHaveLength(FOREST.length);
  });

  test('zoomer défait les groupes : la séparation suit l’échelle', () => {
    const view = { ...PHONE, scale: 4 };
    const clusters = clusterMarkers(FOREST, view);
    expect(tooClose(clusters, view)).toEqual([]);
    expect(clusters.length).toBeGreaterThan(clusterMarkers(FOREST, PHONE).length);
  });
});
