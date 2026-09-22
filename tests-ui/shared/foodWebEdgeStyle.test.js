import { describe, test, expect } from 'vitest';
import {
  EVIDENCE_HYPOTHESIS_DASH,
  EVIDENCE_SITE_WIDTH_BOOST,
  INTERACTION_EDGE_STYLES,
  LEGEND_ENTRIES,
  TROPHIC_EDGE_TYPES,
  buildEdgeExportCss,
  colorDistanceRgb,
  edgeEvidenceClass,
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

/**
 * Familles de teintes : plusieurs types partagent délibérément une couleur.
 *
 * Jusqu'à la migration 255, les 8 types avaient 8 teintes distinctes. Les 14 types
 * actuels ne peuvent plus : la table Okabe–Ito, choisie pour rester lisible en vision
 * deutan/protan et en vidéoprojection, ne compte que 8 teintes sûres. En inventer six de
 * plus reviendrait à rapprocher les couleurs jusqu'à ce qu'elles cessent d'être
 * distinguables — exactement ce que la règle des 0,18 protège.
 *
 * Le parti pris est donc : la teinte porte la FAMILLE (flux trophique animal, cycle de
 * l'azote…), le motif de tirets porte le TYPE à l'intérieur de la famille. Les tests
 * ci-dessous vérifient les deux moitiés de cette règle — les teintes réellement utilisées
 * restent écartées, et deux types d'une même famille ne partagent jamais leur trait.
 */

describe('foodWebEdgeStyle', () => {
  test('chaque type d’interaction a un style, et deux types n’ont jamais le même', () => {
    expect(Object.keys(INTERACTION_EDGE_STYLES).sort()).toEqual([...INTERACTION_TYPES].sort());
    // La signature complète — teinte + tirets + épaisseur — doit rester unique : c'est
    // elle que l'œil distingue, pas la teinte seule.
    const signatures = new Set(
      Object.values(INTERACTION_EDGE_STYLES).map((s) => `${s.color}|${s.dash}|${s.width}`),
    );
    expect(signatures.size).toBe(INTERACTION_TYPES.length);
  });

  test('deux types de la même famille de teinte ne partagent jamais leur trait', () => {
    const byColor = new Map();
    for (const [type, style] of Object.entries(INTERACTION_EDGE_STYLES)) {
      if (!byColor.has(style.color)) byColor.set(style.color, []);
      byColor.get(style.color).push([type, style]);
    }
    for (const [color, members] of byColor) {
      for (let i = 0; i < members.length; i += 1) {
        for (let j = i + 1; j < members.length; j += 1) {
          const [ta, sa] = members[i];
          const [tb, sb] = members[j];
          expect(
            sa.dash === sb.dash && sa.width === sb.width,
            `${ta}/${tb} partagent la teinte ${color} : il leur faut un trait différent`,
          ).toBe(false);
        }
      }
    }
  });

  test('les teintes réellement utilisées restent suffisamment écartées (distance RGB)', () => {
    // Porte sur l'ensemble des teintes distinctes, pas sur les paires de types : deux
    // types d'une même famille partagent leur teinte par construction (distance 0).
    const palette = [...new Set(Object.values(INTERACTION_EDGE_STYLES).map((s) => s.color))];
    for (let i = 0; i < palette.length; i += 1) {
      for (let j = i + 1; j < palette.length; j += 1) {
        const dist = colorDistanceRgb(palette[i], palette[j]);
        expect(dist, `${palette[i]} vs ${palette[j]}`).toBeGreaterThan(0.18);
      }
    }
  });

  test('la palette reste bornée à la table Okabe–Ito (8 teintes sûres)', () => {
    const palette = new Set(Object.values(INTERACTION_EDGE_STYLES).map((s) => s.color));
    expect(palette.size).toBeLessThanOrEqual(8);
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
    expect(TROPHIC_EDGE_TYPES).toEqual([
      'herbivorie',
      'predation',
      'decomposition',
      'detritivorie',
      'frugivorie',
      'granivorie',
      'parasitisme',
      // Migration 272 : brouter un mycélium vivant est une consommation, pas de la
      // fragmentation de matière morte.
      'mycophagie',
    ]);
    expect(isTrophicEdgeType('predation')).toBe(true);
    expect(isTrophicEdgeType('detritivorie')).toBe(true);
    expect(isTrophicEdgeType('mycophagie')).toBe(true);
    expect(isTrophicEdgeType('pollinisation')).toBe(false);
    expect(isTrophicEdgeType('mutualisme')).toBe(false);
    // Excrétion et assimilation transportent de la matière, mais dans l'autre sens : ce
    // sont des apports minéraux, pas des flux trophiques (cf. `matterFlow`).
    expect(isTrophicEdgeType('excretion')).toBe(false);
    expect(isTrophicEdgeType('assimilation')).toBe(false);
  });

  test('les types de la migration 272 rejoignent la famille de teinte dont ils relèvent', () => {
    expect(INTERACTION_EDGE_STYLES.mutualisme.color).toBe(INTERACTION_EDGE_STYLES.symbiose.color);
    expect(INTERACTION_EDGE_STYLES.commensalisme.color).toBe(
      INTERACTION_EDGE_STYLES.symbiose.color,
    );
    expect(INTERACTION_EDGE_STYLES.facilitation.color).toBe(
      INTERACTION_EDGE_STYLES.plante_hote.color,
    );
    expect(INTERACTION_EDGE_STYLES.allelopathie.color).toBe(
      INTERACTION_EDGE_STYLES.competition.color,
    );
    expect(INTERACTION_EDGE_STYLES.mycophagie.color).toBe(
      INTERACTION_EDGE_STYLES.decomposition.color,
    );
  });

  test('le mutualisme apparaît symétrique dans la légende', () => {
    // La liste en dur des types symétriques avait oublié le mutualisme : la légende le lit
    // désormais dans les métadonnées d'orientation.
    const bySymmetry = Object.fromEntries(LEGEND_ENTRIES.map((e) => [e.type, e.symmetric]));
    expect(bySymmetry.mutualisme).toBe(true);
    expect(bySymmetry.symbiose).toBe(true);
    expect(bySymmetry.competition).toBe(true);
    expect(bySymmetry.commensalisme).toBe(false);
  });
});

/**
 * Niveau de preuve : second registre graphique, indépendant du type.
 *
 * Un lien recopié d'une flore et un lien constaté dans la cour se lisaient à l'identique.
 * La teinte continue de dire le TYPE ; c'est la continuité du trait qui dit la preuve.
 */
describe('niveau de preuve', () => {
  test('une hypothèse passe en tirets courts, quel que soit le figuré du type', () => {
    const base = resolveEdgeRenderStyle('predation');
    expect(base.dash).toBe(null);
    const hypothese = resolveEdgeRenderStyle('predation', { evidenceLevel: 'hypothese' });
    expect(hypothese.dash).toBe(EVIDENCE_HYPOTHESIS_DASH);
    expect(hypothese.color).toBe(base.color);
    expect(hypothese.opacity).toBeLessThan(1);
  });

  test('une observation faite sur le site renforce le trait', () => {
    const base = resolveEdgeRenderStyle('herbivorie');
    const onSite = resolveEdgeRenderStyle('herbivorie', { evidenceLevel: 'observe_site' });
    expect(onSite.width).toBe(base.width + EVIDENCE_SITE_WIDTH_BOOST);
    expect(onSite.dash).toBe(base.dash);
    expect(onSite.opacity).toBe(1);
  });

  test('un lien documenté (ou sans niveau) garde le style du type', () => {
    const base = resolveEdgeRenderStyle('symbiose');
    for (const level of [null, undefined, '', 'bibliographie']) {
      const style = resolveEdgeRenderStyle('symbiose', { evidenceLevel: level });
      expect(style.dash).toBe(base.dash);
      expect(style.width).toBe(base.width);
      expect(style.opacity).toBe(1);
    }
  });

  test('preuve et sélection se cumulent', () => {
    const style = resolveEdgeRenderStyle('predation', {
      active: true,
      evidenceLevel: 'observe_site',
    });
    expect(style.halo).toBe(true);
    expect(style.width).toBeGreaterThan(
      resolveEdgeRenderStyle('predation', { evidenceLevel: 'observe_site' }).width,
    );
  });

  test('edgeEvidenceClass ne marque que ce qui sort de l’ordinaire', () => {
    expect(edgeEvidenceClass('hypothese')).toBe('pedago-foodweb-graph__line--hypothese');
    expect(edgeEvidenceClass('observe_site')).toBe('pedago-foodweb-graph__line--observe-site');
    expect(edgeEvidenceClass('bibliographie')).toBe('');
    expect(edgeEvidenceClass(null)).toBe('');
  });

  test('le CSS d’export porte les deux règles de preuve', () => {
    const css = buildEdgeExportCss();
    expect(css).toContain('.pedago-foodweb-graph__line--hypothese');
    expect(css).toContain('.pedago-foodweb-graph__line--observe-site');
  });
});
