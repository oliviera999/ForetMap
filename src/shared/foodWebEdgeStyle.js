/**
 * Styles visuels des arêtes du réseau trophique (couleur, pointillés).
 *
 * Parité d'intention avec `INTERACTION_TYPE_META` dans `foodWebTypes.js` :
 * chaque type d'interaction a une signature graphique distincte pour la légende
 * et le rendu SVG du graphe.
 */

import { INTERACTION_TYPES, interactionTypeLabel } from './foodWebTypes.js';

/** @typedef {{ color: string, dash: string|null, width: number }} FoodWebEdgeStyle */

/** @type {Record<string, FoodWebEdgeStyle>} */
export const INTERACTION_EDGE_STYLES = Object.freeze({
  herbivorie: { color: '#c2410c', dash: null, width: 2 },
  predation: { color: '#b91c1c', dash: null, width: 2 },
  decomposition: { color: '#78350f', dash: '8 4', width: 1.8 },
  pollinisation: { color: '#ca8a04', dash: '6 3', width: 1.8 },
  plante_hote: { color: '#15803d', dash: '2 4', width: 1.8 },
  nitrification: { color: '#1d4ed8', dash: '10 3 2 3', width: 1.8 },
  symbiose: { color: '#0f766e', dash: null, width: 2.2 },
  competition: { color: '#4b5563', dash: '4 4', width: 1.8 },
});

/** Types « flux trophique » (sens écologique « est mangée par »). */
export const TROPHIC_EDGE_TYPES = Object.freeze(['herbivorie', 'predation', 'decomposition']);

const DEFAULT_EDGE_STYLE = Object.freeze({ color: '#94a3b8', dash: null, width: 1.6 });

const ACTIVE_EDGE_COLOR = '#16a34a';
const ACTIVE_EDGE_WIDTH = 2.6;

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
 * Style effectif d'une arête au rendu (sélection / survol actif en vert).
 *
 * @param {string} type
 * @param {{ active?: boolean }} [opts]
 */
export function resolveEdgeRenderStyle(type, { active = false } = {}) {
  const base = edgeStyleForType(type);
  if (active) {
    return { color: ACTIVE_EDGE_COLOR, dash: base.dash, width: ACTIVE_EDGE_WIDTH };
  }
  return { color: base.color, dash: base.dash, width: base.width };
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
    '.pedago-foodweb-graph__line.active{stroke:#16a34a;stroke-width:2.6}',
    '.pedago-foodweb-graph__line.dim{opacity:.12}',
    '.pedago-foodweb-graph__arrowhead.active{fill:#16a34a}',
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
