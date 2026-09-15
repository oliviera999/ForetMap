/**
 * Styles visuels des arêtes du réseau trophique (couleur, pointillés).
 *
 * Parité d'intention avec `INTERACTION_TYPE_META` dans `foodWebTypes.js` :
 * chaque type d'interaction a une signature graphique distincte pour la légende
 * et le rendu SVG du graphe.
 *
 * Palette (sept. 2026) : familles sémantiques écartées pour la vidéoprojection
 * et la vision deutan/protan — jamais deux types distingués par la seule teinte
 * (second canal : tirets / épaisseur). Inspiration des tables Okabe–Ito / Wong
 * adaptées au thème forêt.
 */

import { INTERACTION_TYPES, interactionTypeLabel } from './foodWebTypes.js';

/** @typedef {{ color: string, dash: string|null, width: number }} FoodWebEdgeStyle */

/** @type {Record<string, FoodWebEdgeStyle>} */
export const INTERACTION_EDGE_STYLES = Object.freeze({
  // Flux trophiques : chauds écartés (ambre / rouge / brun-violet).
  herbivorie: { color: '#e69f00', dash: '12 5', width: 2 },
  predation: { color: '#d55e00', dash: null, width: 2.4 },
  decomposition: { color: '#cc79a7', dash: '8 4', width: 1.8 },
  // Interactions « positives » / structure : or, vert feuille, cyan clair.
  pollinisation: { color: '#f0e442', dash: '6 3', width: 1.8 },
  plante_hote: { color: '#009e73', dash: '2 4', width: 1.8 },
  symbiose: { color: '#56b4e9', dash: null, width: 2.2 },
  // Cycles / stress.
  nitrification: { color: '#0072b2', dash: '10 3 2 3', width: 1.8 },
  competition: { color: '#666666', dash: '4 4', width: 1.8 },
  // Flux trophiques ajoutés (migration 250) : même famille chaude que l'herbivorie et la
  // prédation, distingués par le motif de tirets — jamais par la seule teinte.
  detritivorie: { color: '#cc79a7', dash: '3 3', width: 1.8 },
  frugivorie: { color: '#e69f00', dash: '2 3', width: 2 },
  granivorie: { color: '#e69f00', dash: '9 3 2 3', width: 1.8 },
  parasitisme: { color: '#d55e00', dash: '5 3 1 3', width: 1.8 },
  // Apports de matière minérale : même bleu que la nitrification, dont ils ont été
  // détachés, motifs distincts.
  excretion: { color: '#0072b2', dash: '2 2', width: 1.8 },
  assimilation: { color: '#0072b2', dash: '6 2 2 2', width: 1.8 },
});

/** Types « flux trophique » (sens écologique « est mangée par »). */
export const TROPHIC_EDGE_TYPES = Object.freeze([
  'herbivorie',
  'predation',
  'decomposition',
  'detritivorie',
  'frugivorie',
  'granivorie',
  'parasitisme',
]);

const DEFAULT_EDGE_STYLE = Object.freeze({ color: '#94a3b8', dash: null, width: 1.6 });

/** Anneau / halo de sélection (ne remplace pas la teinte du type). */
export const ACTIVE_EDGE_HALO_COLOR = '#16a34a';
export const ACTIVE_EDGE_HALO_WIDTH = 6;
const ACTIVE_EDGE_WIDTH_BOOST = 0.4;

function normalizeType(type) {
  return String(type || '')
    .trim()
    .toLowerCase();
}

export function isTrophicEdgeType(type) {
  return TROPHIC_EDGE_TYPES.includes(normalizeType(type));
}

/** Style de base d'un type d'interaction (couleur + figuré). */
export function edgeStyleForType(type) {
  const key = normalizeType(type);
  return INTERACTION_EDGE_STYLES[key] || DEFAULT_EDGE_STYLE;
}

/** Classe CSS BEM pour une arête selon son type. */
export function edgeStyleClass(type) {
  const key = normalizeType(type);
  if (INTERACTION_EDGE_STYLES[key]) return `pedago-foodweb-graph__line--${key}`;
  return 'pedago-foodweb-graph__line--default';
}

/**
 * Style effectif d'une arête au rendu.
 * À l'état actif, conserve la teinte et le figuré du type ; élargit légèrement
 * le trait. Le halo vert est tracé à part (`halo: true`).
 *
 * @param {string} type
 * @param {{ active?: boolean }} [opts]
 * @returns {{ color: string, dash: string|null, width: number, halo: boolean, haloColor: string, haloWidth: number }}
 */
export function resolveEdgeRenderStyle(type, { active = false } = {}) {
  const base = edgeStyleForType(type);
  if (active) {
    return {
      color: base.color,
      dash: base.dash,
      width: base.width + ACTIVE_EDGE_WIDTH_BOOST,
      halo: true,
      haloColor: ACTIVE_EDGE_HALO_COLOR,
      haloWidth: ACTIVE_EDGE_HALO_WIDTH,
    };
  }
  return {
    color: base.color,
    dash: base.dash,
    width: base.width,
    halo: false,
    haloColor: ACTIVE_EDGE_HALO_COLOR,
    haloWidth: ACTIVE_EDGE_HALO_WIDTH,
  };
}

/** Distance RGB simple (0–√3) pour garde-fou de palette. */
export function colorDistanceRgb(hexA, hexB) {
  const parse = (hex) => {
    const h = String(hex || '')
      .replace('#', '')
      .trim();
    if (h.length !== 6) return null;
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  };
  const a = parse(hexA);
  const b = parse(hexB);
  if (!a || !b) return 0;
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) / 255;
}

/** Entrées ordonnées pour la légende (tous les types connus). */
export const LEGEND_ENTRIES = INTERACTION_TYPES.map((type) => ({
  type,
  label: interactionTypeLabel(type),
  style: edgeStyleForType(type),
  symmetric: type === 'symbiose' || type === 'competition',
}));

/** Génère les règles CSS embarquées pour l'export SVG/PNG. */
export function buildEdgeExportCss() {
  const rules = [
    '.pedago-foodweb-graph__line{fill:none}',
    `.pedago-foodweb-graph__line-halo{fill:none;stroke:${ACTIVE_EDGE_HALO_COLOR};stroke-linecap:round;opacity:.45}`,
    '.pedago-foodweb-graph__line.dim{opacity:.12}',
  ];
  for (const [type, style] of Object.entries(INTERACTION_EDGE_STYLES)) {
    const dash = style.dash ? `stroke-dasharray:${style.dash};` : '';
    rules.push(
      `.pedago-foodweb-graph__line--${type}{stroke:${style.color};stroke-width:${style.width};${dash}}`,
      `.pedago-foodweb-graph__arrowhead--${type}{fill:${style.color}}`,
    );
  }
  rules.push(
    '.pedago-foodweb-graph__line--default{stroke:#94a3b8;stroke-width:1.6}',
    '.pedago-foodweb-graph__arrowhead--default{fill:#94a3b8}',
  );
  return rules.join('\n');
}
