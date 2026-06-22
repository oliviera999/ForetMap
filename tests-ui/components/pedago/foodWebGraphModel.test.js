import { describe, test, expect } from 'vitest';
import {
  ENV_NODE_ID,
  buildGraphModel,
  computeCircleLayout,
  computeTrophicLayout,
  focusSubset,
  neighborIds,
  trophicColumn,
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
    expect(nodes.map((n) => n.id).sort((a, b) => a - b)).toEqual([10, 20, 30, 40]);
    expect(nodes.find((n) => n.id === 30).role).toBe('producteur');
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
