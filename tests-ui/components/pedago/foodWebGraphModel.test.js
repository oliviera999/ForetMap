import { describe, test, expect } from 'vitest';
import {
  ENV_NODE_ID,
  ENV_NODE_LABEL,
  buildGraphModel,
  computeCircleLayout,
  computeTrophicLayout,
  focusSubset,
  neighborIds,
  orderNodesForCircle,
  parallelEdgeOffset,
  parallelEdgeRanks,
  trophicColumn,
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
    expect(trophicColumn('producteur')).toBe(0);
    expect(trophicColumn('consommateur')).toBe(1);
    expect(trophicColumn('decomposeur')).toBe(2);
    expect(trophicColumn(null)).toBe(3);
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
