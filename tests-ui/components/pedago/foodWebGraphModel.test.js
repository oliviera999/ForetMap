import { describe, test, expect } from 'vitest';
import {
  ENV_NODE_ID,
  ENV_NODE_LABEL,
  DETRITIVORE_LEVEL,
  TROPHIC_LANE_DETRITIVORES,
  TROPHIC_LEVEL_MAX,
  buildGraphModel,
  computeChainLayout,
  computeCircleLayout,
  computeEnvAnchor,
  computeTrophicLayout,
  computeTrophicLevelLayout,
  computeTrophicLevels,
  focusSubset,
  formatTrophicLevel,
  normalizeFocusSeeds,
  trophicLevelBand,
  trophicLevelTitle,
  itemsForPreset,
  itemMatchesPreset,
  neighborIds,
  orderNodesForCircle,
  parallelEdgeOffset,
  parallelEdgeRanks,
  trophicColumn,
  trophicColumnLabels,
  trophicColumnXs,
  trophicRoleOrder,
  trophicRoleText,
  truncateNodeLabel,
} from '../../../src/components/pedago/foodWebGraphModel.js';

const ITEMS = [
  {
    id: 1,
    interaction_type: 'predation',
    from_id: 10,
    from_name: 'Renard',
    from_emoji: '🦊',
    from_role: 'consommateur',
    to_id: 20,
    to_name: 'Lapin',
    to_emoji: '🐰',
    to_role: 'consommateur',
    description: '',
  },
  {
    id: 2,
    interaction_type: 'herbivorie',
    from_id: 20,
    from_name: 'Lapin',
    from_emoji: '🐰',
    from_role: 'consommateur',
    to_id: 30,
    to_name: 'Trèfle',
    to_emoji: '🍀',
    to_role: 'producteur',
    description: '',
  },
  {
    id: 3,
    interaction_type: 'decomposition',
    from_id: 40,
    from_name: 'Champignon',
    from_emoji: '🍄',
    from_role: 'decomposeur',
    to_id: null,
    to_name: null,
    to_emoji: null,
    to_role: null,
    description: 'litière',
  },
];

describe('buildGraphModel', () => {
  test('dérive nœuds uniques + rôles', () => {
    const { nodes } = buildGraphModel(ITEMS);
    const speciesIds = nodes.filter((n) => !n.isEnv).map((n) => n.id);
    expect(speciesIds.sort((a, b) => a - b)).toEqual([10, 20, 30, 40]);
    expect(nodes.find((n) => n.id === 30).role).toBe('producteur');
  });

  test('matérialise un nœud « environnement » quand une interaction n’a pas de cible', () => {
    const { nodes } = buildGraphModel(ITEMS);
    const env = nodes.find((n) => n.id === ENV_NODE_ID);
    expect(env).toBeTruthy();
    expect(env.isEnv).toBe(true);
    expect(env.name).toBe(ENV_NODE_LABEL);
  });

  test('pas de nœud « environnement » si toutes les interactions ont une cible', () => {
    const { nodes } = buildGraphModel(ITEMS.slice(0, 2));
    expect(nodes.some((n) => n.id === ENV_NODE_ID)).toBe(false);
  });

  test('oriente les arêtes selon le sens écologique', () => {
    const { edges } = buildGraphModel(ITEMS);
    const pred = edges.find((e) => e.id === 1);
    // prédation : flèche inversée (proie → prédateur)
    expect(pred.tailId).toBe(20);
    expect(pred.headId).toBe(10);
    expect(pred.relation).toBe('est mangée par');

    const deco = edges.find((e) => e.id === 3);
    // cible nulle → ancre environnement
    expect(deco.tailId).toBe(ENV_NODE_ID);
    expect(deco.headId).toBe(40);
  });
});

