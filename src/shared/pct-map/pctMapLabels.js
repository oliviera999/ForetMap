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
 * 17 repères sur 20 (aucune catégorie) passaient systématiquement après tout le reste. À rang
 * égal, la plus grande zone gagne ; le lieu sélectionné passe avant tout le monde.
 *
 * Aucun DOM, aucun état : testable en environnement node.
 */
import { estimateLabelBox, resolveLabelCollisions } from './mapOverlayLabelCollision.js';
import { parsePctPolygonPoints } from './pctPolygon.js';
import { polygonPoleOfInaccessibilityPct } from './pctPolylabel.js';

/** Rang d'un lieu sans catégorie : entre les catégories structurantes et les catégories de détail. */
export const DEFAULT_LABEL_PRIORITY = 50;

/** Taille de police des étiquettes, en pixels **écran** (constante quel que soit le zoom). */
export const LABEL_FONT_SIZE_PX = 12;

/** Largeur minimale d'un nom de zone : en dessous, le nom serait illisible plutôt que court. */
export const ZONE_LABEL_MIN_WIDTH_PX = 56;

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
}) {
  const width = toFinite(contentWidthPx);
  const height = toFinite(contentHeightPx);
  const s = toFinite(scale, 1);
  if (!(width > 0) || !(height > 0) || !(s > 0)) return new Set();

  const candidates = [];
  for (const spec of zoneSpecs || []) {
    if (!spec.name) continue;
    const maxWidth = zoneLabelMaxWidthPx(spec, width, s);
    candidates.push({
      id: spec.key,
      priority: labelPriority(spec.zone, categoriesById),
      weight: spec.areaPct,
      pinned: spec.key === pinnedKey,
      box: estimateLabelBox({
        x: (spec.anchor.xp / 100) * width * s,
        y: (spec.anchor.yp / 100) * height * s,
        text: spec.name,
        fontSizePx,
        maxWidthPx: maxWidth,
      }),
    });
  }
  for (const marker of markers || []) {
    const text = String(marker?.label ?? marker?.name ?? '').trim();
    const xPct = Number(marker?.x_pct);
    const yPct = Number(marker?.y_pct);
    if (!text || !Number.isFinite(xPct) || !Number.isFinite(yPct)) continue;
    const key = labelKey('marker', marker.id);
    candidates.push({
      id: key,
      priority: labelPriority(marker, categoriesById),
      // Un repère n'a pas d'aire : à rang égal il passe après les zones, dont l'étiquette
      // nomme une surface déjà visible à l'écran.
      weight: 0,
      pinned: key === pinnedKey,
      box: estimateLabelBox({
        x: (xPct / 100) * width * s,
        y: (yPct / 100) * height * s + MARKER_LABEL_OFFSET_PX,
        text,
        fontSizePx,
        maxWidthPx: MARKER_LABEL_MAX_WIDTH_PX,
      }),
    });
  }
  return resolveLabelCollisions(candidates);
}
