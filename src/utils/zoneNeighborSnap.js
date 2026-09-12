/**
 * Accroche topologique entre zones voisines (sommets / arêtes partagés).
 *
 * Complète l’aimant « image » (`edgeSnap.js`) : ici on colle sur la géométrie
 * des autres polygones, pas sur les contrastes du plan.
 *
 * Points en pourcentages d’image `{ xp, yp }` (convention ForetMap).
 */

import { projectPointOnSegmentPct } from '../shared/pct-map/pctPolygon.js';

/** Rayon d’accroche voisin par défaut (% largeur image). */
export const NEIGHBOR_SNAP_DEFAULT_RADIUS_PCT = 1.5;

/** Seuil d’alignement multi-zones : sommets « proches » (% image). */
export const ZONE_ALIGN_DEFAULT_THRESHOLD_PCT = 2;

/** Marge bbox pour décider que deux zones sont « proches » (× seuil). */
const NEARBY_BBOX_MARGIN_FACTOR = 1.5;

/** Bonus de score pour préférer un sommet voisin à une projection d’arête. */
const VERTEX_SNAP_BONUS = 0.35;

function asXpYp(p) {
  return {
    xp: Number(p?.xp ?? p?.x) || 0,
    yp: Number(p?.yp ?? p?.y) || 0,
  };
}

function clampPct(p) {
  return {
    xp: Math.min(100, Math.max(0, Number(p?.xp) || 0)),
    yp: Math.min(100, Math.max(0, Number(p?.yp) || 0)),
  };
}

/** Distance euclidienne en % image. */
export function pctDistance(a, b) {
  const ax = Number(a?.xp) || 0;
  const ay = Number(a?.yp) || 0;
  const bx = Number(b?.xp) || 0;
  const by = Number(b?.yp) || 0;
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

function bboxOf(pts) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const raw of pts || []) {
    const p = asXpYp(raw);
    if (p.xp < minX) minX = p.xp;
    if (p.yp < minY) minY = p.yp;
    if (p.xp > maxX) maxX = p.xp;
    if (p.yp > maxY) maxY = p.yp;
  }
  if (!Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY };
}

function bboxesNear(a, b, margin) {
  if (!a || !b) return false;
  const m = Number(margin) || 0;
  return !(
    a.maxX + m < b.minX ||
    b.maxX + m < a.minX ||
    a.maxY + m < b.minY ||
    b.maxY + m < a.minY
  );
}

/**
 * Parse une liste de zones `{ id, points }` (points JSON string ou tableau).
 * @returns {Array<{ id: string, points: Array<{xp:number,yp:number}> }>}
 */
export function normalizeNeighborZones(zones) {
  const out = [];
  for (const z of zones || []) {
    if (!z || z.id == null) continue;
    let pts = z.points;
    if (typeof pts === 'string') {
      try {
        pts = JSON.parse(pts || '[]');
      } catch {
        pts = null;
      }
    }
    if (!Array.isArray(pts) || pts.length < 3) continue;
    const points = pts.map(asXpYp).map(clampPct);
    if (points.length < 3) continue;
    out.push({ id: String(z.id), points });
  }
  return out;
}

/**
 * Zones dont la bbox touche celle d’au moins une autre (marge = seuil × facteur).
 * @param {Array<{ id: string, points: Array<{xp:number,yp:number}> }>} zones
 * @param {number} thresholdPct
 */
export function filterNearbyZones(zones, thresholdPct = ZONE_ALIGN_DEFAULT_THRESHOLD_PCT) {
  const list = (zones || []).filter((z) => z?.points?.length >= 3);
  if (list.length < 2) return [];
  const margin =
    (Number(thresholdPct) || ZONE_ALIGN_DEFAULT_THRESHOLD_PCT) * NEARBY_BBOX_MARGIN_FACTOR;
  const boxes = list.map((z) => bboxOf(z.points));
  const keep = new Set();
  for (let i = 0; i < list.length; i += 1) {
    for (let j = i + 1; j < list.length; j += 1) {
      if (bboxesNear(boxes[i], boxes[j], margin)) {
        keep.add(i);
        keep.add(j);
      }
    }
  }
  return list.filter((_z, i) => keep.has(i));
}

/**
 * Accroche un point sur le sommet ou l’arête le plus proche d’un polygone voisin.
 *
 * @param {{xp:number,yp:number}} point
 * @param {Array<{ id: string, points: Array<{xp:number,yp:number}> }>} neighbors
 * @param {number} [radiusPct]
 * @returns {{ xp: number, yp: number, kind: 'vertex'|'edge', zoneId: string, edgeIndex: number, strength: number } | null}
 */
