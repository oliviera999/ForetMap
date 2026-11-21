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
 * Emoji et nom d'une zone (`docs/AUDIT_ETIQUETTES_ZONES_2026-09-29.md`) : l'**emoji** est
 * centré sur l'ancre, le **nom** posé dessous. Les deux sont candidats, emojis d'abord (petits,
 * lisibles à toute échelle), et chacun réserve la place qu'il occupe réellement à l'écran. Un
 * nom n'apparaît jamais sans l'emoji de sa zone : il flotterait sous une place vide.
 *
 * Aucun DOM, aucun état : testable en environnement node.
 */
import {
  boxesOverlap,
  estimateGlyphBox,
  estimateLabelBox,
  estimateTextWidthPx,
  LABEL_LINE_HEIGHT_RATIO,
  orderLabelCandidates,
  unbrokenTextWidthPx,
} from './mapOverlayLabelCollision.js';
import { rotatePointAround } from './pctMapOrientation.js';
import { parsePctPolygonPoints } from './pctPolygon.js';
import { polygonLabelAnchorsPct, polygonPoleOfInaccessibilityPct } from './pctPolylabel.js';

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

/** Lignes autorisées pour le nom d'un repère replié aux espaces (`wrapNamesAtSpaces`). */
export const MARKER_LABEL_MAX_LINES = 2;

/**
 * Largeur du nom d'un repère replié aux espaces : sa largeur naturelle s'il tient sur une
 * ligne de {@link MARKER_LABEL_MAX_WIDTH_PX}, sinon de quoi tenir sur deux lignes sans couper de
 * mot, dans la limite de {@link ZONE_LABEL_MAX_WIDTH_PX}.
 *
 * Pourquoi : sur une ligne de 132 px, « Butte Erosion », « Mare des abeilles » ou « Cuve à
 * eau — centre » finissaient en « Butte Eros… », « Mare des… » (audit UI/UX du 19/11/2026,
 * U5). Le moteur (`resolveLabelLayout`) et le rendu (`--fm-pct-marker-label-w`) appellent
 * cette même fonction.
 * @param {string} text
 * @param {number} fontSizePx
 * @returns {number} px écran (0 pour un nom vide).
 */
export function markerLabelWidthPx(text, fontSizePx) {
  const name = String(text ?? '').trim();
  if (!name) return 0;
  const natural = estimateTextWidthPx(name, fontSizePx);
  if (natural <= MARKER_LABEL_MAX_WIDTH_PX) return natural;
  const twoLines = unbrokenTextWidthPx(name, fontSizePx, MARKER_LABEL_MAX_LINES);
  return Math.min(ZONE_LABEL_MAX_WIDTH_PX, Math.max(MARKER_LABEL_MAX_WIDTH_PX, twoLines));
}

/** Écart vertical entre le point d'un repère et le centre de son étiquette (px écran). */
export const MARKER_LABEL_OFFSET_PX = 26;

/**
 * Espace entre le bas de l'emoji d'une zone et le haut de son nom (px écran), à défaut de
 * variable `--map-overlay-label-margin-top` (réglage admin « espacement emoji / libellé »).
 */
export const ZONE_NAME_GAP_PX = 4;

/** Habillage horizontal du nom du lieu sélectionné (pilule, `padding: 0 6px`). */
export const ACTIVE_LABEL_EXTRA_WIDTH_PX = 12;

function toFinite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Clé d'étiquette, préfixée par le type : une zone et un repère peuvent porter le même id. */
export function labelKey(kind, id) {
  return `${kind}:${id}`;
}

/** Clé de l'emoji d'une zone (distincte de celle de son nom, `labelKey('zone', id)`). */
export function zoneEmojiLabelKey(id) {
  return labelKey('zone-emoji', id);
}

/**
 * Rapport largeur ÷ hauteur d'un rectangle, arrondi (clé de mémoïsation stable), 1 à défaut.
 * @param {number} width
 * @param {number} height
 */
export function contentAspect(width, height) {
  const w = Number(width);
  const h = Number(height);
  if (!(w > 0) || !(h > 0)) return 1;
  return Math.round((w / h) * 1000) / 1000;
}

/**
 * Ancre d'étiquette d'une zone : pôle d'inaccessibilité **isotrope** (`aspect`), centroïde
 * arithmétique en repli.
 * @param {Array<{ xp: number, yp: number }>} points
 * @param {number} [aspect=1] largeur ÷ hauteur de l'image.
 */
