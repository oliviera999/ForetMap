/**
 * Helpers purs du graphe « réseau trophique » (sans DOM, testables).
 *
 * Construit le modèle nœuds/arêtes à partir des lignes de `/api/food-web`,
 * calcule les dispositions (cercle / niveaux trophiques) et les voisinages
 * utilisés par le mode focus et la mise en évidence au survol.
 */

import { interactionMatterFlow, orientInteraction } from '../../shared/foodWebTypes.js';

/** Ancre visuelle des extrémités « environnement » (cible/source nulle). */
export const ENV_NODE_ID = '__env__';

/** Libellé et emoji du nœud « environnement » (sol, air, lumière…). */
export const ENV_NODE_LABEL = 'Environnement';
export const ENV_NODE_EMOJI = '🌍';

/**
 * Ordre des colonnes pour la disposition par rôle trophique — la chaîne de la matière :
 * producteurs, consommateurs, puis ceux qui recyclent la matière morte. `detritivore`
 * (migration 295) se place avant `decomposeur` : il fragmente, le décomposeur minéralise.
 */
export const TROPHIC_ORDER = Object.freeze([
  'producteur',
  'consommateur',
  'detritivore',
  'decomposeur',
]);

/** Libellé de colonne de chaque rôle, et de la colonne des rôles inconnus. */
export const TROPHIC_ROLE_COLUMN_LABELS = Object.freeze({
  producteur: 'Producteurs',
  consommateur: 'Consommateurs',
  detritivore: 'Détritivores',
  decomposeur: 'Décomposeurs',
});
export const TROPHIC_OTHER_COLUMN_LABEL = 'Autres';

/** Libellé d'un rôle dans une phrase (infobulle, lecteur d'écran). */
const TROPHIC_ROLE_SINGULAR = Object.freeze({
  producteur: 'producteur',
  consommateur: 'consommateur',
  detritivore: 'détritivore',
  decomposeur: 'décomposeur',
});

/** Rôle trophique normalisé (minuscules, sans espace) — chaîne vide si absent. */
function roleKey(role) {
  return String(role || '')
    .trim()
    .toLowerCase();
}

/** « détritivore », « décomposeur »… ; un rôle hors liste est rendu tel quel. */
export function trophicRoleText(role) {
  return TROPHIC_ROLE_SINGULAR[roleKey(role)] || String(role || '');
}

/** Présélections de graphe : séparer réseau alimentaire et autres relations. */
export const GRAPH_PRESETS = Object.freeze({
  // Réseau alimentaire : tout ce qui transporte de la matière d'un être vivant vers celui
  // qui le consomme (`matterFlow: 'to_from'`, cf. `foodWebTypes.js`).
  alimentaire: Object.freeze([
    'herbivorie',
    'predation',
    'decomposition',
    'detritivorie',
    'frugivorie',
    'granivorie',
    'parasitisme',
    // Migration 272 : brouter un mycélium vivant est bien une consommation.
    'mycophagie',
  ]),
  // Autres relations : services, rapports, et apports de matière minérale — excrétion et
  // assimilation, détachées de `nitrification` par la migration 255, y rejoignent le
  // cycle de l'azote plutôt que le réseau alimentaire. Mutualisme, commensalisme,
  // allélopathie et facilitation (migration 272) en relèvent aussi : ce sont des rapports
  // entre espèces, pas des transferts de matière.
  relations: Object.freeze([
    'pollinisation',
    'plante_hote',
    'symbiose',
    'competition',
    'nitrification',
    'excretion',
    'assimilation',
    'mutualisme',
    'commensalisme',
    'allelopathie',
    'facilitation',
  ]),
  all: null,
});

export const GRAPH_PRESET_LABELS = Object.freeze({
  alimentaire: 'Réseau alimentaire',
  relations: 'Autres relations',
  all: 'Tout',
});

export function itemMatchesPreset(item, preset) {
  const types = GRAPH_PRESETS[preset];
  if (!types) return true;
  const type = String(item?.interaction_type || item?.type || '')
    .trim()
    .toLowerCase();
  return types.includes(type);
}

/** Filtre les interactions avant construction du modèle (évite des nœuds orphelins). */
export function itemsForPreset(items, preset) {
  return (items || []).filter((item) => itemMatchesPreset(item, preset));
}

