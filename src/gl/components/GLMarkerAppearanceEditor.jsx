import React from 'react';
import { MediaLibraryMenu } from '../../components/MediaLibraryMenu.jsx';
import {
  DEFAULT_QUESTION_MARKER_EMOJI,
  MAP_MARKER_EMOJI_MAX_LEN,
  defaultAppearanceForEventType,
  isQuestionEventType,
  normalizeDisplayMode,
  normalizeMarkerEmoji,
} from '../../utils/glMarkerAppearance.js';
import { useResolveGlMarkerIconDisplayUrl } from '../hooks/useResolveGlMarkerIconDisplayUrl.js';

const DISPLAY_MODE_OPTIONS = [
  { value: 'label', label: 'Texte (titre)' },
  { value: 'emoji', label: 'Emoji' },
  { value: 'icon', label: 'Icône (image)' },
];

const QUICK_EMOJIS = ['❓', '🚩', '📖', '⭐', '🎯', '🌿'];

export const EMPTY_APPEARANCE_FORM = {
  displayMode: 'emoji',
  emoji: DEFAULT_QUESTION_MARKER_EMOJI,
  iconUrl: '',
  touched: false,
};

export function appearanceFormFromMarker(marker) {
  if (!marker) return { ...EMPTY_APPEARANCE_FORM };
  const storedMode = normalizeDisplayMode(marker.display_mode ?? marker.displayMode);
  const eventType = marker.event_type ?? marker.eventType;
  const defaults = defaultAppearanceForEventType(eventType);
  return {
    displayMode: storedMode ?? defaults.displayMode,
    emoji: marker.emoji ?? defaults.emoji ?? '',
    iconUrl: marker.icon_url ?? marker.iconUrl ?? '',
    touched: storedMode != null,
  };
}

export function appearanceDefaultsForEventType(eventType, currentForm) {
  if (currentForm?.touched) return null;
  return defaultAppearanceForEventType(eventType);
}

export function GLMarkerAppearanceEditor({
  value,
  onChange,
  eventType,
  fetchMediaLibrary,
  uploadMediaLibrary,
  removeMediaLibrary,
}) {
  const displayMode = value?.displayMode || 'label';
  const emoji = value?.emoji ?? '';
  const iconUrl = value?.iconUrl ?? '';
  const resolveIconUrl = useResolveGlMarkerIconDisplayUrl();
  const previewIconUrl = iconUrl ? resolveIconUrl(iconUrl) || iconUrl : '';

  function patch(next) {
    onChange?.({
      ...value,
      ...next,
      touched: next.touched !== undefined ? next.touched : true,
    });
  }

  function handleDisplayModeChange(nextMode) {
    const mode = normalizeDisplayMode(nextMode) || 'label';
    if (mode === 'emoji') {
      patch({
        displayMode: mode,
        emoji: emoji || (isQuestionEventType(eventType) ? DEFAULT_QUESTION_MARKER_EMOJI : '⭐'),
        iconUrl: '',
      });
      return;
    }
    if (mode === 'icon') {
      patch({ displayMode: mode, emoji: '', iconUrl });
      return;
    }
    patch({ displayMode: 'label', emoji: '', iconUrl: '' });
  }

  return (
    <fieldset className="gl-marker-appearance-editor">
      <legend>Affichage sur la carte</legend>
      <p className="gl-hint">Le label reste utilisé dans les modales et pour l’accessibilité.</p>
      <label>
        Mode d’affichage
        <select
          value={displayMode}
          onChange={(event) => handleDisplayModeChange(event.target.value)}
        >
          {DISPLAY_MODE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      {displayMode === 'emoji' ? (
        <div className="gl-marker-appearance-editor__emoji">
          <label>
            Emoji
            <input
              type="text"
              inputMode="text"
              autoComplete="off"
              spellCheck={false}
              maxLength={MAP_MARKER_EMOJI_MAX_LEN}
              className="gl-marker-appearance-editor__emoji-input"
              value={emoji}
              onChange={(event) =>
                patch({
                  emoji: normalizeMarkerEmoji(event.target.value, {
                    allowEmpty: true,
                    fallback: '',
                  }),
                })
              }
              style={{ maxWidth: 140 }}
            />
          </label>
          <div
            className="gl-marker-appearance-editor__emoji-quick"
            role="group"
            aria-label="Emojis suggérés"
          >
            {QUICK_EMOJIS.map((item) => (
              <button
                key={item}
                type="button"
                className={`emoji-btn ${emoji === item ? 'sel' : ''}`}
                onClick={() => patch({ emoji: item })}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {displayMode === 'icon' ? (
        <div className="gl-marker-appearance-editor__icon">
          <label>
            URL de l’icône
            <input
              type="url"
              value={iconUrl}
              onChange={(event) => patch({ iconUrl: String(event.target.value || '').trim() })}
              placeholder="/uploads/media-library/..."
            />
          </label>
          {previewIconUrl ? (
            <img
              className="gl-marker-appearance-editor__icon-preview"
              src={previewIconUrl}
              alt=""
              aria-hidden
            />
          ) : null}
          {typeof fetchMediaLibrary === 'function' ? (
            <MediaLibraryMenu
              title="Choisir une icône dans la bibliothèque"
              fetchItems={fetchMediaLibrary}
              uploadDataUrl={uploadMediaLibrary}
              removeItem={removeMediaLibrary}
              onPickUrl={(url) => patch({ iconUrl: url, displayMode: 'icon' })}
            />
          ) : null}
        </div>
      ) : null}
    </fieldset>
  );
}

export function appearanceToPayload(appearanceForm) {
  if (!appearanceForm) return {};
  return {
    displayMode: appearanceForm.displayMode,
    emoji: appearanceForm.displayMode === 'emoji' ? appearanceForm.emoji || null : null,
    iconUrl: appearanceForm.displayMode === 'icon' ? appearanceForm.iconUrl || null : null,
  };
}
