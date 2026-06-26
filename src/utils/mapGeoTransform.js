/**
 * Transformation affine à 3 points entre le repère % d'un plan (xp, yp ∈ [0,100])
 * et les coordonnées GPS réelles (lat, lng). Sert au suivi GPS de la mascotte :
 * la position du capteur est convertie en % puis transmise à `moveTo`.
 *
 * Une transformation affine (6 paramètres) gère translation, échelle, rotation et
 * léger cisaillement — adaptée à une image de plan non alignée au nord. À l'échelle
 * d'un établissement (~centaines de mètres), lat/lng sont traités comme un plan local
 * (pas de projection Mercator nécessaire).
 *
 * @typedef {{ xp: number, yp: number, lat: number, lng: number }} GeoAnchor
 */

/** Seuil de déterminant en dessous duquel les 3 points sont considérés colinéaires. */
const COLLINEAR_EPSILON = 1e-12;

function isFiniteNumber(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

/**
 * Valide un jeu d'ancres : exactement 3 points finis et non colinéaires (dans le repère %).
 * @param {unknown} anchors
 * @returns {boolean}
 */
export function isValidAnchors(anchors) {
  if (!Array.isArray(anchors) || anchors.length !== 3) return false;
  for (const a of anchors) {
    if (!a || typeof a !== 'object') return false;
    if (
      !isFiniteNumber(a.xp) ||
      !isFiniteNumber(a.yp) ||
      !isFiniteNumber(a.lat) ||
      !isFiniteNumber(a.lng)
    ) {
      return false;
    }
  }
  // Non-colinéarité dans le repère % (aire du triangle ≠ 0).
  const [p0, p1, p2] = anchors;
  const area = (p1.xp - p0.xp) * (p2.yp - p0.yp) - (p2.xp - p0.xp) * (p1.yp - p0.yp);
  return Math.abs(area) > 1e-9;
}

/**
 * Résout le système 3×3 M·[u,v,w]ᵀ = r par la règle de Cramer.
 * @param {number[][]} m matrice 3×3
 * @param {number[]} r vecteur résultat (longueur 3)
 * @returns {[number, number, number] | null} null si la matrice est singulière
 */
function solve3x3(m, r) {
  const det =
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  if (!Number.isFinite(det) || Math.abs(det) < COLLINEAR_EPSILON) return null;

  const col = (m2, c, vec) => m2.map((row, i) => row.map((val, j) => (j === c ? vec[i] : val)));
  const detOf = (mm) =>
    mm[0][0] * (mm[1][1] * mm[2][2] - mm[1][2] * mm[2][1]) -
    mm[0][1] * (mm[1][0] * mm[2][2] - mm[1][2] * mm[2][0]) +
    mm[0][2] * (mm[1][0] * mm[2][1] - mm[1][1] * mm[2][0]);

  return [detOf(col(m, 0, r)) / det, detOf(col(m, 1, r)) / det, detOf(col(m, 2, r)) / det];
}

/**
 * Dérive les coefficients affines géo→% à partir de 3 ancres.
 * xp = a·lng + b·lat + c ; yp = d·lng + e·lat + f.
 * @param {GeoAnchor[]} anchors
 * @returns {{ a:number, b:number, c:number, d:number, e:number, f:number } | null}
 */
export function solveAffineFromAnchors(anchors) {
  if (!isValidAnchors(anchors)) return null;
  const m = anchors.map((p) => [p.lng, p.lat, 1]);
  const sx = solve3x3(
    m,
    anchors.map((p) => p.xp),
  );
  const sy = solve3x3(
    m,
    anchors.map((p) => p.yp),
  );
  if (!sx || !sy) return null;
  return { a: sx[0], b: sx[1], c: sx[2], d: sy[0], e: sy[1], f: sy[2] };
}

/**
 * Convertit une coordonnée GPS en position % du plan.
 * @param {number} lat
 * @param {number} lng
 * @param {GeoAnchor[]} anchors
 * @returns {{ xp: number, yp: number } | null}
 */
export function geoToPct(lat, lng, anchors) {
  if (!isFiniteNumber(lat) || !isFiniteNumber(lng)) return null;
  const t = solveAffineFromAnchors(anchors);
  if (!t) return null;
  const xp = t.a * lng + t.b * lat + t.c;
  const yp = t.d * lng + t.e * lat + t.f;
  if (!Number.isFinite(xp) || !Number.isFinite(yp)) return null;
  return { xp, yp };
}

/**
 * Convertit une position % du plan en coordonnée GPS (inverse, pour aperçu/contrôle du calage).
 * @param {number} xp
 * @param {number} yp
 * @param {GeoAnchor[]} anchors
 * @returns {{ lat: number, lng: number } | null}
 */
export function pctToGeo(xp, yp, anchors) {
  if (!isFiniteNumber(xp) || !isFiniteNumber(yp) || !isValidAnchors(anchors)) return null;
  const m = anchors.map((p) => [p.xp, p.yp, 1]);
  const slng = solve3x3(
    m,
    anchors.map((p) => p.lng),
  );
  const slat = solve3x3(
    m,
    anchors.map((p) => p.lat),
  );
  if (!slng || !slat) return null;
  const lng = slng[0] * xp + slng[1] * yp + slng[2];
  const lat = slat[0] * xp + slat[1] * yp + slat[2];
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

/**
 * Vrai si la position % est dans les limites du plan (avec marge de tolérance).
 * @param {{ xp: number, yp: number } | null} pct
 * @param {number} [margin] marge en % au-delà des bords (défaut 0)
 * @returns {boolean}
 */
export function isPctWithinMap(pct, margin = 0) {
  if (!pct) return false;
  return pct.xp >= -margin && pct.xp <= 100 + margin && pct.yp >= -margin && pct.yp <= 100 + margin;
}