/** Hauteur minimale de scène : en dessous, les nœuds paraissent flotter. */
const MIN_SCENE_H = 340;

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
      // Qualité du lien (migration 272) : le rendu en a besoin pour marquer une hypothèse
      // ou une observation de terrain, le panneau de détail pour les nommer.
      evidenceLevel: row.evidence_level || null,
      pollinationEfficacy: row.pollination_efficacy || null,
      sourceRef: row.source_ref || null,
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
 * Profondeurs d'isolement proposées : 0 = la sélection seule, 1 = voisins
 * directs, 2 = la chaîne alimentaire autour d'elle.
 *
 * La profondeur 0 n'a de sens qu'à partir de deux espèces sélectionnées — elle
 * montre alors le réseau **des seules espèces choisies**, avec leurs relations
 * mutuelles et rien d'autre.
 */
export const FOCUS_DEPTHS = [0, 1, 2];

export const FOCUS_DEPTH_LABELS = Object.freeze({
  0: 'Sélection',
  1: 'Voisins',
  2: 'Chaîne',
});

export const FOCUS_DEPTH_TITLES = Object.freeze({
  0: 'Les espèces sélectionnées et leurs relations mutuelles, rien d’autre',
  1: 'Voisins directs des espèces sélectionnées',
  2: 'Deux crans : la chaîne alimentaire autour de la sélection',
});

/**
 * Normalise une graine de focus : identifiant seul, tableau, `Set`, ou tout
 * itérable. Rend un `Set` sans valeur nulle.
 */
export function normalizeFocusSeeds(seeds) {
  const out = new Set();
  if (seeds == null) return out;
  if (typeof seeds === 'number' || typeof seeds === 'string') {
    out.add(seeds);
    return out;
  }
  if (typeof seeds[Symbol.iterator] === 'function') {
    for (const value of seeds) if (value != null) out.add(value);
    return out;
  }
  out.add(seeds);
  return out;
}

/**
 * Sous-réseau « focus » : les nœuds ciblés et leur voisinage jusqu'à `depth`
 * arêtes, avec toutes les arêtes internes à ce sous-ensemble.
 *
 * `seeds` accepte un identifiant **ou un ensemble d'identifiants** : c'est ce
 * qui permet de composer un réseau à partir d'une sélection d'espèces et
 * d'exclure tout le reste.
 *
 * `depth = 0` garde la sélection seule ; `depth = 1` donne le voisinage direct ;
 * `depth = 2` expose la **chaîne** (qui mange qui mange qui), qui est l'objet
 * même d'un réseau trophique.
 */
export function focusSubset(edges, seeds, depth = 1) {
  const roots = normalizeFocusSeeds(seeds);
  if (roots.size === 0) return null;
  const list = edges || [];
  const rawDepth = Number(depth);
  const steps = Number.isFinite(rawDepth) ? Math.max(0, Math.floor(rawDepth)) : 1;
  const visibleNodes = new Set(roots);
  let frontier = new Set(roots);
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
 * forment un arc contigu (producteurs, puis consommateurs, détritivores,
 * décomposeurs, puis rôles inconnus), et sont triées par nom à l'intérieur de
 * chaque arc.
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

/**
 * Rayon et hauteur de scène d'un cercle de `count` nœuds.
 *
 * Le rayon suit le nombre d'espèces pour garder ~46 px entre deux pastilles
 * voisines (leur diamètre est de 40 px), et la scène réserve autour de l'anneau
 * la couronne où se posent les étiquettes radiales. Le rayon est borné : au-delà,
 * agrandir ne sert plus à rien — le viewBox étant mis à l'échelle du conteneur,
 * une scène deux fois plus grande rapetissit tout d'autant. C'est l'isolement
 * (focus, sélection) qui répond à ces volumes, pas la géométrie.
 */
export function circleLayoutSize(count, { minHeight = MIN_SCENE_H } = {}) {
  const needed = (Math.max(1, count) * 46) / (2 * Math.PI);
  const radius = Math.min(320, Math.max(110, needed));
  return { radius, height: Math.max(minHeight, Math.round(2 * (radius + 110))) };
}

/** Disposition circulaire, regroupée par rôle trophique. */
export function computeCircleLayout(nodes, { width = 640, height = 440, radius = null } = {}) {
  const cx = width / 2;
  const cy = height / 2;
  const r = radius == null ? Math.min(width, height) / 2 - 70 : radius;
  const map = new Map();
  const list = orderNodesForCircle(nodes);
  list.forEach((node, index) => {
    const angle = (2 * Math.PI * index) / Math.max(list.length, 1) - Math.PI / 2;
    map.set(node.id, { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) });
  });
  return map;
}

