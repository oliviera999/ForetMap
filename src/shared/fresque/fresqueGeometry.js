/**
 * Géométrie des flèches d'une fresque : du bord d'une carte au bord de l'autre (intersection
 * du segment des centres avec les rectangles), décalage des paires A → B / B → A, point
 * d'ancrage du repère. Même esprit que `FoodWebGraph.jsx` (réseau trophique), réécrit en
 * fonctions pures pour les cartes rectangulaires en pourcentage.
 *
 * Unités : la table fait 16:10 ; les coordonnées d'état sont en % de la largeur (x) et de la
 * hauteur (y). Le SVG des flèches utilise un `viewBox` 0 0 160 100 : `x × 1.6`, `y × 1`.
 */

import { CARD_W_PCT, CARD_H_PCT, TABLE_ASPECT } from './fresqueCore.js';

/** Longueur (unités SVG) sous laquelle une flèche bord à bord est remplacée par centre à centre. */
export const MIN_ARROW_LENGTH = 2;

export const SVG_W = 100 * TABLE_ASPECT;
export const SVG_H = 100;

/** Rectangle d'une carte en unités SVG. */
export function cardSvgRect(pos) {
  return {
    x: pos.x * TABLE_ASPECT,
    y: pos.y,
    w: CARD_W_PCT * TABLE_ASPECT,
    h: CARD_H_PCT,
  };
}

export function rectCenter(rect) {
  return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
}

/**
 * Point où le segment `from → to` sort du rectangle (ancré sur son centre). Rend le centre si
 * les deux points sont confondus.
 */
export function exitPoint(rect, from, to, padding = 0.8) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) return { x: from.x, y: from.y };
  const hw = rect.w / 2 + padding;
  const hh = rect.h / 2 + padding;
  const tx = Math.abs(dx) > 1e-6 ? hw / Math.abs(dx) : Infinity;
  const ty = Math.abs(dy) > 1e-6 ? hh / Math.abs(dy) : Infinity;
  const t = Math.min(tx, ty);
  return { x: from.x + dx * t, y: from.y + dy * t };
}

/**
 * Segment d'une flèche entre deux cartes, avec décalage latéral (`offset`, unités SVG) pour
 * séparer A → B et B → A.
 * @returns {{ x1, y1, x2, y2, mx, my, angle } | null}
 */
export function arrowSegment(fromPos, toPos, { offset = 0 } = {}) {
  if (!fromPos || !toPos) return null;
  const a = cardSvgRect(fromPos);
  const b = cardSvgRect(toPos);
  let ca = rectCenter(a);
  let cb = rectCenter(b);
  if (offset) {
    const dx = cb.x - ca.x;
    const dy = cb.y - ca.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * offset;
    const ny = (dx / len) * offset;
    ca = { x: ca.x + nx, y: ca.y + ny };
    cb = { x: cb.x + nx, y: cb.y + ny };
  }
  let p1 = exitPoint(a, ca, cb);
  let p2 = exitPoint(b, cb, ca);
  // Cartes collées ou superposées : les bords se croisent et la flèche disparaîtrait ; on la
  // trace alors de centre à centre pour qu'elle reste visible et touchable.
  const crossed = (p2.x - p1.x) * (cb.x - ca.x) + (p2.y - p1.y) * (cb.y - ca.y) <= 0;
  if (crossed || Math.hypot(p2.x - p1.x, p2.y - p1.y) < MIN_ARROW_LENGTH) {
    p1 = ca;
    p2 = cb;
  }
  const angle = (Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180) / Math.PI;
  return {
    x1: p1.x,
    y1: p1.y,
    x2: p2.x,
    y2: p2.y,
    mx: (p1.x + p2.x) / 2,
    my: (p1.y + p2.y) / 2,
    angle,
  };
}

/** Décalage à appliquer à chaque flèche quand la paire inverse existe aussi. */
export function arrowOffsets(links, amount = 2.2) {
  const keys = new Set(links.map((l) => `${l.from}>${l.to}`));
  const out = {};
  for (const l of links) {
    out[l.id] = keys.has(`${l.to}>${l.from}`) ? amount : 0;
  }
  return out;
}

/** Position du repère (icône) : à mi-chemin, légèrement décalé perpendiculairement. */
export function markAnchor(segment, distance = 3) {
  if (!segment) return null;
  const rad = ((segment.angle + 90) * Math.PI) / 180;
  return { x: segment.mx + Math.cos(rad) * distance, y: segment.my + Math.sin(rad) * distance };
}

/** Conversion d'un point de la table (% largeur / % hauteur) vers les unités SVG. */
export function pctToSvg(x, y) {
  return { x: x * TABLE_ASPECT, y };
}
