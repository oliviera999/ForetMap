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
 * (MIT, https://github.com/Leaflet/Leaflet.markercluster) — ici réécrit en quelques dizaines de
 * lignes, sans quadtree ni animation.
 *
 * **Seconde passe — séparation** (audit UI/UX du 19/11/2026, lot I). La grille seule laisse
 * passer un défaut : deux repères voisins rangés dans deux cellules différentes ne sont jamais
 * comparés. Un repère laissé seul pouvait donc tomber **sous** la pastille du groupe d'à côté
 * (relevé sur la Visite de la forêt, téléphone : repère à 25 px du centre d'une pastille de
 * 56 × 44 px — le doigt ouvrait la pastille, jamais la fiche). Après la grille, on fusionne
 * donc de proche en proche tout ce qui se recouvre encore, en pixels écran et avec la taille
 * **rendue** des cibles (`clusterSeparationPx`), jusqu'à ce que plus rien ne se gêne.
 *
 * Aucun état, aucun DOM : le produit décide de ce qu'il dessine et de ce que fait un tap.
 */

/** Côté d'une cellule de grille, en pixels écran (≈ une cible tactile). */
export const CLUSTER_CELL_PX_DEFAULT = 44;

/**
 * Demi-côté de la cible tactile d'un repère seul, en pixels écran (`.fm-pct-marker` : un carré
 * de `--tap-target`, 44 px, quel que soit le pointeur — la taille ne dépend pas de
 * `pointer: coarse`).
 */
export const CLUSTER_MARKER_RADIUS_PX_DEFAULT = 22;

/** Demi-hauteur d'une pastille de groupe (`.fm-pct-cluster`, `min-height: --tap-target`). */
export const CLUSTER_PILL_HALF_HEIGHT_PX = 22;

/** Marge intérieure d'une pastille de groupe, bordure comprise (`padding: 0 10px` + 2 px). */
export const CLUSTER_PILL_INSET_PX = 12;

/**
 * Demi-largeur rendue d'une pastille de groupe, en pixels écran. La pilule porte un emoji et
 * un compteur : bordure 2 × 2 px, marges 2 × 10 px, écart 4 px, emoji ≈ 20 px, ≈ 9 px par
 * chiffre (mesuré : 55 à 56 px pour un chiffre) ; jamais moins qu'une cible tactile.
 * @param {number} count nombre de repères du groupe.
 */
export function clusterPillRadiusPx(count) {
  const digits = String(Math.max(Math.round(toFinite(count, 2)), 2)).length;
  return Math.max(CLUSTER_PILL_HALF_HEIGHT_PX, (47 + 9 * digits) / 2);
}

/**
 * Écart minimal, en pixels écran, entre les centres de deux éléments rendus (repère seul ou
 * pastille) pour qu'aucun ne prenne le toucher de l'autre. En dessous, on les fusionne.
 *
 * - **repère seul / pastille** : rayon de la pastille + rayon du repère — la cible du repère
 *   ne passe plus sous la pilule (opaque, elle masquait aussi l'emoji) ;
 * - **deux repères seuls** : la diagonale d'une demi-cible — le centre de l'un n'est jamais
 *   dans le carré de touche de l'autre ;
 * - **deux pastilles** : la somme de leurs rayons moins leur marge intérieure — deux pilules
 *   peuvent se frôler par leurs bords vides, jamais se couvrir l'emoji ou le compteur ; et au
 *   moins la demi-diagonale de la plus large, pour que le centre de l'une ne soit jamais sous
 *   l'autre.
 *
 * Distance euclidienne, et non un test de boîtes : les cibles restent droites à l'écran quand
 * la carte est orientée (`--pct-orient`), le calcul ne doit pas dépendre de l'angle.
 *
 * @param {number} countA taille du premier élément (1 = repère seul).
 * @param {number} countB taille du second.
 * @param {{ markerRadiusPx?: number, pillRadiusPx?: (count: number) => number }} [sizes]
 */
export function clusterSeparationPx(countA, countB, sizes = {}) {
  const markerRadius = toFinite(sizes.markerRadiusPx, CLUSTER_MARKER_RADIUS_PX_DEFAULT);
  const pillRadius =
    typeof sizes.pillRadiusPx === 'function' ? sizes.pillRadiusPx : clusterPillRadiusPx;
  const aIsPill = countA > 1;
  const bIsPill = countB > 1;
  if (!aIsPill && !bIsPill) return markerRadius * Math.SQRT2;
  if (aIsPill && bIsPill) {
    const radiusA = toFinite(pillRadius(countA));
    const radiusB = toFinite(pillRadius(countB));
    return Math.max(
      Math.hypot(Math.max(radiusA, radiusB), CLUSTER_PILL_HALF_HEIGHT_PX),
      radiusA + radiusB - CLUSTER_PILL_INSET_PX,
    );
  }
  return toFinite(pillRadius(aIsPill ? countA : countB)) + markerRadius;
}

/** Au-delà de cette échelle relative à l'ajustement, plus aucun regroupement. */
export const CLUSTER_DISABLE_ABOVE_FIT_SCALE = 4;

function toFinite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Rang d'un lieu **mis en avant** (`map_highlight`, plan e-nov) : devant toute catégorie.
 * Fini (et non `-Infinity`) pour rester comparable et sérialisable.
 */
export const HIGHLIGHT_PRIORITY = -1e9;

/**
 * Rang de priorité d'un repère : plus **petit** = plus important (on garde `sort_order` des
 * catégories, déjà utilisé pour l'ordre d'affichage ; pas de nouveau champ à saisir).
 * Un repère sans catégorie prend la priorité la plus basse.
 */
export function markerPriority(marker, categoriesById) {
  // Lieu mis en avant (plan e-nov) : il mène son groupe, quel que soit son ordre de catégorie.
  if (marker?.map_highlight === true) return HIGHLIGHT_PRIORITY;
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

/** Centre (moyenne des membres) d'un groupe en construction, en % et en pixels écran. */
function placeGroup(group, pxPerPctX, pxPerPctY) {
  let sumX = 0;
  let sumY = 0;
  for (const { xPct, yPct } of group.members) {
    sumX += xPct;
    sumY += yPct;
  }
  group.xPx = (sumX / group.members.length) * pxPerPctX;
  group.yPx = (sumY / group.members.length) * pxPerPctY;
  return group;
}

/**
 * Seconde passe : tant que deux éléments sont plus proches que `clusterSeparationPx`, on
 * fusionne la paire **la plus en défaut** (rapport distance / écart requis le plus petit ; à
 * égalité, la première dans l'ordre d'entrée — jamais un tirage, sinon les pastilles sautent
 * d'un rendu à l'autre). Chaque fusion retire un élément : la boucle termine toujours. Le
 * centre d'un groupe bouge quand il grossit, d'où la reprise complète après chaque fusion.
 */
function separateGroups(groups, pxPerPctX, pxPerPctY, sizes) {
  let total = 0;
  for (const group of groups) {
    placeGroup(group, pxPerPctX, pxPerPctY);
    total += group.members.length;
  }
  // Aucun écart requis ne dépasse celui des plus grosses pastilles possibles : deux éléments
  // plus éloignés que cette borne ne se gênent jamais. Elle sert de pas à une grille de
  // voisinage, pour ne comparer que des éléments proches (coût linéaire par reprise, au lieu
  // de toutes les paires — sensible sur un plan de plusieurs centaines de repères).
  const reach = Math.max(
    clusterSeparationPx(1, 1, sizes),
    clusterSeparationPx(1, total, sizes),
    clusterSeparationPx(total, total, sizes),
  );
  if (!(reach > 0)) return groups;
  for (;;) {
    const cells = new Map();
    for (let index = 0; index < groups.length; index += 1) {
      const group = groups[index];
      group.cx = Math.floor(group.xPx / reach);
      group.cy = Math.floor(group.yPx / reach);
      const key = `${group.cx}:${group.cy}`;
      const cellMembers = cells.get(key);
      if (cellMembers) cellMembers.push(index);
      else cells.set(key, [index]);
    }
    let bestA = -1;
    let bestB = -1;
    let bestRatio = 1;
    for (let a = 0; a < groups.length; a += 1) {
      const groupA = groups[a];
      for (let dx = -1; dx <= 1; dx += 1) {
        for (let dy = -1; dy <= 1; dy += 1) {
          for (const b of cells.get(`${groupA.cx + dx}:${groupA.cy + dy}`) || []) {
            if (b <= a) continue;
            const groupB = groups[b];
            const need = clusterSeparationPx(groupA.members.length, groupB.members.length, sizes);
            if (!(need > 0)) continue;
            const ratio = Math.hypot(groupA.xPx - groupB.xPx, groupA.yPx - groupB.yPx) / need;
            if (
              ratio < bestRatio ||
              (ratio === bestRatio && bestA >= 0 && (a < bestA || (a === bestA && b < bestB)))
            ) {
              bestRatio = ratio;
              bestA = a;
              bestB = b;
            }
          }
        }
      }
    }
    if (bestA < 0) return groups;
    const merged = groups[bestA];
    merged.members = merged.members
      .concat(groups[bestB].members)
      .sort((m1, m2) => m1.order - m2.order);
    groups.splice(bestB, 1);
    placeGroup(merged, pxPerPctX, pxPerPctY);
  }
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
 * @param {number} [options.markerRadiusPx=22] demi-côté de la cible d'un repère seul, px écran.
 * @param {(count: number) => number} [options.pillRadiusPx] demi-largeur d'une pastille de
 *   groupe selon son compteur, px écran (défaut : `clusterPillRadiusPx`).
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
    keepApartId = '',
    markerRadiusPx = CLUSTER_MARKER_RADIUS_PX_DEFAULT,
    pillRadiusPx = clusterPillRadiusPx,
  } = options;
  const all = (markers || []).filter(
    (m) => m && Number.isFinite(Number(m.x_pct)) && Number.isFinite(Number(m.y_pct)),
  );
  /**
   * Le repère mis en avant (fiche ouverte, lieu visé) ne se fond jamais dans un groupe : sa
   * fiche parlait sinon d'un lieu que **rien** sur la carte ne montrait
   * (`docs/AUDIT_PLAN_NAVIGATION_2026-09-16-bis.md` G3).
   */
  const apartKey = String(keepApartId || '');
  /**
   * Les repères **mis en avant** (`map_highlight`, plan e-nov) ne se fondent pas non plus :
   * tout l'objet de ce plan est qu'on les repère au premier coup d'œil, dès la vue
   * d'ensemble — fondus dans une pastille chiffrée, ils disparaîtraient justement là.
   */
  const isApart = (m) => (apartKey && String(m.id) === apartKey) || m.map_highlight === true;
  const apart = all.filter(isApart);
  const list = apart.length > 0 ? all.filter((m) => !isApart(m)) : all;
  const width = toFinite(contentWidthPx);
  const height = toFinite(contentHeightPx);
  const s = toFinite(scale, 1);
  const cell = toFinite(cellPx, CLUSTER_CELL_PX_DEFAULT);
  // Sans mesure exploitable, ou regroupement coupé : un groupe par repère (rendu inchangé).
  if (!enabled || !(width > 0) || !(height > 0) || !(s > 0) || !(cell > 0)) {
    return all.map((marker) => singleton(marker, categoriesById));
  }

  const pxPerPctX = (width * s) / 100;
  const pxPerPctY = (height * s) / 100;
  const buckets = new Map();
  let order = 0;
  for (const marker of list) {
    const xPct = Number(marker.x_pct);
    const yPct = Number(marker.y_pct);
    const xPx = xPct * pxPerPctX;
    const yPx = yPct * pxPerPctY;
    const key = `${Math.floor(xPx / cell)}:${Math.floor(yPx / cell)}`;
    const entry = {
      marker,
      xPct,
      yPct,
      order,
      priority: markerPriority(marker, categoriesById),
    };
    order += 1;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(entry);
    else buckets.set(key, [entry]);
  }

  // Seconde passe : ce que la grille a laissé se recouvrir d'une cellule à l'autre.
  const groups = separateGroups(
    Array.from(buckets.values(), (members) => ({ members })),
    pxPerPctX,
    pxPerPctY,
    { markerRadiusPx, pillRadiusPx },
  );

  const clusters = [];
  for (const { members } of groups) {
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
  const byPosition = (a, b) => a.y_pct - b.y_pct || a.x_pct - b.x_pct;
  clusters.sort(byPosition);
  // Les repères mis à part ne fusionnent pas : ils peuvent donc se trouver sur une pastille.
  // Rendus **en dernier**, ils sont peints au-dessus d'elle et gardent le toucher en leur
  // centre (fiche ouverte, lieu mis en avant du plan e-nov).
  const apartClusters = apart.map((marker) => singleton(marker, categoriesById));
  apartClusters.sort(byPosition);
  return clusters.concat(apartClusters);
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