/**
 * Index de colonne d'un rôle trophique dans `order` (les rôles inconnus vont à
 * droite, après la dernière colonne de rôle).
 */
export function trophicColumn(role, order = TROPHIC_ORDER) {
  const idx = order.indexOf(roleKey(role));
  return idx === -1 ? order.length : idx;
}

/**
 * Rôles mis en colonnes pour ces nœuds. La colonne « Détritivores » n'apparaît
 * que si le réseau en compte un : un réseau qui n'en a pas — celui de G&L, qui
 * réutilise ce graphe, n'en a jamais — garde exactement ses quatre colonnes.
 */
export function trophicRoleOrder(nodes) {
  const hasDetritivore = layoutableNodes(nodes).some(
    (node) => roleKey(node?.role) === 'detritivore',
  );
  return hasDetritivore ? TROPHIC_ORDER : TROPHIC_ORDER.filter((role) => role !== 'detritivore');
}

/** Libellés visibles des colonnes d'un ordre de rôles, colonne « Autres » comprise. */
export function trophicColumnLabels(order = TROPHIC_ORDER) {
  return [...order.map((role) => TROPHIC_ROLE_COLUMN_LABELS[role]), TROPHIC_OTHER_COLUMN_LABEL];
}

/**
 * Abscisses des colonnes de la disposition par rôle (même formule que
 * `computeTrophicLayout`) — sert aux étiquettes Producteurs / …
 */
export function trophicColumnXs({ width = 640, order = TROPHIC_ORDER } = {}) {
  const colCount = order.length + 1;
  const usableW = width - 120;
  return Array.from({ length: colCount }, (_, col) => 70 + (usableW * col) / (colCount - 1));
}

/**
 * Disposition par rôle trophique : producteurs → consommateurs → détritivores
 * (s'il y en a) → décomposeurs (→ rôle inconnu), répartis verticalement dans
 * chaque colonne.
 */
export function computeTrophicLayout(nodes, { width = 640, height = 440 } = {}) {
  const order = trophicRoleOrder(nodes);
  const columns = new Map();
  for (const node of layoutableNodes(nodes)) {
    const col = trophicColumn(node.role, order);
    if (!columns.has(col)) columns.set(col, []);
    columns.get(col).push(node);
  }
  const xs = trophicColumnXs({ width, order });
  const map = new Map();
  for (const [col, colNodes] of columns) {
    const x = xs[col];
    const n = colNodes.length;
    colNodes.forEach((node, i) => {
      const y = n === 1 ? height / 2 : 60 + ((height - 120) * i) / (n - 1);
      map.set(node.id, { x, y });
    });
  }
  return map;
}

/* ------------------------------------------------------------------ *
 * Niveaux trophiques calculés (consommateurs primaire / secondaire…)   *
 * ------------------------------------------------------------------ */

/** Dernier niveau représenté : au-delà, on plafonne (et on le dit). */
export const TROPHIC_LEVEL_MAX = 4;

/** Garde-fou de convergence : les boucles détritus ↔ décomposeur en créent. */
const TROPHIC_LEVEL_ITERATIONS = 40;

/** Libellé d'un niveau entier — ce que l'élève doit pouvoir nommer. */
export const TROPHIC_LEVEL_LABELS = Object.freeze({
  1: 'Producteurs',
  2: 'Consommateurs primaires',
  3: 'Consommateurs secondaires',
  4: 'Consommateurs tertiaires',
});

/** Même liste au singulier, pour les phrases d'infobulle. */
export const TROPHIC_LEVEL_SINGULAR = Object.freeze({
  1: 'producteur',
  2: 'consommateur primaire',
  3: 'consommateur secondaire',
  4: 'consommateur tertiaire',
});

