'use strict';

/**
 * L'équipe est-elle réellement dans la zone feuillet qu'elle présente ?
 *
 * Sans ce contrôle, `POST /api/gl/games/:id/feuillet-zones/:zoneId/present` ne vérifiait
 * que l'existence de la zone et l'appartenance du joueur à une équipe : un élève pouvait
 * enchaîner les 24 zones du catalogue depuis sa chaise, encaisser les cœurs et les gemmes
 * de chacune et inscrire autant d'événements `feuillet_zone_presented` — sans jamais
 * déplacer sa mascotte. Le déplacement est pourtant tout le jeu.
 *
 * Deux systèmes de coordonnées se rencontrent ici, et c'est le piège du module :
 *   - le catalogue (`src/gl/data/zones_feuillets.json`) décrit ses polygones en
 *     coordonnées **normalisées 0–1** ;
 *   - la position d'une équipe est stockée en **pourcentage 0–100**, qu'elle soit libre
 *     (`position_x_pct`) ou héritée du repère où elle se tient (`marker_x_pct`).
 * On convertit donc le polygone, jamais la position — c'est le sens qui préserve la
 * comparaison faite côté navigateur.
 *
 * Le MJ n'est pas soumis à cette garde : présenter une zone à distance est un geste
 * d'animation légitime (démonstration, rattrapage d'une équipe bloquée).
 */

const { isPointInPolygon } = require('./shared/glPointInPolygon');

/**
 * Coercition stricte en nombre. `Number(null)` et `Number('')` valent **0**, ce qui ferait
 * passer une coordonnée absente pour l'origine du plateau — une équipe de position inconnue
 * serait alors « quelque part en haut à gauche » plutôt qu'introuvable. Seuls un nombre fini
 * ou une chaîne non vide qui en représente un sont acceptés.
 * @returns {number|null}
 */
function toFiniteNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Coordonnée normalisée 0–1 → pourcentage 0–100. `null` si inexploitable. */
function normToPct(value) {
  const n = toFiniteNumber(value);
  return n == null ? null : n * 100;
}

/**
 * Polygone du catalogue (tuples `[x, y]` en 0–1) → points `{x, y}` en 0–100.
 * Les sommets illisibles sont ignorés ; à moins de trois points, la zone n'est pas un
 * polygone et l'appelant refusera.
 * @param {unknown} polygone
 * @returns {Array<{x:number,y:number}>}
 */
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
 * Position effective de l'équipe en % : sa position libre si elle en a une, sinon celle
 * du repère où elle se tient.
 * @returns {{ xp: number, yp: number } | null} `null` si la position est inconnue
 */
function resolveTeamPctPosition(team) {
  const xp = toFiniteNumber(team?.position_x_pct) ?? toFiniteNumber(team?.marker_x_pct);
  const yp = toFiniteNumber(team?.position_y_pct) ?? toFiniteNumber(team?.marker_y_pct);
  if (xp == null || yp == null) return null;
  return { xp, yp };
}

/**
 * @param {{ position_x_pct?: unknown, position_y_pct?: unknown, marker_x_pct?: unknown, marker_y_pct?: unknown }} team
 * @param {{ polygone?: unknown }} catalogZone zone brute du catalogue
 * @returns {boolean} `false` si la position est inconnue ou le polygone inexploitable
 */
function isTeamInsideFeuilletZone(team, catalogZone) {
  const pos = resolveTeamPctPosition(team);
  if (!pos) return false;
  const points = catalogPolygonToPctPoints(catalogZone?.polygone);
  if (points.length < 3) return false;
  return isPointInPolygon(pos.xp, pos.yp, points);
}

module.exports = {
  toFiniteNumber,
  normToPct,
  catalogPolygonToPctPoints,
  resolveTeamPctPosition,
  isTeamInsideFeuilletZone,
};
