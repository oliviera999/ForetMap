import { repairSupplementaryPlaneEmojiMojibake } from './emojiMojibakeCore.js';

const MAP_MARKER_EMOJI_MAX_LEN = 16;
const MARKER_DISPLAY_MODES = new Set(['label', 'emoji', 'icon']);
const DEFAULT_QUESTION_MARKER_EMOJI = '❓';
const MARKER_QUESTION_EVENT_TYPES = new Set(['question', 'quiz']);

function normalizeDisplayMode(value) {
  const s = String(value || '')
    .trim()
    .toLowerCase();
  return MARKER_DISPLAY_MODES.has(s) ? s : null;
}

function normalizeMarkerEmoji(value, opts = {}) {
  const { fallback = '', allowEmpty = true } = opts;
  if (value === undefined || value === null) {
    return allowEmpty ? fallback : fallback || DEFAULT_QUESTION_MARKER_EMOJI;
  }
  const s = String(value).trim();
  if (!s) {
    return allowEmpty ? fallback : fallback || DEFAULT_QUESTION_MARKER_EMOJI;
  }
  return repairSupplementaryPlaneEmojiMojibake(s).slice(0, MAP_MARKER_EMOJI_MAX_LEN);
}

const MARKER_ICON_STABLE_KEY_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;

function normalizeIconUrl(value) {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  if (/^javascript:/i.test(s) || /^data:/i.test(s)) return null;
  if (s.startsWith('local:/')) return s.slice(0, 512);
  if (s.startsWith('/uploads/')) return s.slice(0, 512);
  if (/^https?:\/\//i.test(s)) return s.slice(0, 512);
  if (MARKER_ICON_STABLE_KEY_RE.test(s)) return s.slice(0, 512);
  return null;
}

function isQuestionEventType(eventType) {
  const s = String(eventType || '')
    .trim()
    .toLowerCase();
  return MARKER_QUESTION_EVENT_TYPES.has(s);
}

function defaultAppearanceForEventType(eventType) {
  if (isQuestionEventType(eventType)) {
    return {
      displayMode: 'emoji',
      emoji: DEFAULT_QUESTION_MARKER_EMOJI,
      iconUrl: null,
    };
  }
  return {
    displayMode: 'label',
    emoji: null,
    iconUrl: null,
  };
}

function resolveStoredDisplayMode(marker) {
  if (!marker) return null;
  const raw = marker.display_mode ?? marker.displayMode ?? null;
  return normalizeDisplayMode(raw);
}

function resolveMarkerAppearance(marker) {
  const label = String(marker?.label || '').trim() || 'Repère';
  const eventType = marker?.event_type ?? marker?.eventType ?? null;
  const storedMode = resolveStoredDisplayMode(marker);
  const defaults = defaultAppearanceForEventType(eventType);

  let displayMode = storedMode ?? defaults.displayMode;
  let emoji =
    marker?.emoji != null && String(marker.emoji).trim()
      ? normalizeMarkerEmoji(marker.emoji, { allowEmpty: true })
      : storedMode === 'emoji'
        ? defaults.emoji
        : defaults.displayMode === 'emoji'
          ? defaults.emoji
          : null;
  let iconUrl = normalizeIconUrl(marker?.icon_url ?? marker?.iconUrl);

  if (displayMode === 'emoji' && !emoji) {
    displayMode = 'label';
  }
  if (displayMode === 'icon' && !iconUrl) {
    displayMode = 'label';
  }

  let visualContent = label;
  if (displayMode === 'emoji' && emoji) {
    visualContent = emoji;
  } else if (displayMode === 'icon' && iconUrl) {
    visualContent = iconUrl;
  }

  return {
    displayMode,
    emoji: displayMode === 'emoji' ? emoji : null,
    iconUrl: displayMode === 'icon' ? iconUrl : null,
    visualContent,
    ariaLabel: label,
  };
}

function validateMarkerAppearance(input) {
  const label = String(input?.label || '').trim();
  const eventType = input?.eventType ?? input?.event_type ?? null;
  const hasDisplayMode =
    Object.prototype.hasOwnProperty.call(input || {}, 'displayMode') ||
    Object.prototype.hasOwnProperty.call(input || {}, 'display_mode');
  const hasEmoji = Object.prototype.hasOwnProperty.call(input || {}, 'emoji');
  const hasIconUrl =
    Object.prototype.hasOwnProperty.call(input || {}, 'iconUrl') ||
    Object.prototype.hasOwnProperty.call(input || {}, 'icon_url');

  let displayMode = hasDisplayMode
    ? normalizeDisplayMode(input.displayMode ?? input.display_mode)
    : null;
  let emoji = hasEmoji
    ? normalizeMarkerEmoji(input.emoji, { allowEmpty: true, fallback: '' })
    : null;
  let iconUrl = hasIconUrl ? normalizeIconUrl(input.iconUrl ?? input.icon_url) : null;

  if (!hasDisplayMode && !hasEmoji && !hasIconUrl) {
    const defaults = defaultAppearanceForEventType(eventType);
    return {
      error: null,
      displayMode: defaults.displayMode,
      emoji: defaults.emoji,
      iconUrl: defaults.iconUrl,
    };
  }

  if (hasDisplayMode && !displayMode) {
    return { error: 'displayMode invalide (label, emoji ou icon attendu)' };
  }

  if (!displayMode) {
    if (iconUrl) displayMode = 'icon';
    else if (emoji) displayMode = 'emoji';
    else displayMode = defaultAppearanceForEventType(eventType).displayMode;
  }

  if (displayMode === 'emoji') {
    if (!emoji) {
      emoji = isQuestionEventType(eventType) ? DEFAULT_QUESTION_MARKER_EMOJI : null;
    }
    if (!emoji) {
      return { error: 'emoji requis pour displayMode emoji' };
    }
    iconUrl = null;
  } else if (displayMode === 'icon') {
    if (!iconUrl) {
      return { error: 'iconUrl requis pour displayMode icon' };
    }
    emoji = null;
  } else {
    emoji = null;
    iconUrl = null;
  }

  return {
    error: null,
    displayMode,
    emoji,
    iconUrl,
    label,
  };
}

function parseAppearanceInput(body, eventType) {
  const hasAny = ['displayMode', 'display_mode', 'emoji', 'iconUrl', 'icon_url'].some((key) =>
    Object.prototype.hasOwnProperty.call(body || {}, key),
  );
  if (!hasAny) {
    const defaults = defaultAppearanceForEventType(eventType);
    return { skip: true, ...defaults };
  }
  const validated = validateMarkerAppearance({ ...body, eventType });
  if (validated.error) return { skip: false, error: validated.error };
  return {
    skip: false,
    displayMode: validated.displayMode,
    emoji: validated.emoji,
    iconUrl: validated.iconUrl,
  };
}

export {
  MAP_MARKER_EMOJI_MAX_LEN,
  MARKER_DISPLAY_MODES,
  DEFAULT_QUESTION_MARKER_EMOJI,
  MARKER_QUESTION_EVENT_TYPES,
  normalizeDisplayMode,
  normalizeMarkerEmoji,
  normalizeIconUrl,
  isQuestionEventType,
  defaultAppearanceForEventType,
  resolveMarkerAppearance,
  validateMarkerAppearance,
  parseAppearanceInput,
};