export function snapPointToNeighborZones(
  point,
  neighbors,
  radiusPct = NEIGHBOR_SNAP_DEFAULT_RADIUS_PCT,
) {
  if (!point || !Array.isArray(neighbors) || !neighbors.length) return null;
  const radius = Math.max(0.05, Number(radiusPct) || NEIGHBOR_SNAP_DEFAULT_RADIUS_PCT);
  const p = asXpYp(point);
  let best = null;

  for (const zone of neighbors) {
    const pts = zone.points;
    if (!pts || pts.length < 2) continue;
    const n = pts.length;

    for (let i = 0; i < n; i += 1) {
      const v = pts[i];
      const d = pctDistance(p, v);
      if (d > radius) continue;
      const strength = 1 - d / radius + VERTEX_SNAP_BONUS;
      if (!best || strength > best.strength) {
        best = {
          xp: v.xp,
          yp: v.yp,
          kind: 'vertex',
          zoneId: zone.id,
          edgeIndex: i,
          strength,
        };
      }
    }

    for (let i = 0; i < n; i += 1) {
      const a = pts[i];
      const b = pts[(i + 1) % n];
      const proj = projectPointOnSegmentPct(
        { x: p.xp, y: p.yp },
        { x: a.xp, y: a.yp },
        { x: b.xp, y: b.yp },
      );
      const hit = { xp: proj.x, yp: proj.y };
      const d = pctDistance(p, hit);
      if (d > radius) continue;
      const strength = 1 - d / radius;
      if (!best || strength > best.strength) {
        best = {
          xp: hit.xp,
          yp: hit.yp,
          kind: 'edge',
          zoneId: zone.id,
          edgeIndex: i,
          strength,
        };
      }
    }
  }

  if (!best) return null;
  return { ...best, ...clampPct(best) };
}

/**
 * Localise le point le plus proche sur le contour d’une zone (sommet ou arête).
 * @returns {{ kind: 'vertex'|'edge', index: number, point: {xp,yp}, dist: number } | null}
 */
function locateOnPolygon(point, pts, radiusPct) {
  if (!pts || pts.length < 2) return null;
  const radius = Math.max(0.05, Number(radiusPct) || NEIGHBOR_SNAP_DEFAULT_RADIUS_PCT);
  const p = asXpYp(point);
  const n = pts.length;
  let best = null;

  for (let i = 0; i < n; i += 1) {
    const d = pctDistance(p, pts[i]);
    if (d > radius) continue;
    if (!best || d < best.dist) {
      best = { kind: 'vertex', index: i, point: { ...pts[i] }, dist: d };
    }
  }

  for (let i = 0; i < n; i += 1) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const proj = projectPointOnSegmentPct(
      { x: p.xp, y: p.yp },
      { x: a.xp, y: a.yp },
      { x: b.xp, y: b.yp },
    );
    const hit = { xp: proj.x, yp: proj.y };
    const d = pctDistance(p, hit);
    if (d > radius) continue;
    if (!best || d < best.dist) {
      best = { kind: 'edge', index: i, point: hit, dist: d };
    }
  }

  return best;
}

/**
 * Paramètre curviligne [0, n) le long du polygone pour une localisation sommet/arête.
 */
function curveParam(loc, pts) {
  if (!loc) return 0;
  if (loc.kind === 'vertex') return loc.index;
  const a = pts[loc.index];
  const b = pts[(loc.index + 1) % pts.length];
  const len = pctDistance(a, b) || 1;
  const t = pctDistance(a, loc.point) / len;
  return loc.index + Math.max(0, Math.min(1, t));
}

/**
 * Sommets intermédiaires le long du contour (arc le plus court), hors extrémités.
 * @returns {Array<{xp:number,yp:number}>}
 */
function walkPolygonInterior(pts, fromParam, toParam) {
  const n = pts.length;
  if (n < 3) return [];

  const fromV = ((Math.round(fromParam) % n) + n) % n;
  const toV = ((Math.round(toParam) % n) + n) % n;
  if (fromV === toV) return [];

  const fwd = [];
  for (let i = (fromV + 1) % n; i !== toV; i = (i + 1) % n) {
    fwd.push({ ...pts[i] });
    if (fwd.length >= n) break;
  }
  const bwd = [];
  for (let i = (fromV - 1 + n) % n; i !== toV; i = (i - 1 + n) % n) {
    bwd.push({ ...pts[i] });
    if (bwd.length >= n) break;
  }
  return fwd.length <= bwd.length ? fwd : bwd;
}

/**
 * Si deux points se collent au même voisin, renvoie les sommets intermédiaires
 * du meilleur arc partagé (côté commun). Sinon `[]`.
 *
 * @param {{xp:number,yp:number}} fromPoint
 * @param {{xp:number,yp:number}} toPoint
 * @param {Array<{ id: string, points: Array<{xp:number,yp:number}> }>} neighbors
 * @param {number} [radiusPct]
 * @returns {{ zoneId: string, points: Array<{xp:number,yp:number}> } | null}
 */
