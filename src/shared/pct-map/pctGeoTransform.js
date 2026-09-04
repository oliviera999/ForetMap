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
 * La résolution passe par les **différences au premier point** (système 2×2) : les
 * coordonnées sont ainsi implicitement centrées, ce qui évite les annulations
 * catastrophiques entre des longitudes ~2,3 et la colonne de 1 du système 3×3 naïf,
 * et permet un test de singularité **relatif** à l'échelle des données — un seuil
 * absolu n'a aucun sens quand les écarts de coordonnées valent 10⁻⁴ à 10⁻³ degré
 * (voir `docs/AUDIT_GEOLOCALISATION_2026-09.md`, C1).
 *
 * @typedef {{ xp: number, yp: number, lat: number, lng: number }} GeoAnchor
 * @typedef {{ a:number, b:number, c:number, d:number, e:number, f:number }} GeoTransform
 */

/** Seuil relatif de singularité : |det| rapporté au carré de la plus grande différence. */
const RELATIVE_DET_EPSILON = 1e-9;

/** Mètres par degré de latitude (approximation sphérique, suffisante à l'échelle d'un site). */
const METERS_PER_DEGREE = 111320;

/**
 * Ratio max toléré entre les échelles m/% impliquées par les paires d'ancres.
 * Large à dessein : un plan très allongé (image 3:1) produit légitimement un ratio ~3 ;
 * le cas pathologique observé en production (audit BDD §3.1) était à 26.
 */
export const GEO_SCALE_RATIO_MAX = 8;

/**
 * Aplatissement minimal du triangle GPS : hauteur minimale rapportée au plus long côté
 * (équivalent à 2·aire/longest²). En dessous, les trois points GPS sont quasi alignés
 * et la transformation est numériquement absurde.
 */
export const GEO_FLATNESS_MIN = 0.05;

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
 * Résout l'affine (u,v) → (x,y) par différences au premier point : x = a·u + b·v + c,
 * y = d·u + e·v + f. Test de singularité relatif à l'échelle des différences.
 * @param {{u:number,v:number}[]} src 3 points source
 * @param {{x:number,y:number}[]} dst 3 points destination
 * @returns {GeoTransform | null}
 */
function solveAffine2D(src, dst) {
  const du1 = src[1].u - src[0].u;
  const dv1 = src[1].v - src[0].v;
  const du2 = src[2].u - src[0].u;
  const dv2 = src[2].v - src[0].v;
  const det = du1 * dv2 - du2 * dv1;
  const scale = Math.max(Math.abs(du1), Math.abs(dv1), Math.abs(du2), Math.abs(dv2));
  if (!Number.isFinite(det) || Math.abs(det) < RELATIVE_DET_EPSILON * scale * scale) return null;

  const dx1 = dst[1].x - dst[0].x;
  const dx2 = dst[2].x - dst[0].x;
  const dy1 = dst[1].y - dst[0].y;
  const dy2 = dst[2].y - dst[0].y;
  const a = (dx1 * dv2 - dx2 * dv1) / det;
  const b = (du1 * dx2 - du2 * dx1) / det;
  const c = dst[0].x - a * src[0].u - b * src[0].v;
  const d = (dy1 * dv2 - dy2 * dv1) / det;
  const e = (du1 * dy2 - du2 * dy1) / det;
  const f = dst[0].y - d * src[0].u - e * src[0].v;
  if (![a, b, c, d, e, f].every(Number.isFinite)) return null;
  return { a, b, c, d, e, f };
}

/**
 * Dérive les coefficients affines géo→% à partir de 3 ancres.
 * xp = a·lng + b·lat + c ; yp = d·lng + e·lat + f.
 * @param {GeoAnchor[]} anchors
 * @returns {GeoTransform | null}
 */
export function solveAffineFromAnchors(anchors) {
  if (!isValidAnchors(anchors)) return null;
  return solveAffine2D(
    anchors.map((p) => ({ u: p.lng, v: p.lat })),
    anchors.map((p) => ({ x: p.xp, y: p.yp })),
  );
}

/**
 * Applique une transformation géo→% pré-calculée (voir `solveAffineFromAnchors`) —
 * évite de re-résoudre le système à chaque position du capteur.
 * @param {GeoTransform | null} t
 * @param {number} lat
 * @param {number} lng
 * @returns {{ xp: number, yp: number } | null}
 */
export function applyGeoTransform(t, lat, lng) {
  if (!t || !isFiniteNumber(lat) || !isFiniteNumber(lng)) return null;
  const xp = t.a * lng + t.b * lat + t.c;
  const yp = t.d * lng + t.e * lat + t.f;
  if (!Number.isFinite(xp) || !Number.isFinite(yp)) return null;
  return { xp, yp };
}

