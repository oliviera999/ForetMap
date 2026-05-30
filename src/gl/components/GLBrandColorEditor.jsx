import React from 'react';
import {
  DEFAULT_GL_BRAND_COLORS,
  GL_BRAND_COLOR_KEYS,
  GL_BRAND_COLOR_LABELS,
} from '../../utils/glBrandTheme.js';

function isValidHexColor(value) {
  return /^#[0-9a-f]{6}$/i.test(String(value || '').trim());
}

function normalizeHexInput(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.startsWith('#')) return raw.slice(0, 7);
  return `#${raw}`.slice(0, 7);
}

export function GLBrandColorEditor({
  value,
  onChange,
  disabled = false,
  showReset = true,
  sparse = false,
  inheritedColors = null,
}) {
  const colors = value && typeof value === 'object' ? value : {};
  const inherited = inheritedColors && typeof inheritedColors === 'object' ? inheritedColors : DEFAULT_GL_BRAND_COLORS;

  function patchColor(key, nextRaw) {
    const normalized = normalizeHexInput(nextRaw);
    if (sparse) {
      onChange?.((prev) => {
        const prevColors = prev && typeof prev === 'object' ? { ...prev } : {};
        if (!normalized || !isValidHexColor(normalized)) {
          delete prevColors[key];
          return prevColors;
        }
        return { ...prevColors, [key]: normalized.toLowerCase() };
      });
      return;
    }
    onChange?.((prev) => {
      const prevColors = prev && typeof prev === 'object' ? { ...prev } : { ...DEFAULT_GL_BRAND_COLORS };
      const fallback = inherited[key] || DEFAULT_GL_BRAND_COLORS[key];
      const next = isValidHexColor(normalized) ? normalized.toLowerCase() : fallback;
      return { ...prevColors, [key]: next };
    });
  }

  function clearColor(key) {
    if (sparse) {
      onChange?.((prev) => {
        const prevColors = prev && typeof prev === 'object' ? { ...prev } : {};
        delete prevColors[key];
        return prevColors;
      });
      return;
    }
    patchColor(key, inherited[key] || DEFAULT_GL_BRAND_COLORS[key]);
  }

  function resetAll() {
    if (sparse) {
      onChange?.({});
      return;
    }
    onChange?.({ ...DEFAULT_GL_BRAND_COLORS });
  }

  return (
    <div className="gl-color-editor">
      <div className="gl-color-editor-grid">
        {GL_BRAND_COLOR_KEYS.map((key) => {
          const current = colors[key] || '';
          const effective = current || inherited[key] || DEFAULT_GL_BRAND_COLORS[key];
          const pickerValue = isValidHexColor(current) ? current : (isValidHexColor(effective) ? effective : '#000000');
          const hint = sparse && !current
            ? `Hérite : ${inherited[key] || DEFAULT_GL_BRAND_COLORS[key]}`
            : '';
          return (
            <label key={key} className="gl-color-editor-field">
              <span className="gl-color-editor-label">{GL_BRAND_COLOR_LABELS[key] || key}</span>
              <span className="gl-color-editor-inputs">
                <input
                  type="color"
                  value={pickerValue}
                  disabled={disabled}
                  aria-label={`${GL_BRAND_COLOR_LABELS[key]} — sélecteur`}
                  onChange={(event) => patchColor(key, event.target.value)}
                />
                <input
                  type="text"
                  value={current}
                  placeholder={sparse ? inherited[key] || DEFAULT_GL_BRAND_COLORS[key] : ''}
                  disabled={disabled}
                  spellCheck={false}
                  onChange={(event) => patchColor(key, event.target.value)}
                />
                {sparse && current ? (
                  <button
                    type="button"
                    className="gl-btn-secondary gl-btn-sm"
                    disabled={disabled}
                    onClick={() => clearColor(key)}
                    title="Revenir à la charte plateforme"
                  >
                    ×
                  </button>
                ) : null}
              </span>
              {hint ? <span className="gl-hint gl-color-editor-hint">{hint}</span> : null}
            </label>
          );
        })}
      </div>
      {showReset ? (
        <div className="gl-inline-actions">
          <button type="button" className="gl-btn-secondary" disabled={disabled} onClick={resetAll}>
            {sparse ? 'Effacer les surcharges' : 'Réinitialiser aux valeurs par défaut'}
          </button>
        </div>
      ) : null}
    </div>
  );
}
