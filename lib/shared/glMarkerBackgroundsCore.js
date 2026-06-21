'use strict';

const MARKER_BACKGROUND_MODES = Object.freeze(['label', 'emoji', 'icon']);

const MARKER_BACKGROUND_PRESETS = new Set(['transparent', 'classic']);

const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i;

const DEFAULT_MARKER_BACKGROUNDS = Object.freeze({
  label: 'transparent',
  emoji: 'transparent',
  icon: 'transparent',
});

const CLASSIC_MARKER_BACKGROUNDS = Object.freeze({
  label: '#fb923c',
  emoji: 'rgba(255, 255, 255, 0.92)',
  icon: 'transparent',
});

const CLASSIC_EMOJI_BOX_SHADOW = '0 1px 4px rgba(15, 23, 42, 0.18)';

const TRANSPARENT_LABEL_TEXT_SHADOW =
  '0 0 2px rgba(255, 255, 255, 0.92), 0 1px 3px rgba(15, 23, 42, 0.35)';

function isValidHexColor(value) {
  return HEX_COLOR_RE.test(String(value || '').trim());
}

function normalizeHexColor(value) {
  const raw = String(value || '').trim();
  if (!isValidHexColor(raw)) return null;
  return raw.toLowerCase();
}

function normalizeMarkerBackgroundModeValue(value, fallback = 'transparent') {
  const raw = String(value ?? '')
    .trim()
    .toLowerCase();
  if (MARKER_BACKGROUND_PRESETS.has(raw)) return raw;
  const hex = normalizeHexColor(value);
  if (hex) return hex;
  return fallback;
}

function normalizeMarkerBackgrounds(input) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  return {
    label: normalizeMarkerBackgroundModeValue(source.label, DEFAULT_MARKER_BACKGROUNDS.label),
    emoji: normalizeMarkerBackgroundModeValue(source.emoji, DEFAULT_MARKER_BACKGROUNDS.emoji),
    icon: normalizeMarkerBackgroundModeValue(source.icon, DEFAULT_MARKER_BACKGROUNDS.icon),
  };
}

function validateMarkerBackgrounds(input) {
  if (input == null || typeof input !== 'object' || Array.isArray(input)) {
    return { error: 'marker_backgrounds doit être un objet JSON' };
  }
  const normalized = {};
  for (const mode of MARKER_BACKGROUND_MODES) {
    if (!Object.prototype.hasOwnProperty.call(input, mode)) {
      normalized[mode] = DEFAULT_MARKER_BACKGROUNDS[mode];
      continue;
    }
    const raw = input[mode];
    const preset = String(raw ?? '')
      .trim()
      .toLowerCase();
    if (MARKER_BACKGROUND_PRESETS.has(preset)) {
      normalized[mode] = preset;
      continue;
    }
    const hex = normalizeHexColor(raw);
    if (hex) {
      normalized[mode] = hex;
      continue;
    }
    return { error: `Valeur marker_backgrounds.${mode} invalide (transparent, classic ou #RRGGBB)` };
  }
  return { error: null, value: normalized };
}

function resolveBackgroundCssValue(mode, settingValue) {
  const normalized = normalizeMarkerBackgroundModeValue(
    settingValue,
    DEFAULT_MARKER_BACKGROUNDS[mode],
  );
  if (normalized === 'transparent') return 'transparent';
  if (normalized === 'classic') return CLASSIC_MARKER_BACKGROUNDS[mode];
  return normalized;
}

function resolveMarkerBackgroundCssVars(backgrounds) {
  const normalized = normalizeMarkerBackgrounds(backgrounds);
  const labelBg = resolveBackgroundCssValue('label', normalized.label);
  const emojiBg = resolveBackgroundCssValue('emoji', normalized.emoji);
  const iconBg = resolveBackgroundCssValue('icon', normalized.icon);

  const vars = {
    '--gl-marker-bg-label': labelBg,
    '--gl-marker-bg-emoji': emojiBg,
    '--gl-marker-bg-icon': iconBg,
    '--gl-marker-bg-emoji-shadow':
      normalized.emoji === 'classic' ? CLASSIC_EMOJI_BOX_SHADOW : 'none',
    '--gl-marker-label-text-shadow':
      normalized.label === 'transparent' ? TRANSPARENT_LABEL_TEXT_SHADOW : 'none',
  };

  return vars;
}

module.exports = {
  MARKER_BACKGROUND_MODES,
  MARKER_BACKGROUND_PRESETS,
  DEFAULT_MARKER_BACKGROUNDS,
  CLASSIC_MARKER_BACKGROUNDS,
  CLASSIC_EMOJI_BOX_SHADOW,
  TRANSPARENT_LABEL_TEXT_SHADOW,
  isValidHexColor,
  normalizeHexColor,
  normalizeMarkerBackgroundModeValue,
  normalizeMarkerBackgrounds,
  validateMarkerBackgrounds,
  resolveBackgroundCssValue,
  resolveMarkerBackgroundCssVars,
};
