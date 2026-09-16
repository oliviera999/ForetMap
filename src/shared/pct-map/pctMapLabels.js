/**
 * Placement des étiquettes d'une carte « % image » — module pur (noyau carte partagé).
 *
 * Réponse aux constats B1, B2 et B4 de `docs/AUDIT_PLAN_AFFICHAGE_2026-09.md` : sur le plan de
 * Lyautey, 11 noms de zone sur 28 se recouvraient à l'ouverture, deux étaient posés hors de
 * leur propre polygone, et aucun nom de repère n'apparaissait avant un zoom ×3,2.
 *
 * Méthode, celle des moteurs cartographiques : **aucun seuil arbitraire**. Toute étiquette est
 * candidate à toute échelle ; c'est le placement glouton par priorité
 * (`mapOverlayLabelCollision.js`) qui tranche. Comme les boîtes sont mesurées en pixels
 * **écran** et que les étiquettes gardent une taille constante à l'écran (contre-échelle côté
 * CSS), zoomer écarte les ancres sans grossir les boîtes : les étiquettes masquées
 * réapparaissent d'elles-mêmes.
 *
 * Priorité : rang de catégorie (`sort_order`, plus petit = plus important), les lieux sans
 * catégorie prenant un rang intermédiaire plutôt que le dernier — sans quoi, en production,
 * 17 repères sur 20 (aucune catégorie) passaient systématiquement après tout le reste. Ce rang
 * intermédiaire est **calculé sur les catégories présentes** (médiane) et non fixé en dur :
 * une constante ne reste intermédiaire que pour une échelle de numérotation donnée
 * (`defaultLabelPriority`, audit du 13 septembre N2). À rang égal, la plus grande zone gagne ;
 * le lieu sélectionné passe avant tout le monde.
 *
 * Aucun DOM, aucun état : testable en environnement node.
 */
import { estimateLabelBox, resolveLabelCollisions } from './mapOverlayLabelCollision.js';
import { rotatePointAround } from './pctMapOrientation.js';
import { parsePctPolygonPoints } from './pctPolygon.js';
import { polygonPoleOfInaccessibilityPct } from './pctPolylabel.js';

/**
 * Rang de repli d'un lieu sans catégorie, quand aucune catégorie n'est connue.
 *
 * **Ne pas s'en servir comme rang « intermédiaire » en dur** : il l'était quand les catégories
 * valaient 10, 100… ; il ne l'est plus depuis qu'elles sont numérotées 0, 1, 2, 3…
 * (`docs/AUDIT_PLAN_AFFICHAGE_2026-09-13.md` N2 : les cinq entrées du lycée, sans catégorie,
 * se retrouvaient **derrière les neuf catégories réelles**, donc derrière les tables d'échecs).
 * Le rang intermédiaire réel se calcule sur les catégories présentes :
 * `defaultLabelPriority()`.
 */
export const DEFAULT_LABEL_PRIORITY = 50;

/** Taille de police des étiquettes, en pixels **écran** (constante quel que soit le zoom). */
export const LABEL_FONT_SIZE_PX = 12;

/** Taille des emojis d'étiquette (zones et repères), en pixels **écran**. */
export const LABEL_EMOJI_SIZE_PX = 16;

/**
 * Largeur minimale d'un nom de zone : en dessous, le nom serait illisible plutôt que court.
 *
 * Portée de 56 à 96 px (≈ 9 → ≈ 16 caractères à 12 px) : à 56 px, des noms pourtant courts
 * étaient rendus en moignons dès le cadrage d'ouverture — « Cour du lycée » en
 * « Cour du… », « Bât.D — collège » en « Bât.D… », 14 étiquettes sur 43 tronquées en
 * production (`docs/AUDIT_PLAN_NAVIGATION_UX_2026-09-16.md` N11). Le moteur de collisions
 * lit cette largeur : une étiquette qui ne tient plus est **masquée** plutôt que tronquée, et
 * revient au zoom. Mieux vaut moins de noms, tous lisibles, que beaucoup de moignons.
 */
