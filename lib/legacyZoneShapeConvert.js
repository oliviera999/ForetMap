/**
 * Conversion des zones legacy (rect/circle/ellipse en pixels) vers des polygones en % (xp/yp).
 * Dimensions par défaut : plan forêt comestible 1600×1000 (viewBox SVG / repère fork SQLite).
 */

const DEFAULT_MAP_WIDTH = 1600;
const DEFAULT_MAP_HEIGHT = 1000;
const CURVE_SEGMENTS = 24;

function clampPct(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

function pixelToPct(x, y, mapW = DEFAULT_MAP_WIDTH, mapH = DEFAULT_MAP_HEIGHT) {
  return {
    xp: clampPct((Number(x) / mapW) * 100),
    yp: clampPct((Number(y) / mapH) * 100),
  };
}

function parseZonePointsJson(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length < 3) return null;
    const points = parsed
      .map((p) => ({ xp: Number(p?.xp), yp: Number(p?.yp) }))
      .filter((p) => Number.isFinite(p.xp) && Number.isFinite(p.yp));
    return points.length >= 3 ? points : null;
  } catch (_) {
    return null;
  }
}

function rectPixelsToPolygonPoints(
  x,
  y,
  width,
  height,
  mapW = DEFAULT_MAP_WIDTH,
  mapH = DEFAULT_MAP_HEIGHT,
) {
  const x0 = Number(x);
  const y0 = Number(y);
  const w = Number(width);
  const h = Number(height);
  const corners = [
    [x0, y0],
    [x0 + w, y0],
    [x0 + w, y0 + h],
    [x0, y0 + h],
  ];
  return corners.map(([px, py]) => pixelToPct(px, py, mapW, mapH));
}

function circlePixelsToPolygonPoints(
  x,
  y,
  width,
  height,
  mapW = DEFAULT_MAP_WIDTH,
  mapH = DEFAULT_MAP_HEIGHT,
) {
  const x0 = Number(x);
  const y0 = Number(y);
  const w = Number(width);
  const h = Number(height);
  const cx = x0 + w / 2;
  const cy = y0 + h / 2;
  const rx = w / 2;
  const ry = h / 2;
  const points = [];
  for (let i = 0; i < CURVE_SEGMENTS; i += 1) {
    const angle = (2 * Math.PI * i) / CURVE_SEGMENTS;
    points.push(pixelToPct(cx + rx * Math.cos(angle), cy + ry * Math.sin(angle), mapW, mapH));
  }
  return points;
}

function ellipsePixelsToPolygonPoints(
  x,
  y,
  width,
  height,
  mapW = DEFAULT_MAP_WIDTH,
  mapH = DEFAULT_MAP_HEIGHT,
) {
  return circlePixelsToPolygonPoints(x, y, width, height, mapW, mapH);
}

/**
 * @param {object} zone — ligne SQLite `zones` (fork)
 * @param {{ mapWidth?: number, mapHeight?: number }} [options]
 * @returns {string|null} JSON `points` (xp/yp) ou null si conversion impossible
 */
function resolveZonePointsJson(zone, options = {}) {
  const mapW = options.mapWidth ?? DEFAULT_MAP_WIDTH;
  const mapH = options.mapHeight ?? DEFAULT_MAP_HEIGHT;
  const existing = parseZonePointsJson(zone?.points);
  if (existing) return JSON.stringify(existing);

  const shape = String(zone?.shape || 'rect').toLowerCase();
  const x = zone?.x;
  const y = zone?.y;
  const width = zone?.width;
  const height = zone?.height;
  if (![x, y, width, height].every((v) => Number.isFinite(Number(v)))) return null;

  let points = null;
  if (shape === 'circle') {
    points = circlePixelsToPolygonPoints(x, y, width, height, mapW, mapH);
  } else if (shape === 'ellipse') {
    points = ellipsePixelsToPolygonPoints(x, y, width, height, mapW, mapH);
  } else {
    points = rectPixelsToPolygonPoints(x, y, width, height, mapW, mapH);
  }
  return points && points.length >= 3 ? JSON.stringify(points) : null;
}

