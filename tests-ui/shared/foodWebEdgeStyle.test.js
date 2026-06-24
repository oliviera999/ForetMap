import { describe, test, expect } from 'vitest';
import {
  INTERACTION_EDGE_STYLES,
  LEGEND_ENTRIES,
  TROPHIC_EDGE_TYPES,
  buildEdgeExportCss,
  edgeStyleClass,
  edgeStyleForType,
  isTrophicEdgeType,
  resolveEdgeRenderStyle,
} from '../../src/shared/foodWebEdgeStyle.js';
import { INTERACTION_TYPES } from '../../src/shared/foodWebTypes.js';

describe('foodWebEdgeStyle', () => {
  test('chaque type d’interaction a un style distinct', () => {
    expect(Object.keys(INTERACTION_EDGE_STYLES).sort()).toEqual([...INTERACTION_TYPES].sort());
    const colors = new Set(Object.values(INTERACTION_EDGE_STYLES).map((s) => s.color));
    expect(colors.size).toBe(INTERACTION_TYPES.length);
  });

  test('edgeStyleForType et edgeStyleClass', () => {
    const style = edgeStyleForType('predation');
    expect(style.color).toBe('#b91c1c');
    expect(edgeStyleClass('predation')).toBe('pedago-foodweb-graph__line--predation');
    expect(edgeStyleForType('inconnu').color).toBe('#94a3b8');
  });

  test('resolveEdgeRenderStyle active conserve le figuré', () => {
    const base = resolveEdgeRenderStyle('decomposition');
    expect(base.dash).toBe('8 4');
    const active = resolveEdgeRenderStyle('decomposition', { active: true });
    expect(active.color).toBe('#16a34a');
    expect(active.dash).toBe('8 4');
  });

  test('LEGEND_ENTRIES couvre tous les types', () => {
    expect(LEGEND_ENTRIES.map((e) => e.type).sort()).toEqual([...INTERACTION_TYPES].sort());
  });

  test('buildEdgeExportCss inclut les couleurs par type', () => {
    const css = buildEdgeExportCss();
    expect(css).toContain('.pedago-foodweb-graph__line--symbiose');
    expect(css).toContain('#0f766e');
  });

  test('isTrophicEdgeType identifie les flux trophiques', () => {
    expect(TROPHIC_EDGE_TYPES).toEqual(['herbivorie', 'predation', 'decomposition']);
    expect(isTrophicEdgeType('predation')).toBe(true);
    expect(isTrophicEdgeType('pollinisation')).toBe(false);
  });
});