/**
 * Convertit une coordonnée GPS en position % du plan.
 * @param {number} lat
 * @param {number} lng
 * @param {GeoAnchor[]} anchors
 * @returns {{ xp: number, yp: number } | null}
 */
export function geoToPct(lat, lng, anchors) {
  return applyGeoTransform(solveAffineFromAnchors(anchors), lat, lng);
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
  const t = solveAffine2D(
    anchors.map((p) => ({ u: p.xp, v: p.yp })),
    anchors.map((p) => ({ x: p.lng, y: p.lat })),
  );
  if (!t) return null;
  const lng = t.a * xp + t.b * yp + t.c;
  const lat = t.d * xp + t.e * yp + t.f;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

/**
 * Projette les 3 ancres dans un plan local en mètres (x = est, y = nord), centré
 * sur leur barycentre — le facteur cos(lat) corrige la convergence des méridiens.
 * @param {GeoAnchor[]} anchors ancres déjà validées
 * @returns {{ x:number, y:number, xp:number, yp:number }[]}
 */
function anchorsToLocalMeters(anchors) {
  const lat0 = (anchors[0].lat + anchors[1].lat + anchors[2].lat) / 3;
  const lng0 = (anchors[0].lng + anchors[1].lng + anchors[2].lng) / 3;
  const cosLat = Math.cos((lat0 * Math.PI) / 180);
  return anchors.map((p) => ({
    x: (p.lng - lng0) * cosLat * METERS_PER_DEGREE,
    y: (p.lat - lat0) * METERS_PER_DEGREE,
    xp: p.xp,
    yp: p.yp,
  }));
}

/**
 * Contrôle de plausibilité **géographique** d'un calage (audit C1) : les bornes et la
 * non-colinéarité en % ne suffisent pas — un triangle GPS quasi plat ou des échelles
 * m/% incompatibles entre paires produisent une transformation acceptée mais absurde.
 *
 * @param {unknown} anchors
 * @returns {{ ok: true, scaleRatio: number, flatness: number }
 *         | { ok: false, reason: 'invalid'|'geo_collinear'|'scale_mismatch',
 *             scaleRatio?: number, flatness?: number }}
 */
export function assessAnchorsGeoPlausibility(anchors) {
  if (!isValidAnchors(anchors)) return { ok: false, reason: 'invalid' };
  const pts = anchorsToLocalMeters(anchors);
  const pairs = [
    [0, 1],
    [0, 2],
    [1, 2],
  ].map(([i, j]) => {
    const distM = Math.hypot(pts[j].x - pts[i].x, pts[j].y - pts[i].y);
    const distPct = Math.hypot(pts[j].xp - pts[i].xp, pts[j].yp - pts[i].yp);
    return { distM, scale: distM / distPct };
  });

  const areaM2 =
    Math.abs(
      (pts[1].x - pts[0].x) * (pts[2].y - pts[0].y) - (pts[2].x - pts[0].x) * (pts[1].y - pts[0].y),
    ) / 2;
  const longestM = Math.max(...pairs.map((p) => p.distM));
  const flatness = longestM > 0 ? (2 * areaM2) / (longestM * longestM) : 0;
  if (!(flatness >= GEO_FLATNESS_MIN)) return { ok: false, reason: 'geo_collinear', flatness };

  const scales = pairs.map((p) => p.scale);
  const scaleRatio = Math.max(...scales) / Math.min(...scales);
  if (!(scaleRatio <= GEO_SCALE_RATIO_MAX)) {
    return { ok: false, reason: 'scale_mismatch', scaleRatio, flatness };
  }
  return { ok: true, scaleRatio, flatness };
}

/**
 * Dimensions réelles approximatives du plan (largeur/hauteur en mètres), déduites du
 * calage — affichées dans l'outil prof comme contrôle de vraisemblance.
 * @param {GeoAnchor[]} anchors
 * @returns {{ widthM: number, heightM: number } | null}
 */
export function planSizeMeters(anchors) {
  const origin = pctToGeo(0, 0, anchors);
  const right = pctToGeo(100, 0, anchors);
  const bottom = pctToGeo(0, 100, anchors);
  if (!origin || !right || !bottom) return null;
  const cosLat = Math.cos((origin.lat * Math.PI) / 180);
  const dist = (p, q) =>
    Math.hypot((q.lng - p.lng) * cosLat * METERS_PER_DEGREE, (q.lat - p.lat) * METERS_PER_DEGREE);
  const widthM = dist(origin, right);
  const heightM = dist(origin, bottom);
  if (!Number.isFinite(widthM) || !Number.isFinite(heightM)) return null;
  return { widthM, heightM };
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
