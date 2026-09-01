'use strict';

/**
 * Géoréférencement des plans (côté serveur) : validation et normalisation des
 * ancres de calibration GPS stockées dans `maps.geo_anchors_json`.
 *
 * Le calcul de la transformation affine vit côté front (src/utils/mapGeoTransform.js) ;
 * le serveur se contente de valider/exposer les ancres. La logique de validité
 * (3 points finis, non colinéaires) est volontairement dupliquée ici en CJS pour
 * garder l'API autonome, sans interop ESM.
 *
 * @typedef {{ xp: number, yp: number, lat: number, lng: number }} GeoAnchor
 */

function isFiniteNumber(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

/**
 * Coordonnée d'ancre tolérante : un nombre, ou une chaîne numérique à séparateur décimal
 * point ou virgule (`"48,8534"`). Le front normalise déjà la saisie (voir
 * `src/utils/geoCoordParse.js`, qui gère en plus DMS et hémisphères) ; ce filet évite
 * qu'un client renvoyant une chaîne se voie opposer un 400 pour un simple séparateur.
 * @param {unknown} v
 * @returns {number|null}
 */
function toCoordNumber(v) {
  if (isFiniteNumber(v)) return v;
  if (typeof v !== 'string') return null;
  const text = v.trim().replace(/[−–—]/g, '-');
  if (!/^[+-]?(\d+([.,]\d*)?|[.,]\d+)$/.test(text)) return null;
  const parsed = Number(text.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Valide un jeu d'ancres : exactement 3 points finis et non colinéaires (repère %).
 * @param {unknown} anchors
 * @returns {boolean}
 */
function isValidAnchors(anchors) {
  if (!Array.isArray(anchors) || anchors.length !== 3) return false;
  const points = [];
  for (const a of anchors) {
    if (!a || typeof a !== 'object') return false;
    const xp = toCoordNumber(a.xp);
    const yp = toCoordNumber(a.yp);
    const lat = toCoordNumber(a.lat);
    const lng = toCoordNumber(a.lng);
    if (xp == null || yp == null || lat == null || lng == null) return false;
    if (xp < 0 || xp > 100 || yp < 0 || yp > 100) return false;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
    points.push({ xp, yp, lat, lng });
  }
  const [p0, p1, p2] = points;
  const area = (p1.xp - p0.xp) * (p2.yp - p0.yp) - (p2.xp - p0.xp) * (p1.yp - p0.yp);
  return Math.abs(area) > 1e-9;
}

/**
 * Réduit chaque ancre à ses 4 champs numériques (ignore tout extra).
 * @param {GeoAnchor[]} anchors
 * @returns {GeoAnchor[]}
 */
function sanitizeAnchors(anchors) {
  return anchors.map((a) => ({
    xp: toCoordNumber(a.xp),
    yp: toCoordNumber(a.yp),
    lat: toCoordNumber(a.lat),
    lng: toCoordNumber(a.lng),
  }));
}

/**
 * Parse le JSON d'ancres stocké en base ; retourne les ancres valides ou null.
 * @param {string|null|undefined} raw
 * @returns {GeoAnchor[]|null}
 */
function parseAnchors(raw) {
  if (raw == null || raw === '') return null;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return isValidAnchors(parsed) ? sanitizeAnchors(parsed) : null;
  } catch (_) {
    return null;
  }
}

/** Mètres par degré de latitude (approximation sphérique, suffisante à l'échelle d'un site). */
const METERS_PER_DEGREE = 111320;

/** Ratio max toléré entre les échelles m/% des paires d'ancres (cf. miroir ESM). */
const GEO_SCALE_RATIO_MAX = 8;

/** Aplatissement minimal du triangle GPS (hauteur min / plus long côté). */
const GEO_FLATNESS_MIN = 0.05;

/**
 * Contrôle de plausibilité **géographique** d'un calage — miroir CJS de
 * `assessAnchorsGeoPlausibility` de `src/utils/mapGeoTransform.js` (même duplication
 * volontaire que `isValidAnchors`, voir l'en-tête). Les bornes et la non-colinéarité
 * en % laissent passer un triangle GPS quasi plat ou des échelles m/% incompatibles
 * entre paires (constat C1 de `docs/AUDIT_GEOLOCALISATION_2026-09.md`, cas réel en
 * production dans l'audit BDD §3.1) : la transformation résultante est acceptée mais
 * absurde. Appliqué **à l'écriture uniquement** — les calages déjà stockés restent
 * servis tels quels tant qu'ils ne sont pas réenregistrés.
 *
 * @param {GeoAnchor[]} anchors ancres déjà passées par `isValidAnchors`/`sanitizeAnchors`
 * @returns {{ ok: true } | { ok: false, reason: 'geo_collinear'|'scale_mismatch', scaleRatio?: number }}
 */
function assessAnchorsGeoPlausibility(anchors) {
  const lat0 = (anchors[0].lat + anchors[1].lat + anchors[2].lat) / 3;
  const lng0 = (anchors[0].lng + anchors[1].lng + anchors[2].lng) / 3;
  const cosLat = Math.cos((lat0 * Math.PI) / 180);
  const pts = anchors.map((p) => ({
    x: (p.lng - lng0) * cosLat * METERS_PER_DEGREE,
    y: (p.lat - lat0) * METERS_PER_DEGREE,
    xp: p.xp,
    yp: p.yp,
  }));
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
  if (!(flatness >= GEO_FLATNESS_MIN)) return { ok: false, reason: 'geo_collinear' };

  const scales = pairs.map((p) => p.scale);
  const scaleRatio = Math.max(...scales) / Math.min(...scales);
  if (!(scaleRatio <= GEO_SCALE_RATIO_MAX)) {
    return { ok: false, reason: 'scale_mismatch', scaleRatio };
  }
  return { ok: true };
}

/**
 * Normalise une ligne `maps` pour l'API : ajoute `georef` (ancres ou null) et
 * `gps_enabled` (booléen). Le champ brut `geo_anchors_json` est retiré.
 * @param {Record<string, unknown>} row
 * @returns {Record<string, unknown>}
 */
function withMapGeoref(row) {
  if (!row || typeof row !== 'object') return row;
  const { geo_anchors_json: rawAnchors, gps_enabled, ...rest } = row;
  const georef = parseAnchors(rawAnchors);
  return {
    ...rest,
    georef,
    gps_enabled: !!gps_enabled && !!georef,
  };
}

module.exports = {
  isValidAnchors,
  sanitizeAnchors,
  parseAnchors,
  withMapGeoref,
  assessAnchorsGeoPlausibility,
};
