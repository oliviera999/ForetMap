/**
 * Regroupement des repères au dézoom — noyau carte partagé (lot 5 du plan de convergence,
 * `docs/AUDIT_PLAN_LYAUTEY_2026-09.md` §8.3).
 *
 * Problème : le plan de Lyautey porte de nombreux repères fortement superposés. Au dézoom,
 * ils forment un tas d'emojis où un doigt ouvre presque toujours le mauvais lieu. Le même
 * défaut est relevé sur la carte de travail ForetMap (audit d'homogénéité, E4 / D2) et sur
 * les plateaux G&L denses.
 *
 * Méthode : **grille en pixels écran**. Les repères sont projetés à l'échelle courante, puis
 * rangés dans des cellules d'environ une cible tactile (44 px) ; toute cellule qui contient
 * plus d'un repère devient un groupe. C'est l'algorithme le plus simple qui tienne : pur,
 * sans dépendance, linéaire, stable d'un rendu à l'autre (pas de k-means qui « saute »), et
 * testable sans rendu. Inspiration : le regroupement par grille de Leaflet.markercluster
 * (MIT, https://github.com/Leaflet/Leaflet.markercluster) — ici réécrit en une trentaine de
 * lignes, sans quadtree ni animation.
 *
 * Aucun état, aucun DOM : le produit décide de ce qu'il dessine et de ce que fait un tap.
 */

/** Côté d'une cellule de grille, en pixels écran (≈ une cible tactile). */
export const CLUSTER_CELL_PX_DEFAULT = 44;

/** Au-delà de cette échelle relative à l'ajustement, plus aucun regroupement. */
export const CLUSTER_DISABLE_ABOVE_FIT_SCALE = 4;

function toFinite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Rang de priorité d'un repère : plus **petit** = plus important (on garde `sort_order` des
 * catégories, déjà utilisé pour l'ordre d'affichage ; pas de nouveau champ à saisir).
 * Un repère sans catégorie prend la priorité la plus basse.
 */
export function markerPriority(marker, categoriesById) {
  const ids = marker?.category_ids || [];
  let best = Number.POSITIVE_INFINITY;
  for (const id of ids) {
    const category = categoriesById?.get?.(String(id));
    if (!category) continue;
    const rank = toFinite(category.sort_order, Number.POSITIVE_INFINITY);
    if (rank < best) best = rank;
  }
  return best;
}

/**
 * Repère représentatif d'un groupe : le plus prioritaire, puis le premier venu (ordre stable
 * de la liste d'entrée) — jamais un tirage au sort, sinon la pastille change à chaque rendu.
 */
function pickLead(members) {
  let lead = members[0];
  for (const member of members) {
    if (member.priority < lead.priority) lead = member;
  }
  return lead;
}

/**
 * Regroupe des repères posés en pourcentage de l'image.
 *
 * @param {Array<object>} markers repères `{ id, x_pct, y_pct, emoji, label, category_ids }`.
 * @param {object} options
 * @param {number} options.contentWidthPx largeur du contenu (rectangle image) en px, à l'échelle 1.
 * @param {number} options.contentHeightPx hauteur du contenu en px, à l'échelle 1.
 * @param {number} options.scale échelle courante de la vue.
 * @param {number} [options.cellPx=44] côté d'une cellule, en px écran.
 * @param {Map<string, object>} [options.categoriesById] catalogue des catégories (priorités).
 * @param {boolean} [options.enabled=true] regroupement actif (barre d'outils ForetMap).
 * @returns {Array<{ id: string, x_pct: number, y_pct: number, count: number, lead: object,
 *   markers: Array<object>, bounds: { minXPct: number, minYPct: number, maxXPct: number,
 *   maxYPct: number } }>} groupes (un repère seul donne un groupe de taille 1).
 */
