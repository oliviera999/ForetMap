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

module.exports = { isValidAnchors, sanitizeAnchors, parseAnchors, withMapGeoref };
