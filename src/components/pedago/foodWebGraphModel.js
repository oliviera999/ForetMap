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
  const ensure = (id, name, emoji, role, inScope) => {
    if (id == null) return;
    const key = Number(id);
    // `inScope === false` : espèce hors de la zone/carte filtrée, gardée pour ne
    // pas amputer la relation, mais marquée. Une espèce vue « dans le périmètre »
    // au moins une fois y reste.
    const outOfScope = inScope === false;
    if (!nodeMap.has(key)) {
      nodeMap.set(key, {
        id: key,
        name: name || '',
        emoji: emoji || '',
        role: role || null,
        outOfScope,
      });
      return;
    }
    const existing = nodeMap.get(key);
    if (role && !existing.role) existing.role = role;
    if (!outOfScope) existing.outOfScope = false;
  };

  /** L'API renvoie 1/0 (MySQL) ; l'absence de colonne vaut « dans le périmètre ». */
  const readScope = (value) => (value == null ? true : Boolean(Number(value)));

  const edges = [];
  let usesEnvNode = false;
  for (const row of items || []) {
    ensure(row.from_id, row.from_name, row.from_emoji, row.from_role, readScope(row.from_in_scope));
    ensure(row.to_id, row.to_name, row.to_emoji, row.to_role, readScope(row.to_in_scope));
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

/** Profondeurs de focus proposées (1 = voisins directs, 2 = chaîne alimentaire). */
export const FOCUS_DEPTHS = [1, 2];

/**
 * Sous-réseau « focus » : le nœud ciblé et son voisinage jusqu'à `depth` arêtes,
 * avec toutes les arêtes internes à ce sous-ensemble.
 *
 * `depth = 1` donne le voisinage direct ; `depth = 2` expose la **chaîne**
 * (qui mange qui mange qui), qui est l'objet même d'un réseau trophique.
 */
export function focusSubset(edges, focusId, depth = 1) {
  if (focusId == null) return null;
  const list = edges || [];
  const steps = Math.max(1, Math.floor(Number(depth) || 1));
  const visibleNodes = new Set([focusId]);
  let frontier = new Set([focusId]);
  for (let i = 0; i < steps; i += 1) {
    const next = new Set();
    for (const nodeId of frontier) {
      for (const neighbor of neighborIds(list, nodeId)) {
        if (!visibleNodes.has(neighbor)) {
          visibleNodes.add(neighbor);
          next.add(neighbor);
        }
      }
    }
    if (next.size === 0) break;
    frontier = next;
  }
  // Une arête est retenue si ses deux extrémités sont dans le sous-réseau : à
  // profondeur 2, cela ajoute les liens entre voisins, qui font la chaîne.
  const visibleEdges = new Set(
    list.filter((e) => visibleNodes.has(e.tailId) && visibleNodes.has(e.headId)).map((e) => e.id),
  );
  return { visibleNodes, visibleEdges };
}

/**
 * Rang de chaque arête parmi ses parallèles (même paire d'extrémités, sens
 * indifférent). Deux relations entre les mêmes espèces — la contrainte SQL
 * n'interdit que le triplet (source, cible, type) — étaient tracées comme des
 * segments strictement confondus : une seule visible, deux cibles de clic au
 * même point. Le rang sert à écarter chaque arête de l'axe.
 *
 * @returns {Map<number, { index: number, count: number }>} par identifiant d'arête
 */
export function parallelEdgeRanks(edges) {
  const groups = new Map();
  for (const edge of edges || []) {
    const a = String(edge.tailId);
    const b = String(edge.headId);
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(edge);
  }
  const ranks = new Map();
  for (const group of groups.values()) {
    group.forEach((edge, index) => {
      ranks.set(edge.id, { index, count: group.length });
    });
  }
  return ranks;
}

/**
 * Décalage perpendiculaire d'une arête par rapport à l'axe entre ses deux
 * nœuds, centré sur 0 : une arête seule reste droite, deux se répartissent de
 * part et d'autre, et ainsi de suite.
 */
export function parallelEdgeOffset(rank, spacing = 18) {
  if (!rank || rank.count <= 1) return 0;
  return (rank.index - (rank.count - 1) / 2) * spacing;
}

/** Nœuds à positionner par une disposition : le nœud environnement est ancré à part. */
function layoutableNodes(nodes) {
  return (nodes || []).filter((node) => !isEnvNodeId(node?.id));
}

/**
 * Ordre de placement sur le cercle : les espèces d'un même rôle trophique
 * forment un arc contigu (producteurs, puis consommateurs, puis décomposeurs,
 * puis rôles inconnus), et sont triées par nom à l'intérieur de chaque arc.
 *
 * Sans ce regroupement, l'ordre était celui d'arrivée de l'API — trié par type
 * d'interaction puis par nom de source, donc arbitraire du point de vue du
 * graphe : les liens d'un même niveau trophique traversaient tout le cercle.
 */
export function orderNodesForCircle(nodes) {
  return [...layoutableNodes(nodes)].sort((a, b) => {
    const ca = trophicColumn(a.role);
    const cb = trophicColumn(b.role);
    if (ca !== cb) return ca - cb;
    return String(a.name || '').localeCompare(String(b.name || ''), 'fr');
  });
}

/** Disposition circulaire (par défaut), regroupée par rôle trophique. */
export function computeCircleLayout(nodes, { width = 640, height = 440 } = {}) {
  const cx = width / 2;
  const cy = height / 2;
  const r = Math.min(width, height) / 2 - 70;
  const map = new Map();
  const list = orderNodesForCircle(nodes);
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