export function sharedEdgeFillBetween(
  fromPoint,
  toPoint,
  neighbors,
  radiusPct = NEIGHBOR_SNAP_DEFAULT_RADIUS_PCT,
) {
  if (!fromPoint || !toPoint || !Array.isArray(neighbors)) return null;
  const radius = Math.max(0.05, Number(radiusPct) || NEIGHBOR_SNAP_DEFAULT_RADIUS_PCT);

  let best = null;
  for (const zone of neighbors) {
    const locA = locateOnPolygon(fromPoint, zone.points, radius);
    const locB = locateOnPolygon(toPoint, zone.points, radius);
    if (!locA || !locB) continue;
    const paramA = curveParam(locA, zone.points);
    const paramB = curveParam(locB, zone.points);
    const fill = walkPolygonInterior(zone.points, paramA, paramB);
    if (!fill.length) continue;
    const score = fill.length + (2 - locA.dist / radius) + (2 - locB.dist / radius);
    if (!best || score > best.score) {
      best = { zoneId: zone.id, points: fill, score };
    }
  }
  return best ? { zoneId: best.zoneId, points: best.points } : null;
}

/**
 * Union-find pour regrouper les sommets proches entre zones sélectionnées.
 */
function ufParent(parent, i) {
  if (parent[i] !== i) parent[i] = ufParent(parent, parent[i]);
  return parent[i];
}

function ufUnion(parent, a, b) {
  const ra = ufParent(parent, a);
  const rb = ufParent(parent, b);
  if (ra !== rb) parent[rb] = ra;
}

/**
 * Aligne les zones sélectionnées proches : regroupe les sommets dans le seuil
 * et les colle sur le centroïde du groupe (côtés partagés nets).
 *
 * @param {Array<{ id: string|number, points: string|Array }>} zones
 * @param {{ thresholdPct?: number }} [options]
 * @returns {{
 *   aligned: Array<{ id: string, points: Array<{xp:number,yp:number}> }>,
 *   movedVertexCount: number,
 *   clusterCount: number,
 * } | null}
 */
export function previewAlignSelectedZones(zones, options = {}) {
  const threshold = Math.max(
    0.05,
    Number(options.thresholdPct) || ZONE_ALIGN_DEFAULT_THRESHOLD_PCT,
  );
  const normalized = normalizeNeighborZones(zones);
  const nearby = filterNearbyZones(normalized, threshold);
  if (nearby.length < 2) return null;

  /** @type {Array<{ zoneId: string, index: number, xp: number, yp: number }>} */
  const verts = [];
  for (const z of nearby) {
    z.points.forEach((p, index) => {
      verts.push({ zoneId: z.id, index, xp: p.xp, yp: p.yp });
    });
  }
  if (verts.length < 2) return null;

  const parent = verts.map((_, i) => i);
  for (let i = 0; i < verts.length; i += 1) {
    for (let j = i + 1; j < verts.length; j += 1) {
      if (verts[i].zoneId === verts[j].zoneId) continue;
      if (pctDistance(verts[i], verts[j]) <= threshold) ufUnion(parent, i, j);
    }
  }

  /** @type {Map<number, number[]>} */
  const clusters = new Map();
  for (let i = 0; i < verts.length; i += 1) {
    const root = ufParent(parent, i);
    if (!clusters.has(root)) clusters.set(root, []);
    clusters.get(root).push(i);
  }

  /** Position cible par (zoneId, index) */
  const target = new Map();
  let movedVertexCount = 0;
  let clusterCount = 0;

  for (const members of clusters.values()) {
    if (members.length < 2) continue;
    const zoneIds = new Set(members.map((i) => verts[i].zoneId));
    if (zoneIds.size < 2) continue;
    clusterCount += 1;
    let sx = 0;
    let sy = 0;
    for (const i of members) {
      sx += verts[i].xp;
      sy += verts[i].yp;
    }
    const cx = sx / members.length;
    const cy = sy / members.length;
    const snapped = clampPct({ xp: cx, yp: cy });
    for (const i of members) {
      const v = verts[i];
      const key = `${v.zoneId}:${v.index}`;
      target.set(key, snapped);
      if (pctDistance(v, snapped) > 1e-6) movedVertexCount += 1;
    }
  }

  if (!clusterCount) return null;

  const aligned = nearby.map((z) => ({
    id: z.id,
    points: z.points.map((p, index) => {
      const hit = target.get(`${z.id}:${index}`);
      return hit ? { ...hit } : { ...p };
    }),
  }));

  return { aligned, movedVertexCount, clusterCount };
}

/**
 * Applique l’accroche voisin à un point (ou renvoie le point borné inchangé).
 */
export function applyNeighborSnap(point, neighbors, radiusPct, enabled) {
  const base = clampPct(asXpYp(point));
  if (!enabled) return base;
  const hit = snapPointToNeighborZones(base, neighbors, radiusPct);
  return hit ? clampPct(hit) : base;
}