describe('voisinage et focus', () => {
  test('neighborIds renvoie les voisins directs', () => {
    const { edges } = buildGraphModel(ITEMS);
    const ns = neighborIds(edges, 20);
    expect(ns.has(10)).toBe(true);
    expect(ns.has(30)).toBe(true);
    expect(ns.has(20)).toBe(false);
  });

  test('focusSubset isole le nœud + ses voisins', () => {
    const { edges } = buildGraphModel(ITEMS);
    const sub = focusSubset(edges, 20);
    expect([...sub.visibleNodes].sort((a, b) => a - b)).toEqual([10, 20, 30]);
    expect(sub.visibleEdges.has(1)).toBe(true);
    expect(sub.visibleEdges.has(2)).toBe(true);
    expect(sub.visibleEdges.has(3)).toBe(false);
  });
});

describe('dispositions', () => {
  test('cercle place tous les nœuds', () => {
    const { nodes } = buildGraphModel(ITEMS);
    const layout = computeCircleLayout(nodes, { width: 640, height: 440 });
    expect(layout.size).toBe(4);
    for (const pos of layout.values()) {
      expect(Number.isFinite(pos.x)).toBe(true);
      expect(Number.isFinite(pos.y)).toBe(true);
    }
  });

  test('niveaux trophiques : colonnes ordonnées', () => {
    // Chaîne de la matière : le détritivore (migration 295) fragmente avant que le
    // décomposeur ne minéralise.
    expect(trophicColumn('producteur')).toBe(0);
    expect(trophicColumn('consommateur')).toBe(1);
    expect(trophicColumn('detritivore')).toBe(2);
    expect(trophicColumn('decomposeur')).toBe(3);
    expect(trophicColumn(null)).toBe(4);
    const { nodes } = buildGraphModel(ITEMS);
    const layout = computeTrophicLayout(nodes, { width: 640, height: 440 });
    // producteur (Trèfle, 30) plus à gauche que décomposeur (Champignon, 40)
    expect(layout.get(30).x).toBeLessThan(layout.get(40).x);
  });
});

describe('truncateNodeLabel', () => {
  test('laisse intact un nom assez court', () => {
    expect(truncateNodeLabel('Trèfle')).toBe('Trèfle');
  });

  test('marque la coupe par une ellipse', () => {
    const label = truncateNodeLabel('Consoude officinale de Russie');
    expect(label.endsWith('…')).toBe(true);
    expect(label.length).toBeLessThanOrEqual(16);
  });

  test('tolère un nom absent', () => {
    expect(truncateNodeLabel(null)).toBe('');
  });
});

describe('dispositions — nœud environnement', () => {
  test('le nœud environnement est ancré à part, hors des dispositions', () => {
    const { nodes } = buildGraphModel(ITEMS);
    const circle = computeCircleLayout(nodes, { width: 880, height: 560 });
    const trophic = computeTrophicLayout(nodes, { width: 880, height: 560 });
    expect(circle.has(ENV_NODE_ID)).toBe(false);
    expect(trophic.has(ENV_NODE_ID)).toBe(false);
    // Les espèces, elles, restent toutes positionnées.
    for (const node of nodes.filter((n) => !n.isEnv)) {
      expect(circle.has(node.id)).toBe(true);
      expect(trophic.has(node.id)).toBe(true);
    }
  });

  test('le nœud environnement ne consomme pas de place sur le cercle', () => {
    const nodes = buildGraphModel(ITEMS).nodes;
    const species = nodes.filter((n) => !n.isEnv);
    expect(nodes.length).toBe(species.length + 1);
    const withEnv = computeCircleLayout(nodes, { width: 880, height: 560 });
    const withoutEnv = computeCircleLayout(species, { width: 880, height: 560 });
    expect(withEnv.size).toBe(species.length);
    for (const node of species) {
      expect(withEnv.get(node.id)).toEqual(withoutEnv.get(node.id));
    }
  });
});