export const ZONE_LABEL_MIN_WIDTH_PX = 96;

/**
 * Lignes autorisées pour un nom de zone. Le nom se replie plutôt que de finir en moignon :
 * « Cour du lycée », « Salle Delacroix » ou « Potager du bâtiment M » ne tiennent pas sur une
 * ligne de 96 px, mais tiennent sur deux. Au-delà de deux lignes, l'étiquette mangerait le
 * plan : les noms plus longs restent tronqués (N11 de l'audit navigation).
 */
export const ZONE_LABEL_MAX_LINES = 2;

/** Largeur maximale d'un nom de zone (au-delà, troncature avec points de suspension). */
export const ZONE_LABEL_MAX_WIDTH_PX = 168;

/** Largeur maximale du nom d'un repère. */
export const MARKER_LABEL_MAX_WIDTH_PX = 132;

/** Écart vertical entre le point d'un repère et le centre de son étiquette (px écran). */
export const MARKER_LABEL_OFFSET_PX = 26;

function toFinite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Clé d'étiquette, préfixée par le type : une zone et un repère peuvent porter le même id. */
export function labelKey(kind, id) {
  return `${kind}:${id}`;
}

/**
 * Rang à donner à un lieu **sans catégorie**, calculé sur les catégories réellement présentes.
 *
 * Pourquoi pas une constante : la valeur d'un `sort_order` n'a pas de sens absolu, seulement un
 * sens **relatif aux autres catégories**. Un lieu sans catégorie doit passer au milieu du
 * peloton, quelle que soit l'échelle de numérotation choisie par l'établissement — qu'elle
 * aille de 0 à 14 (production, septembre 2026) ou de 10 à 100 (production, 2025). Une constante
 * ne peut pas tenir cette promesse : à 50, elle est intermédiaire dans le second cas et
 * **dernière** dans le premier, ce qui reléguait les cinq entrées du lycée derrière les tables
 * d'échecs (N2).
 *
 * Valeur retenue : **à mi-chemin entre le rang médian et le rang distinct suivant**. Deux
 * propriétés en découlent, et ce sont elles qui comptent :
 * - le résultat est **strictement supérieur** à la médiane, donc à rang nominal égal une
 *   catégorie réelle l'emporte toujours — avoir une catégorie est une information, ne pas en
 *   avoir est une absence d'information, et l'égalité serait tranchée par l'ordre d'itération ;
 * - il reste **strictement inférieur** au rang suivant, donc le lieu sans catégorie garde bien
 *   la moitié basse du classement devant lui et la moitié haute derrière.
 *
 * @param {Map<string, { sort_order?: number }>|null} categoriesById
 * @returns {number} rang intermédiaire, ou {@link DEFAULT_LABEL_PRIORITY} sans catégorie connue.
 */
export function defaultLabelPriority(categoriesById) {
  const ranks = [];
  for (const category of categoriesById?.values?.() || []) {
    const rank = Number(category?.sort_order);
    if (Number.isFinite(rank)) ranks.push(rank);
  }
  if (!ranks.length) return DEFAULT_LABEL_PRIORITY;
  ranks.sort((a, b) => a - b);
  const median = ranks[(ranks.length - 1) >> 1];
  // Rang distinct immédiatement supérieur ; s'il n'y en a pas (médiane = maximum), on s'écarte
  // d'un cran pour rester strictement au-delà sans franchir de catégorie.
  const next = ranks.find((rank) => rank > median);
  return (median + (next === undefined ? median + 1 : next)) / 2;
}

/**
 * Rang de catégorie d'un lieu : le plus petit `sort_order` de ses catégories, ou
 * `fallback` s'il n'en a aucune (connue).
 * @param {{ category_ids?: Array<string> }} place
 * @param {Map<string, { sort_order?: number }>|null} categoriesById
 * @param {number} [fallback]
 */
export function labelPriority(place, categoriesById, fallback = DEFAULT_LABEL_PRIORITY) {
  let best = Number.POSITIVE_INFINITY;
  for (const id of place?.category_ids || []) {
    const rank = toFinite(categoriesById?.get?.(String(id))?.sort_order, Number.POSITIVE_INFINITY);
    if (rank < best) best = rank;
  }
  return Number.isFinite(best) ? best : fallback;
}

