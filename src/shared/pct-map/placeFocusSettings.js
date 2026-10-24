/**
 * Réglages du **zoom sur le lieu avant sa fiche** (`ui.place_focus.*`, déclarés dans
 * `lib/settings/placeFocus.js`), ramenés à une forme sûre pour les trois surfaces ForetMap
 * (carte de travail, Visite, Plan). Même principe que `resolveRouteSettings` : une valeur
 * absente, hors bornes ou illisible retombe sur le défaut.
 */

export const PLACE_FOCUS_SETTINGS_DEFAULTS = Object.freeze({
  workEnabled: true,
  visitEnabled: true,
  planEnabled: true,
  durationMs: 350,
  /** Zoom maximal, en multiple de la carte entière. */
  maxZoom: 4,
  restoreOnClose: true,
  /** Effets visuels par surface : emoji qui s'envole / atterrit, projecteur. */
  fx: Object.freeze({
    work: Object.freeze({ emoji: true, spotlight: true }),
    visit: Object.freeze({ emoji: true, spotlight: true }),
    plan: Object.freeze({ emoji: true, spotlight: true }),
  }),
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
 * @param {object|null|undefined} raw section `place_focus` des réglages (clés du registre,
 *   sans le préfixe `ui.place_focus.`).
 * @returns {typeof PLACE_FOCUS_SETTINGS_DEFAULTS}
 */
export function resolvePlaceFocusSettings(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const d = PLACE_FOCUS_SETTINGS_DEFAULTS;
  return {
    workEnabled: readBool(src.work_enabled, d.workEnabled),
    visitEnabled: readBool(src.visit_enabled, d.visitEnabled),
    planEnabled: readBool(src.plan_enabled, d.planEnabled),
    durationMs: readNumber(src.duration_ms, d.durationMs, 150, 800),
    maxZoom: readNumber(src.max_zoom_percent, d.maxZoom * 100, 150, 800) / 100,
    restoreOnClose: readBool(src.restore_on_close, d.restoreOnClose),
    fx: {
      work: readFx(src, 'work'),
      visit: readFx(src, 'visit'),
      plan: readFx(src, 'plan'),
    },
  };
}

function readFx(src, surface) {
  const d = PLACE_FOCUS_SETTINGS_DEFAULTS.fx[surface];
  return {
    emoji: readBool(src[`fx_emoji_${surface}`], d.emoji),
    spotlight: readBool(src[`fx_spotlight_${surface}`], d.spotlight),
  };
}
