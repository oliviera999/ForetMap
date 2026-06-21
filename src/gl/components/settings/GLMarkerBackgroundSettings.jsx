import React, { useEffect, useState } from 'react';
import {
  CLASSIC_MARKER_BACKGROUNDS,
  MARKER_BACKGROUND_MODES,
  isValidHexColor,
  normalizeHexColor,
  resolveBackgroundCssValue,
} from '../../../shared/glMarkerBackgroundsCore.js';
import {
  MARKER_BACKGROUND_MODE_LABELS,
  MARKER_BACKGROUND_UI_MODES,
  markerBackgroundStoredValue,
  markerBackgroundUiMode,
  readMarkerBackgroundsSetting,
} from '../../utils/glSettingsForm.js';
import { GLField } from '../ui/GLField.jsx';
import { GLInput } from '../ui/GLInput.jsx';

const SETTINGS_KEY = 'gameplay.marker_backgrounds';

function defaultCustomHex(mode) {
  const classic = CLASSIC_MARKER_BACKGROUNDS[mode];
  return classic && classic.startsWith('#') ? classic : '#fb923c';
}

function MarkerBackgroundPreview({ mode, storedValue }) {
  const cssBg = resolveBackgroundCssValue(mode, storedValue);
  const isEmoji = mode === 'emoji';
  const isIcon = mode === 'icon';
  return (
    <span
      className={`gl-marker-bg-preview gl-marker-bg-preview--${mode}`}
      style={{
        background: cssBg,
        boxShadow: isEmoji && storedValue === 'classic' ? '0 1px 4px rgba(15, 23, 42, 0.18)' : 'none',
      }}
      aria-hidden
    >
      {isIcon ? '🖼' : isEmoji ? '❓' : 'Repère'}
    </span>
  );
}

function MarkerBackgroundRow({ mode, value, disabled, onChange }) {
  const uiMode = markerBackgroundUiMode(value);
  const [customHex, setCustomHex] = useState(() =>
    uiMode === 'custom' ? String(value).toLowerCase() : defaultCustomHex(mode),
  );

  useEffect(() => {
    const nextUiMode = markerBackgroundUiMode(value);
    if (nextUiMode === 'custom') {
      setCustomHex(String(value).toLowerCase());
    }
  }, [value]);

  function emit(nextUiMode, hex = customHex) {
    onChange(
      markerBackgroundStoredValue(nextUiMode, hex, defaultCustomHex(mode)),
    );
  }

  return (
    <div className="gl-marker-bg-row">
      <GLField label={MARKER_BACKGROUND_MODE_LABELS[mode]}>
        <div className="gl-marker-bg-row__controls">
          <select
            value={uiMode}
            disabled={disabled}
            onChange={(event) => {
              const nextUiMode = event.target.value;
              if (nextUiMode === 'custom') {
                emit('custom', customHex || defaultCustomHex(mode));
                return;
              }
              emit(nextUiMode);
            }}
          >
            {MARKER_BACKGROUND_UI_MODES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {uiMode === 'custom' ? (
            <>
              <input
                type="color"
                value={isValidHexColor(customHex) ? customHex : defaultCustomHex(mode)}
                disabled={disabled}
                onChange={(event) => {
                  const next = normalizeHexColor(event.target.value) || defaultCustomHex(mode);
                  setCustomHex(next);
                  emit('custom', next);
                }}
                aria-label={`Couleur fond repère ${MARKER_BACKGROUND_MODE_LABELS[mode]}`}
              />
              <GLInput
                value={customHex}
                disabled={disabled}
                onChange={(event) => {
                  const next = event.target.value;
                  setCustomHex(next);
                  if (isValidHexColor(next)) emit('custom', next);
                }}
                placeholder="#RRGGBB"
                style={{ maxWidth: 120 }}
              />
            </>
          ) : null}
          <MarkerBackgroundPreview mode={mode} storedValue={value} />
        </div>
      </GLField>
    </div>
  );
}

export function GLMarkerBackgroundSettings({ settings, savingKey, onSave, disabled = false }) {
  const backgrounds = readMarkerBackgroundsSetting(settings);
  const saving = savingKey === SETTINGS_KEY;

  function patchMode(mode, nextValue) {
    onSave?.(SETTINGS_KEY, {
      ...backgrounds,
      [mode]: nextValue,
    });
  }

  return (
    <div className="gl-marker-bg-settings gl-form">
      <h5>Fond des repères sur la carte</h5>
      <p className="gl-hint">
        Défaut plateforme : fond transparent pour tous les modes. Le preset « Classique » restaure
        l&apos;ancien rendu (orange pour les libellés, blanc pour les emojis).
      </p>
      {MARKER_BACKGROUND_MODES.map((mode) => (
        <MarkerBackgroundRow
          key={mode}
          mode={mode}
          value={backgrounds[mode]}
          disabled={disabled || saving}
          onChange={(nextValue) => patchMode(mode, nextValue)}
        />
      ))}
      {saving ? (
        <p className="gl-hint" role="status">
          Enregistrement…
        </p>
      ) : null}
    </div>
  );
}

export { SETTINGS_KEY as GL_MARKER_BACKGROUNDS_SETTINGS_KEY };