/**
 * Voies latérales, hors des bandes de la pyramide. Décomposeurs et espèces sans
 * niveau n'ont pas d'étage ; les détritivores en ont un (le 2) mais restent
 * affichés à côté des décomposeurs, dans la voie de la matière morte, sous leur
 * propre intitulé : l'élève y lit qui fragmente et qui minéralise.
 */
export const TROPHIC_LANE_DETRITIVORES = 'detritivores';
export const TROPHIC_LANE_DECOMPOSERS = 'decomposeurs';
export const TROPHIC_LANE_UNKNOWN = 'indetermine';
export const TROPHIC_LANE_LABELS = Object.freeze({
  [TROPHIC_LANE_DETRITIVORES]: 'Détritivores',
  [TROPHIC_LANE_DECOMPOSERS]: 'Décomposeurs',
  [TROPHIC_LANE_UNKNOWN]: 'Non déterminé',
});

/**
 * Niveau d'un détritivore : il mange de la matière organique morte, base du
 * réseau détritique (niveau 1), comme un herbivore mange une plante. C'est un
 * consommateur primaire de matière morte, et son prédateur prend le niveau 3.
 */
export const DETRITIVORE_LEVEL = 2;

/**
 * Position trophique de chaque espèce, **calculée depuis le graphe affiché**.
 *
 *   niveau(espèce) = 1 + moyenne(niveau de ses proies)
 *   niveau(producteur ou espèce sans proie) = 1
 *
 * C'est la position trophique fractionnaire de Levine, « Several measures of
 * trophic structure applicable to complex food webs », J. Theor. Biol. 83(2),
 * 1980 (https://doi.org/10.1016/0022-5193(80)90288-X), telle que la calculent
 * les outils du domaine (p. ex. le paquet R `cheddar`,
 * https://github.com/quicklizard99/cheddar, BSD-2) — principe repris, aucun
 * code emprunté.
 *
 * Choix assumés, documentés dans `docs/AUDIT_RESEAU_TROPHIQUE_DENSITE_2026-09-16.md` :
 * - seules les arêtes qui **transportent de la matière vers le consommateur**
 *   comptent (`matterFlow === 'to_from'`), ce que la table des types dit déjà ;
 * - les **décomposeurs n'ont pas de niveau** : ils ne sont pas un 4ᵉ étage mais
 *   un retour de matière — les ranger dans la pyramide est l'erreur classique ;
 * - un **détritivore** (migration 295) part du niveau 2 même sans nourriture
 *   affichée : la matière morte qu'il mange vaut 1 par convention, et elle manque
 *   souvent au réseau montré (isolement, niveau Collège…). Ses proies affichées
 *   affinent ensuite la valeur comme pour tout consommateur ;
 * - une espèce **sans aucune relation trophique** n'a pas de niveau (« non
 *   déterminé ») plutôt qu'un niveau 1 par défaut ;
 * - la valeur est **fractionnaire** : un omnivore vaut 2,5 et le dit, au lieu
 *   d'être arrondi vers un niveau qu'il n'occupe pas ;
 * - le résultat vaut **dans le réseau affiché** : changer de carte, de zone ou
 *   de cadrage peut le changer, et l'interface doit le formuler ainsi.
 *
 * @returns {Map<number, number>} niveau par identifiant d'espèce (absent = non déterminé)
 */