describe('arêtes parallèles', () => {
  const PAIR = [
    {
      id: 1,
      interaction_type: 'pollinisation',
      from_id: 1,
      from_name: 'Abeille',
      to_id: 2,
      to_name: 'Pommier',
    },
    {
      id: 2,
      interaction_type: 'herbivorie',
      from_id: 1,
      from_name: 'Abeille',
      to_id: 2,
      to_name: 'Pommier',
    },
    {
      id: 3,
      interaction_type: 'symbiose',
      from_id: 3,
      from_name: 'Mycorhize',
      to_id: 4,
      to_name: 'Chêne',
    },
  ];

  test('range les arêtes qui relient la même paire', () => {
    const { edges } = buildGraphModel(PAIR);
    const ranks = parallelEdgeRanks(edges);
    expect(ranks.get(1).count).toBe(2);
    expect(ranks.get(2).count).toBe(2);
    expect(ranks.get(1).index).not.toBe(ranks.get(2).index);
    expect(ranks.get(3).count).toBe(1);
  });

  test('le rang ignore le sens de la relation', () => {
    const ranks = parallelEdgeRanks([
      { id: 1, tailId: 1, headId: 2 },
      { id: 2, tailId: 2, headId: 1 },
    ]);
    expect(ranks.get(1).count).toBe(2);
  });

  test('une arête seule reste droite, deux s’écartent symétriquement', () => {
    expect(parallelEdgeOffset({ index: 0, count: 1 })).toBe(0);
    const a = parallelEdgeOffset({ index: 0, count: 2 });
    const b = parallelEdgeOffset({ index: 1, count: 2 });
    expect(a).toBe(-b);
    expect(a).not.toBe(0);
  });
});

describe('focusSubset — profondeur', () => {
  // Chaîne : Trèfle ← Lapin ← Renard (orientation « est mangée par »).
  const CHAIN = buildGraphModel([
    {
      id: 1,
      interaction_type: 'predation',
      from_id: 10,
      from_name: 'Renard',
      to_id: 20,
      to_name: 'Lapin',
    },
    {
      id: 2,
      interaction_type: 'herbivorie',
      from_id: 20,
      from_name: 'Lapin',
      to_id: 30,
      to_name: 'Trèfle',
    },
  ]).edges;

  test('profondeur 1 : voisins directs seulement', () => {
    const subset = focusSubset(CHAIN, 30, 1);
    expect([...subset.visibleNodes].sort((a, b) => a - b)).toEqual([20, 30]);
    expect(subset.visibleEdges.size).toBe(1);
  });

  test('profondeur 2 : la chaîne complète', () => {
    const subset = focusSubset(CHAIN, 30, 2);
    expect([...subset.visibleNodes].sort((a, b) => a - b)).toEqual([10, 20, 30]);
    expect(subset.visibleEdges.size).toBe(2);
  });

  test('profondeur par défaut inchangée (1)', () => {
    expect(focusSubset(CHAIN, 30).visibleNodes.size).toBe(2);
  });
});

describe('orderNodesForCircle', () => {
  test('regroupe les rôles trophiques en arcs contigus', () => {
    const nodes = [
      { id: 1, name: 'Renard', role: 'consommateur' },
      { id: 2, name: 'Trèfle', role: 'producteur' },
      { id: 3, name: 'Champignon', role: 'decomposeur' },
      { id: 4, name: 'Ortie', role: 'producteur' },
    ];
    expect(orderNodesForCircle(nodes).map((n) => n.name)).toEqual([
      'Ortie',
      'Trèfle',
      'Renard',
      'Champignon',
    ]);
  });
});

describe('périmètre de zone', () => {
  test('marque l’espèce hors périmètre sans la retirer', () => {
    const { nodes } = buildGraphModel([
      {
        id: 1,
        interaction_type: 'predation',
        from_id: 10,
        from_name: 'Renard',
        to_id: 20,
        to_name: 'Lapin',
        from_in_scope: 0,
        to_in_scope: 1,
      },
    ]);
    expect(nodes.find((n) => n.id === 10).outOfScope).toBe(true);
    expect(nodes.find((n) => n.id === 20).outOfScope).toBe(false);
  });

  test('une espèce vue dans le périmètre y reste', () => {
    const { nodes } = buildGraphModel([
      {
        id: 1,
        interaction_type: 'predation',
        from_id: 10,
        to_id: 20,
        from_in_scope: 1,
        to_in_scope: 1,
      },
      {
        id: 2,
        interaction_type: 'herbivorie',
        from_id: 10,
        to_id: 30,
        from_in_scope: 0,
        to_in_scope: 1,
      },
    ]);
    expect(nodes.find((n) => n.id === 10).outOfScope).toBe(false);
  });

  test('sans colonne de périmètre, rien n’est marqué', () => {
    const { nodes } = buildGraphModel([
      { id: 1, interaction_type: 'predation', from_id: 10, to_id: 20 },
    ]);
    expect(nodes.every((n) => !n.outOfScope)).toBe(true);
  });
});

