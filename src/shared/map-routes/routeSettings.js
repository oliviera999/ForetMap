/**
 * Réglages du **mode parcours** (`ui.routes.*`, déclarés dans `lib/settings/routes.js`),
 * ramenés à une forme sûre pour les trois surfaces (Visite, carte de travail, plans).
 *
 * Les valeurs viennent du réseau, ou d'un cache hors ligne écrit par une version antérieure :
 * chacune est bornée ici, et retombe sur le défaut si elle manque ou ne veut rien dire.
 */

export const ROUTE_SETTINGS_DEFAULTS = Object.freeze({
  overviewEnabled: true,
  autoLocate: true,
  cameraEnabled: true,
  /** Zoom de marche, en multiple de la carte entière. */
  walkingZoom: 3,
  walkingTriggerM: 8,
  /** Anticipation vers l'étape, en fraction de la demi-vue (0 → 0,9). */
  lookahead: 0.6,
  lineAnimated: true,
});

function readBool(value, fallback) {
  if (value === true || value === 1 || value === '1' || value === 'true') return true;
  if (value === false || value === 0 || value === '0' || value === 'false') return false;
  return fallback;
}

function readNumber(value, fallback, min, max) {
  if (value == null || value === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/**
 * @param {object|null|undefined} raw section `routes` des réglages (clés du registre, sans le
 *   préfixe `ui.routes.`).
 * @returns {typeof ROUTE_SETTINGS_DEFAULTS}
 */
export function resolveRouteSettings(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const d = ROUTE_SETTINGS_DEFAULTS;
  return {
    overviewEnabled: readBool(src.overview_enabled, d.overviewEnabled),
    autoLocate: readBool(src.auto_locate, d.autoLocate),
    cameraEnabled: readBool(src.camera_enabled, d.cameraEnabled),
    walkingZoom: readNumber(src.walking_zoom_percent, d.walkingZoom * 100, 150, 800) / 100,
    walkingTriggerM: readNumber(src.walking_trigger_m, d.walkingTriggerM, 2, 100),
    lookahead: readNumber(src.lookahead_percent, d.lookahead * 100, 0, 90) / 100,
    lineAnimated: readBool(src.line_animated, d.lineAnimated),
  };
}
