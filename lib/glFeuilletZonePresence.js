'use strict';

/**
 * Présence d'une équipe dans une zone feuillet (anti-farm).
 * Les polygones du catalogue sont en coords normalisées 0–1 ; la position
 * d'équipe est en % 0–100 (comme le front `glNormMapCoords` / `glPointInPolygon`).
 */

const { isPointInPolygon } = require('./shared/glPointInPolygon');

function normToPct(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n * 100;
}

/** @param {unknown} polygone tuples [x,y] 0–1 → points {x,y} 0–100 */
function catalogPolygonToPctPoints(polygone) {
  if (!Array.isArray(polygone)) return [];
  const points = [];
  for (const pt of polygone) {
    if (!Array.isArray(pt) || pt.length < 2) continue;
    const x = normToPct(pt[0]);
    const y = normToPct(pt[1]);
    if (x == null || y == null) continue;
    points.push({ x, y });
  }
  return points;
}

/**
 * Position effective de l'équipe (libre ou héritée du repère).
 * @param {{ position_x_pct?: unknown, position_y_pct?: unknown, marker_x_pct?: unknown, marker_y_pct?: unknown }} team
 * @returns {{ xp: number, yp: number } | null}
 */
function resolveTeamPctPosition(team) {
  const xpRaw = team?.position_x_pct ?? team?.marker_x_pct;
  const ypRaw = team?.position_y_pct ?? team?.marker_y_pct;
  const xp = Number(xpRaw);
  const yp = Number(ypRaw);
  if (!Number.isFinite(xp) || !Number.isFinite(yp)) return null;
  return { xp, yp };
}

/**
 * @param {{ position_x_pct?: unknown, position_y_pct?: unknown, marker_x_pct?: unknown, marker_y_pct?: unknown }} team
 * @param {{ polygone?: unknown }} catalogZone zone brute du JSON catalogue
 */
function isTeamInsideFeuilletZone(team, catalogZone) {
  const pos = resolveTeamPctPosition(team);
  if (!pos) return false;
  const points = catalogPolygonToPctPoints(catalogZone?.polygone);
  if (points.length < 3) return false;
  return isPointInPolygon(pos.xp, pos.yp, points);
}

module.exports = {
  normToPct,
  catalogPolygonToPctPoints,
  resolveTeamPctPosition,
  isTeamInsideFeuilletZone,
};