export function zoneLabelAnchorPct(points, aspect = 1) {
  const pts = points || [];
  const pole = polygonPoleOfInaccessibilityPct(pts, undefined, aspect);
  if (pole) return { xp: pole.xp, yp: pole.yp };
  return {
    xp: pts.reduce((s, p) => s + p.xp, 0) / (pts.length || 1),
    yp: pts.reduce((s, p) => s + p.yp, 0) / (pts.length || 1),
  };
}

function cssPx(value, fallback) {
  const match = /^\s*(-?\d+(?:\.\d+)?)px\s*$/.exec(String(value ?? ''));
  const n = match ? Number(match[1]) : Number.NaN;
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Tailles **réellement rendues** des étiquettes, lues dans les variables CSS que le produit
 * pose sur le calque (préférence « Aa », pointeur tactile, réglages admin) : le moteur de
 * collisions doit mesurer ce que l'on voit, pas les tailles par défaut.
 *
 * @param {Record<string, unknown>|null|undefined} style variables `--map-overlay-*`.
 * @returns {{ fontSizePx: number, emojiSizePx: number, nameGapPx: number }}
 */
export function resolveOverlayLabelSizesPx(style) {
  const s = style && typeof style === 'object' ? style : {};
  return {
    fontSizePx: cssPx(s['--map-overlay-label-font-size'], LABEL_FONT_SIZE_PX),
    emojiSizePx: cssPx(s['--map-overlay-emoji-font-size'], LABEL_EMOJI_SIZE_PX),
    nameGapPx: Math.max(0, cssPx(s['--map-overlay-label-margin-top'], ZONE_NAME_GAP_PX)),
  };
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
 * Rang d'une étiquette de lieu **mis en avant** (`map_highlight`, plan e-nov) : devant toute
 * catégorie — son nom doit rester écrit quand deux étiquettes se disputent la place.
 */
export const HIGHLIGHT_LABEL_PRIORITY = -1e9;

/**
 * Rang de catégorie d'un lieu : le plus petit `sort_order` de ses catégories, ou
 * `fallback` s'il n'en a aucune (connue). Un lieu mis en avant passe devant tout le monde.
 * @param {{ category_ids?: Array<string>, map_highlight?: boolean }} place
 * @param {Map<string, { sort_order?: number }>|null} categoriesById
 * @param {number} [fallback]
 */
export function labelPriority(place, categoriesById, fallback = DEFAULT_LABEL_PRIORITY) {
  if (place?.map_highlight === true) return HIGHLIGHT_LABEL_PRIORITY;
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
 * @param {{ aspect?: number }} [options] `aspect` : largeur ÷ hauteur de l'image (ancre isotrope).
 * @returns {Array<object>} specs `{ zone, id, key, emojiKey, emoji, name, anchor, anchors,
 *   areaPct, bounds }` — `anchors` : pôle puis points de repli (`polygonLabelAnchorsPct`),
 *   essayés dans l'ordre quand la place est prise.
 */
export function buildZoneLabelSpecs(zones, splitEmoji, { aspect = 1 } = {}) {
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
    const candidates = polygonLabelAnchorsPct(points, aspect).map(({ xp, yp }) => ({ xp, yp }));
    const anchor = candidates[0] || zoneLabelAnchorPct(points, aspect);
    specs.push({
      zone,
      id: String(zone.id),
      key: labelKey('zone', zone.id),
      emojiKey: zoneEmojiLabelKey(zone.id),
      emoji,
      name,
      anchor,
      anchors: candidates.length ? candidates : [anchor],
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
 * Largeur allouée au nom d'une zone **sans couper de mot** : celle de son polygone
 * (`zoneLabelMaxWidthPx`), élargie s'il le faut jusqu'à ce que le nom tienne sur
 * `maxLines` lignes coupées aux espaces, dans la limite de {@link ZONE_LABEL_MAX_WIDTH_PX}.
 *
 * Pourquoi : dans une petite zone, le nom recevait 96 px quelle que soit sa longueur ; un mot
 * plus large (« Jardinières », 123 px à 22,4 px) se coupait alors n'importe où —
 * « Bananera / ie », « Aromati / ques » (audit UI/UX du 19/11/2026, U5). Au-delà du plafond,
 * le rendu replie en dernier recours (`overflow-wrap: break-word`, coupure syllabique).
 *
 * Le moteur (`resolveLabelLayout`, option `zoneNameMaxWidthPx`) et le rendu (`maxWidthPx` de
 * l'étiquette) doivent appeler cette même fonction : la boîte de collision est celle du rendu.
 *
 * @param {object} spec spécification d'étiquette (`buildZoneLabelSpecs`).
 * @param {number} contentWidthPx largeur du rectangle image à l'échelle 1.
 * @param {number} scale échelle courante.
 * @param {{ fontSizePx?: number, maxLines?: number }} [options]
 * @returns {number}
 */
export function zoneLabelUnbrokenWidthPx(
  spec,
  contentWidthPx,
  scale,
  { fontSizePx = LABEL_FONT_SIZE_PX, maxLines = ZONE_LABEL_MAX_LINES } = {},
) {
  const base = zoneLabelMaxWidthPx(spec, contentWidthPx, scale);
  const need = unbrokenTextWidthPx(spec?.name, fontSizePx, maxLines);
  return Math.min(ZONE_LABEL_MAX_WIDTH_PX, Math.max(base, need));
}

/**
 * Cadre visible dans le repère des ancres de `resolveLabelLayout` : origine au coin du rectangle
 * du contenu, à l'échelle courante. Le calque « monde » est translaté de (`x`, `y`) puis mis à
 * l'échelle `s` ; le rectangle du contenu y est décalé de (`offsetX`, `offsetY`).
 * @param {{ x: number, y: number, s: number }} transform vue posée (`committed`).
 * @param {{ offsetX: number, offsetY: number }} fitRect
 * @param {{ w: number, h: number }} stage taille du cadre (px).
 * @returns {{ left: number, top: number, right: number, bottom: number }|null}
 */
export function labelFrameFromView(transform, fitRect, stage) {
  const w = toFinite(stage?.w);
  const h = toFinite(stage?.h);
  const s = toFinite(transform?.s, 1);
  if (!(w > 1) || !(h > 1) || !(s > 0)) return null;
  const ox = toFinite(transform?.x) + s * toFinite(fitRect?.offsetX);
  const oy = toFinite(transform?.y) + s * toFinite(fitRect?.offsetY);
  return { left: -ox, top: -oy, right: w - ox, bottom: h - oy };
}

/**
 * Boîtes mesurées en px **du cadre** (commandes posées sur la carte), ramenées dans le repère
 * des ancres de `resolveLabelLayout` — même origine que `labelFrameFromView`.
 * @param {Array<{ left: number, top: number, right: number, bottom: number }>} boxes
 * @param {{ x: number, y: number, s: number }} transform
 * @param {{ offsetX: number, offsetY: number }} fitRect
 * @returns {Array<{ left: number, top: number, right: number, bottom: number }>}
 */
export function labelBoxesFromScreen(boxes, transform, fitRect) {
  const s = toFinite(transform?.s, 1);
  const ox = toFinite(transform?.x) + s * toFinite(fitRect?.offsetX);
  const oy = toFinite(transform?.y) + s * toFinite(fitRect?.offsetY);
  return (boxes || []).map((b) => ({
    left: toFinite(b?.left) - ox,
    top: toFinite(b?.top) - oy,
    right: toFinite(b?.right) - ox,
    bottom: toFinite(b?.bottom) - oy,
  }));
}

/**
 * Côtés possibles du nom d'une zone par rapport à son emoji, par ordre de préférence. `below`
 * est le rendu par défaut ; les autres ne servent que si la place sous l'emoji est prise.
 */
export const ZONE_NAME_SIDES = Object.freeze(['below', 'right', 'left', 'above']);

/** Largeur rendue d'un nom posé à côté de l'emoji : le nom plus l'emoji et l'écart. */
export function zoneLabelSideExtraWidthPx(nameSide, emojiSizePx, nameGapPx) {
  return nameSide === 'right' || nameSide === 'left'
    ? Math.max(toFinite(emojiSizePx, LABEL_EMOJI_SIZE_PX), 0) +
        Math.max(toFinite(nameGapPx, ZONE_NAME_GAP_PX), 0)
    : 0;
}

/** Hauteur visible d'une pastille de groupe de repères (cible tactile, `.fm-pct-cluster`). */
export const CLUSTER_OBSTACLE_HEIGHT_PX = 44;

/**
 * Obstacles posés par les repères (épingles et pastilles de groupe), en % de l'image avec leur
 * taille **écran**. Le moteur d'étiquettes cherche à les éviter sans jamais les masquer : ils
 * restent la seule façon d'atteindre un repère.
 *
 * @param {Array<{ x_pct: number, y_pct: number, count?: number }>} items repères ou groupes
 *   (`clusterMarkers`).
 * @param {{ emojiSizePx?: number }} [options]
 * @returns {Array<{ id: string, xPct: number, yPct: number, widthPx: number,
 *   heightPx: number }>}
 */
export function markerObstaclesFrom(items, { emojiSizePx = LABEL_EMOJI_SIZE_PX } = {}) {
  const pin = Math.max(toFinite(emojiSizePx, LABEL_EMOJI_SIZE_PX), 1) + 4;
  const out = [];
  for (const item of items || []) {
    const xPct = Number(item?.x_pct);
    const yPct = Number(item?.y_pct);
    if (!Number.isFinite(xPct) || !Number.isFinite(yPct)) continue;
    const count = Math.max(Math.round(toFinite(item?.count, 1)), 1);
    // Identifiant du repère (ou du groupe) : le nom d'un repère n'évite pas sa propre épingle.
    const id = item?.id == null ? '' : String(item.id);
    if (count > 1) {
      // Pilule « emoji + nombre » : 10 px de marge de chaque côté, 4 px d'écart, ~9 px par
      // chiffre, bordure de 2 px ; au moins une cible tactile.
      const width = Math.max(CLUSTER_OBSTACLE_HEIGHT_PX, 28 + pin + 9 * String(count).length);
      out.push({ id, xPct, yPct, widthPx: width, heightPx: CLUSTER_OBSTACLE_HEIGHT_PX });
    } else {
      out.push({ id, xPct, yPct, widthPx: pin, heightPx: pin });
    }
  }
  return out;
}

function shiftBox(box, dx, dy) {
  return {
    left: box.left + dx,
    right: box.right + dx,
    top: box.top + dy,
    bottom: box.bottom + dy,
  };
}

/**
 * Boîte du nom d'une zone posé d'un côté de son emoji. Les marges des deux boîtes se touchent
 * sans se croiser : un nom ne se heurte jamais à son propre emoji, même avec un écart nul.
 */
function zoneNameBoxAt(side, at, emojiBox, emojiPx, gapPx, labelBoxOptions) {
  const base = estimateLabelBox({ ...labelBoxOptions, x: 0, y: 0, anchorY: 'top' });
  const halfW = (base.right - base.left) / 2;
  const height = base.bottom - base.top;
  const half = emojiPx / 2;
  if (side === 'right' || side === 'left') {
    const dy = at.y - (base.top + height / 2);
    const cx = side === 'right' ? at.x + half + gapPx + halfW : at.x - half - gapPx - halfW;
    const box = shiftBox(base, cx, dy);
    if (side === 'right') box.left = Math.max(box.left, emojiBox.right);
    else box.right = Math.min(box.right, emojiBox.left);
    return box;
  }
  if (side === 'above') {
    const box = shiftBox(base, at.x, at.y - half - gapPx - base.bottom);
    box.bottom = Math.min(box.bottom, emojiBox.top);
    return box;
  }
  const box = shiftBox(base, at.x, at.y + half + gapPx - base.top);
  box.top = Math.max(box.top, emojiBox.bottom);
  return box;
}

/**
 * Placement des étiquettes à l'échelle courante : **ce qui s'affiche, et où**.
 *
 * Chaque étiquette de zone dispose de plusieurs positions candidates, essayées dans l'ordre :
 * - l'**emoji**, les points d'ancrage de la zone (`spec.anchors` : pôle d'inaccessibilité puis
 *   replis, `polygonLabelAnchorsPct`) ;
 * - le **nom**, sous l'emoji puis à droite, à gauche, au-dessus (`ZONE_NAME_SIDES`) ; sans
 *   emoji, centré sur chacun des points d'ancrage.
 *
 * Une position est retenue si elle ne recouvre aucune étiquette déjà placée et, de préférence,
 * aucun **obstacle** (épingles et pastilles de groupe des repères). Quand tous les
 * emplacements libres d'étiquettes touchent un obstacle, l'étiquette garde le premier d'entre
 * eux : un repère ne fait jamais disparaître un nom, il le fait seulement bouger s'il le peut.
 * Inspiration : les positions candidates des moteurs cartographiques (`text-variable-anchor`
 * de Mapbox GL, https://docs.mapbox.com/style-spec/reference/layers/).
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
 * @param {number} [params.emojiSizePx] taille rendue de l'emoji d'une zone.
 * @param {number} [params.nameGapPx] espace entre l'emoji et le nom.
 * @param {boolean} [params.includeZoneNames=true] `false` : emojis de zone seuls (bascule
 *   « étiquettes » masquées).
 * @param {number} [params.zoneNameMaxLines] lignes d'un nom de zone (le calque d'édition, en
 *   SVG, n'en rend qu'une).
 * @param {(spec: object) => number} [params.zoneNameMaxWidthPx] largeur allouée au nom (défaut :
 *   `zoneLabelMaxWidthPx`, ou `zoneLabelUnbrokenWidthPx` avec `wrapNamesAtSpaces`).
 * @param {boolean} [params.wrapNamesAtSpaces=false] noms repliés **aux espaces** (calques HTML
 *   de `SharedMapStage`) : noms de zone élargis pour qu'aucun mot ne soit coupé, noms de repère
 *   sur deux lignes au plus (`markerLabelWidthPx`), largeurs naturelles estimées glyphe par
 *   glyphe. Le calque d'édition (SVG, une ligne tronquée) garde l'ancien calcul.
 * @param {Array<{ xPct: number, yPct: number, widthPx: number, heightPx: number }>}
 *   [params.obstacles] épingles et pastilles de repères (`markerObstaclesFrom`).
 * @param {boolean} [params.obstaclesHideNames=false] épingles et pastilles **masquent** les noms
 *   au lieu de les laisser se poser dessus faute de mieux : un nom (de zone ou de repère) qui ne
 *   trouve aucune place libre de repères attend le zoom — « mieux vaut moins de noms, tous
 *   lisibles ». Les emojis de zone gardent l'ancien repli. Activé par la Visite (audit UI/UX du
 *   19/11/2026, U5 : pastilles et épingles sur les noms) ; le lieu épinglé reste affiché.
 * @param {Array<{ left: number, top: number, right: number, bottom: number }>}
 *   [params.chromeBoxes] commandes posées **sur** la carte (boutons de zoom, cartouche
 *   d'échelle), dans le repère des ancres (`labelBoxesFromScreen`) : aucune étiquette ne s'y
 *   pose, sauf le lieu épinglé. Ignorées quand la carte est orientée, comme `frame`.
 * @param {{ left: number, top: number, right: number, bottom: number }|null} [params.frame]
 *   cadre **visible**, dans le repère des ancres (px écran, origine au coin du contenu à
 *   l'échelle courante — `labelFrameFromView`). Une étiquette qui en sortirait est traitée
 *   comme une collision : son nom essaie un autre côté, sinon il est masqué et revient au
 *   zoom ou au déplacement. Sans cadre, ou carte orientée, rien ne change. Le lieu épinglé
 *   reste toujours affiché (audit UI/UX du 19/11/2026, U5 : noms rognés au bord du cadre).
 * @returns {{ visible: Set<string>, placements: Map<string, { xp: number, yp: number,
 *   nameSide: string }> }} `visible` : clés `zone-emoji:<id>`, `zone:<id>`, `marker:<id>` ;
 *   `placements` : par id de zone, point d'ancrage retenu (en % de l'image) et côté du nom
 *   (`below`, `right`, `left`, `above`, ou `center` pour un nom sans emoji).
 */
export function resolveLabelLayout({
  zoneSpecs,
  markers,
  categoriesById = null,
  contentWidthPx,
  contentHeightPx,
  scale,
  pinnedKey = '',
  fontSizePx = LABEL_FONT_SIZE_PX,
  emojiSizePx = LABEL_EMOJI_SIZE_PX,
  nameGapPx = ZONE_NAME_GAP_PX,
  includeZoneNames = true,
  zoneNameMaxLines = ZONE_LABEL_MAX_LINES,
  zoneNameMaxWidthPx = null,
  wrapNamesAtSpaces = false,
  orientationDeg = 0,
  orientOriginPct = null,
  obstacles = [],
  obstaclesHideNames = false,
  chromeBoxes = [],
  frame = null,
}) {
  const visible = new Set();
  const placements = new Map();
  const width = toFinite(contentWidthPx);
  const height = toFinite(contentHeightPx);
  const s = toFinite(scale, 1);
  if (!(width > 0) || !(height > 0) || !(s > 0)) return { visible, placements };

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
  const emojiPx = Math.max(toFinite(emojiSizePx, LABEL_EMOJI_SIZE_PX), 1);
  const gapPx = Math.max(toFinite(nameGapPx, ZONE_NAME_GAP_PX), 0);
  const widthOf =
    typeof zoneNameMaxWidthPx === 'function'
      ? zoneNameMaxWidthPx
      : wrapNamesAtSpaces
        ? (spec) =>
            zoneLabelUnbrokenWidthPx(spec, width, s, { fontSizePx, maxLines: zoneNameMaxLines })
        : (spec) => zoneLabelMaxWidthPx(spec, width, s);

  const softBoxes = [];
  for (const o of obstacles || []) {
    const xPct = Number(o?.xPct);
    const yPct = Number(o?.yPct);
    if (!Number.isFinite(xPct) || !Number.isFinite(yPct)) continue;
    const at = anchorPx(xPct, yPct);
    const w = Math.max(toFinite(o.widthPx, 0), 0) / 2;
    const h = Math.max(toFinite(o.heightPx, 0), 0) / 2;
    softBoxes.push({
      id: o?.id == null ? '' : String(o.id),
      left: at.x - w,
      right: at.x + w,
      top: at.y - h,
      bottom: at.y + h,
    });
  }
  const kept = [];
  // Cadre visible : ignoré quand la carte est orientée (boîtes alignées sur l'écran, ancres
  // tournées autour d'un pivot — le calcul du bord n'aurait plus de sens simple).
  const frameBox =
    !rotates &&
    frame &&
    [frame.left, frame.top, frame.right, frame.bottom].every((v) => Number.isFinite(Number(v)))
      ? frame
      : null;
  // Commandes posées sur la carte : places déjà prises (carte non orientée seulement).
  if (!rotates) {
    for (const b of chromeBoxes || []) {
      if ([b?.left, b?.top, b?.right, b?.bottom].every((v) => Number.isFinite(Number(v)))) {
        kept.push({
          left: Number(b.left),
          top: Number(b.top),
          right: Number(b.right),
          bottom: Number(b.bottom),
        });
      }
    }
  }
  const outside = (box) =>
    !!frameBox &&
    (box.left < frameBox.left ||
      box.right > frameBox.right ||
      box.top < frameBox.top ||
      box.bottom > frameBox.bottom);
  const hitsKept = (box) => outside(box) || kept.some((k) => boxesOverlap(k, box));
  const hitsSoft = (box, exceptId = null) =>
    softBoxes.some((k) => (exceptId == null || k.id !== exceptId) && boxesOverlap(k, box));
  /**
   * Première option libre d'étiquettes et d'obstacles, sinon première libre d'étiquettes ;
   * une étiquette épinglée est toujours gardée (de préférence hors obstacle).
   */
  const choose = (boxes, pinned, avoidSoft = true, strictSoft = false) => {
    let firstFree = -1;
    for (let i = 0; i < boxes.length; i += 1) {
      if (!pinned && hitsKept(boxes[i])) continue;
      if (!avoidSoft || !hitsSoft(boxes[i])) return i;
      // `strictSoft` : pas de repli sur un repère (`obstaclesHideNames`).
      if (firstFree < 0 && !(strictSoft && !pinned)) firstFree = i;
    }
    if (firstFree >= 0) return firstFree;
    return pinned && boxes.length ? 0 : -1;
  };
  const anchorsOf = (spec) =>
    Array.isArray(spec.anchors) && spec.anchors.length ? spec.anchors : [spec.anchor];
  /** Point d'ancrage retenu pour l'emoji de chaque zone (index dans `anchors`) et sa boîte. */
  const emojiAt = new Map();

  /**
   * Nom d'une zone à emoji : les quatre côtés autour de l'emoji déjà posé, puis — si aucun ne
   * convient — les autres points d'ancrage de la zone où l'emoji tiendrait aussi, l'emoji
   * suivant alors son nom. Même préférence que `choose` : sans obstacle d'abord, sinon
   * seulement sans étiquette — ce repli-là n'est admis qu'à la place actuelle de l'emoji, qui
   * ne se déplace que vers un point libre de repères. Met à jour `kept` et `emojiAt` ; renvoie
   * `null` si rien ne tient.
   */
  const placeZoneNameWithEmoji = (entry, anchors, labelBoxOptions) => {
    const current = emojiAt.get(entry.spec.id);
    const others = kept.filter((k) => k !== current.box);
    const hitsOthers = (box) => outside(box) || others.some((k) => boxesOverlap(k, box));
    const order = [current.index, ...anchors.map((_, i) => i).filter((i) => i !== current.index)];
    let fallback = null;
    let nameOnly = null;
    let chosen = null;
    for (const index of order) {
      const at = anchorPx(anchors[index].xp, anchors[index].yp);
      const emojiBox =
        index === current.index
          ? current.box
          : estimateGlyphBox({ x: at.x, y: at.y, sizePx: emojiPx });
      if (index !== current.index && hitsOthers(emojiBox)) continue;
      for (const side of ZONE_NAME_SIDES) {
        const nameBox = zoneNameBoxAt(side, at, emojiBox, emojiPx, gapPx, labelBoxOptions);
        if (!entry.pinned && hitsOthers(nameBox)) continue;
        const option = { index, side, emojiBox, nameBox };
        if (!hitsSoft(nameBox) && !hitsSoft(emojiBox)) {
          chosen = option;
          break;
        }
        if (obstaclesHideNames) {
          // Nom libre de repères, emoji resté à sa place (posé sur une épingle faute de mieux) :
          // admis. Un nom sur un repère, jamais — il attendra le zoom.
          if (!nameOnly && index === current.index && !hitsSoft(nameBox)) nameOnly = option;
          continue;
        }
        // L'emoji ne quitte pas sa place pour se poser sur un repère.
        if (!fallback && index === current.index) fallback = option;
      }
      if (chosen) break;
    }
    chosen = chosen || nameOnly || fallback;
    if (!chosen && entry.pinned) {
      const at = anchorPx(anchors[current.index].xp, anchors[current.index].yp);
      chosen = {
        index: current.index,
        side: ZONE_NAME_SIDES[0],
        emojiBox: current.box,
        nameBox: zoneNameBoxAt(
          ZONE_NAME_SIDES[0],
          at,
          current.box,
          emojiPx,
          gapPx,
          labelBoxOptions,
        ),
      };
    }
    if (!chosen) return null;
    if (chosen.emojiBox !== current.box) {
      kept[kept.indexOf(current.box)] = chosen.emojiBox;
      emojiAt.set(entry.spec.id, { index: chosen.index, box: chosen.emojiBox });
    }
    kept.push(chosen.nameBox);
    return chosen;
  };

  const zoneEntries = (zoneSpecs || []).map((spec) => ({
    spec,
    priority: labelPriority(spec.zone, categoriesById, fallbackPriority),
    weight: spec.areaPct,
    pinned: spec.key === pinnedKey,
    emojiKey: spec.emojiKey || zoneEmojiLabelKey(spec.id),
  }));

  // 1. Emojis de zone, avant tout nom : petits, lisibles à toute échelle.
  for (const entry of orderLabelCandidates(zoneEntries.filter((e) => e.spec.emoji))) {
    const anchors = anchorsOf(entry.spec);
    const boxes = anchors.map((a) => {
      const at = anchorPx(a.xp, a.yp);
      return estimateGlyphBox({ x: at.x, y: at.y, sizePx: emojiPx });
    });
    const i = choose(boxes, entry.pinned);
    if (i < 0) continue;
    kept.push(boxes[i]);
    visible.add(entry.emojiKey);
    emojiAt.set(entry.spec.id, { index: i, box: boxes[i] });
  }

  // 2. Noms de zone et de repère, par priorité. Un nom n'apparaît jamais sans l'emoji de sa
  //    zone : il flotterait sous une place vide.
  const names = [];
  if (includeZoneNames) {
    for (const entry of zoneEntries) {
      if (!entry.spec.name) continue;
      if (entry.spec.emoji && !emojiAt.has(entry.spec.id)) continue;
      names.push({ ...entry, kind: 'zone' });
    }
  }
  for (const marker of markers || []) {
    const text = String(marker?.label ?? marker?.name ?? '').trim();
    const xPct = Number(marker?.x_pct);
    const yPct = Number(marker?.y_pct);
    if (!text || !Number.isFinite(xPct) || !Number.isFinite(yPct)) continue;
    const key = labelKey('marker', marker.id);
    names.push({
      kind: 'marker',
      marker,
      text,
      xPct,
      yPct,
      key,
      priority: labelPriority(marker, categoriesById, fallbackPriority),
      // Un repère n'a pas d'aire : à rang égal il passe après les zones, dont l'étiquette
      // nomme une surface déjà visible à l'écran.
      weight: 0,
      pinned: key === pinnedKey,
    });
  }
  for (const entry of orderLabelCandidates(names)) {
    if (entry.kind === 'marker') {
      const at = anchorPx(entry.xPct, entry.yPct);
      // L'écart au point est **vertical à l'écran** : l'étiquette étant contre-tournée, il
      // s'ajoute après la rotation de l'ancre, jamais avant.
      const box = wrapNamesAtSpaces
        ? // Repliée : la première ligne garde sa place d'avant (centrée sur l'écart), la
          // seconde pend dessous (`.fm-pct-marker__label`).
          estimateLabelBox({
            x: at.x,
            y: at.y + MARKER_LABEL_OFFSET_PX - (fontSizePx * LABEL_LINE_HEIGHT_RATIO) / 2,
            anchorY: 'top',
            text: entry.text,
            fontSizePx,
            maxWidthPx: markerLabelWidthPx(entry.text, fontSizePx),
            maxLines: MARKER_LABEL_MAX_LINES,
            naturalWidthPx: estimateTextWidthPx(entry.text, fontSizePx),
            extraWidthPx: entry.pinned ? ACTIVE_LABEL_EXTRA_WIDTH_PX : 0,
          })
        : estimateLabelBox({
            x: at.x,
            y: at.y + MARKER_LABEL_OFFSET_PX,
            text: entry.text,
            fontSizePx,
            maxWidthPx: MARKER_LABEL_MAX_WIDTH_PX,
            extraWidthPx: entry.pinned ? ACTIVE_LABEL_EXTRA_WIDTH_PX : 0,
          });
      if (choose([box], entry.pinned, false) < 0) continue;
      // Sur une autre épingle ou une pastille (sa propre épingle exceptée) : masqué (Visite).
      if (obstaclesHideNames && !entry.pinned && hitsSoft(box, String(entry.marker.id))) continue;
      kept.push(box);
      visible.add(entry.key);
      continue;
    }
    const { spec } = entry;
    const labelBoxOptions = {
      text: spec.name,
      fontSizePx,
      maxWidthPx: widthOf(spec),
      maxLines: zoneNameMaxLines,
      naturalWidthPx: wrapNamesAtSpaces ? estimateTextWidthPx(spec.name, fontSizePx) : null,
      extraWidthPx: entry.pinned ? ACTIVE_LABEL_EXTRA_WIDTH_PX : 0,
    };
    const anchors = anchorsOf(spec);
    if (spec.emoji) {
      const placed = placeZoneNameWithEmoji(entry, anchors, labelBoxOptions);
      if (!placed) continue;
      visible.add(spec.key);
      placements.set(spec.id, { ...pickPct(anchors[placed.index]), nameSide: placed.side });
      continue;
    }
    const boxes = anchors.map((a) => {
      const at = anchorPx(a.xp, a.yp);
      return estimateLabelBox({ ...labelBoxOptions, x: at.x, y: at.y });
    });
    const i = choose(boxes, entry.pinned, true, obstaclesHideNames);
    if (i < 0) continue;
    kept.push(boxes[i]);
    visible.add(spec.key);
    placements.set(spec.id, { ...pickPct(anchors[i]), nameSide: 'center' });
  }

  // Zones dont l'emoji est affiché sans nom : l'ancre retenue pour l'emoji fait foi.
  for (const entry of zoneEntries) {
    const { spec } = entry;
    if (placements.has(spec.id)) continue;
    const anchors = anchorsOf(spec);
    const at = emojiAt.get(spec.id);
    placements.set(spec.id, {
      ...pickPct(anchors[at ? at.index : 0]),
      nameSide: spec.emoji ? 'below' : 'center',
    });
  }
  return { visible, placements };
}

function pickPct(anchor) {
  return { xp: toFinite(anchor?.xp), yp: toFinite(anchor?.yp) };
}

/**
 * Étiquettes réellement affichables à l'échelle courante (clés seules) — voir
 * `resolveLabelLayout`, dont c'est la projection.
 *
 * @param {Parameters<typeof resolveLabelLayout>[0]} params
 * @returns {Set<string>} clés des étiquettes à afficher : `zone-emoji:<id>` (emoji de zone),
 *   `zone:<id>` (nom de zone), `marker:<id>` (nom de repère).
 */
export function resolveVisibleLabels(params) {
  return resolveLabelLayout(params).visible;
}
