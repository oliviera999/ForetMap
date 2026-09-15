import { useEffect, useMemo, useState } from 'react';
import { BRAND_COLOR_KEYS, normalizeBrandCore } from '../../shared/brand/brandThemeCore.js';
import { FORETMAP_BRAND_DEFAULTS } from '../../constants/brand.js';

const COLOR_LABELS = {
  primary: 'Primaire',
  secondary: 'Secondaire',
  tertiary: 'Tertiaire',
  text: 'Texte',
  link: 'Lien',
  linkHover: 'Lien (survol)',
  topbar: 'Barre du haut',
  background: 'Fond',
};

function isValidHex(value) {
  return /^#[0-9a-f]{6}$/i.test(String(value || '').trim());
}

function normalizeHexInput(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.startsWith('#')) return raw.slice(0, 7);
  return `#${raw}`.slice(0, 7);
}

/**
 * Éditeur de marque ForetMap / Plan (couleurs, polices, logo, favicon).
 * S'inspire du pattern GL (`GLBrandColorEditor`) sans les slots hero/cartes GL.
 * Cœur partagé : `src/shared/brand/brandThemeCore.js`.
 */
export function ForetBrandEditor({
  title = 'Identité visuelle',
  value,
  defaults = FORETMAP_BRAND_DEFAULTS,
  disabled = false,
  onSave,
  saving = false,
}) {
  const normalized = useMemo(() => normalizeBrandCore(value, defaults), [value, defaults]);
  const [draft, setDraft] = useState(normalized);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setDraft(normalized);
    setDirty(false);
  }, [normalized]);

  const patch = (partial) => {
    setDraft((prev) => ({ ...prev, ...partial }));
    setDirty(true);
  };

  const patchColor = (key, raw) => {
    const hex = normalizeHexInput(raw);
    const next = isValidHex(hex) ? hex.toLowerCase() : defaults.colors?.[key] || '#000000';
    setDraft((prev) => ({
      ...prev,
      colors: { ...(prev.colors || {}), [key]: next },
    }));
    setDirty(true);
  };

  const handleSave = () => {
    onSave?.(normalizeBrandCore(draft, defaults));
    setDirty(false);
  };

  const handleReset = () => {
    setDraft(normalizeBrandCore({}, defaults));
    setDirty(true);
  };

  return (
    <div className="foret-brand-editor" data-testid="foret-brand-editor">
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>
        Couleurs, polices et logo de l’établissement. Logo et favicon : chemins sous{' '}
        <code>/uploads/</code> ou <code>/maps/</code> uniquement.
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
          gap: 10,
          marginBottom: 12,
        }}
      >
        {BRAND_COLOR_KEYS.map((key) => (
          <label key={key} className="field" style={{ margin: 0 }}>
            <span>{COLOR_LABELS[key] || key}</span>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                type="color"
                value={draft.colors?.[key] || defaults.colors?.[key] || '#000000'}
                disabled={disabled}
                onChange={(e) => patchColor(key, e.target.value)}
                style={{ width: 44, height: 44, padding: 0, border: 'none' }}
              />
              <input
                type="text"
                value={draft.colors?.[key] || ''}
                disabled={disabled}
                onChange={(e) => patchColor(key, e.target.value)}
                style={{ flex: 1 }}
              />
            </div>
          </label>
        ))}
      </div>

      <label className="field">
        <span>Police du corps (CSS)</span>
        <input
          type="text"
          value={draft.fonts?.body || ''}
          disabled={disabled}
          placeholder="ex. 'Source Sans 3', sans-serif"
          onChange={(e) => patch({ fonts: { ...(draft.fonts || {}), body: e.target.value } })}
        />
      </label>
      <label className="field">
        <span>Police des titres (CSS)</span>
        <input
          type="text"
          value={draft.fonts?.heading || ''}
          disabled={disabled}
          placeholder="ex. 'Fraunces', serif"
          onChange={(e) => patch({ fonts: { ...(draft.fonts || {}), heading: e.target.value } })}
        />
      </label>
      <label className="field">
        <span>Familles Google Fonts (séparées par virgule)</span>
        <input
          type="text"
          value={(draft.fonts?.googleFamilies || []).join(', ')}
          disabled={disabled}
          placeholder="Source Sans 3, Fraunces"
          onChange={(e) => {
            const families = e.target.value
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean);
            patch({ fonts: { ...(draft.fonts || {}), googleFamilies: families } });
          }}
        />
      </label>
      <label className="field">
        <span>URL du logo</span>
        <input
          type="text"
          value={draft.logoUrl || ''}
          disabled={disabled}
          placeholder="/uploads/…"
          onChange={(e) => patch({ logoUrl: e.target.value.trim() })}
        />
      </label>
      <label className="field">
        <span>URL du favicon</span>
        <input
          type="text"
          value={draft.faviconUrl || ''}
          disabled={disabled}
          placeholder="/uploads/…"
          onChange={(e) => patch({ faviconUrl: e.target.value.trim() })}
        />
      </label>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
        <button
          type="button"
          className="btn btn-primary"
          disabled={disabled || saving || !dirty}
          onClick={handleSave}
        >
          {saving ? 'Enregistrement…' : 'Enregistrer la charte'}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={disabled || saving}
          onClick={handleReset}
        >
          Revenir aux défauts
        </button>
      </div>
    </div>
  );
}