describe('itemsForPreset', () => {
  const mix = [
    { id: 1, interaction_type: 'predation', from_id: 1, to_id: 2 },
    { id: 2, interaction_type: 'nitrification', from_id: 3, to_id: null },
    { id: 3, interaction_type: 'pollinisation', from_id: 4, to_id: 5 },
  ];

  test('alimentaire ne garde que les flux trophiques', () => {
    const kept = itemsForPreset(mix, 'alimentaire');
    expect(kept.map((i) => i.id)).toEqual([1]);
    expect(itemMatchesPreset(mix[1], 'alimentaire')).toBe(false);
  });

  test('relations garde les interactions non trophiques', () => {
    expect(itemsForPreset(mix, 'relations').map((i) => i.id)).toEqual([2, 3]);
  });

  test('tout conserve la liste', () => {
    expect(itemsForPreset(mix, 'all')).toHaveLength(3);
  });
});

/* ------------------------------------------------------------------ *
 * Lots F1–F5 : sélection multiple, niveaux calculés, dispositions      *
 * ------------------------------------------------------------------ */

/** Trèfle → Lapin → Renard, plus un champignon décomposeur sans cible. */
const WEB = buildGraphModel([
  {
    id: 1,
    interaction_type: 'herbivorie',
    from_id: 20,
    from_name: 'Lapin',
    from_role: 'consommateur',
    to_id: 30,
    to_name: 'Trèfle',
    to_role: 'producteur',
  },
  {
    id: 2,
    interaction_type: 'predation',
    from_id: 10,
    from_name: 'Renard',
    from_role: 'consommateur',
    to_id: 20,
    to_name: 'Lapin',
    to_role: 'consommateur',
  },
  {
    id: 3,
    interaction_type: 'decomposition',
    from_id: 40,
    from_name: 'Champignon',
    from_role: 'decomposeur',
    to_id: null,
    to_name: null,
  },
]);

describe('focusSubset — graines multiples', () => {
  test('normalizeFocusSeeds accepte un identifiant, un tableau ou un Set', () => {
    expect([...normalizeFocusSeeds(12)]).toEqual([12]);
    expect([...normalizeFocusSeeds([12, 13])]).toEqual([12, 13]);
    expect([...normalizeFocusSeeds(new Set([12]))]).toEqual([12]);
    expect([...normalizeFocusSeeds(null)]).toEqual([]);
    expect([...normalizeFocusSeeds([12, null, 13])]).toEqual([12, 13]);
  });

  test('profondeur 0 : les espèces choisies et leurs relations mutuelles, rien d’autre', () => {
    const subset = focusSubset(WEB.edges, [20, 30], 0);
    expect([...subset.visibleNodes].sort((a, b) => a - b)).toEqual([20, 30]);
    // L'herbivorie relie les deux : elle est gardée. La prédation (Renard) non.
    expect([...subset.visibleEdges]).toEqual([1]);
  });

  test('deux graines réunissent leurs voisinages', () => {
    const subset = focusSubset(WEB.edges, [30, 40], 1);
    expect([...subset.visibleNodes].sort()).toEqual([20, 30, 40, ENV_NODE_ID].sort());
  });

  test('une graine seule garde exactement l’ancien comportement', () => {
    expect([...focusSubset(WEB.edges, 20, 1).visibleNodes].sort((a, b) => a - b)).toEqual([
      10, 20, 30,
    ]);
  });
});