export function computeTrophicLevels(nodes, edges) {
  const levels = new Map();
  const preys = new Map();
  const eaten = new Set();

  for (const edge of edges || []) {
    if (interactionMatterFlow(edge?.type) !== 'to_from') continue;
    if (isEnvNodeId(edge.tailId) || isEnvNodeId(edge.headId)) continue;
    // Convention d'orientation : la queue est la ressource, la tête le consommateur.
    if (!preys.has(edge.headId)) preys.set(edge.headId, []);
    preys.get(edge.headId).push(edge.tailId);
    eaten.add(edge.tailId);
  }

  // Aucune relation « qui mange qui » dans le réseau affiché (cadrage « Autres
  // relations », par exemple) : personne n'a de position trophique, et la vue
  // doit retomber sur les rôles plutôt que d'inventer un étage.
  if (preys.size === 0) return levels;

  const species = (nodes || []).filter((node) => node && !isEnvNodeId(node.id));
  const roleOf = (node) => roleKey(node.role);

  for (const node of species) {
    const role = roleOf(node);
    if (role === 'decomposeur') continue;
    const myPreys = preys.get(node.id);
    if (role === 'producteur') {
      levels.set(node.id, 1);
      continue;
    }
    if (role === 'detritivore') {
      // Sans ce point de départ, un lombric sans nourriture affichée valait 1
      // (« mangé sans manger ») et l'étourneau qui le mange, 2.
      levels.set(node.id, DETRITIVORE_LEVEL);
      continue;
    }
    if (!myPreys || myPreys.length === 0) {
      // Ressource de base du réseau montré (litière, compost, détritus…) : elle
      // est mangée sans manger. Sans lien du tout : non déterminé.
      if (eaten.has(node.id)) levels.set(node.id, 1);
      continue;
    }
    levels.set(node.id, 2);
  }

  for (let pass = 0; pass < TROPHIC_LEVEL_ITERATIONS; pass += 1) {
    let maxDelta = 0;
    for (const node of species) {
      if (roleOf(node) === 'producteur') continue;
      if (!levels.has(node.id)) continue;
      const myPreys = preys.get(node.id);
      if (!myPreys || myPreys.length === 0) continue;
      const known = myPreys.map((id) => levels.get(id)).filter((v) => Number.isFinite(v));
      if (known.length === 0) continue;
      const mean = known.reduce((sum, v) => sum + v, 0) / known.length;
      // Le plafond fait converger les cycles (A mange B qui mange A) au lieu de
      // les laisser diverger de +2 à chaque passe.
      const next = Math.min(TROPHIC_LEVEL_MAX, 1 + mean);
      maxDelta = Math.max(maxDelta, Math.abs(next - levels.get(node.id)));
      levels.set(node.id, next);
    }
    if (maxDelta < 1e-6) break;
  }

  return levels;
}

/** Bande d'affichage (1…TROPHIC_LEVEL_MAX) d'un niveau fractionnaire. */
export function trophicLevelBand(level) {
  if (!Number.isFinite(level)) return null;
  return Math.min(TROPHIC_LEVEL_MAX, Math.max(1, Math.round(level)));
}

