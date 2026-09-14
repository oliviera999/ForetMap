import { describe, test, expect } from 'vitest';
import {
  INTERACTION_EDGE_STYLES,
  LEGEND_ENTRIES,
  TROPHIC_EDGE_TYPES,
  buildEdgeExportCss,
  colorDistanceRgb,
  edgeStyleClass,
  edgeStyleForType,
  isTrophicEdgeType,
  resolveEdgeRenderStyle,
} from '../../src/shared/foodWebEdgeStyle.js';
import { INTERACTION_TYPES } from '../../src/shared/foodWebTypes.js';

/** Paires qui doivent rester distinguables sans s'appuyer sur la seule teinte. */
const DUAL_CHANNEL_PAIRS = [
  ['herbivorie', 'predation'],
  ['plante_hote', 'symbiose'],
  ['herbivorie', 'decomposition'],
];

describe('foodWebEdgeStyle', () => {
  test('chaque type d’interaction a un style distinct', () => {
    expect(Object.keys(INTERACTION_EDGE_STYLES).sort()).toEqual([...INTERACTION_TYPES].sort());
    const colors = new Set(Object.values(INTERACTION_EDGE_STYLES).map((s) => s.color));
    expect(colors.size).toBe(INTERACTION_TYPES.length);
  });

  test('les couleurs sont suffisamment écartées (distance RGB)', () => {
    const entries = Object.entries(INTERACTION_EDGE_STYLES);
    for (let i = 0; i < entries.length; i += 1) {
      for (let j = i + 1; j < entries.length; j += 1) {
        const dist = colorDistanceRgb(entries[i][1].color, entries[j][1].color);
        expect(dist, `${entries[i][0]} vs ${entries[j][0]}`).toBeGreaterThan(0.18);
      }
    }
  });

  test('paires critiques : second canal (dash ou width) en plus de la couleur', () => {
    for (const [a, b] of DUAL_CHANNEL_PAIRS) {
      const sa = INTERACTION_EDGE_STYLES[a];
      const sb = INTERACTION_EDGE_STYLES[b];
      const sameDash = sa.dash === sb.dash;
      const sameWidth = sa.width === sb.width;
      expect(sameDash && sameWidth, `${a}/${b} ne doivent pas partager dash+width`).toBe(false);
    }
  });

  test('edgeStyleForType et edgeStyleClass', () => {
    const style = edgeStyleForType('predation');
    expect(style.color).toBe('#d55e00');
    expect(edgeStyleClass('predation')).toBe('pedago-foodweb-graph__line--predation');
    expect(edgeStyleForType('inconnu').color).toBe('#94a3b8');
  });

  test('resolveEdgeRenderStyle active conserve la teinte et active le halo', () => {
    const base = resolveEdgeRenderStyle('decomposition');
    expect(base.dash).toBe('8 4');
    expect(base.halo).toBe(false);
    const active = resolveEdgeRenderStyle('decomposition', { active: true });
    expect(active.color).toBe(base.color);
    expect(active.dash).toBe('8 4');
    expect(active.halo).toBe(true);
    expect(active.haloColor).toBe('#16a34a');
    expect(active.width).toBeGreaterThan(base.width);
  });

  test('LEGEND_ENTRIES couvre tous les types', () => {
    expect(LEGEND_ENTRIES.map((e) => e.type).sort()).toEqual([...INTERACTION_TYPES].sort());
  });

  test('buildEdgeExportCss inclut les couleurs par type et le halo', () => {
    const css = buildEdgeExportCss();
    expect(css).toContain('.pedago-foodweb-graph__line--symbiose');
    expect(css).toContain('#56b4e9');
    expect(css).toContain('.pedago-foodweb-graph__line-halo');
    expect(css).not.toContain('.pedago-foodweb-graph__line.active{stroke:#16a34a');
  });

  test('isTrophicEdgeType identifie les flux trophiques', () => {
    expect(TROPHIC_EDGE_TYPES).toEqual(['herbivorie', 'predation', 'decomposition']);
    expect(isTrophicEdgeType('predation')).toBe(true);
    expect(isTrophicEdgeType('pollinisation')).toBe(false);
  });
});