describe('niveaux trophiques calculés', () => {
  test('producteur 1, herbivore 2, prédateur 3', () => {
    const levels = computeTrophicLevels(WEB.nodes, WEB.edges);
    expect(levels.get(30)).toBe(1);
    expect(levels.get(20)).toBe(2);
    expect(levels.get(10)).toBe(3);
  });

  test('un décomposeur n’a pas de niveau : il n’est pas un étage de plus', () => {
    const levels = computeTrophicLevels(WEB.nodes, WEB.edges);
    expect(levels.has(40)).toBe(false);
  });

  test('le nœud environnement reste hors de l’échelle', () => {
    const levels = computeTrophicLevels(WEB.nodes, WEB.edges);
    expect(levels.has(ENV_NODE_ID)).toBe(false);
  });

  test('un omnivore prend une valeur fractionnaire', () => {
    // Le merle mange un ver (niveau 2, qui mange la litière) et des baies (niveau 1).
    const web = buildGraphModel([
      {
        id: 1,
        interaction_type: 'decomposition',
        from_id: 2,
        from_name: 'Ver',
        from_role: 'consommateur',
        to_id: 1,
        to_name: 'Litière',
        to_role: null,
      },
      {
        id: 2,
        interaction_type: 'predation',
        from_id: 3,
        from_name: 'Merle',
        from_role: 'consommateur',
        to_id: 2,
        to_name: 'Ver',
        to_role: 'consommateur',
      },
      {
        id: 3,
        interaction_type: 'frugivorie',
        from_id: 3,
        from_name: 'Merle',
        from_role: 'consommateur',
        to_id: 4,
        to_name: 'Sureau',
        to_role: 'producteur',
      },
    ]);
    const levels = computeTrophicLevels(web.nodes, web.edges);
    expect(levels.get(1)).toBe(1);
    expect(levels.get(2)).toBe(2);
    // 1 + (2 + 1) / 2 = 2,5
    expect(levels.get(3)).toBeCloseTo(2.5, 5);
    expect(formatTrophicLevel(levels.get(3))).toBe('2,5');
    expect(trophicLevelTitle(levels.get(3))).toMatch(/régime mixte/);
  });

  test('sans la moindre relation trophique, personne n’a de niveau', () => {
    const web = buildGraphModel([
      {
        id: 1,
        interaction_type: 'pollinisation',
        from_id: 1,
        from_name: 'Abeille',
        from_role: 'consommateur',
        to_id: 2,
        to_name: 'Pommier',
        to_role: 'producteur',
      },
    ]);
    expect(computeTrophicLevels(web.nodes, web.edges).size).toBe(0);
  });

  test('un cycle ne fait pas diverger le calcul', () => {
    const web = buildGraphModel([
      {
        id: 1,
        interaction_type: 'predation',
        from_id: 1,
        from_name: 'A',
        from_role: 'consommateur',
        to_id: 2,
        to_name: 'B',
        to_role: 'consommateur',
      },
      {
        id: 2,
        interaction_type: 'predation',
        from_id: 2,
        from_name: 'B',
        from_role: 'consommateur',
        to_id: 1,
        to_name: 'A',
        to_role: 'consommateur',
      },
    ]);
    const levels = computeTrophicLevels(web.nodes, web.edges);
    for (const value of levels.values()) {
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeLessThanOrEqual(TROPHIC_LEVEL_MAX);
    }
  });

  test('la bande d’affichage arrondit et plafonne', () => {
    expect(trophicLevelBand(1)).toBe(1);
    expect(trophicLevelBand(2.4)).toBe(2);
    expect(trophicLevelBand(2.6)).toBe(3);
    expect(trophicLevelBand(9)).toBe(TROPHIC_LEVEL_MAX);
    expect(trophicLevelBand(undefined)).toBe(null);
  });

  test('le titre situe le niveau « dans ce réseau »', () => {
    expect(trophicLevelTitle(2)).toMatch(/niveau 2 dans ce réseau/);
    expect(trophicLevelTitle(2)).toMatch(/consommateur primaire/);
    expect(trophicLevelTitle(null)).toMatch(/non déterminé/);
  });
});

