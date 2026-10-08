/**
 * Réglages « zoom sur le repère / la zone avant le popover d'arrivée » (`gameplay.board_focus_*`),
 * lus depuis les réglages de jeu publics (clés camelCase de `/api/gl/gameplay-settings`) ou
 * depuis les clés pointées du formulaire admin.
 */

export const BOARD_FOCUS_DEFAULTS = Object.freeze({
  enabled: true,
  durationMs: 350,
  restoreOnClose: true,
  fx: Object.freeze({ emoji: true, spotlight: true, sparkles: true }),
});

function flagDefaultOn(value) {
  if (value == null) return true;
  return value === true || value === 'true' || value === 1 || value === '1';
}

/**
 * @param {object} [gameplaySettings]
 * @returns {{ enabled: boolean, durationMs: number, restoreOnClose: boolean,
 *   fx: { emoji: boolean, spotlight: boolean, sparkles: boolean } }}
 */
export function resolveBoardFocusSettings(gameplaySettings = {}) {
  const s = gameplaySettings && typeof gameplaySettings === 'object' ? gameplaySettings : {};
  const rawDuration = Number(s.boardFocusDurationMs ?? s['gameplay.board_focus_duration_ms']);
  return {
    enabled: flagDefaultOn(s.boardFocusEnabled ?? s['gameplay.board_focus_enabled']),
    durationMs: Number.isFinite(rawDuration)
      ? Math.min(800, Math.max(150, Math.round(rawDuration)))
      : BOARD_FOCUS_DEFAULTS.durationMs,
    restoreOnClose: flagDefaultOn(
      s.boardFocusRestoreOnClose ?? s['gameplay.board_focus_restore_on_close'],
    ),
    fx: {
      emoji: flagDefaultOn(s.boardFocusFxEmoji ?? s['gameplay.board_focus_fx_emoji']),
      spotlight: flagDefaultOn(s.boardFocusFxSpotlight ?? s['gameplay.board_focus_fx_spotlight']),
      sparkles: flagDefaultOn(s.boardFocusFxSparkles ?? s['gameplay.board_focus_fx_sparkles']),
    },
  };
}