/** Aire d'un polygone en unités de pourcentage (formule du lacet), toujours positive. */
export function polygonAreaPct(points) {
  const pts = points || [];
  if (pts.length < 3) return 0;
  let sum = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    sum += pts[j].xp * pts[i].yp - pts[i].xp * pts[j].yp;
  }
  return Math.abs(sum / 2);
}

/**
 * Pré-calcul par zone, indépendant du zoom (à mémoïser sur la liste des zones) : ancre de
 * l'étiquette au **pôle d'inaccessibilité** — le centroïde arithmétique tombe hors du polygone
 * sur un bâtiment en L ou en U (B2) —, emoji séparé du nom (B3), aire et emprise.
 *
 * @param {Array<object>} zones zones `{ id, name, emoji, points, category_ids }`.
 * @param {(name: string) => { emoji: string, name: string }} splitEmoji séparation emoji / nom.
 * @returns {Array<object>} specs `{ zone, id, key, emoji, name, anchor, areaPct, bounds }`.
 */
export function buildZoneLabelSpecs(zones, splitEmoji) {
  const specs = [];
  for (const zone of zones || []) {
    const points = parsePctPolygonPoints(zone.points);
    if (points.length < 3) continue;
    const split = splitEmoji(String(zone.name || ''));
    const name = String(split?.name || '').trim();
    const emoji = String(zone.emoji || '').trim() || String(split?.emoji || '').trim();
    if (!name && !emoji) continue;
    const xs = points.map((p) => p.xp);
    const ys = points.map((p) => p.yp);
    specs.push({
      zone,
      id: String(zone.id),
      key: labelKey('zone', zone.id),
      emoji,
      name,
      anchor: polygonPoleOfInaccessibilityPct(points) || {
        xp: xs.reduce((s, v) => s + v, 0) / xs.length,
        yp: ys.reduce((s, v) => s + v, 0) / ys.length,
      },
      areaPct: polygonAreaPct(points),
      bounds: {
        minXPct: Math.min(...xs),
        maxXPct: Math.max(...xs),
        minYPct: Math.min(...ys),
        maxYPct: Math.max(...ys),
      },
    });
  }
  return specs;
}

/**
 * Largeur allouée au nom d'une zone, en pixels écran : celle de son polygone, bornée — un nom
 * plus large que son bâtiment recouvre les voisins (B1 : jusqu'à ×19,5 en production), un nom
 * réduit à quelques pixels ne se lit pas.
 */
export function zoneLabelMaxWidthPx(spec, contentWidthPx, scale) {
  const bounds = spec?.bounds;
  if (!bounds) return ZONE_LABEL_MIN_WIDTH_PX;
  const widthPx =
    ((toFinite(bounds.maxXPct) - toFinite(bounds.minXPct)) / 100) *
    toFinite(contentWidthPx) *
    toFinite(scale, 1);
  return Math.max(ZONE_LABEL_MIN_WIDTH_PX, Math.min(ZONE_LABEL_MAX_WIDTH_PX, widthPx));
}

/**
 * Étiquettes réellement affichables à l'échelle courante.
 *
 * @param {object} params
 * @param {Array<object>} params.zoneSpecs sortie de `buildZoneLabelSpecs`.
 * @param {Array<object>} params.markers repères `{ id, x_pct, y_pct, label, category_ids }`.
 * @param {Map<string, object>|null} [params.categoriesById]
 * @param {number} params.contentWidthPx largeur du rectangle image à l'échelle 1.
 * @param {number} params.contentHeightPx hauteur du rectangle image à l'échelle 1.
 * @param {number} params.scale échelle courante.
 * @param {string} [params.pinnedKey] étiquette toujours gardée (`labelKey` du lieu sélectionné).
 * @param {number} [params.fontSizePx]
 * @param {number} [params.orientationDeg=0] rotation du calque carte (« cap en haut »), en
 *   degrés CSS. Les étiquettes étant **contre-tournées** pour rester lisibles, leurs boîtes
 *   restent alignées sur l'écran alors que leurs ancres, elles, tournent : il faut donc
 *   tourner les ancres ici, sans quoi deux noms qui ne se gênent pas à 0° se recouvrent à 45°
 *   (`docs/AUDIT_PLAN_AFFICHAGE_2026-09-13.md` N1).
 * @param {{ xp?: number, yp?: number }|null} [params.orientOriginPct] pivot de cette rotation,
 *   en % du contenu (défaut : centre, comme `mapOrientationStyle`).
 * @returns {Set<string>} clés (`zone:<id>` / `marker:<id>`) des étiquettes à afficher.
 */
