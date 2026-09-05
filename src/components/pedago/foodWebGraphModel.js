/**
 * Helpers purs du graphe « réseau trophique » (sans DOM, testables).
 *
 * Construit le modèle nœuds/arêtes à partir des lignes de `/api/food-web`,
 * calcule les dispositions (cercle / niveaux trophiques) et les voisinages
 * utilisés par le mode focus et la mise en évidence au survol.
 */

import { orientInteraction } from '../../shared/foodWebTypes.js';

/** Ancre visuelle des extrémités « environnement » (cible/source nulle). */
export const ENV_NODE_ID = '__env__';

/** Libellé et emoji du nœud « environnement » (sol, air, lumière…). */
export const ENV_NODE_LABEL = 'Environnement';
export const ENV_NODE_EMOJI = '🌍';

/** Ordre des colonnes pour la disposition par niveau trophique. */
export const TROPHIC_ORDER = ['producteur', 'consommateur', 'decomposeur'];

/** Longueur maximale d'un libellé de nœud avant troncature. */
export const NODE_LABEL_MAX = 16;

/** Vrai pour le nœud « environnement » (extrémité non-espèce d'une interaction). */
export function isEnvNodeId(id) {
  return id === ENV_NODE_ID;
}

/**
 * Libellé de nœud tronqué, avec une ellipse explicite quand il est coupé —
 * sans marque de coupe, « Consoude officin » se lit comme un nom complet.
 */
export function truncateNodeLabel(name, max = NODE_LABEL_MAX) {
  const text = String(name || '');
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

/**
 * Construit le modèle de graphe orienté écologiquement.
 * Chaque arête expose `tailId`/`headId` (sens d'affichage de la flèche).
 *
 * Les interactions sans espèce cible (`to_id` nul : nitrification du sol,
 * décomposition vers la litière…) sont rattachées à un nœud « environnement »
 * explicite — sans lui, la flèche pointait vers un point vide de la scène.
 */
export function buildGraphModel(items) {
  const nodeMap = new Map();
  const ensure = (id, name, emoji, role) => {
    if (id == null) return;
    const key = Number(id);
    if (!nodeMap.has(key)) {
      nodeMap.set(key, { id: key, name: name || '', emoji: emoji || '', role: role || null });
    } else if (role && !nodeMap.get(key).role) {
      nodeMap.get(key).role = role;
    }
  };

  const edges = [];
  let usesEnvNode = false;
  for (const row of items || []) {
    ensure(row.from_id, row.from_name, row.from_emoji, row.from_role);
    ensure(row.to_id, row.to_name, row.to_emoji, row.to_role);
    const oriented = orientInteraction(row.from_id, row.to_id, row.interaction_type);
    const tailId = oriented.tailId == null ? ENV_NODE_ID : oriented.tailId;
    const headId = oriented.headId == null ? ENV_NODE_ID : oriented.headId;
    if (tailId === ENV_NODE_ID || headId === ENV_NODE_ID) usesEnvNode = true;
    edges.push({
      id: row.id,
      type: row.interaction_type,
      description: row.description || '',
      relation: oriented.relation,
      symmetric: oriented.symmetric,
      tailId,
      headId,
    });
  }

  const nodes = [...nodeMap.values()];
  if (usesEnvNode) {
    nodes.push({
      id: ENV_NODE_ID,
      name: ENV_NODE_LABEL,
      emoji: ENV_NODE_EMOJI,
      role: null,
      isEnv: true,
    });
  }

  return { nodes, edges };
}

/** Identifiants des voisins directs d'un nœud (via les arêtes). */
export function neighborIds(edges, nodeId) {
  const set = new Set();
  for (const edge of edges || []) {
    if (edge.tailId === nodeId) set.add(edge.headId);
    if (edge.headId === nodeId) set.add(edge.tailId);
  }
  set.delete(nodeId);
  return set;
}

/**
 * Sous-réseau « focus » : le nœud ciblé + ses voisins directs, et les arêtes
 * qui les relient. Permet d'obtenir un réseau simplifié et lisible.
 */
export function focusSubset(edges, focusId) {
  if (focusId == null) return null;
  const visibleNodes = neighborIds(edges, focusId);
  visibleNodes.add(focusId);
  const visibleEdges = new Set(
    (edges || []).filter((e) => e.tailId === focusId || e.headId === focusId).map((e) => e.id),
  );
  return { visibleNodes, visibleEdges };
}

/** Nœuds à positionner par une disposition : le nœud environnement est ancré à part. */
function layoutableNodes(nodes) {
  return (nodes || []).filter((node) => !isEnvNodeId(node?.id));
}

/** Disposition circulaire (par défaut). */
export function computeCircleLayout(nodes, { width = 640, height = 440 } = {}) {
  const cx = width / 2;
  const cy = height / 2;
  const r = Math.min(width, height) / 2 - 70;
  const map = new Map();
  const list = layoutableNodes(nodes);
  list.forEach((node, index) => {
    const angle = (2 * Math.PI * index) / Math.max(list.length, 1) - Math.PI / 2;
    map.set(node.id, { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) });
  });
  return map;
}

/** Index de colonne d'un rôle trophique (les rôles inconnus vont à droite). */
export function trophicColumn(role) {
  const idx = TROPHIC_ORDER.indexOf(String(role || '').toLowerCase());
  return idx === -1 ? TROPHIC_ORDER.length : idx;
}

/**
 * Disposition par niveau trophique : producteurs → consommateurs →
 * décomposeurs (→ rôle inconnu), répartis verticalement dans chaque colonne.
 */
export function computeTrophicLayout(nodes, { width = 640, height = 440 } = {}) {
  const columns = new Map();
  for (const node of layoutableNodes(nodes)) {
    const col = trophicColumn(node.role);
    if (!columns.has(col)) columns.set(col, []);
    columns.get(col).push(node);
  }
  const colCount = TROPHIC_ORDER.length + 1;
  const usableW = width - 120;
  const map = new Map();
  for (const [col, colNodes] of columns) {
    const x = 70 + (usableW * col) / (colCount - 1);
    const n = colNodes.length;
    colNodes.forEach((node, i) => {
      const y = n === 1 ? height / 2 : 60 + ((height - 120) * i) / (n - 1);
      map.set(node.id, { x, y });
    });
  }
  return map;
}