export function clusterMarkers(markers, options = {}) {
  const {
    contentWidthPx = 0,
    contentHeightPx = 0,
    scale = 1,
    cellPx = CLUSTER_CELL_PX_DEFAULT,
    categoriesById = null,
    enabled = true,
  } = options;
  const list = (markers || []).filter(
    (m) => m && Number.isFinite(Number(m.x_pct)) && Number.isFinite(Number(m.y_pct)),
  );
  const width = toFinite(contentWidthPx);
  const height = toFinite(contentHeightPx);
  const s = toFinite(scale, 1);
  const cell = toFinite(cellPx, CLUSTER_CELL_PX_DEFAULT);
  // Sans mesure exploitable, ou regroupement coupé : un groupe par repère (rendu inchangé).
  if (!enabled || !(width > 0) || !(height > 0) || !(s > 0) || !(cell > 0)) {
    return list.map((marker) => singleton(marker, categoriesById));
  }

  const buckets = new Map();
  for (const marker of list) {
    const xPct = Number(marker.x_pct);
    const yPct = Number(marker.y_pct);
    const xPx = (xPct / 100) * width * s;
    const yPx = (yPct / 100) * height * s;
    const key = `${Math.floor(xPx / cell)}:${Math.floor(yPx / cell)}`;
    const entry = { marker, xPct, yPct, priority: markerPriority(marker, categoriesById) };
    const bucket = buckets.get(key);
    if (bucket) bucket.push(entry);
    else buckets.set(key, [entry]);
  }

  const clusters = [];
  for (const members of buckets.values()) {
    if (members.length === 1) {
      clusters.push(singleton(members[0].marker, categoriesById));
      continue;
    }
    const lead = pickLead(members);
    let sumX = 0;
    let sumY = 0;
    let minXPct = Infinity;
    let minYPct = Infinity;
    let maxXPct = -Infinity;
    let maxYPct = -Infinity;
    for (const { xPct, yPct } of members) {
      sumX += xPct;
      sumY += yPct;
      if (xPct < minXPct) minXPct = xPct;
      if (yPct < minYPct) minYPct = yPct;
      if (xPct > maxXPct) maxXPct = xPct;
      if (yPct > maxYPct) maxYPct = yPct;
    }
    clusters.push({
      id: `cluster:${lead.marker.id}:${members.length}`,
      x_pct: sumX / members.length,
      y_pct: sumY / members.length,
      count: members.length,
      lead: lead.marker,
      markers: members.map((m) => m.marker),
      bounds: { minXPct, minYPct, maxXPct, maxYPct },
    });
  }
  // Ordre stable : de haut en bas puis de gauche à droite (les clés de `Map` suivent l'ordre
  // d'insertion, donc l'ordre d'entrée ; on impose un ordre géométrique pour le rendu).
  clusters.sort((a, b) => a.y_pct - b.y_pct || a.x_pct - b.x_pct);
  return clusters;
}

function singleton(marker, categoriesById) {
  const xPct = Number(marker.x_pct);
  const yPct = Number(marker.y_pct);
  return {
    id: String(marker.id),
    x_pct: xPct,
    y_pct: yPct,
    count: 1,
    lead: marker,
    markers: [marker],
    bounds: { minXPct: xPct, minYPct: yPct, maxXPct: xPct, maxYPct: yPct },
    priority: markerPriority(marker, categoriesById),
  };
}

/**
 * Un groupe se sépare-t-il si l'on zoome ? Vrai dès que ses repères ne sont pas au même
 * endroit : le produit peut alors zoomer sur son enveloppe plutôt que d'ouvrir une liste.
 * @param {{ bounds: object, count: number }} cluster
 * @param {number} [epsilonPct=0.05] écart en dessous duquel deux repères sont « au même point ».
 */
export function clusterSeparatesOnZoom(cluster, epsilonPct = 0.05) {
  if (!cluster || cluster.count < 2) return false;
  const { minXPct, minYPct, maxXPct, maxYPct } = cluster.bounds || {};
  return maxXPct - minXPct > epsilonPct || maxYPct - minYPct > epsilonPct;
}

/**
 * Échelle à viser pour que l'enveloppe d'un groupe occupe le cadre (avec une marge), bornée
 * par le produit. Sert au « tap sur un groupe → zoom animé sur son enveloppe ».
 *
 * @param {{ bounds: object }} cluster
 * @param {{ stageWidthPx: number, stageHeightPx: number, contentWidthPx: number,
 *   contentHeightPx: number, marginRatio?: number, maxScale?: number }} view
 * @returns {number} échelle cible (jamais inférieure à 1e-3).
 */
export function clusterZoomTargetScale(cluster, view = {}) {
  const {
    stageWidthPx = 0,
    stageHeightPx = 0,
    contentWidthPx = 0,
    contentHeightPx = 0,
    marginRatio = 0.6,
    maxScale = 8,
  } = view;
  const b = cluster?.bounds;
  if (!b || !(contentWidthPx > 0) || !(contentHeightPx > 0)) return 1;
  const spanXPx = Math.max(((b.maxXPct - b.minXPct) / 100) * contentWidthPx, 1);
  const spanYPx = Math.max(((b.maxYPct - b.minYPct) / 100) * contentHeightPx, 1);
  const usableW = toFinite(stageWidthPx) * marginRatio;
  const usableH = toFinite(stageHeightPx) * marginRatio;
  if (!(usableW > 0) || !(usableH > 0)) return 1;
  const target = Math.min(usableW / spanXPx, usableH / spanYPx);
  return Math.max(1e-3, Math.min(toFinite(maxScale, 8), target));
}

/** Centre de l'enveloppe d'un groupe, en pourcentage (cible de `focusOnPct`). */
export function clusterCenterPct(cluster) {
  const b = cluster?.bounds;
  if (!b) return { xp: 0, yp: 0 };
  return { xp: (b.minXPct + b.maxXPct) / 2, yp: (b.minYPct + b.maxYPct) / 2 };
}