export function resolveVisibleLabels({
  zoneSpecs,
  markers,
  categoriesById = null,
  contentWidthPx,
  contentHeightPx,
  scale,
  pinnedKey = '',
  fontSizePx = LABEL_FONT_SIZE_PX,
  orientationDeg = 0,
  orientOriginPct = null,
}) {
  const width = toFinite(contentWidthPx);
  const height = toFinite(contentHeightPx);
  const s = toFinite(scale, 1);
  if (!(width > 0) || !(height > 0) || !(s > 0)) return new Set();

  // Position d'une ancre en pixels **écran**, rotation de la carte comprise. Une mise à
  // l'échelle uniforme commute avec une rotation : tourner après mise à l'échelle donne la
  // même géométrie relative que le CSS, qui tourne avant.
  const deg = toFinite(orientationDeg, 0);
  const rotates = Math.abs(deg) > 1e-6;
  const originXpx = (toFinite(orientOriginPct?.xp, 50) / 100) * width * s;
  const originYpx = (toFinite(orientOriginPct?.yp, 50) / 100) * height * s;
  const anchorPx = (xPct, yPct) => {
    const x = (toFinite(xPct) / 100) * width * s;
    const y = (toFinite(yPct) / 100) * height * s;
    return rotates ? rotatePointAround(x, y, originXpx, originYpx, deg) : { x, y };
  };

  const fallbackPriority = defaultLabelPriority(categoriesById);
  const candidates = [];
  for (const spec of zoneSpecs || []) {
    if (!spec.name) continue;
    const maxWidth = zoneLabelMaxWidthPx(spec, width, s);
    const at = anchorPx(spec.anchor.xp, spec.anchor.yp);
    candidates.push({
      id: spec.key,
      priority: labelPriority(spec.zone, categoriesById, fallbackPriority),
      weight: spec.areaPct,
      pinned: spec.key === pinnedKey,
      box: estimateLabelBox({
        x: at.x,
        y: at.y,
        text: spec.name,
        fontSizePx,
        maxWidthPx: maxWidth,
        maxLines: ZONE_LABEL_MAX_LINES,
      }),
    });
  }
  for (const marker of markers || []) {
    const text = String(marker?.label ?? marker?.name ?? '').trim();
    const xPct = Number(marker?.x_pct);
    const yPct = Number(marker?.y_pct);
    if (!text || !Number.isFinite(xPct) || !Number.isFinite(yPct)) continue;
    const key = labelKey('marker', marker.id);
    const at = anchorPx(xPct, yPct);
    candidates.push({
      id: key,
      priority: labelPriority(marker, categoriesById, fallbackPriority),
      // Un repère n'a pas d'aire : à rang égal il passe après les zones, dont l'étiquette
      // nomme une surface déjà visible à l'écran.
      weight: 0,
      pinned: key === pinnedKey,
      box: estimateLabelBox({
        x: at.x,
        // L'écart au point est **vertical à l'écran** : l'étiquette étant contre-tournée,
        // il s'ajoute après la rotation de l'ancre, jamais avant.
        y: at.y + MARKER_LABEL_OFFSET_PX,
        text,
        fontSizePx,
        maxWidthPx: MARKER_LABEL_MAX_WIDTH_PX,
      }),
    });
  }
  return resolveLabelCollisions(candidates);
}