/** « 2,4 » — la valeur fractionnaire, en français, sans décimale inutile. */
export function formatTrophicLevel(level) {
  if (!Number.isFinite(level)) return '';
  const rounded = Math.round(level * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace('.', ',');
}

/**
 * Phrase d'infobulle : « niveau 2,4 dans ce réseau — omnivore ». Le « dans ce
 * réseau » n'est pas une précaution de style : le niveau dépend du périmètre
 * affiché.
 */
export function trophicLevelTitle(level) {
  if (!Number.isFinite(level)) return 'niveau non déterminé dans ce réseau';
  const band = trophicLevelBand(level);
  const omnivore = Math.abs(level - band) > 0.15;
  const label = TROPHIC_LEVEL_SINGULAR[band] || '';
  const base = `niveau ${formatTrophicLevel(level)} dans ce réseau`;
  if (omnivore) return `${base} — régime mixte, entre deux niveaux`;
  return label ? `${base} — ${label}` : base;
}

/* ------------------------------------------------------------------ *
 * Dispositions denses : bandes de niveau, chaîne d'une espèce          *
 * ------------------------------------------------------------------ */

/**
 * Au-delà de ce nombre de nœuds, toutes les étiquettes ne peuvent plus tenir :
 * seules celles des nœuds actifs (survol, sélection, réseau isolé) sont
 * tracées. Mesure : sur le cercle, le pas tombe sous la largeur d'une étiquette
 * (~88 px) dès 15 nœuds ; on laisse une marge avant de masquer, parce qu'un nom
 * partiellement gêné reste plus utile qu'un nom absent.
 */
export const LABEL_CROWD_THRESHOLD = 80;

/** Au-delà de huit espèces, la voie latérale passe à deux sous-colonnes. */
const LANE_WRAP_AT = 8;

/** Largeur réservée à un nœud et à son étiquette, et hauteur d'une rangée. */
const SLOT_W = 96;
const ROW_H = 58;
const BAND_PAD = 16;
const SCENE_PAD_X = 48;

/** Nombre de nœuds par rangée dans une largeur donnée. */
function slotsPerRow(usableWidth) {
  return Math.max(1, Math.floor(usableWidth / SLOT_W));
}

/** Tri stable et lisible à l'intérieur d'un niveau ou d'une voie. */
function byName(a, b) {
  return String(a?.name || '').localeCompare(String(b?.name || ''), 'fr');
}

/**
 * Disposition par **niveau trophique calculé**, de bas en haut.
 *
 * Trois différences avec `computeTrophicLayout` (rôles, colonnes de gauche à
 * droite), toutes demandées par l'audit de densité :
 * 1. l'axe suit la **convention scolaire** — producteurs en bas, prédateurs en
 *    haut ;
 * 2. un niveau qui compte plus d'espèces que la largeur n'en porte se
 *    **répartit sur plusieurs rangées** au lieu de s'empiler sur une verticale
 *    (78 producteurs sur 440 px donnaient un pas de 5,7 px) ;
 * 3. décomposeurs et espèces sans niveau vont dans une **voie latérale** : ce
 *    ne sont pas des étages de la pyramide. Les détritivores les y rejoignent,
 *    sous leur propre intitulé, bien qu'ils aient un niveau : la voie est celle
 *    de la matière morte.
 *
 * La scène **grandit en hauteur** avec le nombre de rangées : le conteneur est
 * en `height: auto`, donc la place gagnée est réelle (l'échelle de rendu ne
 * change pas), contrairement à un élargissement qui se contenterait de tout
 * rapetisser.
 *
 * La hauteur rendue n'est **pas** celle demandée : elle épouse le contenu (d'où
 * l'absence de paramètre `height`), pour ne laisser ni bande vide en haut ni
 * rangées à l'étroit en bas.
 *
 * @returns {{ positions: Map, width: number, height: number,
 *             bands: Array, lanes: Array, laneLeft: number|null }}
 */
export function computeTrophicLevelLayout(nodes, levels, { width = 880 } = {}) {
  const positions = new Map();
  const species = (nodes || []).filter((node) => node && !isEnvNodeId(node.id));
  const levelOf = (id) => (levels instanceof Map ? levels.get(id) : undefined);

  const bandsByLevel = new Map();
  // Ordre d'insertion = ordre des voies à l'écran : détritivores, décomposeurs,
  // puis espèces sans niveau.
  const laneNodes = {
    [TROPHIC_LANE_DETRITIVORES]: [],
    [TROPHIC_LANE_DECOMPOSERS]: [],
    [TROPHIC_LANE_UNKNOWN]: [],
  };

  for (const node of species) {
    const role = roleKey(node.role);
    if (role === 'detritivore') {
      laneNodes[TROPHIC_LANE_DETRITIVORES].push(node);
      continue;
    }
    const band = trophicLevelBand(levelOf(node.id));
    if (band == null) {
      const lane = role === 'decomposeur' ? TROPHIC_LANE_DECOMPOSERS : TROPHIC_LANE_UNKNOWN;
      laneNodes[lane].push(node);
      continue;
    }
    if (!bandsByLevel.has(band)) bandsByLevel.set(band, []);
    bandsByLevel.get(band).push(node);
  }

  const laneList = Object.entries(laneNodes)
    .filter(([, list]) => list.length > 0)
    .map(([key, list]) => ({
      key,
      label: TROPHIC_LANE_LABELS[key],
      nodes: [...list].sort(byName),
    }));
  const laneCount = laneList.reduce((sum, lane) => sum + lane.nodes.length, 0);

  // Largeur de la voie latérale : une sous-colonne, deux au-delà de huit espèces.
  const laneCols = laneCount === 0 ? 0 : laneCount > LANE_WRAP_AT ? 2 : 1;
  const laneWidth = laneCols === 0 ? 0 : laneCols * SLOT_W + 24;
  const mainWidth = width - laneWidth;
  const usable = Math.max(SLOT_W, mainWidth - 2 * SCENE_PAD_X);
  const perRow = slotsPerRow(usable);

  const presentLevels = [...bandsByLevel.keys()].sort((a, b) => a - b);
  const bandPlans = presentLevels.map((level) => {
    const list = [...bandsByLevel.get(level)].sort(byName);
    const rows = Math.max(1, Math.ceil(list.length / perRow));
    return { level, list, rows, height: rows * ROW_H + BAND_PAD };
  });

  const contentHeight = bandPlans.reduce((sum, band) => sum + band.height, 0);
  // Une case vide sépare deux voies : sans elle, l'intitulé de la seconde
  // (« Non déterminé ») se posait sur l'étiquette de la dernière espèce de la
  // première. Le nœud environnement occupe la case du bas.
  const laneSlots = laneCount + Math.max(0, laneList.length - 1);
  const lanePerCol = laneCols === 0 ? 0 : Math.ceil(laneSlots / laneCols);
  const laneHeight = laneCols === 0 ? 0 : 54 + lanePerCol * ROW_H + 96;
  // La scène épouse son contenu : elle grandit quand les rangées s'accumulent,
  // et ne laisse pas une bande vide en haut quand le réseau est court.
  const sceneHeight = Math.max(MIN_SCENE_H, contentHeight + 56, laneHeight);

  // Empilement de bas en haut : le niveau 1 touche le bas de la scène.
  const bands = [];
  let cursor = sceneHeight - 20;
  for (const plan of bandPlans) {
    const bottom = cursor;
    const top = bottom - plan.height;
    cursor = top;
    plan.list.forEach((node, index) => {
      const row = Math.floor(index / perRow);
      const inRow = plan.list.slice(row * perRow, (row + 1) * perRow);
      const col = index - row * perRow;
      const x = SCENE_PAD_X + (usable * (col + 0.5)) / inRow.length;
      const y = bottom - BAND_PAD / 2 - ROW_H / 2 - row * ROW_H;
      positions.set(node.id, { x, y });
    });
    bands.push({
      level: plan.level,
      label: TROPHIC_LEVEL_LABELS[plan.level] || `Niveau ${plan.level}`,
      top,
      bottom,
      labelY: top + 14,
    });
  }

  // Voie latérale : une colonne par tranche, remplie de haut en bas.
  const lanes = [];
  if (laneCols > 0) {
    const laneLeft = width - laneWidth;
    const perCol = Math.max(1, lanePerCol);
    let placed = 0;
    let laneIndex = 0;
    for (const lane of laneList) {
      if (laneIndex > 0) placed += 1;
      laneIndex += 1;
      // Chaque voie garde son intitulé au-dessus de sa première espèce : posés
      // au même endroit, « Décomposeurs » et « Non déterminé » se recouvraient.
      let firstPos = null;
      for (const node of lane.nodes) {
        const col = Math.floor(placed / perCol);
        const row = placed - col * perCol;
        const pos = {
          x: laneLeft + 12 + SLOT_W * (col + 0.5),
          y: 54 + ROW_H / 2 + row * ROW_H,
        };
        positions.set(node.id, pos);
        if (!firstPos) firstPos = pos;
        placed += 1;
      }
      lanes.push({
        key: lane.key,
        label: lane.label,
        count: lane.nodes.length,
        x: firstPos.x,
        labelY: firstPos.y - 30,
      });
    }
    positions.set(ENV_NODE_ID, { x: laneLeft + laneWidth / 2, y: sceneHeight - 54 });
    return { positions, width, height: sceneHeight, bands, lanes, laneLeft };
  }

  positions.set(ENV_NODE_ID, { x: width - 48, y: sceneHeight - 54 });
  return { positions, width, height: sceneHeight, bands, lanes, laneLeft: null };
}

/** Colonnes de la disposition « fiche » — l'ordre est celui de la lecture. */
export const CHAIN_COLUMN_LABELS = Object.freeze({
  resources: 'Ce qu’elle mange',
  focus: 'L’espèce',
  consumers: 'Ce qui la mange',
  others: 'Autres espèces reliées',
});

/**
 * Disposition « fiche trophique » d'une espèce : ses ressources à gauche,
 * elle au centre, ses consommateurs à droite, le reste de ses relations en bas.
 *
 * C'est la phrase que l'élève doit produire — « le merle mange des vers, et il
 * est mangé par… » — et qu'aucune des deux autres dispositions ne met en forme :
 * le cercle ne dit rien du sens, les bandes situent l'espèce mais ne mettent pas
 * *ses* proies en face d'elle.
 */
export function computeChainLayout(nodes, edges, focusId, { width = 880 } = {}) {
  const positions = new Map();
  const list = (nodes || []).filter(Boolean);
  if (focusId == null || list.length === 0) {
    return { positions, width, height: MIN_SCENE_H, columns: [] };
  }

  const resources = new Set();
  const consumers = new Set();
  for (const edge of edges || []) {
    if (interactionMatterFlow(edge?.type) !== 'to_from') continue;
    if (edge.headId === focusId) resources.add(edge.tailId);
    if (edge.tailId === focusId) consumers.add(edge.headId);
  }
  // Une espèce peut être des deux côtés (cannibalisme, boucle détritique) : la
  // ressource prime, pour ne pas la dédoubler.
  for (const id of resources) consumers.delete(id);

  const byId = new Map(list.map((node) => [node.id, node]));
  const pick = (ids) =>
    [...ids]
      .map((id) => byId.get(id))
      .filter(Boolean)
      .sort(byName);
  const left = pick(resources);
  const right = pick(consumers);
  const placed = new Set([focusId, ...resources, ...consumers]);
  const others = list.filter((node) => !placed.has(node.id)).sort(byName);

  const othersRows = others.length === 0 ? 0 : Math.ceil(others.length / slotsPerRow(width - 96));
  const mainTop = 56;
  // Hauteur nécessaire : la dernière étiquette de la plus longue colonne doit
  // tenir dans la scène — sinon le bas de la fiche était coupé.
  const tallest = Math.max(left.length, right.length, 1);
  const neededMain = mainTop + (tallest - 1) * ROW_H + 40;
  // La rangée « autres relations » se pose sous les colonnes, étiquettes comprises.
  const othersBlock = othersRows === 0 ? 0 : othersRows * ROW_H + 86;
  const sceneHeight = Math.max(MIN_SCENE_H, neededMain + othersBlock + 20);
  const mainBottom = sceneHeight - othersBlock - 40;
  const centerY = (mainTop + mainBottom) / 2;

  const spread = (group, x) => {
    const n = group.length;
    group.forEach((node, index) => {
      const span = mainBottom - mainTop;
      const y = n === 1 ? centerY : mainTop + (span * index) / (n - 1);
      positions.set(node.id, { x, y });
    });
  };

  const xLeft = width * 0.17;
  const xCenter = width * 0.5;
  const xRight = width * 0.83;
  spread(left, xLeft);
  spread(right, xRight);
  positions.set(focusId, { x: xCenter, y: centerY });

  if (others.length > 0) {
    const perRow = slotsPerRow(width - 96);
    others.forEach((node, index) => {
      const row = Math.floor(index / perRow);
      const inRow = others.slice(row * perRow, (row + 1) * perRow);
      const col = index - row * perRow;
      positions.set(node.id, {
        x: 48 + ((width - 96) * (col + 0.5)) / inRow.length,
        y: mainBottom + 70 + row * ROW_H,
      });
    });
  }

  const columns = [
    left.length > 0 ? { key: 'resources', label: CHAIN_COLUMN_LABELS.resources, x: xLeft } : null,
    { key: 'focus', label: CHAIN_COLUMN_LABELS.focus, x: xCenter },
    right.length > 0 ? { key: 'consumers', label: CHAIN_COLUMN_LABELS.consumers, x: xRight } : null,
  ].filter(Boolean);

  return {
    positions,
    width,
    height: sceneHeight,
    columns,
    othersLabel: others.length > 0 ? CHAIN_COLUMN_LABELS.others : null,
    othersY: others.length > 0 ? mainBottom + 42 : null,
  };
}

/**
 * Ancrage du nœud « environnement » pour les dispositions qui ne le placent pas.
 *
 * Sur le cercle il va au **centre** : l'ancrage fixe en haut (440, 28) tombait à
 * 2 px du premier nœud, dont l'étiquette recouvrait la pastille (constat D4).
 * Le centre est libre par construction — toutes les espèces sont sur l'anneau.
 */
export function computeEnvAnchor(layoutKind, { width = 880, height = 560 } = {}) {
  if (layoutKind === 'circle') return { x: width / 2, y: height / 2 };
  return { x: width / 2, y: 28 };
}