describe('disposition par bandes de niveau', () => {
  const levels = computeTrophicLevels(WEB.nodes, WEB.edges);

  test('les producteurs sont en bas, les prédateurs au-dessus', () => {
    const layout = computeTrophicLevelLayout(WEB.nodes, levels, { width: 880, height: 560 });
    expect(layout.positions.get(30).y).toBeGreaterThan(layout.positions.get(20).y);
    expect(layout.positions.get(20).y).toBeGreaterThan(layout.positions.get(10).y);
  });

  test('chaque bande présente porte son nom', () => {
    const layout = computeTrophicLevelLayout(WEB.nodes, levels, { width: 880, height: 560 });
    expect(layout.bands.map((b) => b.label)).toEqual([
      'Producteurs',
      'Consommateurs primaires',
      'Consommateurs secondaires',
    ]);
  });

  test('les décomposeurs vont dans une voie à part, hors des bandes', () => {
    const layout = computeTrophicLevelLayout(WEB.nodes, levels, { width: 880, height: 560 });
    expect(layout.lanes.map((l) => l.label)).toContain('Décomposeurs');
    expect(layout.laneLeft).toBeGreaterThan(0);
    expect(layout.positions.get(40).x).toBeGreaterThan(layout.laneLeft);
  });

  test('un niveau trop fourni se répartit sur plusieurs rangées', () => {
    // 40 producteurs : une colonne unique donnerait un pas de 11 px.
    const many = Array.from({ length: 40 }, (_, i) => ({
      id: 100 + i,
      name: `Plante ${i}`,
      role: 'producteur',
    }));
    const manyLevels = new Map(many.map((n) => [n.id, 1]));
    const layout = computeTrophicLevelLayout(many, manyLevels, { width: 880, height: 560 });
    const ys = new Set([...layout.positions.values()].map((p) => Math.round(p.y)));
    expect(ys.size).toBeGreaterThan(1);
    // Deux nœuds voisins ne se recouvrent pas.
    const sorted = [...layout.positions.values()].sort((a, b) => a.y - b.y || a.x - b.x);
    for (let i = 1; i < sorted.length; i += 1) {
      const dx = Math.abs(sorted[i].x - sorted[i - 1].x);
      const dy = Math.abs(sorted[i].y - sorted[i - 1].y);
      expect(dx > 40 || dy > 40).toBe(true);
    }
  });

  test('la scène grandit en hauteur quand les rangées s’accumulent', () => {
    // 78 producteurs : l'ordre de grandeur du corpus versionné.
    const many = Array.from({ length: 78 }, (_, i) => ({
      id: 200 + i,
      name: `Plante ${i}`,
      role: 'producteur',
    }));
    const manyLevels = new Map(many.map((n) => [n.id, 1]));
    const layout = computeTrophicLevelLayout(many, manyLevels, { width: 880, height: 560 });
    expect(layout.height).toBeGreaterThan(560);
  });
});

describe('disposition « fiche » d’une espèce', () => {
  test('ressources à gauche, consommateurs à droite', () => {
    const chain = computeChainLayout(WEB.nodes, WEB.edges, 20, { width: 880, height: 560 });
    expect(chain.positions.get(30).x).toBeLessThan(chain.positions.get(20).x);
    expect(chain.positions.get(10).x).toBeGreaterThan(chain.positions.get(20).x);
    expect(chain.columns.map((c) => c.key)).toEqual(['resources', 'focus', 'consumers']);
  });

  test('sans espèce isolée, rien n’est placé', () => {
    expect(computeChainLayout(WEB.nodes, WEB.edges, null).positions.size).toBe(0);
  });
});