/**
 * Cultures d'une zone du fork SQLite (`[{ plant, stage }]`) → noms de plantes. L'état de
 * culture (`stage`) n'est plus lu : l'application ne le conserve plus (piste C de l'audit du
 * 25/09/2026, § 3.5 — `zones.stage` n'avait que ce convertisseur pour lecteur).
 */
function parseCulturesJson(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => ({ plant: String(item?.plant || '').trim() }))
      .filter((item) => item.plant);
  } catch (_) {
    return [];
  }
}

/**
 * Mappe `cultures` / `current_plant` du fork SQLite → `living_beings` (liste JSON de noms).
 * Le nom mono-espèce du fork est une donnée source : il devient un être vivant, et n'est
 * plus recopié dans une colonne `current_plant` (retirée, piste C).
 * @param {object} zone
 * @returns {{ living_beings: string|null }}
 */
function mapZoneLivingFields(zone) {
  const cultures = parseCulturesJson(zone?.cultures);
  if (cultures.length > 0) {
    return { living_beings: JSON.stringify([...new Set(cultures.map((c) => c.plant))]) };
  }
  const currentPlant = String(zone?.current_plant || '').trim();
  return { living_beings: currentPlant ? JSON.stringify([currentPlant]) : null };
}

/**
 * Normalise une ligne zone SQLite pour insertion MySQL (carte `foret` par défaut).
 * @param {object} zone
 * @param {{ mapId?: string, mapWidth?: number, mapHeight?: number }} [options]
 * @returns {object|null}
 */
function normalizeSqliteZoneRow(zone, options = {}) {
  if (!zone?.id || !zone?.name) return null;
  const mapId = String(options.mapId || 'foret').trim() || 'foret';
  const points = resolveZonePointsJson(zone, options);
  if (!points) return null;
  const living = mapZoneLivingFields(zone);
  return {
    id: String(zone.id).trim(),
    map_id: mapId,
    name: String(zone.name).trim(),
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    living_beings: living.living_beings,
    special: zone.special ? 1 : 0,
    shape: 'rect',
    points,
    color: zone.color || '#86efac80',
    description: zone.description != null ? String(zone.description) : '',
  };
}

/**
 * Normalise une ligne repère SQLite pour insertion MySQL.
 * @param {object} marker
 * @param {{ mapId?: string }} [options]
 * @returns {object|null}
 */
function normalizeSqliteMarkerRow(marker, options = {}) {
  if (!marker?.id || !marker?.label) return null;
  const xp = Number(marker.x_pct);
  const yp = Number(marker.y_pct);
  if (!Number.isFinite(xp) || !Number.isFinite(yp)) return null;
  const mapId = String(options.mapId || 'foret').trim() || 'foret';
  const plantName = String(marker.plant_name || '').trim();
  return {
    id: String(marker.id).trim(),
    map_id: mapId,
    x_pct: xp,
    y_pct: yp,
    label: String(marker.label).trim(),
    // Nom mono-espèce du fork : devient un être vivant (la colonne `plant_name` est retirée).
    living_beings: plantName ? JSON.stringify([plantName]) : null,
    note: marker.note != null ? String(marker.note) : '',
    emoji: marker.emoji || '🌱',
    created_at: marker.created_at || null,
  };
}

module.exports = {
  DEFAULT_MAP_HEIGHT,
  DEFAULT_MAP_WIDTH,
  clampPct,
  circlePixelsToPolygonPoints,
  ellipsePixelsToPolygonPoints,
  mapZoneLivingFields,
  normalizeSqliteMarkerRow,
  normalizeSqliteZoneRow,
  parseCulturesJson,
  parseZonePointsJson,
  pixelToPct,
  rectPixelsToPolygonPoints,
  resolveZonePointsJson,
};