describe('ancrage du nœud environnement', () => {
  test('sur le cercle, il passe au centre (il recouvrait le premier nœud)', () => {
    const anchor = computeEnvAnchor('circle', { width: 880, height: 560 });
    expect(anchor).toEqual({ x: 440, y: 280 });
    const circle = computeCircleLayout(WEB.nodes, { width: 880, height: 560 });
    for (const pos of circle.values()) {
      expect(Math.hypot(pos.x - anchor.x, pos.y - anchor.y)).toBeGreaterThan(40);
    }
  });

  test('sur les colonnes de rôles, il reste en haut (aucune collision)', () => {
    expect(computeEnvAnchor('roles', { width: 880, height: 560 })).toEqual({ x: 440, y: 28 });
  });
});

/* ------------------------------------------------------------------ *
 * Détritivores (migration 295)                                         *
 * ------------------------------------------------------------------ */

/** Étourneau → Lombric, avec ou sans la litière que mange le lombric. */
function starlingWeb({ wormRole = 'detritivore', withLitter = false } = {}) {
  const rows = [
    {
      id: 1,
      interaction_type: 'predation',
      from_id: 1,
      from_name: 'Étourneau unicolore',
      from_role: 'consommateur',
      to_id: 2,
      to_name: 'Lombric commun',
      to_role: wormRole,
    },
  ];
  if (withLitter) {
    rows.push({
      id: 2,
      interaction_type: 'detritivorie',
      from_id: 2,
      from_name: 'Lombric commun',
      from_role: wormRole,
      to_id: 3,
      to_name: 'Litière de feuilles',
      to_role: null,
    });
  }
  return buildGraphModel(rows);
}

describe('détritivores — niveaux', () => {
  test('le prédateur d’un détritivore est consommateur secondaire (niveau 3)', () => {
    // Nourriture du lombric absente du réseau affiché (isolement, niveau Collège…).
    const web = starlingWeb();
    const levels = computeTrophicLevels(web.nodes, web.edges);
    expect(levels.get(2)).toBe(DETRITIVORE_LEVEL);
    expect(levels.get(1)).toBe(3);
    expect(trophicLevelTitle(levels.get(1))).toMatch(/consommateur secondaire/);
  });

  test('avec sa nourriture affichée, le détritivore reste au niveau 2', () => {
    const web = starlingWeb({ withLitter: true });
    const levels = computeTrophicLevels(web.nodes, web.edges);
    expect(levels.get(3)).toBe(1);
    expect(levels.get(2)).toBe(2);
    expect(levels.get(1)).toBe(3);
  });

  test('un détritivore qui chasse aussi prend une valeur mixte', () => {
    // Litière (1) et puceron herbivore (2) : 1 + (1 + 2) / 2 = 2,5.
    const web = buildGraphModel([
      {
        id: 1,
        interaction_type: 'detritivorie',
        from_id: 1,
        from_name: 'Fourmi',
        from_role: 'detritivore',
        to_id: 2,
        to_name: 'Litière',
        to_role: null,
      },
      {
        id: 2,
        interaction_type: 'predation',
        from_id: 1,
        from_name: 'Fourmi',
        from_role: 'detritivore',
        to_id: 3,
        to_name: 'Puceron',
        to_role: 'consommateur',
      },
      {
        id: 3,
        interaction_type: 'herbivorie',
        from_id: 3,
        from_name: 'Puceron',
        from_role: 'consommateur',
        to_id: 4,
        to_name: 'Rosier',
        to_role: 'producteur',
      },
    ]);
    const levels = computeTrophicLevels(web.nodes, web.edges);
    expect(levels.get(1)).toBeCloseTo(2.5, 5);
  });

  test('décomposeur strict : comportement inchangé (pas de niveau, prédateur au 2)', () => {
    // Même réseau, lombric resté « décomposeur » : l'état d'avant la migration 295.
    const web = starlingWeb({ wormRole: 'decomposeur' });
    const levels = computeTrophicLevels(web.nodes, web.edges);
    expect(levels.has(2)).toBe(false);
    expect(levels.get(1)).toBe(2);
  });

  test('un champignon décomposeur n’a toujours pas de niveau', () => {
    const levels = computeTrophicLevels(WEB.nodes, WEB.edges);
    expect(levels.has(40)).toBe(false);
    expect(levels.get(10)).toBe(3);
  });
});

describe('détritivores — dispositions', () => {
  test('bandes : le détritivore va dans sa voie, à côté des décomposeurs', () => {
    const web = buildGraphModel([
      {
        id: 1,
        interaction_type: 'predation',
        from_id: 1,
        from_name: 'Étourneau unicolore',
        from_role: 'consommateur',
        to_id: 2,
        to_name: 'Lombric commun',
        to_role: 'detritivore',
      },
      {
        id: 2,
        interaction_type: 'mycophagie',
        from_id: 5,
        from_name: 'Collembole',
        from_role: 'detritivore',
        to_id: 6,
        to_name: 'Champignons de litière',
        to_role: 'decomposeur',
      },
    ]);
    const levels = computeTrophicLevels(web.nodes, web.edges);
    const layout = computeTrophicLevelLayout(web.nodes, levels, { width: 880 });
    // Étiquette distincte, placée avant celle des décomposeurs.
    expect(layout.lanes.map((lane) => lane.key)).toEqual([
      TROPHIC_LANE_DETRITIVORES,
      'decomposeurs',
    ]);
    expect(layout.lanes.map((lane) => lane.label)).toEqual(['Détritivores', 'Décomposeurs']);
    expect(layout.lanes[0].count).toBe(2);
    // Hors des bandes : la pyramide ne porte que l'étourneau, au niveau 3.
    expect(layout.bands.map((band) => band.label)).toEqual(['Consommateurs secondaires']);
    expect(layout.positions.get(2).x).toBeGreaterThan(layout.laneLeft);
    expect(layout.positions.get(5).x).toBeGreaterThan(layout.laneLeft);
    expect(layout.positions.get(1).x).toBeLessThan(layout.laneLeft);
  });

  test('colonnes de rôles : « Détritivores » seulement si le réseau en compte', () => {
    // Sans détritivore (et donc pour G&L) : les quatre colonnes d'avant la migration 295.
    const without = trophicRoleOrder(WEB.nodes);
    expect(without).toEqual(['producteur', 'consommateur', 'decomposeur']);
    expect(trophicColumnLabels(without)).toEqual([
      'Producteurs',
      'Consommateurs',
      'Décomposeurs',
      'Autres',
    ]);
    expect(trophicColumnXs({ width: 880, order: without })).toHaveLength(4);

    const nodes = [...starlingWeb().nodes, { id: 40, name: 'Champignon', role: 'decomposeur' }];
    const order = trophicRoleOrder(nodes);
    expect(trophicColumnLabels(order)).toEqual([
      'Producteurs',
      'Consommateurs',
      'Détritivores',
      'Décomposeurs',
      'Autres',
    ]);
    const layout = computeTrophicLayout(nodes, { width: 880, height: 560 });
    // Consommateur, puis détritivore, puis décomposeur, de gauche à droite.
    expect(layout.get(1).x).toBeLessThan(layout.get(2).x);
    expect(layout.get(2).x).toBeLessThan(layout.get(40).x);
  });

  test('cercle : l’arc des détritivores précède celui des décomposeurs', () => {
    const nodes = [
      { id: 1, name: 'Champignon', role: 'decomposeur' },
      { id: 2, name: 'Lombric', role: 'detritivore' },
      { id: 3, name: 'Renard', role: 'consommateur' },
      { id: 4, name: 'Trèfle', role: 'producteur' },
    ];
    expect(orderNodesForCircle(nodes).map((n) => n.name)).toEqual([
      'Trèfle',
      'Renard',
      'Lombric',
      'Champignon',
    ]);
  });

  test('libellé de rôle pour les phrases, accentué', () => {
    expect(trophicRoleText('detritivore')).toBe('détritivore');
    expect(trophicRoleText('decomposeur')).toBe('décomposeur');
    expect(trophicRoleText('consommateur')).toBe('consommateur');
    expect(trophicRoleText('inconnu')).toBe('inconnu');
  });
});
